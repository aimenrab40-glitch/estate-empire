/**
 * Phase 2 rules: houses, hotels, mortgages, stats and restart restore.
 * Run with:  npx tsx server/scripts/test-buildings.ts
 */
import {
  createGame,
  startGame,
  rehydrateGame,
  buildOn,
  sellBuilding,
  mortgageTile,
  unmortgageTile,
  buyPending,
  rentFor,
  closeRestoredAuction,
  GameError,
  type GameContext,
} from '../src/game/engine.js';
import { BOARD } from '../../shared/src/board.js';

let passed = 0;
let failed = 0;

const check = (cond: boolean, label: string) => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
};

const expectError = (fn: () => unknown, match: string, label: string) => {
  try {
    fn();
    failed++;
    console.log(`  ✗ ${label} (no error thrown)`);
  } catch (err) {
    if (err instanceof GameError && err.message.includes(match)) {
      passed++;
      console.log(`  ✓ ${label} → "${err.message}"`);
    } else {
      failed++;
      console.log(`  ✗ ${label} (wrong error: ${(err as Error).message})`);
    }
  }
};

const freshGame = (): GameContext => {
  const members = [
    { id: 'p1', name: 'Alice', avatar: 'car', isHost: true },
    { id: 'p2', name: 'Bob', avatar: 'dog', isHost: false },
  ];
  return startGame(createGame('TEST02', members, 6, undefined, () => 0.5), 'p1');
};

/** Hand tiles to a player directly (test fixture). */
const grant = (ctx: GameContext, playerId: string, tiles: number[]) => {
  const s = ctx.state;
  for (const t of tiles) {
    if (!s.players.find((p) => p.id === playerId)!.properties.includes(t)) {
      s.players.find((p) => p.id === playerId)!.properties.push(t);
    }
    s.ownerId[t] = playerId;
  }
  return ctx;
};

const BROWN = [1, 3]; // Baker Street / Harbour Lane — houseCost 50, rent ladder differs
const P1_CASH = 1500;

console.log('\nPhase 2 fixtures');
{
  const ctx = freshGame();
  check(Array.isArray(ctx.state.buildings) && ctx.state.buildings.length === 40, 'buildings array has 40 slots');
  check(Array.isArray(ctx.state.mortgaged) && ctx.state.mortgaged.length === 40, 'mortgaged array has 40 slots');
  check(!!ctx.state.stats?.p1 && ctx.state.stats.p1.rentPaid === 0, 'stats initialised for p1');
}

console.log('\nBuilding — ownership & set rules');
{
  let ctx = freshGame();
  grant(ctx, 'p1', [1]); // only half the brown set
  expectError(() => buildOn(ctx, 'p1', 1), 'Own the whole colour set', 'cannot build without owning the full set');
  expectError(() => buildOn(ctx, 'p2', 1), 'You do not own', 'cannot build on somebody else’s street');

  ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  ctx = buildOn(ctx, 'p1', 1);
  check(ctx.state.buildings[1] === 1, 'first house built on tile 1');
  expectError(() => buildOn(ctx, 'p1', 1), 'Build evenly', 'even-build enforced (other tile still empty)');
  ctx = buildOn(ctx, 'p1', 3);
  check(ctx.state.buildings[3] === 1, 'house built on tile 3');
  ctx = buildOn(ctx, 'p1', 1);
  check(ctx.state.buildings[1] === 2, 'second house on tile 1 after levelling');
  check(ctx.state.players[0].cash === P1_CASH - 150, 'three houses cost $150');
}

console.log('\nBuilding — hotels & caps');
{
  let ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  // Level both tiles to 4 houses, then upgrade each to a hotel.
  for (const level of [1, 2, 3, 4]) {
    ctx = buildOn(ctx, 'p1', 1);
    ctx = buildOn(ctx, 'p1', 3);
  }
  ctx = buildOn(ctx, 'p1', 1);
  check(ctx.state.buildings[1] === 5, '4 houses upgraded into a hotel (level 5)');
  ctx = buildOn(ctx, 'p1', 3);
  check(ctx.state.buildings[3] === 5, 'second hotel on the other tile');
  expectError(() => buildOn(ctx, 'p1', 1), 'hotel is the maximum', 'a hotel is the maximum level');
  check(ctx.state.players[0].cash === P1_CASH - 10 * 50, 'ten buildings at $50 cost $500');
}

console.log('\nRent ladder & double-rent rule');
{
  let ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  const tile1 = BOARD[1];
  check(rentFor(ctx.state, tile1, 'p1') === tile1.rent![0] * 2, 'full set with no houses doubles base rent (rule on)');
  ctx = buildOn(ctx, 'p1', 1);
  ctx = buildOn(ctx, 'p1', 3);
  check(rentFor(ctx.state, tile1, 'p1') === tile1.rent![1], '1 house pays the 1-house rent (no doubling on improved tiles)');
}

console.log('\nMortgages');
{
  let ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  ctx = mortgageTile(ctx, 'p1', 1);
  check(ctx.state.mortgaged[1] === true, 'tile 1 marked mortgaged');
  check(ctx.state.players[0].cash === P1_CASH + 30, 'mortgage pays half price ($30)');
  check(rentFor(ctx.state, BOARD[1], 'p1') === 0, 'mortgaged tile collects no rent');
  expectError(() => buildOn(ctx, 'p1', 1), 'Unmortgage every street', 'mortgage blocks building in the set');
  ctx = unmortgageTile(ctx, 'p1', 1);
  check(ctx.state.mortgaged[1] === false, 'mortgage lifted');
  check(ctx.state.players[0].cash === P1_CASH + 30 - 33, 'unmortgage costs mortgage + 10% interest ($33)');

  // Buildings block mortgaging.
  ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  ctx = buildOn(ctx, 'p1', 1);
  expectError(() => mortgageTile(ctx, 'p1', 1), 'Sell all buildings', 'cannot mortgage a set with buildings');
  ctx = sellBuilding(ctx, 'p1', 1);
  check(ctx.state.buildings[1] === 0 && ctx.state.players[0].cash === P1_CASH - 50 + 25, 'selling a house refunds half');
}

console.log('\nSelling buildings — even sell-off');
{
  let ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  ctx = buildOn(ctx, 'p1', 1);
  ctx = buildOn(ctx, 'p1', 3);
  ctx = buildOn(ctx, 'p1', 1);
  expectError(() => sellBuilding(ctx, 'p1', 3), 'most-built streets first', 'even sell-off enforced');
  ctx = sellBuilding(ctx, 'p1', 1);
  check(ctx.state.buildings[1] === 1, 'sold from the most-built street');
}

console.log('\nStats counters');
{
  let ctx = freshGame();
  grant(ctx, 'p1', [5]);
  ctx.state.awaiting = 'buy';
  ctx.state.pendingTile = 15;
  ctx = buyPending(ctx, 'p1');
  check((ctx.state.stats?.p1?.buys ?? 0) === 1, 'buying increments buys stat');
}

console.log('\nSnapshot restore (pre-Phase-2 payloads)');
{
  const ctx = freshGame();
  grant(ctx, 'p1', BROWN);
  const legacy = JSON.parse(JSON.stringify(ctx.state)) as Record<string, unknown>;
  delete legacy.buildings;
  delete legacy.mortgaged;
  delete legacy.stats;
  legacy.players = (legacy.players as Record<string, unknown>[]).map((p) => ({
    ...p,
    connected: true, // pretend everyone was "connected" when the snapshot was taken
  }));
  const restored = rehydrateGame(legacy as never, ['c1'], ['h1']);
  check(Array.isArray(restored.state.buildings) && restored.state.buildings.length === 40, 'buildings normalised from legacy snapshot');
  check(Array.isArray(restored.state.mortgaged) && restored.state.mortgaged.every((m) => m === false), 'mortgaged normalised from legacy snapshot');
  check(restored.state.players.every((p) => p.connected === false), 'all players marked disconnected after restore');
  check((restored.state.stats?.p1?.buys ?? -1) === 0, 'stats zeroed-in for legacy players');
  check(restored.chanceDeck.length === 1 && restored.chestDeck.length === 1, 'decks preserved');
}

console.log('\nAuction restore — highest bid stands after a crash');
{
  let ctx = freshGame();
  grant(ctx, 'p2', []);
  ctx.state.awaiting = 'auction';
  ctx.state.auction = {
    tile: 1,
    highestBid: 75,
    highestBidderId: 'p2',
    endsAt: Date.now() - 5_000, // already due — expired during the outage
    bidders: ['p2'],
  };
  const p2cash = ctx.state.players[1].cash;
  const restored = closeRestoredAuction(ctx);
  check(restored.state.auction === null, 'restored auction is closed');
  check(restored.state.ownerId[1] === 'p2', 'property awarded to the highest bidder');
  check(restored.state.players[1].cash === p2cash - 75, 'winning bid was charged');
  check(restored.state.awaiting === 'end-turn', 'turn flow resumes after the auction settles');
  check((restored.state.stats?.p2?.auctionWins ?? 0) === 1, 'auction win recorded in stats');
  check((restored.state.stats?.p2?.buys ?? 0) === 1, 'auction win counts as a purchase');

  // No bids at all → property returns to the bank, game continues.
  const ctx2 = freshGame();
  ctx2.state.awaiting = 'auction';
  ctx2.state.auction = {
    tile: 1,
    highestBid: 0,
    highestBidderId: null,
    endsAt: Date.now() - 1000,
    bidders: [],
  };
  const restored2 = closeRestoredAuction(ctx2);
  check(restored2.state.ownerId[1] === null, 'unbid property returns to the bank');
  check(restored2.state.awaiting === 'end-turn', 'turn flow resumes with no winner');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
