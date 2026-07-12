import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBattleCommand,
  createInitialBoss,
  initialBattleState,
} from '../src/shared/battle.ts';

const freshBattle = () => ({
  ...initialBattleState,
  bosses: [createInitialBoss('boss-1')],
});

test('limita a batalha a três chefões e seleciona a nova aba', () => {
  let state = freshBattle();
  state = applyBattleCommand(state, { type: 'add-boss' });
  state = applyBattleCommand(state, { type: 'add-boss' });
  const unchanged = applyBattleCommand(state, { type: 'add-boss' });

  assert.equal(state.bosses.length, 3);
  assert.equal(state.activeBossId, state.bosses[2].id);
  assert.equal(unchanged, state);
});

test('mantém os dados e a vida isolados por chefão', () => {
  let state = applyBattleCommand(freshBattle(), { type: 'add-boss' });
  const secondBossId = state.activeBossId;

  state = applyBattleCommand(state, {
    type: 'configure',
    bossId: secondBossId,
    bossName: 'Guardião Rubro',
    maxHealth: 900,
    attack: 22,
    rangedAttack: 18,
    defense: 16,
    skills: 14,
    damageReduction: 8,
  });
  state = applyBattleCommand(state, {
    type: 'damage',
    bossId: secondBossId,
    amount: 125,
  });

  assert.equal(state.bosses[0].bossName, 'O Chefão Sem Nome');
  assert.equal(state.bosses[0].currentHealth, 500);
  assert.equal(state.bosses[1].bossName, 'Guardião Rubro');
  assert.equal(state.bosses[1].currentHealth, 775);
});

test('mantém pelo menos um chefão e preserva uma aba ativa válida', () => {
  let state = freshBattle();
  assert.equal(
    applyBattleCommand(state, { type: 'remove-boss', bossId: 'boss-1' }),
    state,
  );

  state = applyBattleCommand(state, { type: 'add-boss' });
  const selectedBossId = state.activeBossId;
  state = applyBattleCommand(state, {
    type: 'remove-boss',
    bossId: selectedBossId,
  });

  assert.equal(state.bosses.length, 1);
  assert.equal(state.activeBossId, state.bosses[0].id);
});

test('limita vida, atributos e texto aos intervalos aceitos', () => {
  const state = applyBattleCommand(freshBattle(), {
    type: 'configure',
    bossId: 'boss-1',
    bossName: `  ${'X'.repeat(120)}  `,
    maxHealth: 2_000_000,
    attack: 2000,
    rangedAttack: -5,
    defense: 20,
    skills: 30,
    damageReduction: 40,
  });
  const boss = state.bosses[0];

  assert.equal(boss.bossName.length, 100);
  assert.equal(boss.maxHealth, 1_000_000);
  assert.equal(boss.currentHealth, 1_000_000);
  assert.equal(boss.attack, 999);
  assert.equal(boss.rangedAttack, 0);
});
