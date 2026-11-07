import {
  SECRET_ROLES,
  assignSecretRoles,
} from '../../../shared/src/types.js';
import type {
  GameState,
  LogKind,
  PublicPlayer,
  MafiaRoleId,
  NightActions,
} from '../../../shared/src/types.js';

/** Thrown for illegal actions — surfaced to the client as a toast. */
export class GameError extends Error {}

export interface GameContext {
  state: GameState;
  roles: Record<string, MafiaRoleId>;
}

export type NightKind = 'kill' | 'save' | 'investigate' | 'shield';

const NIGHT_SECONDS = 30;
const DAY_SECONDS = 60;

let logSeq = 1;

function log(state: GameState, kind: LogKind, text: string) {
  state.log.push({ id: logSeq++, kind, text, ts: Date.now() });
  if (state.log.length > 150) state.log.splice(0, state.log.length - 150);
}

const PLAYER_COLORS = [
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

/** True when the role belongs to the Mafia team. */
export function isMafia(role: MafiaRoleId | undefined | null): boolean {
  return role === 'mafia';
}

export function alivePlayers(state: GameState): PublicPlayer[] {
  return state.players.filter((p) => p.alive);
}

export function checkWinner(state: GameState): 'mafia' | 'citizens' | null {
  const mafia = alivePlayers(state).filter((p) => isMafia(p.role)).length;
  const citizens = alivePlayers(state).filter((p) => !isMafia(p.role)).length;
  if (mafia === 0) return 'citizens';
  if (mafia >= citizens) return 'mafia';
  return null;
}

export function createPlayer(
  id: string,
  name: string,
  avatar: string,
  avatarUrl: string | null,
  seat: number,
  isHost: boolean,
): PublicPlayer {
  return {
    id,
    name,
    avatar,
    avatarUrl: avatarUrl ?? null,
    color: PLAYER_COLORS[seat % PLAYER_COLORS.length]!,
    alive: true,
    connected: true,
    isHost,
    role: undefined,
  };
}

export function createGame(
  code: string,
  members: { id: string; name: string; avatar: string; avatarUrl?: string | null; isHost: boolean }[],
  maxPlayers: number,
): GameContext {
  const players = members.map((m, i) => createPlayer(m.id, m.name, m.avatar, m.avatarUrl ?? null, i, m.isHost));
  const state: GameState = {
    code,
    phase: 'lobby',
    players,
    turnIndex: 0,
    dice: null,
    awaiting: 'roll',
    pendingTile: null,
    message: 'Lobby — waiting for the host to start the Mafia.',
    log: [],
    winnerId: null,
    winnerTeam: null,
    lastCard: null,
    round: 1,
    maxPlayers,
    cardCursor: { chance: 0, chest: 0 },
    startedAt: null,
    updatedAt: Date.now(),
    canRollAgain: false,
    rules: {},
    pot: 0,
    auction: null,
    buildings: [],
    mortgaged: [],
    stats: {},
    phaseEndsAt: null,
    night: null,
    votes: {},
    shieldCharges: 1,
  };
  log(state, 'system', 'Welcome to SUPER NOVA Mafia.');
  log(state, 'system', 'The host starts when at least 2 players are seated.');
  return { state, roles: {} };
}

export function startGame(ctx: GameContext, byPlayerId: string): GameContext {
  const state = ctx.state;
  if (state.phase !== 'lobby') throw new GameError('The game has already started.');
  const by = state.players.find((p) => p.id === byPlayerId);
  if (!by) throw new GameError('You are not in this room.');
  if (state.players.length < 2) throw new GameError('Need at least 2 players to start.');
  if (!by.isHost) throw new GameError('Only the host can start the game.');
  const roles = assignSecretRoles(state.players.map((p) => p.id));
  const players = state.players.map((p) => ({ ...p, role: roles.get(p.id) ?? ('citizen' as MafiaRoleId) }));
  const next: GameContext = {
    state: {
      ...state,
      phase: 'night',
      round: 1,
      players,
      night: { killTargetId: null, saveTargetId: null, investigateTargetId: null, shieldTargetId: null },
      votes: {},
      shieldCharges: 1,
      phaseEndsAt: Date.now() + NIGHT_SECONDS * 1000,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      log: [...state.log],
      message: 'The city sleeps. Mafia, Doctor, Detective and Sheikh, do your work.',
    },
    roles: Object.fromEntries(roles),
  };
  log(next.state, 'system', 'Night 1 — the town closes its eyes…');
  next.state.message = 'Night 1 — secret actions are open.';
  return next;
}

/* ------------------------------ night actions ------------------------------ */

export interface NightActionResult {
  ctx: GameContext;
  investigationResult: { targetName: string; isMafia: boolean } | null;
}

export function nightAction(ctx: GameContext, playerId: string, kind: NightKind, targetId: string): NightActionResult {
  const state = ctx.state;
  if (state.phase !== 'night') throw new GameError('It is not night right now.');
  const me = state.players.find((p) => p.id === playerId);
  if (!me || !me.alive) throw new GameError('You are eliminated and cannot act at night.');
  const role = me.role;
  const need: Record<string, NightKind> = { mafia: 'kill', doctor: 'save', detective: 'investigate', sheikh: 'shield' };
  if (!role || need[role] !== kind) throw new GameError('That action does not match your role.');
  if (!targetId) throw new GameError('Choose a target first.');
  if (targetId === playerId) throw new GameError('You cannot target yourself.');
  const target = state.players.find((p) => p.id === targetId);
  if (!target) throw new GameError('Unknown target.');
  if (!target.alive) throw new GameError('That player is already eliminated.');
  const field =
    kind === 'kill' ? 'killTargetId' : kind === 'save' ? 'saveTargetId' : kind === 'investigate' ? 'investigateTargetId' : 'shieldTargetId';
  const night: NightActions = { ...(state.night ?? { killTargetId: null, saveTargetId: null, investigateTargetId: null, shieldTargetId: null }) };
  (night as unknown as Record<string, string>)[field] = targetId;
  const next: GameContext = {
    state: { ...state, night, updatedAt: Date.now(), log: [...state.log] },
    roles: ctx.roles,
  };
  if (kind === 'investigate') {
    return { ctx: next, investigationResult: { targetName: target.name, isMafia: isMafia(target.role) } };
  }
  return { ctx: next, investigationResult: null };
}

/* -------------------------------- voting --------------------------------- */

export function vote(ctx: GameContext, playerId: string, targetId: string | null): GameContext {
  const state = ctx.state;
  if (state.phase !== 'day') throw new GameError('Voting is only open during the day.');
  const me = state.players.find((p) => p.id === playerId);
  if (!me || !me.alive) throw new GameError('You are eliminated and cannot vote.');
  if (targetId !== null) {
    if (targetId === playerId) throw new GameError('You cannot vote for yourself.');
    const target = state.players.find((p) => p.id === targetId);
    if (!target) throw new GameError('Unknown target.');
    if (!target.alive) throw new GameError('That player is already eliminated.');
  }
  const votes = { ...state.votes };
  if (targetId) votes[playerId] = targetId;
  else delete votes[playerId];
  return {
    state: { ...state, votes, updatedAt: Date.now(), log: [...state.log] },
    roles: ctx.roles,
  };
}

/* --------------------------- phase resolution --------------------------- */

export function isPhaseDue(state: GameState): boolean {
  if (state.phase !== 'night' && state.phase !== 'day') return false;
  return state.phaseEndsAt != null && state.phaseEndsAt <= Date.now();
}

function finishIfNeeded(next: GameState): void {
  const winner = checkWinner(next);
  if (winner) {
    next.phase = 'ended';
    next.winnerTeam = winner;
    next.winnerId = next.players.find((p) => p.alive && isMafia(p.role) === (winner === 'mafia'))?.id ?? null;
    next.phaseEndsAt = null;
    next.message = winner === 'mafia' ? 'The Mafia wins the city!' : 'The Citizens win!';
  }
}

export function resolveNight(ctx: GameContext): GameContext {
  const state = ctx.state;
  if (state.phase !== 'night') throw new GameError('Not currently night.');
  const night = state.night ?? { killTargetId: null, saveTargetId: null, investigateTargetId: null, shieldTargetId: null };
  const players = state.players.map((p) => ({ ...p }));
  const byId = (id: string) => players.find((p) => p.id === id);
  let summary = 'The night was calm. Nobody was eliminated.';

  if (night.killTargetId) {
    const target = byId(night.killTargetId);
    if (target && target.alive) {
      const saved = night.saveTargetId === target.id;
      const shielded = night.shieldTargetId === target.id && state.shieldCharges > 0;
      if (saved) {
        summary = `The Doctor saved ${target.name}. The Mafia found the bed empty.`;
        log(state, 'system', summary);
      } else if (shielded) {
        summary = `${target.name} survived the attack — the Sheikh's shield broke (no charges left).`;
        log(state, 'system', summary);
      } else {
        target.alive = false;
        summary = `${target.name} was eliminated in the night.`;
        log(state, 'system', `${target.name} was eliminated at night.`);
      }
    }
  } else {
    log(state, 'system', 'The Mafia did not act tonight.');
  }

  const spentShield = Boolean(night.killTargetId && night.shieldTargetId === night.killTargetId && state.shieldCharges > 0);
  const nextState: GameState = {
    ...state,
    players,
    phase: 'day',
    night: null,
    votes: {},
    shieldCharges: spentShield ? 0 : state.shieldCharges,
    phaseEndsAt: Date.now() + DAY_SECONDS * 1000,
    message: summary,
    updatedAt: Date.now(),
    log: [...state.log],
  };
  finishIfNeeded(nextState);
  if (nextState.phase !== 'ended') {
    nextState.message = 'Day — discuss and vote who to eliminate.';
    log(nextState, 'system', `Day ${nextState.round} — voting is open.`);
  }
  return { state: nextState, roles: ctx.roles };
}

export function resolveVote(ctx: GameContext): GameContext {
  const state = ctx.state;
  if (state.phase !== 'day') throw new GameError('Not currently day.');
  const tally = new Map<string, number>();
  for (const target of Object.values(state.votes)) {
    tally.set(target, (tally.get(target) ?? 0) + 1);
  }
  let eliminatedId: string | null = null;
  let best = 0;
  for (const [target, count] of tally) {
    if (count > best) {
      best = count;
      eliminatedId = target;
    }
  }
  const players = state.players.map((p) => ({ ...p }));
  let summary = 'The town could not agree — nobody was eliminated.';
  if (eliminatedId) {
    const t = players.find((p) => p.id === eliminatedId);
    const role = t?.role;
    if (t && t.alive) {
      t.alive = false;
      summary = `${t.name} was voted out. Their role: ${role ? SECRET_ROLES[role].label : 'Citizen'}.`;
      log(state, 'system', `${t.name} was eliminated by vote (${role ? SECRET_ROLES[role].label : 'Citizen'} revealed).`);
    }
  } else {
    log(state, 'system', 'No elimination: the town abstained.');
  }
  const nextState: GameState = {
    ...state,
    players,
    phase: 'night',
    round: state.round + 1,
    night: { killTargetId: null, saveTargetId: null, investigateTargetId: null, shieldTargetId: null },
    votes: {},
    phaseEndsAt: Date.now() + NIGHT_SECONDS * 1000,
    message: summary,
    updatedAt: Date.now(),
    log: [...state.log],
  };
  finishIfNeeded(nextState);
  if (nextState.phase !== 'ended') {
    nextState.message = `Night ${nextState.round} — secret actions are open.`;
    log(nextState, 'system', `Night ${nextState.round} — the town sleeps again…`);
  }
  return { state: nextState, roles: ctx.roles };
}

/** Host shortcut: resolve the current phase immediately. */
export function endPhase(ctx: GameContext, playerId: string): GameContext {
  const state = ctx.state;
  const me = state.players.find((p) => p.id === playerId);
  if (!me?.isHost) throw new GameError('Only the host can end the phase.');
  if (state.phase === 'night') return resolveNight(ctx);
  if (state.phase === 'day') return resolveVote(ctx);
  throw new GameError('No phase is running.');
}

/* ------------------------------ persistence ------------------------------ */

/** Rebuild a GameContext from a persisted snapshot (server restart recovery). */
export function rehydrateGame(state: GameState): GameContext {
  const safe: GameState = {
    ...state,
    night: state.night ?? null,
    votes: state.votes ?? {},
    shieldCharges: state.shieldCharges ?? 1,
    players: (state.players ?? []).map((p) => ({
      ...p,
      avatarUrl: (p as PublicPlayer).avatarUrl ?? null,
      alive: (p as PublicPlayer).alive ?? true,
    })),
    log: (state.log ?? []) as GameState['log'],
  };
  if (safe.phase === 'night' || safe.phase === 'day') {
    safe.phaseEndsAt = Date.now() + (safe.phase === 'night' ? NIGHT_SECONDS : DAY_SECONDS) * 1000;
    if (safe.phase === 'night' && !safe.night) {
      safe.night = { killTargetId: null, saveTargetId: null, investigateTargetId: null, shieldTargetId: null };
    }
  }
  const roles: Record<string, MafiaRoleId> = {};
  for (const p of safe.players) {
    if (p.role) roles[p.id] = p.role;
  }
  return { state: safe, roles };
}
