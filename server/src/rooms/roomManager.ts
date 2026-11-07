import { createGame, createPlayer, rehydrateGame, startGame, GameError } from '../game/engine.js';
import type { GameContext } from '../game/engine.js';
import type { ChatMessage, PrivateProfile, PublicPlayer, RoomState } from '../../../shared/src/types.js';

export interface Room {
  code: string;
  name: string;
  maxPlayers: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  game: GameContext;
  chat: ChatMessage[];
  createdAt: number;
  restoredAt?: number;
}

const rooms = new Map<string, Room>();

export function getPrivateProfile(code: string, playerId: string): PrivateProfile | null {
  const room = rooms.get(normalizeCode(code));
  if (!room) return null;
  const seat = room.game.state.players.findIndex((p) => p.id === playerId);
  if (seat === -1) return null;
  const player = room.game.state.players[seat]!;
  return { playerId, username: player.name, role: player.role ?? null, seat };
}

export function assignPrivateRoles(_room: Room): void {}
export function clearPrivateRoles(_code: string): void {}
export function getPrivateRole(_code: string, _playerId: string): null {
  return null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
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
  const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return name || fallback;
}

export function sanitizeAvatar(raw: unknown): string {
  const avatar = String(raw ?? '').trim().slice(0, 24);
  return avatar || 'tophat';
}

export function sanitizeImage(raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v || v.length > 2048) return null;
  return /^https:\/\//i.test(v) || v.startsWith('/') ? v : null;
}

export interface CreateRoomInput {
  name: string;
  avatar: string;
  maxPlayers: number;
  roomName?: string;
  userId?: string;
  image?: string | null;
}

export function createRoom(input: CreateRoomInput): { room: Room; playerId: string } {
  const code = generateCode();
  const playerId = input.userId ?? crypto.randomUUID();
  const name = sanitizeName(input.name, 'Player 1');
  const max = Math.min(10, Math.max(2, Number(input.maxPlayers) || 4));
  const game = createGame(code, [{ id: playerId, name, avatar: sanitizeAvatar(input.avatar), isHost: true }], max);
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

export async function restoreRoomFromDb(codeRaw: string): Promise<Room | null> {
  const code = normalizeCode(codeRaw);
  const existing = rooms.get(code);
  if (existing) return existing;
  const { getStoredRoom, getGameContext, listChat } = await import('../db/repo.js');
  const stored = await getStoredRoom(code);
  if (!stored) return null;
  const persisted = await getGameContext(code);
  if (!persisted) return null;
  const game = rehydrateGame(persisted.state);
  const chat = await listChat(code, 50).catch(() => [] as ChatMessage[]);
  const room: Room = {
    code,
    name: stored.name,
    maxPlayers: stored.maxPlayers,
    hostId: stored.hostId,
    status: stored.status as 'lobby' | 'playing' | 'finished',
    game,
    chat,
    createdAt: stored.createdAt.getTime(),
    restoredAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export async function restoreActiveRooms(): Promise<number> {
  try {
    const { db } = await import('../db/pool.js');
    if (db.mode === 'memory') return 0;
    const res = await db.query<{ code: string }>(`SELECT code FROM rooms WHERE status IN ('lobby', 'playing') ORDER BY created_at`);
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
  opts: { name?: string; avatar?: string; playerId?: string; userId?: string; avatarUrl?: string; image?: string | null },
): Promise<{ room: Room; playerId: string; reconnected: boolean }> {
  const code = normalizeCode(codeRaw);
  let room = rooms.get(code);
  if (!room) {
    room = (await restoreRoomFromDb(code)) ?? undefined;
    if (!room) throw new GameError('Room not found. Check the invite code.');
  }
  const state = room.game.state;
  const wantedId = opts.playerId ?? opts.userId;

  if (wantedId) {
    const existing = state.players.find((p) => p.id === wantedId);
    if (existing) {
      existing.connected = true;
      const img = opts.avatarUrl ?? opts.image;
      if (img) existing.avatarUrl = img;
      return { room, playerId: existing.id, reconnected: true };
    }
  }

  if (room.status === 'finished') throw new GameError('This match has already finished.');
  if (state.phase !== 'lobby') throw new GameError('This match is already in progress — only existing players can rejoin.');
  if (state.players.length >= room.maxPlayers) throw new GameError('This room is full.');

  const playerId = wantedId ?? crypto.randomUUID();
  const seat = state.players.length;
  const player = createPlayer(playerId, sanitizeName(opts.name, `Player ${seat + 1}`), sanitizeAvatar(opts.avatar), opts.avatarUrl ?? opts.image ?? null, seat, seat === 0);
  state.players.push(player);
  state.message = `${player.name} joined the table.`;

  const { persistRoom, persistPlayer, persistGameState } = await import('../db/repo.js');
  await persistRoom(room.code, room.name, room.maxPlayers, room.hostId, 'lobby');
  await persistPlayer(room.code, { id: player.id, name: player.name, avatar: player.avatar, image: player.avatarUrl ?? null, color: player.color, seat });
  await persistGameState(room.game.state);
  return { room, playerId, reconnected: false };
}

export function leaveRoom(codeRaw: string, playerId: string): Room | undefined {
  const room = getRoom(codeRaw);
  if (!room) return undefined;
  const state = room.game.state;
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return room;

  if (state.phase !== 'lobby') {
    const p = state.players[idx];
    p.connected = false;
    if (room.hostId === playerId) {
      const next = state.players.find((x) => x.alive && x.connected) ?? state.players.find((x) => x.alive);
      if (next) {
        room.hostId = next.id;
        state.players.forEach((x) => (x.isHost = x.id === next.id));
      }
    }
    return room;
  }

  state.players.splice(idx, 1);
  if (state.players.length === 0) {
    rooms.delete(room.code);
    return undefined;
  }
  if (room.hostId === playerId) room.hostId = state.players[0].id;
  state.players.forEach((p) => (p.isHost = p.id === room.hostId));
  return room;
}

export function destroyRoom(code: string) {
  rooms.delete(normalizeCode(code));
}

export function startRoomGame(code: string, byPlayerId: string): Room {
  const room = getRoom(code);
  if (!room) throw new GameError('Room not found.');
  room.game = startGame(room.game, byPlayerId);
  room.status = 'playing';
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
  const s = structuredClone(room.game.state);
  for (const p of s.players) {
    if (p.alive) delete p.role;
    // Dead roles are revealed in the log text, not the player record.
    else delete p.role;
  }
  if (s.phase === 'night') s.night = null;
  return {
    code: room.code,
    name: room.name,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    status: room.status,
    game: s,
    players: s.players,
    createdAt: room.createdAt,
  };
}

export function pushChat(room: Room, player: PublicPlayer, text: string): ChatMessage {
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    playerId: player.id,
    name: player.name,
    avatar: player.avatar || 'tophat',
    color: player.color,
    text: text.slice(0, 300),
    ts: Date.now(),
  };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  return msg;
}

export function sweepIdleRooms(): number {
  const now = Date.now();
  let removed = 0;
  for (const room of [...rooms.values()]) {
    const anyConnected = room.game.state.players.some((p) => p.connected);
    const basis = Math.max(room.createdAt, room.restoredAt ?? 0);
    if (!anyConnected && now - basis > 10 * 60_000) {
      rooms.delete(room.code);
      removed++;
    }
  }
  return removed;
}
