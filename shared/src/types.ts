/**
 * Shared types for SUPER NOVA — Mafia (server authoritative + React client).
 *
 * The game is a social-deduction Mafia: secret roles, night kills/saves/
 * investigates, day discussion + voting, lynch, win check.
 * Roles are NEVER broadcast to other players: they live server-side and are
 * delivered one-by-one via S2C.privateProfile to the owning socket only.
 * A dead player's role becomes public (revealed in the log + player list).
 */

/** Secret team roles. */
export type MafiaRoleId = 'mafia' | 'doctor' | 'detective' | 'sheikh' | 'elder' | 'citizen';

export interface MafiaRoleDef {
  id: MafiaRoleId;
  label: string;
  hint: string;
  emoji: string;
  color: string;
}

export const SECRET_ROLES: Record<string, MafiaRoleDef> = {
  mafia: { id: 'mafia', label: 'Mafia', hint: 'Kill one player each night', emoji: '🥀', color: '#ef4444' },
  doctor: { id: 'doctor', label: 'Doctor', hint: 'Save one player each night', emoji: '✚', color: '#22c55e' },
  detective: { id: 'detective', label: 'Detective', hint: 'Investigate one player each night', emoji: '🔍', color: '#38bdf8' },
  sheikh: { id: 'sheikh', label: 'Sheikh', hint: 'Shield a player from one hit', emoji: '🕌', color: '#a855f7' },
  elder: { id: 'elder', label: 'Elder', hint: 'Survives the first death sentence', emoji: '🧓', color: '#f59e0b' },
  citizen: { id: 'citizen', label: 'Citizen', hint: 'Find and vote out the Mafia', emoji: '👤', color: '#e2e8f0' },
};

/** Legacy names kept so older imports keep compiling (mapped to mafia roles). */
export const LEGACY_ROLES = ['godfather', 'investigator', 'villager'] as const;

/** Role bag for N players (2..10). Mafia count grows with table size. */
export function roleBagFor(count: number): MafiaRoleId[] {
  const n = Math.max(2, Math.min(10, count));
  const mafiaCount = n >= 8 ? 2 : 1;
  const bag: MafiaRoleId[] = [];
  for (let i = 0; i < mafiaCount; i++) bag.push('mafia');
  if (n >= 4) bag.push('doctor');
  if (n >= 4) bag.push('detective');
  if (n >= 6) bag.push('sheikh');
  while (bag.length < n) bag.push('citizen');
  return bag.slice(0, n);
}

/** Shuffle + assign one secret role per player id. Deterministic given rng. */
export function assignSecretRoles(playerIds: string[], rng: () => number = Math.random): Map<string, MafiaRoleId> {
  const bag = roleBagFor(playerIds.length);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const map = new Map<string, MafiaRoleId>();
  playerIds.forEach((id, i) => {
    map.set(id, bag[i] ?? 'citizen');
  });
  return map;
}

export interface AvatarOption {
  id: string;
  emoji: string;
  label: string;
}

/** Public player view. `role` is present on the server only; the server strips
 *  it for living players before broadcasting (dead players are revealed). */
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  /** Optional linked-account avatar image (Google/Discord). Null when guest. */
  avatarUrl: string | null;
  /** Legacy alias kept so older UI code keeps compiling. */
  image?: string | null;
  color: string;
  /** Linked account provider, if any (never a key — just 'google'|'discord'). */
  provider?: string;
  alive: boolean;
  connected: boolean;
  isHost: boolean;
  /** Server-only secret. Stripped for living players in broadcasts. */
  role?: MafiaRoleId;
  /** Who this player voted for today (cleared each day). */
  votedFor?: string | null;
}

export type GamePhase = 'lobby' | 'night' | 'day' | 'ended';
export type WinnerTeam = 'mafia' | 'citizens' | null;

export type LogKind = 'info' | 'money' | 'move' | 'card' | 'system' | 'turn' | 'night' | 'day';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  ts: number;
}

export interface NightActions {
  /** Mafia chosen kill target (single authoritative entry; last write wins). */
  killTargetId: string | null;
  /** Doctor save target. */
  saveTargetId: string | null;
  /** Detective investigate target + the result (delivered privately). */
  investigateTargetId: string | null;
  /** Sheikh shield target. */
  shieldTargetId: string | null;
}

export interface GameState {
  code: string;
  phase: GamePhase;
  players: PublicPlayer[];
  /** Legacy field kept so old rehydration code does not crash. */
  turnIndex: number;
  dice: null;
  /** What the client should prompt (kept for compatibility). */
  awaiting: 'roll' | 'buy' | 'end-turn' | 'auction';
  pendingTile: null;
  message: string;
  log: LogEntry[];
  winnerId: string | null;
  winnerTeam: WinnerTeam;
  lastCard: null;
  round: number;
  maxPlayers: number;
  cardCursor: { chance: number; chest: number };
  startedAt: number | null;
  updatedAt: number;
  canRollAgain: false;
  rules: Record<string, unknown>;
  pot: number;
  auction: null;
  buildings: number[];
  mortgaged: boolean[];
  stats: Record<string, unknown>;
  // ---- mafia fields ----
  /** Epoch ms when the current night/day phase auto-advances. */
  phaseEndsAt: number | null;
  /** Night actions for the current night (null outside night). */
  night: NightActions | null;
  /** Votes for the current day (voterId -> targetId). */
  votes: Record<string, string>;
  /** Sheikh shield charges remaining (1). */
  shieldCharges: number;
  /** Detective findings (private — delivered privately, never broadcast). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lastInvestigation?: any;
  /** Last eliminated player (shown on the day header). */
  lastEliminated?: { playerId: string; name: string; role: MafiaRoleId } | null;
  /** One-line recap of last night (shown on the day header). */
  lastNightSummary?: string | null;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  avatar: string;
  color: string;
  text: string;
  ts: number;
}

/** Everything the client needs to render lobby + game. */
export interface RoomState {
  code: string;
  name: string;
  maxPlayers: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  game: GameState | null;
  players: PublicPlayer[];
  createdAt: number;
}

export interface ApiRoomSummary {
  code: string;
  name: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
  players: { name: string; avatar: string; color: string }[];
  createdAt: string;
}

export interface MatchHistoryRow {
  id: number;
  code: string;
  name: string;
  winner: string | null;
  players: number;
  rounds: number;
  started_at: string;
  finished_at: string | null;
}

/* ------------------------------- Socket API -------------------------------- */

export interface AckResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type Ack<T = unknown> = (res: AckResponse<T>) => void;

export interface CreateRoomPayload {
  name: string;
  avatar: string;
  maxPlayers: number;
  roomName?: string;
}

export interface JoinRoomPayload {
  code: string;
  name?: string;
  avatar?: string;
  playerId?: string;
}

export interface JoinResult {
  code: string;
  playerId: string;
}

export interface NightActionPayload {
  /** Mafia: { kind: 'kill', targetId } | Doctor: { kind: 'save' } | ... */
  kind: 'kill' | 'save' | 'investigate' | 'shield';
  targetId: string;
}

export interface VotePayload {
  targetId: string;
}

export const C2S = {
  create: 'room:create',
  join: 'room:join',
  leave: 'room:leave',
  rename: 'room:rename',
  start: 'room:start',
  kick: 'room:kick',
  nightAction: 'mafia:night-action',
  vote: 'mafia:vote',
  endPhase: 'mafia:end-phase',
  voiceJoin: 'voice:join',
  voiceLeave: 'voice:leave',
  voiceState: 'voice:state',
  voiceOffer: 'voice:offer',
  voiceAnswer: 'voice:answer',
  voiceIce: 'voice:ice',
  chat: 'chat:send',
} as const;

export const S2C = {
  state: 'state',
  chat: 'chat:message',
  error: 'error',
  notice: 'notice',
  joined: 'joined',
  privateProfile: 'private:profile',
  voicePeerList: 'voice:peer-list',
  voicePeerJoined: 'voice:peer-joined',
  voicePeerLeft: 'voice:peer-left',
  voiceState: 'voice:state',
  voiceStates: 'voice:states',
  voiceOffer: 'voice:offer',
  voiceAnswer: 'voice:answer',
  voiceIce: 'voice:ice',
} as const;

/** Private overhead profile — delivered only to the owning player. */
export interface PrivateProfile {
  playerId: string;
  username: string;
  role: MafiaRoleId | null;
  seat: number;
  /** Latest detective finding (private to the detective). */
  investigation?: { targetName: string; isMafia: boolean } | null;
  /** One-line night recap for the owner (death/save/blocked). */
  lastNight?: string | null;
}

/** Signed-in user (Google / Discord / guest) — from server /auth/me. */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  discordImage: string | null;
  provider: 'google' | 'discord' | 'guest';
}

/** Linked account identity (Google / Discord). Keys live in server env only. */
export interface LinkedAccount {
  playerId: string;
  provider: 'google' | 'discord';
  providerSub: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}
