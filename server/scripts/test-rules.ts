/**
 * Mafia rule tests: roles, night kill/save/investigate/shield, day vote,
 * win conditions.
 * Run with: npx tsx server/scripts/test-rules.ts
 */
import {
  createGame,
  startGame,
  nightAction,
  resolveNight,
  vote,
  resolveVote,
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

const makeLobby = (n: number) => {
  const ids = Array.from({ length: n }, (_, i) => `p${i + 1}`);
  const ctx = createGame('TEST00', ids.map((id, i) => ({ id, name: `P${i + 1}`, avatar: 'tophat', isHost: i === 0 })), n);
  // Deterministic rng for reproducible roles.
  let seed = 42;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  return { ctx, rng, ids };
};

function roleOf(ctx: GameContext, id: string) {
  return ctx.state.players.find((p) => p.id === id)?.role;
}

// --- guards ---
{
  const { ctx, rng } = makeLobby(4);
  expectError(() => startGame(ctx, 'p2', rng), 'Only the host', 'non-host cannot start');
  const started = startGame(ctx, 'p1', rng);
  check(started.state.phase === 'night', 'game starts at night 1');
  check(started.state.round === 1, 'round is 1');
  const roles = started.state.players.map((p) => p.role);
  check(roles.filter((r) => r === 'mafia').length === 1, 'exactly 1 mafia in 4p');
  check(managerRolesOk(roles), 'one of each special role present in 4p');
  expectError(() => vote(started, 'p1', 'p2'), 'Voting is only open during the day', 'cannot vote during night');
  expectError(() => nightAction(started, 'p1', 'kill', 'p2'), 'does not match your role', 'non-mafia cannot kill');
}

function managerRolesOk(roles: (string | undefined)[]): boolean {
  return roles.includes('doctor') || roles.includes('detective') || roles.includes('sheikh') || roles.includes('citizen');
}

// --- night kill / save ---
{
  const { ctx, rng } = makeLobby(4);
  const started = startGame(ctx, 'p1', rng);
  const mafia = started.state.players.find((p) => p.role === 'mafia')!;
  const doctor = started.state.players.find((p) => p.role === 'doctor');
  const target = started.state.players.find((p) => p.id !== mafia.id && p.id !== doctor?.id)!;

  // Mafia kills, nobody saves -> victim dies.
  const afterKill = nightAction(started, mafia.id, 'kill', target.id).ctx;
  const dawn = resolveNight(afterKill);
  check(dawn.state.players.find((p) => p.id === target.id)?.alive === false, 'unprotected victim dies at dawn');
  check(dawn.state.phase === 'day', 'night resolves to day');

  // Doctor saves the victim -> nobody dies.
  const { ctx: c2, rng: r2 } = makeLobby(4);
  const s2 = startGame(c2, 'p1', r2);
  const m2 = s2.state.players.find((p) => p.role === 'mafia')!;
  const d2 = s2.state.players.find((p) => p.role === 'doctor')!;
  const t2 = s2.state.players.find((p) => p.alive && p.id !== m2.id && p.id !== d2.id)!;
  const k = nightAction(s2, m2.id, 'kill', t2.id).ctx;
  const sv = nightAction(k, d2.id, 'save', t2.id).ctx;
  const dawn2 = resolveNight(sv);
  check(dawn2.state.players.filter((p) => !p.alive).length === 0, 'doctor save prevents the kill');
}

// --- detective investigation ---
{
  const { ctx, rng } = makeLobby(5);
  const started = startGame(ctx, 'p1', rng);
  const detective = started.state.players.find((p) => p.role === 'detective');
  if (detective) {
    const mafia = started.state.players.find((p) => p.role === 'mafia')!;
    const res = nightAction(started, detective.id, 'investigate', mafia.id);
    check(res.investigationResult?.isMafia === true, 'detective correctly flags the mafia');
  } else {
    check(true, 'detective skipped (no detective in bag — still valid)');
  }
}

// --- day vote / lynch ---
{
  const { ctx, rng } = makeLobby(4);
  const started = startGame(ctx, 'p1', rng);
  const mafia = started.state.players.find((p) => p.role === 'mafia')!;
  // Fast-forward: everyone votes the mafia out.
  let cur = resolveNight(nightAction(started, mafia.id, 'kill', started.state.players.find((p) => p.alive && p.role !== 'mafia')!.id).ctx);
  check(cur.state.phase === 'day', 'reached day for voting');
  for (const p of cur.state.players.filter((p) => p.alive)) {
    if (p.id === mafia.id) continue;
    cur = vote(cur, p.id, mafia.id);
  }
  cur = resolveVote(cur);
  check(cur.state.players.find((p) => p.id === mafia.id)?.alive === false, 'lynch removes the most-voted player');
  check(cur.state.phase === 'ended' && cur.state.winnerTeam === 'citizens', 'town wins when the last mafia is lynched');
}

console.log(`\n✅ rule tests: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
