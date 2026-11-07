/**
 * Headless Mafia simulation — validates full games end-to-end.
 * Run with: npx tsx server/scripts/simulate.ts [players]
 */
import { createGame, startGame, nightAction, resolveNight, vote, resolveVote, type GameContext } from '../src/game/engine.js';

const playerCount = Number(process.argv[2] ?? 6);

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const rng = makeRng(7);
const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`);
let ctx: GameContext = createGame('SIM000', ids.map((id) => ({ id, name: id, avatar: 'tophat', isHost: id === ids[0] })), playerCount);
ctx = startGame(ctx, ids[0], rng);

let actions = 0;
let guard = 0;
while (ctx.state.phase !== 'ended' && guard < 500) {
  guard++;
  if (ctx.state.phase === 'night') {
    const night = ctx.state.night;
    const alive = ctx.state.players.filter((p) => p.alive);
    const mafia = alive.find((p) => p.role === 'mafia');
    const doctor = alive.find((p) => p.role === 'doctor');
    const sheikh = alive.find((p) => p.role === 'sheikh');
    const detective = alive.find((p) => p.role === 'detective');
    const others = alive.filter((p) => p.id !== mafia?.id);
    if (mafia && others.length) ctx = nightAction(ctx, mafia.id, 'kill', others[Math.floor(rng() * others.length)].id).ctx;
    if (doctor) {
      const t = alive[Math.floor(rng() * alive.length)];
      ctx = nightAction(ctx, doctor.id, 'save', t.id).ctx;
    }
    if (sheikh && ctx.state.shieldCharges > 0) {
      const t = alive[Math.floor(rng() * alive.length)];
      ctx = nightAction(ctx, sheikh.id, 'shield', t.id).ctx;
    }
    if (detective) {
      const t = alive.find((p) => p.id !== detective.id) ?? alive[0];
      if (t) ctx = nightAction(ctx, detective.id, 'investigate', t.id).ctx;
    }
    actions++;
    ctx = resolveNight(ctx);
  } else if (ctx.state.phase === 'day') {
    const alive = ctx.state.players.filter((p) => p.alive);
    for (const p of alive) {
      const targets = alive.filter((t) => t.id !== p.id);
      if (!targets.length) break;
      ctx = vote(ctx, p.id, targets[Math.floor(rng() * targets.length)].id);
    }
    actions++;
    ctx = resolveVote(ctx);
  }
}

console.log('────────── simulation report ──────────');
console.log(`players    : ${playerCount}`);
console.log(`phase      : ${ctx.state.phase}`);
console.log(`rounds     : ${ctx.state.round}`);
console.log(`phases run : ${actions}`);
console.log(`winner     : ${ctx.state.winnerTeam ?? 'none'}`);
console.log(`alive      : ${ctx.state.players.filter((p) => p.alive).length}`);
const broken = ctx.state.phase !== 'ended';
if (broken) {
  console.log('❌ simulation did not finish');
  process.exit(1);
}
console.log('✅ simulation passed');
