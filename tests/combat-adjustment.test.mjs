import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCombatAdjustment, rollCombatAdjustment } from '../src/shared/combat-adjustment.ts';

test('ajustes permitem somas, subtrações e dados de sinais diferentes, sem avaliar código', () => {
  const parsed = parseCombatAdjustment('+1d6 + 3 + 2d2 − 1d4');
  const dice = [5, 1, 2, 4];
  assert.deepEqual(rollCombatAdjustment(parsed, () => dice.shift()), { rolls: [5, 1, 2, -4], modifier: 3, total: 7 });
  for (const invalid of ['alert(1)', '1d6*3', '1++2', '1d0', '101d6', '10d9999', '999+999', Infinity, {}, '-']) assert.equal(parseCombatAdjustment(invalid), null);
  assert.equal(parseCombatAdjustment('  ').modifier, 0);
  assert.equal(rollCombatAdjustment(parseCombatAdjustment('-1d6-2'), () => 6).total, -8);
});
