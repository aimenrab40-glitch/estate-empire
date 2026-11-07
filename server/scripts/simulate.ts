/**
 * Headless engine simulation — validates the game rules end-to-end without a
 * browser. Run with:  npx tsx server/scripts/simulate.ts [players] [turns]
 */
import {
  createGame,
  startGame,
  rollDice,
  buyPending,
  passBuy,
  endTurn,
  payBail,
  bid,
  settleAuction,
  rentFor,
  type GameContext,
} from '../src/game/engine.js';
import { BOARD, STARTING_CASH, isBuyable } from '../../shared/src/board.js';
import type { PublicPlayer } from '../../shared/src/types.js';

const playerCount = Number(process.argv[2] ?? 4);
const maxTurns = Number(process.argv[3] ?? 4000);

/** Deterministic LCG so runs are reproducible. */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const rng = makeRng(20261106);

const members = Array.from({ length: playerCount }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Player ${i + 1}`,
  avatar: 'tophat',
  isHost: i === 0,
}));

let ctx: GameContext = createGame('SIM001', members, playerCount, undefined, rng);
ctx = startGame(ctx, 'p1');

const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    console.error(`\n❌ ASSERTION FAILED: ${msg}`);
    console.error(JSON.stringify(ctx.state.players.map((p) => ({ id: p.id, cash: p.cash, pos: p.position })), null, 2));
    process.exit(1);
  }
};

let actions = 0;
let auctionsRun = 0;
let propertiesBought = 0;
let rentsPaid = 0;
let jailVisits = 0;

for (let i = 0; i < maxTurns && ctx.state.phase === 'playing'; i++) {
  const s = ctx.state;
  const me: PublicPlayer = s.players[s.turnIndex];

  for (const p of s.players) {
    assert(Number.isFinite(p.cash), `cash must stay numeric (${p.name} = ${p.cash})`);
    assert(p.position >= 0 && p.position < 40, `position out of range for ${p.name}`);
    assert(p.cash >= 0 || p.bankrupt, `${p.name} went negative without bankruptcy`);
  }

  if (s.awaiting === 'buy') {
    const tile = BOARD[s.pendingTile!];
    assert(isBuyable(tile), `pendingTile ${s.pendingTile} is not buyable`);
    const before = me.cash;
    if (me.cash >= (tile.price ?? 0) && rng() > 0.35) {
      const ownerBefore = s.ownerId[tile.index];
      ctx = buyPending(ctx, me.id);
      propertiesBought++;
      assert(ctx.state.ownerId[tile.index] === me.id, 'buyer must own the tile');
      assert(ctx.state.players[s.turnIndex].cash === before - (tile.price ?? 0), 'cash deducted by price');
      assert(ownerBefore === null, 'tile must have been unowned');
    } else {
      ctx = passBuy(ctx, me.id);
      if (ctx.state.awaiting === 'auction') {
        // everyone gets a couple of bids, then the clock runs out
        for (const p of ctx.state.players) {
          if (p.bankrupt || rng() < 0.3) continue;
          const a = ctx.state.auction!;
          const min = a.highestBid > 0 ? a.highestBid + 1 : 1;
          if (min <= p.cash && rng() > 0.4) {
            ctx = bid(ctx, p.id, min + Math.floor(rng() * 20));
          }
        }
        ctx = settleAuction(ctx);
        auctionsRun++;
        assert(ctx.state.auction === null, 'auction must be cleared after settling');
        assert(ctx.state.awaiting !== 'auction', 'awaiting must leave auction state');
      }
    }
    actions++;
    continue;
  }

  if (s.awaiting === 'end-turn') {
    const turnBefore = s.turnIndex;
    ctx = endTurn(ctx, me.id);
    assert(ctx.state.awaiting === 'roll', 'after endTurn the next player must be able to roll');
    assert(ctx.state.turnIndex !== turnBefore || ctx.state.players.length === 1, 'turn must advance');
    actions++;
    continue;
  }

  // awaiting === 'roll'
  if (me.inJail && rng() < 0.4 && me.cash >= 50) {
    ctx = payBail(ctx, me.id);
    assert(!ctx.state.players[s.turnIndex].inJail, 'bail must free the player');
    actions++;
  }

  const posBefore = ctx.state.players[ctx.state.turnIndex].position;
  const cashBefore = ctx.state.players[ctx.state.turnIndex].cash;
  const ownedBefore = ctx.state.ownerId.filter(Boolean).length;
  ctx = rollDice(ctx, me.id, rng);
  const after = ctx.state.players[s.turnIndex];
  actions++;

  const moved = after.position !== posBefore || after.inJail;
  const ownedAfter = ctx.state.ownerId.filter(Boolean).length;
  assert(ownedAfter >= ownedBefore, 'ownership must never decrease');
  if (ownedAfter > ownedBefore) rentsPaid += 0; // ownership change only via buy/auction
  if (after.inJail && !moved) jailVisits++;
  assert(cashBefore !== after.cash || moved || ctx.state.dice !== null, 'roll must do something');

  // If a card put someone in an auction-free pending state we already handled.
  assert(
    ['roll', 'buy', 'end-turn'].includes(ctx.state.awaiting),
    `unexpected awaiting state: ${ctx.state.awaiting}`,
  );
}

const s = ctx.state;
console.log('────────── simulation report ──────────');
console.log(`players          : ${playerCount}`);
console.log(`phase            : ${s.phase}`);
console.log(`rounds           : ${s.round}`);
console.log(`actions run      : ${actions}`);
console.log(`properties owned : ${s.ownerId.filter(Boolean).length}`);
console.log(`auctions settled : ${auctionsRun}`);
console.log(`properties bought: ${propertiesBought}`);
console.log(`free-parking pot : $${s.pot}`);
console.log(`log entries      : ${s.log.length}`);
console.log(
  'balances         :',
  s.players.map((p) => `${p.name}=$${p.cash}${p.bankrupt ? '(out)' : ''}${p.inJail ? '(jail)' : ''}`).join('  '),
);

// extra rule sanity checks
assert(s.players.length === playerCount, 'player count preserved');
assert(s.players.every((p) => p.id !== '' ), 'ids present');
assert(s.log.length > 0, 'log has entries');

// rent table sanity
const brown1 = BOARD[1];
assert(rentFor(s, brown1, s.ownerId[1] ?? null) >= 0, 'rent must be non-negative');

console.log('────────── rule spot-checks ───────────');
const rail = BOARD[5];
const owner = s.players.find((p) => p.properties.includes(5));
if (owner) {
  console.log(`North Station rent for ${owner.name}: $${rentFor(s, rail, owner.id)}`);
} else {
  console.log('North Station unowned in this run');
}
console.log(`bankrupt players: ${s.players.filter((p) => p.bankrupt).length}`);
console.log('\n✅ simulation passed — no invariant broken');
