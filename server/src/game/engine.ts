import {
  BOARD,
  GO_SALARY,
  STARTING_CASH,
  JAIL_INDEX,
  JAIL_TURNS_BEFORE_FINE,
  JAIL_FINE,
  GROUP_TILES,
  mortgageValue,
  unmortgageCost,
} from '../../../shared/src/board.js';
import { CHANCE_CARDS, CHEST_CARDS } from '../../../shared/src/cards.js';
import { PLAYER_COLORS } from '../../../shared/src/avatars.js';
import { DEFAULT_RULES } from '../../../shared/src/types.js';
import type {
  AuctionState,
  GameState,
  PlayerStats,
  PublicPlayer,
  Rules,
  Tile,
  LogKind,
} from '../../../shared/src/types.js';

/** Thrown for illegal actions — surfaced to the client as a toast. */
export class GameError extends Error {}

/** Base auction window; every bid refreshes it to AUCTION_BID_RESET_MS. */
export const AUCTION_MS = 20_000;
export const AUCTION_BID_RESET_MS = 10_000;
/** Building level per property tile: 0 = none, 1-4 houses, 5 = hotel. */
export const MAX_BUILDING_LEVEL = 5;

export interface GameContext {
  state: GameState;
  chanceDeck: string[];
  chestDeck: string[];
}

export type Rng = () => number;

let logSeq = 1;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const d6 = (rng: Rng) => 1 + Math.floor(rng() * 6);

function log(state: GameState, kind: LogKind, text: string) {
  state.log.push({ id: logSeq++, kind, text, ts: Date.now() });
  if (state.log.length > 150) state.log.splice(0, state.log.length - 150);
}

/* ------------------------------ stats helpers ------------------------------ */

const emptyStats = (): PlayerStats => ({
  rentPaid: 0,
  rentCollected: 0,
  buys: 0,
  auctionWins: 0,
  taxesPaid: 0,
});

function statsOf(state: GameState, playerId: string): PlayerStats {
  if (!state.stats) state.stats = {};
  return (state.stats[playerId] ??= emptyStats());
}

function bump(state: GameState, playerId: string, key: keyof PlayerStats, amount = 1) {
  statsOf(state, playerId)[key] += amount;
}

export function createPlayer(
  id: string,
  name: string,
  avatar: string,
  seat: number,
  isHost: boolean,
): PublicPlayer {
  return {
    id,
    name,
    avatar,
    color: PLAYER_COLORS[seat % PLAYER_COLORS.length],
    cash: STARTING_CASH,
    position: 0,
    properties: [],
    inJail: false,
    jailTurns: 0,
    jailCards: 0,
    bankrupt: false,
    connected: true,
    isHost,
  };
}

export function createGame(
  code: string,
  members: { id: string; name: string; avatar: string; isHost: boolean }[],
  maxPlayers: number,
  rules: Rules = DEFAULT_RULES,
  rng: Rng = Math.random,
): GameContext {
  const players = members.map((m, i) => createPlayer(m.id, m.name, m.avatar, i, m.isHost));
  const state: GameState = {
    code,
    phase: 'lobby',
    players,
    turnIndex: 0,
    ownerId: BOARD.map(() => null),
    dice: null,
    doublesCount: 0,
    awaiting: 'roll',
    pendingTile: null,
    message: 'Waiting for the host to start the game…',
    log: [],
    winnerId: null,
    lastCard: null,
    round: 1,
    maxPlayers,
    cardCursor: { chance: 0, chest: 0 },
    startedAt: null,
    updatedAt: Date.now(),
    canRollAgain: false,
    rules: { ...DEFAULT_RULES, ...rules },
    pot: 0,
    auction: null,
    buildings: BOARD.map(() => 0),
    mortgaged: BOARD.map(() => false),
    stats: Object.fromEntries(players.map((p) => [p.id, emptyStats()])),
  };
  return {
    state,
    chanceDeck: shuffle(CHANCE_CARDS.map((c) => c.id), rng),
    chestDeck: shuffle(CHEST_CARDS.map((c) => c.id), rng),
  };
}

/** Rebuild a GameContext from a persisted snapshot (server restart recovery).
 *  The stored decks are reused as-is so the card sequence resumes exactly.
 *  Snapshots written before Phase 2 (or by older builds) are normalized here. */
export function rehydrateGame(
  state: GameState,
  chanceDeck: string[],
  chestDeck: string[],
): GameContext {
  const s = structuredClone(state);
  // Normalize Phase-1 snapshots that predate the buildings/mortgaged/stats fields.
  s.buildings = BOARD.map((_, i) => {
    const v = Array.isArray(s.buildings) ? Number(s.buildings[i]) || 0 : 0;
    return Math.max(0, Math.min(MAX_BUILDING_LEVEL, Math.floor(v)));
  });
  s.mortgaged = BOARD.map((_, i) => (Array.isArray(s.mortgaged) ? !!s.mortgaged[i] : false));
  if (!s.stats || typeof s.stats !== 'object') s.stats = {};
  for (const p of s.players) {
    if (!s.stats[p.id]) s.stats[p.id] = emptyStats();
    p.connected = false;
  }
  return {
    state: s,
    chanceDeck: Array.isArray(chanceDeck) ? chanceDeck.slice() : [],
    chestDeck: Array.isArray(chestDeck) ? chestDeck.slice() : [],
  };
}

/* --------------------------------- helpers --------------------------------- */

const current = (state: GameState): PublicPlayer => {
  const p = state.players[state.turnIndex];
  if (!p) throw new GameError('It is not your turn.');
  return p;
};

const byId = (state: GameState, id: string): PublicPlayer => {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new GameError('You are not in this game.');
  return p;
};

const activePlayers = (state: GameState) => state.players.filter((p) => !p.bankrupt);

function assertPlaying(state: GameState) {
  if (state.phase === 'lobby') throw new GameError('The game has not started yet.');
  if (state.phase === 'ended') throw new GameError('The game is over.');
}

function assertTurn(state: GameState, playerId: string): PublicPlayer {
  const p = current(state);
  if (p.id !== playerId) throw new GameError(`It is ${p.name}'s turn, not yours.`);
  return p;
}

function earn(state: GameState, p: PublicPlayer, amount: number, reason: string) {
  p.cash += amount;
  log(state, 'money', `${p.name} receives $${amount} — ${reason}.`);
}

function payTo(
  state: GameState,
  p: PublicPlayer,
  amount: number,
  creditor: PublicPlayer | null,
  reason: string,
) {
  p.cash -= amount;
  log(
    state,
    'money',
    creditor
      ? `${p.name} pays $${amount} to ${creditor.name} — ${reason}.`
      : `${p.name} pays $${amount} — ${reason}.`,
  );
  if (p.cash < 0) bankrupt(state, p, creditor);
}

function transferProperties(state: GameState, from: PublicPlayer, to: PublicPlayer | null) {
  const tiles = from.properties.slice();
  // Buildings are sold back to the bank at half price to cover the debt
  // (classic rule) — they are never transferred with the titles.
  let sellBack = 0;
  for (const idx of tiles) {
    const built = state.buildings?.[idx] ?? 0;
    if (built > 0) sellBack += built * Math.floor((BOARD[idx].houseCost ?? 0) / 2);
  }
  if (sellBack > 0) {
    from.cash += sellBack;
    for (const idx of tiles) state.buildings[idx] = 0;
    log(state, 'system', `${from.name} sells back buildings to the bank for $${sellBack} to cover the debt.`);
  }
  for (const idx of tiles) {
    if (state.ownerId[idx] !== from.id) continue;
    if (to) {
      state.ownerId[idx] = to.id;
      to.properties.push(idx);
      // Mortgaged properties transfer mortgaged (classic rule).
    } else {
      state.ownerId[idx] = null;
      state.mortgaged[idx] = false;
    }
  }
  from.properties = [];
}

function bankrupt(state: GameState, p: PublicPlayer, creditor: PublicPlayer | null) {
  if (p.bankrupt) return;
  p.bankrupt = true;
  if (creditor && creditor.id !== p.id && !creditor.bankrupt) {
    creditor.cash += Math.max(0, p.cash);
    transferProperties(state, p, creditor);
    log(state, 'system', `${p.name} is bankrupt — everything goes to ${creditor.name}.`);
  } else {
    transferProperties(state, p, null);
    log(state, 'system', `${p.name} is bankrupt and is out of the game.`);
  }
  p.cash = 0;
  const left = activePlayers(state);
  if (left.length <= 1) {
    state.phase = 'ended';
    state.winnerId = left[0]?.id ?? null;
    state.awaiting = 'end-turn';
    state.pendingTile = null;
    state.message = left[0] ? `🏆 ${left[0].name} wins the game!` : 'Game over.';
    log(state, 'system', left[0] ? `🏆 ${left[0].name} wins the game!` : 'Game over.');
  }
}

function ownsGroup(state: GameState, ownerId: string | null, group: string): boolean {
  if (!ownerId) return false;
  const tiles = GROUP_TILES[group] ?? [];
  return tiles.length > 0 && tiles.every((i) => state.ownerId[i] === ownerId);
}

export function rentFor(state: GameState, tile: Tile, ownerId: string | null, rentMult = 1): number {
  if (!ownerId) return 0;
  const owner = state.players.find((p) => p.id === ownerId);
  if (!owner) return 0;
  if (state.rules.rentFreeWhenOwnerInJail && owner.inJail) return 0;

  if (tile.kind === 'property' && tile.rent) {
    if (state.mortgaged?.[tile.index]) return 0;
    const level = state.buildings?.[tile.index] ?? 0;
    if (level > 0) return tile.rent[Math.min(level, 5)] * rentMult;
    const fullSet = ownsGroup(state, ownerId, tile.group!);
    const base = fullSet && state.rules.doubleRentFullSet ? tile.rent[0] * 2 : tile.rent[0];
    return base * rentMult;
  }
  if (tile.kind === 'railroad') {
    if (state.mortgaged?.[tile.index]) return 0;
    const count = owner.properties.filter((i) => BOARD[i].kind === 'railroad').length;
    return 25 * Math.pow(2, Math.max(0, count - 1)) * rentMult;
  }
  if (tile.kind === 'utility') {
    if (state.mortgaged?.[tile.index]) return 0;
    const count = owner.properties.filter((i) => BOARD[i].kind === 'utility').length;
    const per = count >= 2 ? 10 : 4;
    const diceTotal = state.dice ? state.dice[0] + state.dice[1] : 7;
    return per * diceTotal * rentMult;
  }
  return 0;
}

function sendToJail(state: GameState, p: PublicPlayer) {
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  state.doublesCount = 0;
  state.canRollAgain = false;
  log(state, 'move', `👮 ${p.name} is sent to jail.`);
}

function advanceTo(state: GameState, p: PublicPlayer, tile: number, collectGo: boolean) {
  const from = p.position;
  const steps = (tile - from + 40) % 40;
  p.position = tile;
  if (collectGo && steps > 0 && from + steps >= 40) earn(state, p, GO_SALARY, 'passing GO');
  log(state, 'move', `${p.name} moves to ${BOARD[tile].name}.`);
}

type Decks = { chance: string[]; chest: string[] };

function resolveLanding(
  state: GameState,
  p: PublicPlayer,
  decks: Decks,
  rentMult = 1,
  depth = 0,
): 'pending' | 'done' {
  if (state.phase === 'ended') return 'done';
  const tile = BOARD[p.position];

  if (tile.kind === 'property' || tile.kind === 'railroad' || tile.kind === 'utility') {
    const owner = state.ownerId[tile.index];
    if (!owner) {
      if (p.cash >= (tile.price ?? 0)) {
        state.awaiting = 'buy';
        state.pendingTile = tile.index;
        state.message = `Buy ${tile.name} for $${tile.price}?`;
        log(state, 'info', `${p.name} may buy ${tile.name} for $${tile.price}.`);
        return 'pending';
      }
      log(state, 'info', `${p.name} cannot afford ${tile.name} ($${tile.price}).`);
      return 'done';
    }
    if (owner === p.id) {
      log(state, 'info', `${p.name} lands on their own ${tile.name}.`);
      return 'done';
    }
    const rent = rentFor(state, tile, owner, rentMult);
    if (rent > 0) {
      bump(state, p.id, 'rentPaid', rent);
      bump(state, owner, 'rentCollected', rent);
    }
    const ownerP = state.players.find((x) => x.id === owner)!;
    payTo(state, p, rent, ownerP, `rent for ${tile.name}`);
    return 'done';
  }

  switch (tile.kind) {
    case 'tax': {
      const amount = tile.amount ?? 0;
      if (state.rules.freeParkingPot) {
        p.cash -= amount;
        state.pot += amount;
        bump(state, p.id, 'taxesPaid', amount);
        log(state, 'money', `${p.name} pays $${amount} — ${tile.name} (adds to the Free Parking pot).`);
        if (p.cash < 0) bankrupt(state, p, null);
      } else {
        bump(state, p.id, 'taxesPaid', amount);
        payTo(state, p, amount, null, tile.name);
      }
      return 'done';
    }
    case 'parking': {
      if (state.pot > 0) {
        const won = state.pot;
        state.pot = 0;
        p.cash += won;
        log(state, 'money', `🅿️ ${p.name} lands on Free Parking and collects the $${won} pot!`);
      } else {
        log(state, 'info', `${p.name} parks for free (pot is empty).`);
      }
      return 'done';
    }
    case 'chance':
    case 'chest':
      drawCard(state, p, decks, tile.kind, rentMult, depth);
      return 'done';
    case 'gotojail':
      sendToJail(state, p);
      return 'done';
    case 'go':
      log(state, 'info', `${p.name} lands on GO.`);
      return 'done';
    default:
      log(state, 'info', `${p.name} lands on ${tile.name}.`);
      return 'done';
  }
}

function drawCard(
  state: GameState,
  p: PublicPlayer,
  decks: Decks,
  deck: 'chance' | 'chest',
  rentMult: number,
  depth: number,
) {
  const ids = decks[deck];
  if (!ids || ids.length === 0) return;
  const cursor = state.cardCursor[deck];
  const cardId = ids[cursor % ids.length];
  state.cardCursor[deck] = (cursor + 1) % ids.length;

  const card = (deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS).find((c) => c.id === cardId);
  if (!card) return;

  state.lastCard = { deck, text: card.text };
  log(state, 'card', `🎴 ${deck === 'chance' ? 'Chance' : 'Community Chest'}: “${card.text}” → ${p.name}`);

  const e = card.effect;
  switch (e.type) {
    case 'moveTo':
      advanceTo(state, p, e.tile, e.collectGo ?? false);
      if (depth < 2) resolveLanding(state, p, decks, rentMult, depth + 1);
      break;
    case 'moveBy':
      p.position = (p.position + e.delta + 40) % 40;
      log(state, 'move', `${p.name} moves to ${BOARD[p.position].name}.`);
      if (depth < 2) resolveLanding(state, p, decks, rentMult, depth + 1);
      break;
    case 'nearest': {
      let i = p.position;
      const want = e.kind === 'railroad' ? 'railroad' : 'utility';
      for (let n = 0; n < 40 && BOARD[i].kind !== want; n++) i = (i + 1) % 40;
      advanceTo(state, p, i, true);
      if (depth < 2) resolveLanding(state, p, decks, e.doubleRent ? 2 : rentMult, depth + 1);
      break;
    }
    case 'bank':
      if (e.amount >= 0) earn(state, p, e.amount, card.text);
      else payTo(state, p, -e.amount, null, card.text);
      break;
    case 'fromEachPlayer':
      for (const other of activePlayers(state)) {
        if (other.id === p.id) continue;
        const amt = Math.min(other.cash, e.amount);
        if (amt <= 0) continue;
        other.cash -= amt;
        p.cash += amt;
        log(state, 'money', `${other.name} gives $${amt} to ${p.name} — birthday gift.`);
      }
      break;
    case 'jail':
      sendToJail(state, p);
      break;
    case 'jailFree':
      p.jailCards += 1;
      break;
  }
}

/* --------------------------------- actions --------------------------------- */

function afterAction(state: GameState, p: PublicPlayer) {
  if (state.phase === 'ended') return;
  if (p.bankrupt) {
    nextTurn(state);
    return;
  }
  if (state.canRollAgain && !p.inJail) {
    state.awaiting = 'roll';
    state.message = `Doubles! Roll again, ${p.name}.`;
    log(state, 'turn', `${p.name} rolled doubles and gets another roll.`);
  } else {
    state.awaiting = 'end-turn';
    state.message = `End your turn, ${p.name}.`;
  }
}

function nextTurn(state: GameState) {
  state.pendingTile = null;
  state.canRollAgain = false;
  state.doublesCount = 0;
  if (state.phase === 'ended') return;

  const n = state.players.length;
  const from = state.turnIndex;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + 1) % n;
    if (i <= from) state.round += 1;
    if (!state.players[i].bankrupt) break;
  }
  state.turnIndex = i;
  state.awaiting = 'roll';
  const p = state.players[i];
  state.message = p.inJail
    ? `${p.name} is in jail — roll doubles or pay $${JAIL_FINE}.`
    : `${p.name}'s turn — roll the dice.`;
  log(state, 'turn', p.inJail ? `🔒 It is ${p.name}'s turn (in jail).` : `🎲 It is ${p.name}'s turn.`);
}

function clone(ctx: GameContext): GameContext {
  return { state: structuredClone(ctx.state), chanceDeck: ctx.chanceDeck, chestDeck: ctx.chestDeck };
}

const decksOf = (ctx: GameContext): Decks => ({ chance: ctx.chanceDeck, chest: ctx.chestDeck });

function finish(state: GameState): void {
  state.updatedAt = Date.now();
}

/** Roll the dice for the current player and resolve the landing. */
export function rollDice(ctx: GameContext, playerId: string, rng: Rng = Math.random): GameContext {
  const next = clone(ctx);
  const state = next.state;
  const decks = decksOf(next);
  assertPlaying(state);
  const p = assertTurn(state, playerId);
  if (state.awaiting !== 'roll') {
    throw new GameError(
      state.awaiting === 'buy' ? 'Buy or decline the property first.' : 'End your turn first.',
    );
  }

  const d1 = d6(rng);
  const d2 = d6(rng);
  state.dice = [d1, d2];
  state.pendingTile = null;
  state.lastCard = null;
  state.canRollAgain = false;
  const total = d1 + d2;
  log(state, 'move', `${p.name} rolls ${d1} + ${d2} = ${total}.`);

  if (p.inJail) {
    let freed = false;
    if (d1 === d2) {
      freed = true;
      p.inJail = false;
      p.jailTurns = 0;
      log(state, 'info', `${p.name} rolls doubles and walks free!`);
    } else {
      p.jailTurns += 1;
      if (p.jailTurns >= JAIL_TURNS_BEFORE_FINE) {
        if (p.jailCards > 0) {
          p.jailCards -= 1;
          p.inJail = false;
          p.jailTurns = 0;
          freed = true;
          log(state, 'info', `${p.name} uses a Get Out of Jail Free card.`);
        } else if (p.cash >= JAIL_FINE) {
          payTo(state, p, JAIL_FINE, null, 'mandatory jail fine');
          p.inJail = false;
          p.jailTurns = 0;
          freed = true;
        } else {
          log(state, 'info', `${p.name} cannot pay the $${JAIL_FINE} fine and stays in jail.`);
        }
      } else {
        log(state, 'info', `${p.name} stays in jail (attempt ${p.jailTurns}/${JAIL_TURNS_BEFORE_FINE}).`);
      }
    }

    if (!freed) {
      state.awaiting = 'end-turn';
      state.message = `End your turn, ${p.name}.`;
      finish(state);
      return next;
    }

    advanceTo(state, p, (p.position + total) % 40, true);
    if (resolveLanding(state, p, decks) === 'pending') {
      finish(state);
      return next;
    }
    state.canRollAgain = false;
    afterAction(state, p);
    finish(state);
    return next;
  }

  if (d1 === d2) {
    state.doublesCount += 1;
    if (state.doublesCount >= 3) {
      log(state, 'system', `Three doubles in a row — ${p.name} goes to jail!`);
      sendToJail(state, p);
      state.awaiting = 'end-turn';
      state.message = `End your turn, ${p.name}.`;
      finish(state);
      return next;
    }
    state.canRollAgain = true;
  } else {
    state.doublesCount = 0;
    state.canRollAgain = false;
  }

  advanceTo(state, p, (p.position + total) % 40, true);
  if (resolveLanding(state, p, decks) === 'pending') {
    finish(state);
    return next;
  }
  afterAction(state, p);
  finish(state);
  return next;
}

export function buyPending(ctx: GameContext, playerId: string): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = assertTurn(state, playerId);
  if (state.awaiting !== 'buy' || state.pendingTile === null) {
    throw new GameError('There is nothing to buy right now.');
  }
  const tile = BOARD[state.pendingTile];
  const price = tile.price ?? 0;
  if (p.cash < price) throw new GameError('You cannot afford that.');
  p.cash -= price;
  p.properties.push(tile.index);
  state.ownerId[tile.index] = p.id;
  state.pendingTile = null;
  bump(state, p.id, 'buys');
  log(state, 'money', `${p.name} buys ${tile.name} for $${price}.`);
  afterAction(state, p);
  finish(state);
  return next;
}

export function passBuy(ctx: GameContext, playerId: string): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = assertTurn(state, playerId);
  if (state.awaiting !== 'buy' || state.pendingTile === null) {
    throw new GameError('There is nothing to decline.');
  }
  const tile = BOARD[state.pendingTile];
  const tileIndex = state.pendingTile;
  state.pendingTile = null;
  log(state, 'info', `${p.name} declines to buy ${tile.name}.`);
  if (state.rules.auction) {
    openAuction(state, tileIndex);
    finish(state);
    return next;
  }
  afterAction(state, p);
  finish(state);
  return next;
}

/* --------------------------------- auction --------------------------------- */

function openAuction(state: GameState, tileIndex: number) {
  const auction: AuctionState = {
    tile: tileIndex,
    highestBid: 0,
    highestBidderId: null,
    endsAt: Date.now() + AUCTION_MS,
    bidders: [],
  };
  state.auction = auction;
  state.awaiting = 'auction';
  state.message = `Auction for ${BOARD[tileIndex].name} — place your bids!`;
  log(state, 'system', `🔨 Auction started for ${BOARD[tileIndex].name}.`);
}

/** Any player at the table may bid while an auction is open. */
export function bid(ctx: GameContext, playerId: string, amount: number): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const auction = state.auction;
  if (!auction || state.awaiting !== 'auction') throw new GameError('No auction is running.');
  const p = byId(state, playerId);
  if (p.bankrupt) throw new GameError('You are out of the game.');
  const bidValue = Math.floor(Number(amount));
  const minBid = auction.highestBid > 0 ? auction.highestBid + 1 : 1;
  if (!Number.isFinite(bidValue) || bidValue < minBid) {
    throw new GameError(`The next bid must be at least $${minBid}.`);
  }
  if (bidValue > p.cash) throw new GameError(`You only have $${p.cash}.`);

  auction.highestBid = bidValue;
  auction.highestBidderId = p.id;
  if (!auction.bidders.includes(p.id)) auction.bidders.push(p.id);
  // Every bid refreshes the clock so nobody is sniped at the last millisecond.
  auction.endsAt = Date.now() + AUCTION_BID_RESET_MS;
  log(state, 'money', `${p.name} bids $${bidValue} on ${BOARD[auction.tile].name}.`);
  state.message = `Auction: ${p.name} bids $${bidValue} on ${BOARD[auction.tile].name}.`;
  finish(state);
  return next;
}

/** Called when the auction clock runs out — awards the property. */
export function settleAuction(ctx: GameContext): GameContext {
  const state = ctx.state;
  if (!state.auction || state.awaiting !== 'auction') return ctx;

  const next = clone(ctx);
  const s = next.state;
  const auction = s.auction!;
  const tile = BOARD[auction.tile];
  const winnerId = auction.highestBidderId;
  const bidValue = auction.highestBid;
  s.auction = null;
  s.pendingTile = null;

  const winner = winnerId ? s.players.find((p) => p.id === winnerId) : undefined;
  if (winner && !winner.bankrupt && bidValue > 0 && bidValue <= winner.cash) {
    winner.cash -= bidValue;
    winner.properties.push(tile.index);
    s.ownerId[tile.index] = winner.id;
    bump(s, winner.id, 'buys');
    bump(s, winner.id, 'auctionWins');
    log(s, 'money', `🔨 ${winner.name} wins the auction for ${tile.name} at $${bidValue}.`);
  } else if (winnerId && bidValue > 0) {
    log(s, 'system', `Auction for ${tile.name} fell through — no valid winner.`);
  } else {
    log(s, 'system', `No bids for ${tile.name} — it stays with the bank.`);
  }

  const current = s.players[s.turnIndex];
  if (current && !current.bankrupt) afterAction(s, current);
  else nextTurn(s);
  finish(s);
  return next;
}

export function isAuctionDue(state: GameState): boolean {
  return !!state.auction && state.auction.endsAt <= Date.now();
}

/** Host-only rule toggles, editable while the room is still in the lobby. */
export function setRules(
  ctx: GameContext,
  playerId: string,
  patch: Partial<Rules>,
): GameContext {
  const next = clone(ctx);
  const state = next.state;
  const requester = byId(state, playerId);
  if (!requester.isHost) throw new GameError('Only the host can change the rules.');
  if (state.phase === 'playing') throw new GameError('Rules are locked once the game starts.');
  const allowed: (keyof Rules)[] = ['doubleRentFullSet', 'rentFreeWhenOwnerInJail', 'freeParkingPot', 'auction'];
  for (const key of allowed) {
    if (typeof patch[key] === 'boolean') state.rules[key] = patch[key] as boolean;
  }
  log(state, 'system', `⚙️ House rules updated by ${requester.name}.`);
  finish(state);
  return next;
}

export function payBail(ctx: GameContext, playerId: string): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = assertTurn(state, playerId);
  if (state.awaiting !== 'roll') throw new GameError('You cannot pay bail right now.');
  if (!p.inJail) throw new GameError('You are not in jail.');
  if (p.jailCards > 0) {
    p.jailCards -= 1;
    p.inJail = false;
    p.jailTurns = 0;
    log(state, 'info', `${p.name} uses a Get Out of Jail Free card.`);
  } else {
    if (p.cash < JAIL_FINE) throw new GameError(`You need $${JAIL_FINE} to pay bail.`);
    payTo(state, p, JAIL_FINE, null, 'jail bail');
    p.inJail = false;
    p.jailTurns = 0;
  }
  state.message = `${p.name} is out of jail — roll the dice.`;
  finish(state);
  return next;
}

export function endTurn(ctx: GameContext, playerId: string): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = assertTurn(state, playerId);
  if (state.awaiting !== 'end-turn') throw new GameError('Finish your move first.');
  nextTurn(state);
  finish(state);
  return next;
}

/** Host starts the game once at least 2 players are present. */
export function startGame(ctx: GameContext, byPlayerId: string): GameContext {
  const next = clone(ctx);
  const state = next.state;
  if (state.phase !== 'lobby') throw new GameError('The game has already started.');
  const starter = byId(state, byPlayerId);
  if (!starter.isHost) throw new GameError('Only the host can start the game.');
  if (activePlayers(state).length < 2) throw new GameError('You need at least 2 players.');
  state.phase = 'playing';
  state.startedAt = Date.now();
  state.turnIndex = 0;
  state.round = 1;
  state.awaiting = 'roll';
  state.message = `${state.players[0].name}'s turn — roll the dice.`;
  log(state, 'system', '🏁 The game has started! Each player begins with $1500.');
  log(state, 'turn', `🎲 It is ${state.players[0].name}'s turn.`);
  finish(state);
  return next;
}

/* --------------------- buildings & mortgages (phase 2) ---------------------- */

/** Indices of the colour-group property tiles (railroads/utilities excluded). */
function groupPropIndices(group: string): number[] {
  return (GROUP_TILES[group] ?? []).filter((i) => BOARD[i].kind === 'property');
}

function assertBuyableKind(tile: Tile, what: string) {
  if (tile.kind !== 'property' && tile.kind !== 'railroad' && tile.kind !== 'utility') {
    throw new GameError(`${what} only applies to streets, stations and utilities.`);
  }
}

function tileAt(index: number): Tile {
  const idx = Math.floor(Number(index));
  const tile = BOARD[idx];
  if (!tile) throw new GameError('Unknown tile.');
  return tile;
}

/**
 * Build a house (or upgrade the 4th house into a hotel) on a colour-group tile.
 * Classic rules: own the whole set, nothing mortgaged in it, build evenly,
 * 4 houses then a hotel per tile.
 */
export function buildOn(ctx: GameContext, playerId: string, tileIndex: number): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = byId(state, playerId);
  const tile = tileAt(tileIndex);
  if (tile.kind !== 'property' || !tile.group) {
    throw new GameError('Only colour-group streets can take buildings.');
  }
  if (state.ownerId[tile.index] !== p.id) throw new GameError('You do not own that street.');

  const group = tile.group;
  const indices = groupPropIndices(group);
  if (indices.some((i) => state.mortgaged[i])) {
    throw new GameError('Unmortgage every street in the set before building.');
  }
  if (!indices.every((i) => state.ownerId[i] === p.id)) {
    throw new GameError('Own the whole colour set before building.');
  }
  const level = state.buildings[tile.index] ?? 0;
  if (level >= MAX_BUILDING_LEVEL) throw new GameError('A hotel is the maximum.');
  const min = Math.min(...indices.map((i) => state.buildings[i] ?? 0));
  if (level > min) throw new GameError('Build evenly — improve the least-built streets first.');

  const cost = tile.houseCost ?? 0;
  if (p.cash < cost) throw new GameError(`You need $${cost} to build here.`);
  p.cash -= cost;
  state.buildings[tile.index] = level + 1;
  log(
    state,
    'money',
    level + 1 === MAX_BUILDING_LEVEL
      ? `🏨 ${p.name} raises a hotel on ${tile.name}.`
      : `🏠 ${p.name} builds a house on ${tile.name} (${level + 1}/4).`,
  );
  finish(state);
  return next;
}

/** Sell one building back to the bank at half price (even sell-off, the reverse of build). */
export function sellBuilding(ctx: GameContext, playerId: string, tileIndex: number): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = byId(state, playerId);
  const tile = tileAt(tileIndex);
  if (tile.kind !== 'property' || !tile.group) {
    throw new GameError('Only colour-group streets can have buildings.');
  }
  if (state.ownerId[tile.index] !== p.id) throw new GameError('You do not own that street.');
  const level = state.buildings[tile.index] ?? 0;
  if (level <= 0) throw new GameError('There is nothing to sell here.');
  const indices = groupPropIndices(tile.group);
  const max = Math.max(...indices.map((i) => state.buildings[i] ?? 0));
  if (level < max) throw new GameError('Sell from the most-built streets first.');
  const refund = Math.floor((tile.houseCost ?? 0) / 2);
  state.buildings[tile.index] = level - 1;
  p.cash += refund;
  log(
    state,
    'money',
    level === MAX_BUILDING_LEVEL
      ? `🏨 ${p.name} sells the hotel on ${tile.name} for $${refund}.`
      : `🏠 ${p.name} sells a house on ${tile.name} for $${refund}.`,
  );
  finish(state);
  return next;
}

/** Mortgage a property for half its price. No rent is collected until unmortgaged.
 *  Every building in the same colour set must be sold first. */
export function mortgageTile(ctx: GameContext, playerId: string, tileIndex: number): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = byId(state, playerId);
  const tile = tileAt(tileIndex);
  assertBuyableKind(tile, 'Mortgaging');
  if (state.ownerId[tile.index] !== p.id) throw new GameError('You do not own that.');
  if (state.mortgaged[tile.index]) throw new GameError('That is already mortgaged.');
  const group = tile.group ? groupPropIndices(tile.group) : [tile.index];
  if (group.some((i) => (state.buildings[i] ?? 0) > 0)) {
    throw new GameError('Sell all buildings in the set before mortgaging it.');
  }
  const value = mortgageValue(tile);
  state.mortgaged[tile.index] = true;
  p.cash += value;
  log(state, 'money', `💰 ${p.name} mortgages ${tile.name} for $${value}.`);
  finish(state);
  return next;
}

/** Unmortgage: repay the mortgage plus 10% interest. */
export function unmortgageTile(ctx: GameContext, playerId: string, tileIndex: number): GameContext {
  const next = clone(ctx);
  const state = next.state;
  assertPlaying(state);
  const p = byId(state, playerId);
  const tile = tileAt(tileIndex);
  assertBuyableKind(tile, 'Unmortgaging');
  if (state.ownerId[tile.index] !== p.id) throw new GameError('You do not own that.');
  if (!state.mortgaged[tile.index]) throw new GameError('That is not mortgaged.');
  const cost = unmortgageCost(tile);
  if (p.cash < cost) throw new GameError(`You need $${cost} to lift the mortgage.`);
  p.cash -= cost;
  state.mortgaged[tile.index] = false;
  log(state, 'money', `🔓 ${p.name} lifts the mortgage on ${tile.name} for $${cost} (incl. 10% interest).`);
  finish(state);
  return next;
}

/** Resolve an auction that was open when the server stopped.
 *  Highest bid stands; otherwise the property returns to the bank. */
export function closeRestoredAuction(ctx: GameContext): GameContext {
  if (!ctx.state.auction) return ctx;
  const noted = clone(ctx);
  log(noted.state, 'system', '🔨 The auction closed while the server was down — the highest bid stands.');
  return settleAuction(noted);
}
