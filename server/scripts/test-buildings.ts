/**
 * Role-bag + detective/sheikh checks.
 * Run with: npx tsx server/scripts/test-buildings.ts
 */
import { roleBagFor } from '../../shared/src/types.js';
import { createGame, startGame, nightAction, resolveNight } from '../src/game/engine.js';

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

for (let n = 2; n <= 10; n++) {
  const bag = roleBagFor(n);
  check(bag.length === n, `${n} players → bag of ${n} roles`);
}
check(roleBagFor(4).filter((r) => r === 'mafia').length === 1, '4p: 1 mafia');
check(roleBagFor(8).filter((r) => r === 'mafia').length === 2, '8p: 2 mafia');