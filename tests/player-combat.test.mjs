import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isAreaDamageRequest,
  resolveAreaDamage,
} from '../src/shared/player-combat.ts';

const playerState = (overrides = {}) => ({
  clientId: 'client-1',
  characterName: 'Artoniana',
  currentHealth: 40,
  maxHealth: 40,
  currentMana: 12,
  maxMana: 12,
  defenseMelee: 18,
  defenseRanged: 18,
  reflex: 7,
  statuses: [],
  revision: 3,
  ...overrides,
});

const areaDamage = (overrides = {}) => ({
  damage: 11,
  reflexDc: 15,
  successRule: 'half',
  ...overrides,
});

test('considera igualdade com a CD como sucesso no teste de Reflexos', () => {
  const impact = resolveAreaDamage(playerState(), areaDamage(), 8, 41);

  assert.deepEqual(impact.check, {
    die: 8,
    reflex: 7,
    total: 15,
    dc: 15,
    success: true,
    natural: null,
  });
  assert.equal(impact.damage.applied, 6);
});

test('20 natural sempre passa e 1 natural sempre falha', () => {
  const impossibleDc = resolveAreaDamage(
    playerState({ reflex: -20 }),
    areaDamage({ reflexDc: 999 }),
    20,
    1,
  );
  assert.equal(impossibleDc.check.total, 0);
  assert.equal(impossibleDc.check.success, true);
  assert.equal(impossibleDc.check.natural, 20);

  const trivialDc = resolveAreaDamage(
    playerState({ reflex: 999 }),
    areaDamage({ reflexDc: 0 }),
    1,
    2,
  );
  assert.equal(trivialDc.check.total, 1000);
  assert.equal(trivialDc.check.success, false);
  assert.equal(trivialDc.check.natural, 1);
  assert.equal(trivialDc.damage.applied, 11);
});

test('arredonda para cima a metade de dano em um sucesso', () => {
  const impact = resolveAreaDamage(playerState(), areaDamage({ damage: 15 }), 10, 3);

  assert.equal(impact.check.success, true);
  assert.equal(impact.damage.requested, 15);
  assert.equal(impact.damage.applied, 8);
  assert.equal(impact.damage.healthAfter, 32);
});

test('aplica zero de dano quando a regra do sucesso Ã© evitar o dano', () => {
  const impact = resolveAreaDamage(
    playerState(),
    areaDamage({ damage: 40, successRule: 'none' }),
    20,
    4,
  );

  assert.equal(impact.damage.applied, 0);
  assert.equal(impact.damage.healthBefore, 40);
  assert.equal(impact.damage.healthAfter, 40);
  assert.equal(impact.playerState.currentHealth, 40);
});

test('limita PV ao mÃ¡ximo antes do impacto e nunca deixa a vida negativa', () => {
  const overMaximum = playerState({ currentHealth: 60, maxHealth: 40 });
  const impact = resolveAreaDamage(
    overMaximum,
    areaDamage({ damage: 100, reflexDc: 999 }),
    2,
    5,
  );

  assert.equal(impact.damage.healthBefore, 40);
  assert.equal(impact.damage.healthAfter, 0);
  assert.equal(impact.playerState.currentHealth, 0);
  assert.equal(impact.playerState.revision, 4);
  assert.equal(overMaximum.currentHealth, 60);
  assert.equal(overMaximum.revision, 3);
});

test('aceita somente requisiÃ§Ãµes de dano em Ã¡rea dentro dos limites', () => {
  assert.equal(isAreaDamageRequest(areaDamage()), true);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), damage: -1 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), damage: 1.5 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), reflexDc: 1000 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), successRule: 'quarter' }), false);
});
