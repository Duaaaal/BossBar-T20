import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBattleCommand,
  calculateHealthSequence,
  createInitialBoss,
  initialBattleState,
  isHeavyDamageEffect,
  isShieldBreakEffect,
  isMusicCommand,
  isSoundboardCommand,
  volumeToGain,
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
    shield: 0,
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
    shield: 2000,
    skills: 30,
    damageReduction: 40,
  });
  const boss = state.bosses[0];

  assert.equal(boss.bossName.length, 100);
  assert.equal(boss.maxHealth, 1_000_000);
  assert.equal(boss.currentHealth, 1_000_000);
  assert.equal(boss.attack, 999);
  assert.equal(boss.rangedAttack, 0);
  assert.equal(boss.shield, 999);
});

test('calcula dano parcelado com RD e preserva o mínimo de um por golpe', () => {
  assert.deepEqual(
    calculateHealthSequence({
      type: 'damage',
      total: 100,
      hits: 4,
      damageReduction: 12,
    }),
    {
      amountPerHit: 25,
      reductionPerHit: 3,
      effectiveAmountPerHit: 22,
      effectiveTotal: 88,
    },
  );
  assert.equal(
    calculateHealthSequence({
      type: 'damage',
      total: 3,
      hits: 3,
      damageReduction: 99,
    }).effectiveTotal,
    3,
  );
});

test('ignora RD no dano bruto e valida o comando de busca da música', () => {
  assert.equal(
    calculateHealthSequence({
      type: 'damage',
      total: 100,
      hits: 4,
      damageReduction: 999,
      ignoreDamageReduction: true,
    }).effectiveTotal,
    100,
  );
  assert.equal(isMusicCommand({ type: 'seek', time: 42.5 }), true);
  assert.equal(isMusicCommand({ type: 'seek', time: Number.NaN }), false);
  assert.equal(isMusicCommand({ type: 'remove-track', trackId: 'faixa-1' }), true);
  assert.equal(isMusicCommand({ type: 'clear-tracks' }), true);
});

test('só prepara chefões novos ao salvar e libera o inicial ao começar', () => {
  let state = freshBattle();
  assert.equal(state.bosses[0].setupStatus, 'initial');
  assert.equal(state.bosses[0].nextAction, '');

  state = applyBattleCommand(state, { type: 'add-boss' });
  const newBossId = state.activeBossId;
  assert.equal(state.bosses[1].setupStatus, 'pending');

  state = applyBattleCommand(state, { type: 'start-battle' });
  assert.equal(state.bosses[0].setupStatus, 'ready');
  assert.equal(state.bosses[1].setupStatus, 'pending');

  state = applyBattleCommand(state, {
    type: 'configure',
    bossId: newBossId,
    bossName: 'Chefe preparado',
    maxHealth: 600,
    attack: 10,
    rangedAttack: 10,
    defense: 10,
    shield: 0,
    skills: 10,
    damageReduction: 10,
  });
  assert.equal(state.bosses[1].setupStatus, 'ready');
});

test('converte o controle de volume para ganho perceptual', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(0.8), 1);
  assert.ok(volumeToGain(0.4) > 0.21 && volumeToGain(0.4) < 0.22);
  assert.ok(volumeToGain(0.79) < 1);
  assert.ok(volumeToGain(0.9) > 1.41 && volumeToGain(0.9) < 1.42);
  assert.ok(volumeToGain(1) > 1.99 && volumeToGain(1) < 2);
  assert.equal(volumeToGain(2), volumeToGain(1));
});

test('valida comandos limitados aos 20 botões do soundboard', () => {
  assert.equal(isSoundboardCommand({ type: 'play', index: 1 }), true);
  assert.equal(isSoundboardCommand({ type: 'remove', index: 20 }), true);
  assert.equal(isSoundboardCommand({ type: 'clear' }), true);
  assert.equal(isSoundboardCommand({ type: 'play', index: 0 }), false);
  assert.equal(isSoundboardCommand({ type: 'play', index: 21 }), false);
  assert.equal(isSoundboardCommand({ type: 'remove', index: 1.5 }), false);
  assert.equal(isSoundboardCommand({ type: 'stop-all' }), true);
  assert.equal(isSoundboardCommand({ type: 'toggle-mute' }), true);
  assert.equal(isSoundboardCommand({ type: 'set-volume', volume: 0.75 }), true);
  assert.equal(isSoundboardCommand({ type: 'set-volume', volume: Number.NaN }), false);
  assert.equal(isMusicCommand({ type: 'toggle-mute' }), true);
});

test('só considera pesado o golpe que remove mais de dez por cento da vida', () => {
  const effect = {
    id: 1,
    bossId: 'boss-1',
    type: 'damage',
    intensity: 'normal',
    from: 500,
    to: 450,
    maximum: 500,
    shieldFrom: 0,
    shieldTo: 0,
  };
  assert.equal(isHeavyDamageEffect(effect), false);
  assert.equal(isHeavyDamageEffect({ ...effect, to: 449 }), true);
  assert.equal(isHeavyDamageEffect({ ...effect, type: 'heal', to: 300 }), false);
});

test('consome um ponto de escudo por golpe antes de atingir a vida', () => {
  let state = applyBattleCommand(freshBattle(), {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Guardião de Aço',
    maxHealth: 500,
    attack: 10,
    rangedAttack: 10,
    defense: 10,
    shield: 3,
    skills: 10,
    damageReduction: 10,
  });

  for (let hit = 0; hit < 3; hit += 1) {
    state = applyBattleCommand(state, {
      type: 'damage',
      bossId: 'boss-1',
      amount: 100,
    });
  }
  assert.equal(state.bosses[0].shield, 0);
  assert.equal(state.bosses[0].currentHealth, 500);

  state = applyBattleCommand(state, {
    type: 'damage',
    bossId: 'boss-1',
    amount: 100,
  });
  assert.equal(state.bosses[0].currentHealth, 400);

  const breakEffect = {
    id: 2,
    bossId: 'boss-1',
    type: 'damage',
    intensity: 'normal',
    from: 500,
    to: 500,
    maximum: 500,
    shieldFrom: 1,
    shieldTo: 0,
  };
  assert.equal(isShieldBreakEffect(breakEffect), true);
});
