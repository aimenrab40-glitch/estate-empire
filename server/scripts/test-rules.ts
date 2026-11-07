/**
 * Targeted rule tests for the parts the long simulation cannot reach quickly:
 * wrong-turn guards, GO salary, bankruptcy, jail and bail.
 * Run with:  npx tsx server/scripts/test-rules.ts
 */
import {
  createGame,
  startGame,
  rollDice,
  endTurn,
  payBail,
  GameError,
  type GameContext,
} from '../src/game/engine.js';

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

/** Returns values in order, repeating the last one forever. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

/** Test fixture: hand the turn straight back to Alice without simulating Bob. */
const toAlice = (c: GameContext): GameContext => {
  c.state.turnIndex = 0;
  c.state.awaiting = 'roll';
  c.state.doublesCount = 0;
  c.state.canRollAgain = false;
  return c;
};

const freshGame = (seed = 1): GameContext => {
  const members = [
    { id: 'p1', name: 'Alice', avatar: 'car', isHost: true },
    { id: 'p2', name: 'Bob', avatar: 'dog', isHost: false },
  ];
  const rng = seq(0.2, 0.05);
  return createGame('TEST01', members, 6, undefined, rng);
};

/* ------------------------------- turn guards ------------------------------- */
console.log('\nTurn guards');
{
  let ctx = freshGame();
  expectError(() => rollDice(ctx, 'p1'), 'not started', 'roll before the game starts is rejected');
  expectError(() => startGame(ctx, 'p2'), 'Only the host', 'non-host cannot start the game');
  ctx = startGame(ctx, 'p1');
  expectError(() => rollDice(ctx, 'p2'), "Alice's turn", 'rolling out of turn is rejected');
  expectError(() => endTurn(ctx, 'p1'), 'Finish your move', 'ending a turn before rolling is rejected');
  check(ctx.state.players[0].cash === 1500, 'starting balance is $1500');
  check(ctx.state.players[1].cash === 1500, 'second player starts with $1500');
}

/* --------------------------------- GO salary -------------------------------- */
console.log('\nPassing GO');
{
  let ctx = startGame(freshGame(), 'p1');
  ctx.state.players[0].position = 37; // 3 tiles from GO
  const before = ctx.state.players[0].cash;
  ctx = rollDice(ctx, 'p1', seq(0.2, 0.05)); // 2 + 1 = 3 → lands on GO
  const after = ctx.state.players[0];
  check(after.position === 0, `lands on GO (position ${after.position})`);
  check(after.cash === before + 200, `collects the $200 salary ($${before} → $${after.cash})`);
}

/* --------------------------------- jail ------------------------------------ */
console.log('\nJail');
{
  let ctx = startGame(freshGame(), 'p1');
  ctx.state.players[0].position = 28; // 1 + 1 lands on Go To Jail (30)
  ctx = rollDice(ctx, 'p1', seq(0.0, 0.0)); // 1 + 1 → tile 30 (doubles, but jail wins)
  const p1 = ctx.state.players[0];
  check(p1.position === 10 && p1.inJail, 'Go To Jail sends the player to jail');
  check(ctx.state.awaiting === 'end-turn', 'turn ends after going to jail');

  ctx = endTurn(ctx, 'p1');
  ctx = toAlice(ctx); // Bob never rolled in this fixture — hand the turn back
  ctx = rollDice(ctx, 'p1', seq(0.7, 0.7)); // 5 + 5 doubles → walks free, lands on Free Parking
  const freed = ctx.state.players[0];
  check(!freed.inJail, 'rolling doubles releases from jail');
  check(freed.position === 20, `moves by the roll after release (position ${freed.position})`);
  check(ctx.state.awaiting === 'end-turn', 'turn ends after leaving jail');

  // pay bail instead of rolling doubles
  ctx = endTurn(ctx, 'p1');
  ctx = toAlice(ctx);
  const cashBefore = ctx.state.players[0].cash;
  ctx.state.players[0].position = 28;
  ctx = rollDice(ctx, 'p1', seq(0.0, 0.0));
  check(ctx.state.players[0].inJail, 'back in jail for the bail check');
  ctx = endTurn(ctx, 'p1');
  ctx = toAlice(ctx);
  ctx = payBail(ctx, 'p1');
  const jailed = ctx.state.players[0];
  check(!jailed.inJail, 'paying bail releases the player');
  check(jailed.cash === cashBefore - 50, `bail costs $50 ($${cashBefore} → $${jailed.cash})`);
}

/* ------------------------------- bankruptcy -------------------------------- */
console.log('\nBankruptcy');
{
  let ctx = startGame(freshGame(), 'p1');
  const p1 = ctx.state.players[0];
  const p2 = ctx.state.players[1];

  // Alice owns all four stations → rent on North Station = $200
  for (const t of [5, 15, 25, 35]) {
    ctx.state.ownerId[t] = p1.id;
    p1.properties.push(t);
  }
  p2.position = 3; // 2 tiles away from North Station
  p2.cash = 50; // not enough to cover the $200 rent

  // Hand the turn straight to Bob (Alice has nothing to resolve in this fixture).
  ctx.state.turnIndex = 1;
  ctx.state.awaiting = 'roll';
  ctx = rollDice(ctx, 'p2', seq(0.0, 0.0)); // 1 + 1 = 2 → lands on North Station

  const state = ctx.state;
  check(state.players[1].bankrupt, 'player who cannot pay rent goes bankrupt');
  check(state.phase === 'ended' && state.winnerId === 'p1', 'last player standing wins');
  check(state.players[0].properties.includes(5) && state.players[1].properties.length === 0, 'assets transfer to the creditor');
  check(state.players[1].cash === 0, 'bankrupt player is left with $0');
  expectError(() => rollDice(ctx, 'p1'), 'over', 'actions after the game ends are rejected');
}

/* -------------------------------- summary ---------------------------------- */
console.log(`\n${failed === 0 ? '✅' : '❌'} rule tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
