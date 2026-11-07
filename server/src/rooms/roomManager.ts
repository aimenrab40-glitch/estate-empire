import {
  createGame,
  createPlayer,
  rehydrateGame,
  startGame,
  closeRestoredAuction,
  GameError,
} from '../game/engine.js';
import type { GameContext } from '../game/engine.js';
import type { ChatMessage, PrivateProfile, PublicPlayer, RoomState, SecretRoleId } from '../../../shared/src/types.js';
import { DEFAULT_RULES, assignSecretRoles, type Rules } from '../../../shared/src/types.js';
import { emojiFor } from '../../../shared/src/avatars.js';
import { MIN_PLAYERS, MAX_PLAYERS } from '../../../shared/src/board.js';
import {
  db,
} from '../db/pool.js';
import {
  getGameContext,
  getStoredRoom,
  listChat,
  persistGameContext,
  persistGameState,
  persistPlayer,
  persistRoom,
} from '../db/repo.js';

export interface Room {
  code: string;
  name: string;
  maxPlayers: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  game: GameContext;
  chat: ChatMessage[];
  createdAt: number;
  /** Set when the room was rebuilt from PostgreSQL after a restart (not persisted). */
  restoredAt?: number;
}

const rooms = new Map<string, Room>();

/**
 * PRIVATE secret roles — in-memory only. Never written to GameState, RoomState,
 * game_snapshots, or any broadcast. Delivered by the socket layer via unicast
 * private:profile events. Cleared when the room is destroyed/swept.
 */
const privateRoles = new Map<string, Map<string, SecretRoleId>>();

export function getPrivateRole(code: string, playerId: string): SecretRoleId | null {
  return privateRoles.get(normalizeCode(code))?.get(playerId) ?? null;
}

export function getPrivateProfile(code: string, playerId: string): PrivateProfile | null {
  const normalized = normalizeCode(code);
  const room = rooms.get(normalized);
  if (!room) return null;
  const seat = room.game.state.players.findIndex((p) => p.id === playerId);
  if (seat === -1) return null;
  const player = room.game.state.players[seat]!;
  return {
    playerId,
    username: player.name,
    role: privateRoles.get(normalized)?.get(playerId) ?? null,
    seat,
  };
}

export function assignPrivateRoles(room: Room): void {
  const ids = room.game.state.players.map((p) => p.id);
  privateRoles.set(room.code, assignSecretRoles(ids));
}

export function clearPrivateRoles(code: string): void {
  privateRoles.delete(normalizeCode(code));
}

const COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#0ea5e9',
  '#84cc16',
];

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!rooms.has(code)) return code;
  }
  throw new GameError('Could not allocate a room code, please retry.');
}

export const normalizeCode = (code: string) => (code ?? '').trim().toUpperCase();

export function getRoom(code: string): Room | undefined {
  return rooms.get(normalizeCode(code));
}

export function listRooms(): Room[] {
  return [...rooms.values()];
}

export function sanitizeName(raw: unknown, fallback: string): string {
  const name = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
  return name || fallback;
}

export function sanitizeAvatar(raw: unknown): string {
  const avatar = String(raw ?? '').trim().slice(0, 24);
  return avatar || 'tophat';
}

export interface CreateRoomInput {
  name: string;
  avatar: string;
  maxPlayers: number;
  roomName?: string;
  rules?: Partial<Rules>;
}

export function createRoom(input: CreateRoomInput): { room: Room; playerId: string } {
  const code = generateCode();
  const playerId = crypto.randomUUID();
  const name = sanitizeName(input.name, 'Player 1');
  const max = Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Number(input.maxPlayers) || 6));

  const game = createGame(
    code,
    [{ id: playerId, name, avatar: sanitizeAvatar(input.avatar), isHost: true }],
    max,
    { ...DEFAULT_RULES, ...input.rules },
  );

  const room: Room = {
    code,
    name: sanitizeName(input.roomName, `${name}'s table`),
    maxPlayers: max,
    hostId: playerId,
    status: 'lobby',
    game,
    chat: [],
    createdAt: Date.now(),
  };
  rooms.set(code, room);
  return { room, playerId };
}

/** Rebuild one room from PostgreSQL (used by boot restore and lazy rejoin). */
export async function restoreRoomFromDb(codeRaw: string): Promise<Room | null> {
  const code = normalizeCode(codeRaw);
  const existing = rooms.get(code);
  if (existing) return existing;

  const stored = await getStoredRoom(code);
  if (!stored) return null;
  const persisted = await getGameContext(code);
  if (!persisted) return null;

  const game = rehydrateGame(persisted.state, persisted.chanceDeck, persisted.chestDeck);
  // If an auction was open when the server stopped, close it now — the highest
  // bid stands — so the game can never deadlock on a stale timer.
  const settled = closeRestoredAuction(game);
  const chat = await listChat(code, 50).catch(() => [] as ChatMessage[]);

  const room: Room = {
    code,
    name: stored.name,
    maxPlayers: stored.maxPlayers,
    hostId: stored.hostId,
    status: stored.status as 'lobby' | 'playing' | 'finished',
    game: settled,
    chat,
    createdAt: stored.createdAt.getTime(),
    restoredAt: Date.now(),
  };
  rooms.set(code, room);
  // Secret roles are ephemeral — re-assign fresh ones for a restored live game
  // (they were never persisted so they cannot be recovered, and never leak).
  if (room.status === 'playing') assignPrivateRoles(room);
  if (settled !== game) {
    await persistGameContext(code, settled.state, settled.chanceDeck, settled.chestDeck).catch(
      () => undefined,
    );
  }
  return room;
}

/** Restore every unfinished room (lobby or playing) into memory. Called at boot. */
export async function restoreActiveRooms(): Promise<number> {
  if (db.mode === 'memory') return 0;
  try {
    const res = await db.query<{ code: string }>(
      `SELECT code FROM rooms WHERE status IN ('lobby', 'playing') ORDER BY created_at`,
    );
    let restored = 0;
    for (const row of res.rows) {
      const room = await restoreRoomFromDb(row.code);
      if (room) restored += 1;
    }
    return restored;
  } catch (err) {
    console.warn('[db] restoreActiveRooms failed:', (err as Error)?.message ?? err);
    return 0;
  }
}

export async function joinRoom(
  codeRaw: string,
  opts: { name?: string; avatar?: string; playerId?: string },
): Promise<{ room: Room; playerId: string; reconnected: boolean }> {
  const code = normalizeCode(codeRaw);
  let room = rooms.get(code);

  if (!room) {
    // --- server restart recovery: rebuild the room from PostgreSQL -------------
    room = (await restoreRoomFromDb(code)) ?? undefined;
    if (!room) throw new GameError('Room not found. Check the invite code.');
  }

  const state = room.game.state;

  // Reconnect of an existing seat
  if (opts.playerId) {
    const existing = state.players.find((p) => p.id === opts.playerId);
    if (existing) {
      existing.connected = true;
      return { room, playerId: existing.id, reconnected: true };
    }
  }

  if (room.status === 'finished') throw new GameError('This match has already finished.');
  if (state.phase !== 'lobby') {
    throw new GameError('This match is already in progress — only existing players can rejoin.');
  }
  if (state.players.length >= room.maxPlayers) throw new GameError('This room is full.');

  const playerId = crypto.randomUUID();
  const seat = state.players.length;
  const player = createPlayer(
    playerId,
    sanitizeName(opts.name, `Player ${seat + 1}`),
    sanitizeAvatar(opts.avatar),
    seat,
    seat === 0,
  );
  player.color = COLORS[seat % COLORS.length];
  state.players.push(player);
  state.message = `${player.name} joined the table.`;
  await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'lobby');
  await persistPlayer(room.code, {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    color: player.color,
    seat,
  });
  await persistGameState(room.game.state);
  return { room, playerId, reconnected: false };
}

/** Remove a player. During a match they are eliminated instead of deleted. */
export function leaveRoom(codeRaw: string, playerId: string): Room | undefined {
  const room = getRoom(codeRaw);
  if (!room) return undefined;
  const state = room.game.state;
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return room;

  if (state.phase === 'playing') {
    // Mid-match the seat is eliminated so turn order stays consistent.
    const p = state.players[idx];
    p.connected = false;
    p.bankrupt = true;
    for (const t of p.properties) if (state.ownerId[t] === p.id) state.ownerId[t] = null;
    p.properties = [];
    p.cash = 0;
    const left = state.players.filter((x) => !x.bankrupt);
    if (left.length <= 1) {
      state.phase = 'ended';
      state.winnerId = left[0]?.id ?? null;
      state.message = left[0] ? `🏆 ${left[0].name} wins the game!` : 'Game over.';
    }
    return room;
  }

  state.players.splice(idx, 1);
  if (state.players.length === 0) {
    rooms.delete(room.code);
    clearPrivateRoles(room.code);
    return undefined;
  }
  if (room.hostId === playerId) {
    room.hostId = state.players[0].id;
  }
  state.players.forEach((p) => (p.isHost = p.id === room.hostId));
  return room;
}

export function destroyRoom(code: string) {
  rooms.delete(normalizeCode(code));
  clearPrivateRoles(code);
}

export function startRoomGame(code: string, byPlayerId: string): Room {
  const room = getRoom(code);
  if (!room) throw new GameError('Room not found.');
  room.game = startGame(room.game, byPlayerId);
  room.status = 'playing';
  // Assign secret roles now — kept private (unicast only), never broadcast.
  assignPrivateRoles(room);
  return room;
}

export function markFinished(room: Room): boolean {
  if (room.status === 'playing' && room.game.state.phase === 'ended') {
    room.status = 'finished';
    return true;
  }
  return false;
}

export function toRoomState(room: Room): RoomState {
  return {
    code: room.code,
    name: room.name,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    game: room.game.state,
    players: room.game.state.players,
    createdAt: room.createdAt,
    rules: room.game.state.rules,
  };
}

export function pushChat(room: Room, player: PublicPlayer, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    playerId: player.id,
    name: player.name,
    avatar: player.avatar || emojiFor('tophat'),
    color: player.color,
    text: text.slice(0, 300),
    ts: Date.now(),
  };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  return msg;
}

/** Drop empty idle rooms (no connected player) after 10 minutes. */
export function sweepIdleRooms(): number {
  const now = Date.now();
  let removed = 0;
  for (const room of [...rooms.values()]) {
    const anyConnected = room.game.state.players.some((p) => p.connected);
    // A freshly restored room is not "idle" just because it was created long ago.
    const basis = Math.max(room.createdAt, room.restoredAt ?? 0);
    if (!anyConnected && now - basis > 10 * 60_000) {
      rooms.delete(room.code);
      clearPrivateRoles(room.code);
      removed++;
    }
  }
  return removed;
}
