/**
 * Shared type definitions used by both the server (authoritative game engine)
 * and the React client (rendering / socket payloads).
 */

export type TileKind =
  | 'go'
  | 'property'
  | 'railroad'
  | 'utility'
  | 'tax'
  | 'chance'
  | 'chest'
  | 'jail'
  | 'parking'
  | 'gotojail';

export type GroupColor =
  | 'brown'
  | 'lightblue'
  | 'pink'
  | 'orange'
  | 'red'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'rail'
  | 'utility';

export interface Tile {
  index: number;
  name: string;
  kind: TileKind;
  /** Unique emoji icon shown in the middle of the tile. */
  icon?: string;
  /** Purchase price (properties, railroads, utilities). */
  price?: number;
  /** Tax amount for `tax` tiles. */
  amount?: number;
  group?: GroupColor;
  /** Rent ladder: [base, 1 house, 2, 3, 4, hotel] — only base is used in Phase 1. */
  rent?: number[];
  /** Cost to build one house (Phase 2). */
  houseCost?: number;
}

export interface AvatarOption {
  id: string;
  emoji: string;
  label: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
  cash: number;
  position: number;
  /** Tile indices owned by this player. */
  properties: number[];
  inJail: boolean;
  jailTurns: number;
  jailCards: number;
  bankrupt: boolean;
  connected: boolean;
  isHost: boolean;
}

export type GamePhase = 'lobby' | 'playing' | 'ended';

/** What the current player is expected to do right now. */
export type Awaiting = 'roll' | 'buy' | 'end-turn' | 'auction';

/** Host-configurable gameplay rules, toggled from the right-hand panel. */
export interface Rules {
  /** Doubled base rent when an owner holds a complete colour group. */
  doubleRentFullSet: boolean;
  /** No rent is paid while the property's owner is sitting in jail. */
  rentFreeWhenOwnerInJail: boolean;
  /** Taxes are banked in a pot won by whoever lands on Free Parking. */
  freeParkingPot: boolean;
  /** A declined property goes up for a timed auction open to everyone. */
  auction: boolean;
}

export const DEFAULT_RULES: Rules = {
  doubleRentFullSet: true,
  rentFreeWhenOwnerInJail: false,
  freeParkingPot: true,
  auction: true,
};

export interface PlayerStats {
  /** Total rent paid by this player. */
  rentPaid: number;
  /** Total rent collected by this player. */
  rentCollected: number;
  /** Properties bought (direct purchase or auction win). */
  buys: number;
  /** Auctions won. */
  auctionWins: number;
  /** Total taxes paid (Income Tax + Luxury Tax). */
  taxesPaid: number;
}

/** Live auction for a property nobody wanted to buy outright. */
export interface AuctionState {
  tile: number;
  highestBid: number;
  highestBidderId: string | null;
  /** Epoch ms at which bidding closes. */
  endsAt: number;
  /** Player ids that have placed at least one bid. */
  bidders: string[];
}

export type LogKind = 'info' | 'money' | 'move' | 'card' | 'system' | 'turn';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
  ts: number;
}

export interface GameState {
  code: string;
  phase: GamePhase;
  players: PublicPlayer[];
  /** Index into `players` of whoever owns the current turn. */
  turnIndex: number;
  /** ownerId[i] = player id that owns tile i, or null when unowned. */
  ownerId: (string | null)[];
  dice: [number, number] | null;
  doublesCount: number;
  awaiting: Awaiting;
  /** Tile the current player may buy (set when awaiting === 'buy'). */
  pendingTile: number | null;
  /** Plain-language prompt shown above the controls. */
  message: string;
  log: LogEntry[];
  winnerId: string | null;
  lastCard: { deck: 'chance' | 'chest'; text: string } | null;
  round: number;
  maxPlayers: number;
  /** Index into the shuffled chance / chest decks. */
  cardCursor: { chance: number; chest: number };
  startedAt: number | null;
  updatedAt: number;
  /** True when the current player earned an extra roll (doubles). */
  canRollAgain: boolean;
  /** Rules active for this room. */
  rules: Rules;
  /** Free Parking jackpot accumulated from taxes. */
  pot: number;
  /** Set while an auction is running. */
  auction: AuctionState | null;
  /** Building level per tile (0 = none, 1-4 = houses, 5 = hotel). Properties only. */
  buildings: number[];
  /** True per tile for mortgaged properties (no rent collected). */
  mortgaged: boolean[];
  /** Per-player counters for the post-game statistics screen. */
  stats: Record<string, PlayerStats>;
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
  rules: Rules;
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

/** Socket.IO acknowledgement callback. */
export type Ack<T = unknown> = (res: AckResponse<T>) => void;

export interface CreateRoomPayload {
  name: string;
  avatar: string;
  maxPlayers: number;
  roomName?: string;
  rules?: Partial<Rules>;
}

export interface JoinRoomPayload {
  code: string;
  name?: string;
  avatar?: string;
  /** Set when the client already owns a seat in this room (reconnect). */
  playerId?: string;
}

export interface JoinResult {
  code: string;
  playerId: string;
}

export const C2S = {
  create: 'room:create',
  join: 'room:join',
  leave: 'room:leave',
  start: 'room:start',
  kick: 'room:kick',
  rules: 'room:rules',
  roll: 'game:roll',
  buy: 'game:buy',
  pass: 'game:pass',
  endTurn: 'game:end-turn',
  bid: 'game:bid',
  build: 'game:build',
  sellBuilding: 'game:sell-building',
  mortgage: 'game:mortgage',
  unmortgage: 'game:unmortgage',
  voiceJoin: 'voice:join',
  voiceLeave: 'voice:leave',
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
  /** Emitted once after a successful join/rejoin so the client can store its id. */
  joined: 'joined',
  /** PRIVATE unicast: one player's own username + secret role, sent only to that player's socket. */
  privateProfile: 'private:profile',
  voicePeerList: 'voice:peer-list',
  voicePeerJoined: 'voice:peer-joined',
  voicePeerLeft: 'voice:peer-left',
  voiceOffer: 'voice:offer',
  voiceAnswer: 'voice:answer',
  voiceIce: 'voice:ice',
} as const;

/* ------------------------- secret roles (private) ------------------------- */
/**
 * Secret table roles — inspired by the Mafia table artwork (MAFIA, DOCTOR,
 * DETECTIVE, SHEIKH, VILLAGER). Roles are purely identity/immersion for the
 * Estate Empire table; they NEVER affect the property engine, are NEVER stored
 * in GameState / RoomState / snapshots, and NEVER broadcast. The server keeps
 * them in an in-memory map only and delivers each one privately via
 * S2C.privateProfile to the owning socket. The client renders the private
 * overhead label locally for the local player only.
 */
export type SecretRoleId = 'mafia' | 'godfather' | 'doctor' | 'detective' | 'investigator' | 'sheikh' | 'villager';

export interface SecretRoleDef {
  id: SecretRoleId;
  label: string;
  hint: string;
  emoji: string;
  color: string;
}

export const SECRET_ROLES: Record<SecretRoleId, SecretRoleDef> = {
  godfather: { id: 'godfather', label: 'Godfather', hint: 'Leads the family in the shadows', emoji: '👑', color: '#a855f7' },
  mafia: { id: 'mafia', label: 'Mafia', hint: 'Eliminate in silence', emoji: '🥀', color: '#ef4444' },
  doctor: { id: 'doctor', label: 'Doctor', hint: 'Protect a player', emoji: '✚', color: '#22c55e' },
  detective: { id: 'detective', label: 'Detective', hint: 'Investigate a player', emoji: '🔍', color: '#38bdf8' },
  investigator: { id: 'investigator', label: 'Investigator', hint: 'Uncover the truth', emoji: '🔎', color: '#facc15' },
  sheikh: { id: 'sheikh', label: 'Sheikh', hint: 'Use your special power', emoji: '🕌', color: '#a855f7' },
  villager: { id: 'villager', label: 'Villager', hint: 'Find the Mafia', emoji: '👥', color: '#22c55e' },
};

/** Role bag for up to 10 players: Godfather, Mafia, Doctor, Detective, Investigator, Sheikh + 4 Villagers. */
export function roleBagFor(count: number): SecretRoleId[] {
  const bag: SecretRoleId[] = ['godfather', 'mafia', 'doctor', 'detective', 'investigator', 'sheikh', 'villager', 'villager', 'villager', 'villager'];
  return bag.slice(0, Math.min(count, bag.length));
}

/** Shuffle + assign one secret role per player id. Deterministic given rng. */
export function assignSecretRoles(playerIds: string[], rng: () => number = Math.random): Map<string, SecretRoleId> {
  const bag = roleBagFor(playerIds.length);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const map = new Map<string, SecretRoleId>();
  playerIds.forEach((id, i) => {
    map.set(id, bag[i] ?? 'villager');
  });
  return map;
}

/** Private overhead profile — delivered only to the owning player. */
export interface PrivateProfile {
  playerId: string;
  username: string;
  role: SecretRoleId | null;
  seat: number;
}
