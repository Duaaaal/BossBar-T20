import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyBattleCommand,
  advanceBossTurn,
  calculateHealthSequence,
  clampDamageToHealthFloor,
  chooseNonRepeatingIndex,
  createInitialBoss,
  getEncounterSoundEffectKind,
  getEncounterSoundSetting,
  getShieldMechanicSoundKind,
  initialEncounterEffectsState,
  initialBattleState,
  isBattleCommand,
  isEncounterSoundEffectKind,
  isHeavyDamageEffect,
  isMusicControlCommand,
  isEncounterSoundEnabled,
  isShieldBreakEffect,
  isSoundboardCommand,
  volumeToGain,
} from '../src/shared/battle.ts';

test('valida somente comandos seguros dos controles musicais', () => {
  assert.equal(isMusicControlCommand({ type: 'set-volume', volume: 0.65 }), true);
  assert.equal(isMusicControlCommand({ type: 'set-muted', muted: true }), true);
  assert.equal(isMusicControlCommand({ type: 'set-loop', loop: false }), true);
  assert.equal(isMusicControlCommand({ type: 'set-volume', volume: Number.NaN }), false);
  assert.equal(isMusicControlCommand({ type: 'set-muted', muted: 'sim' }), false);
});

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
  assert.equal(boss.rangedAttack, -5);
  assert.equal(boss.rangedDefense, 20);
  assert.equal(boss.shield, 999);
});

test('persiste o arsenal e a arma pre-selecionada de cada chefão', () => {
  const state = freshBattle();
  const boss = state.bosses[0];
  const attacks = [
    {
      id: 'boss-attack:boss-1:claw',
      name: 'Garra Incandescente',
      attackType: 'melee',
      attackModifier: 3,
      damageFormula: '2d8 + 6',
      criticalThreat: 19,
      criticalMultiplier: 3,
      damageType: 'Fogo',
      range: 'Adjacente',
    },
    {
      id: 'boss-attack:boss-1:breath',
      name: 'Sopro',
      attackType: 'ranged',
      attackModifier: 1,
      damageFormula: '4d6',
      criticalThreat: 20,
      criticalMultiplier: 2,
      damageType: 'Fogo',
      range: 'Médio',
    },
  ];
  const next = applyBattleCommand(state, {
    type: 'configure',
    bossId: boss.id,
    bossName: boss.bossName,
    maxHealth: boss.maxHealth,
    currentHealth: boss.currentHealth,
    attack: boss.attack,
    rangedAttack: boss.rangedAttack,
    defense: boss.defense,
    rangedDefense: boss.rangedDefense,
    shield: boss.shield,
    skills: boss.skills,
    damageReduction: boss.damageReduction,
    attacks,
    selectedAttackId: attacks[1].id,
  });
  assert.deepEqual(next.bosses[0].attacks, attacks);
  assert.equal(next.bosses[0].selectedAttackId, attacks[1].id);
});

test('inicia novos chefões com RD zero', () => {
  assert.equal(createInitialBoss('boss-default').damageReduction, 0);
});

test('configura vida atual e perícias exatas sem perder compatibilidade com o valor base', () => {
  const skillValues = Object.fromEntries(
    Object.keys(freshBattle().bosses[0].skillValues).map((id) => [id, 18]),
  );
  skillValues.iniciativa = 27;
  const state = applyBattleCommand(freshBattle(), {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Estrategista',
    maxHealth: 800,
    currentHealth: 620,
    attack: 22,
    rangedAttack: 19,
    defense: 25,
    shield: 2,
    skills: 18,
    skillValues,
    damageReduction: 8,
  });
  const boss = state.bosses[0];

  assert.equal(boss.currentHealth, 620);
  assert.equal(boss.maxHealth, 800);
  assert.equal(boss.skills, 18);
  assert.equal(boss.skillValues.iniciativa, 27);
  assert.equal(boss.skillValues.reflexos, 18);
});

test('uma nova base atualiza somente perícias que continuam herdadas', () => {
  const initialSkills = freshBattle().bosses[0].skillValues;
  let state = applyBattleCommand(freshBattle(), {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Sentinela',
    maxHealth: 500,
    attack: 10,
    rangedAttack: 10,
    defense: 20,
    shield: 0,
    skills: 10,
    skillValues: initialSkills,
    skillOverrides: ['iniciativa'],
    damageReduction: 0,
  });
  state = applyBattleCommand(state, {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Sentinela',
    maxHealth: 500,
    attack: 14,
    rangedAttack: 14,
    defense: 20,
    shield: 0,
    skills: 14,
    skillValues: { ...state.bosses[0].skillValues, iniciativa: 10 },
    skillOverrides: ['iniciativa'],
    damageReduction: 0,
  });

  assert.equal(state.bosses[0].skillValues.iniciativa, 10);
  assert.equal(state.bosses[0].skillValues.reflexos, 14);
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

test('ignora RD no dano bruto', () => {
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

test('acompanha separadamente a preparação da identidade e da próxima ação', () => {
  let state = freshBattle();
  assert.equal(state.bosses[0].identityPrepared, false);
  assert.equal(state.bosses[0].actionPrepared, false);

  state = applyBattleCommand(state, {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Arauto Carmesim',
    controlAmount: '100/4',
    applyDamageReduction: false,
    maxHealth: 800,
    attack: 20,
    rangedAttack: 18,
    defense: 22,
    shield: 1,
    skills: 16,
    damageReduction: 12,
  });
  state = applyBattleCommand(state, {
    type: 'publish-action',
    bossId: 'boss-1',
    text: 'O chão começará a ruir.',
    severity: 'grave',
  });
  assert.equal(state.bosses[0].identityPrepared, true);
  assert.equal(state.bosses[0].actionPrepared, true);
  assert.equal(state.bosses[0].actionVersion, 1);
  assert.equal(state.bosses[0].controlAmount, '100/4');
  assert.equal(state.bosses[0].applyDamageReduction, false);

  state = applyBattleCommand(state, {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Arauto Carmesim',
    controlAmount: '1d20 + 3d5 - 5d2 + 10',
    maxHealth: 800,
    attack: 20,
    rangedAttack: 18,
    defense: 22,
    shield: 1,
    skills: 16,
    damageReduction: 12,
  });
  assert.equal(
    state.bosses[0].controlAmount,
    '1d20 + 3d5 - 5d2 + 10',
  );

  state = applyBattleCommand(state, {
    type: 'mark-identity-unprepared',
    bossId: 'boss-1',
  });
  state = applyBattleCommand(state, {
    type: 'mark-action-unprepared',
    bossId: 'boss-1',
  });
  assert.equal(state.bosses[0].identityPrepared, false);
  assert.equal(state.bosses[0].actionPrepared, false);
  assert.equal(state.bosses[0].setupStatus, 'ready');
});

test('converte o controle de volume para ganho perceptual', () => {
  assert.equal(volumeToGain(0), 0);
  assert.equal(volumeToGain(0.1), 0.015625);
  assert.equal(volumeToGain(0.2), 0.0625);
  assert.equal(volumeToGain(0.4), 0.25);
  assert.equal(volumeToGain(0.8), 1);
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
  assert.equal(isSoundboardCommand({ type: 'toggle-loop' }), true);
  assert.equal(isSoundboardCommand({ type: 'set-volume', volume: 0.75 }), true);
  assert.equal(isSoundboardCommand({ type: 'set-volume', volume: Number.NaN }), false);
});

test('só considera pesado o golpe marcado explicitamente como crítico', () => {
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
  assert.equal(isHeavyDamageEffect({ ...effect, to: 1 }), false);
  assert.equal(
    isHeavyDamageEffect({ ...effect, intensity: 'critical' }),
    true,
  );
  assert.equal(
    isHeavyDamageEffect({
      ...effect,
      type: 'heal',
      intensity: 'critical',
      to: 500,
    }),
    false,
  );
});

test('preserva o piso não letal sem ressuscitar um alvo derrotado', () => {
  assert.equal(clampDamageToHealthFloor(20, 0, 1), 1);
  assert.equal(clampDamageToHealthFloor(1, 0, 1), 1);
  assert.equal(clampDamageToHealthFloor(0, 0, 1), 0);
  assert.equal(clampDamageToHealthFloor(20, 7, 1), 7);
  assert.equal(clampDamageToHealthFloor(20, 0, 0), 0);
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
  assert.equal(getShieldMechanicSoundKind(breakEffect), 'shield-break');
  assert.equal(
    getShieldMechanicSoundKind({ ...breakEffect, shieldFrom: 2, shieldTo: 1 }),
    'shield-impact',
  );
  assert.equal(
    getShieldMechanicSoundKind({ ...breakEffect, shieldFrom: 0, shieldTo: 0 }),
    null,
  );
  assert.equal(getEncounterSoundEffectKind(breakEffect), 'shield-break');
  assert.equal(getEncounterSoundEffectKind({
    ...breakEffect,
    from: 500,
    to: 450,
    shieldFrom: 0,
    shieldTo: 0,
  }), 'damage');
  assert.equal(getEncounterSoundEffectKind({
    ...breakEffect,
    from: 500,
    to: 449,
    intensity: 'critical',
    shieldFrom: 0,
    shieldTo: 0,
  }), 'critical-damage');
  assert.equal(getEncounterSoundEffectKind({
    ...breakEffect,
    type: 'heal',
    from: 400,
    to: 450,
    shieldFrom: 0,
    shieldTo: 0,
  }), 'heal');
});

test('alterna efeitos aleatórios sem repetir imediatamente o mesmo arquivo', () => {
  assert.equal(chooseNonRepeatingIndex(3, null, () => 1), 1);
  assert.equal(chooseNonRepeatingIndex(3, 1, () => 0), 0);
  assert.equal(chooseNonRepeatingIndex(3, 1, () => 1), 2);
  assert.equal(chooseNonRepeatingIndex(1, 0, () => 0), 0);
  assert.equal(chooseNonRepeatingIndex(0, null, () => 0), -1);
});

test('habilita sons e efeitos visuais, mantendo o visor de vida opcional', () => {
  assert.equal(initialEncounterEffectsState.general.automaticStatusEffects, true);
  assert.equal(initialEncounterEffectsState.general.phaseMarkers, false);
  assert.deepEqual(initialEncounterEffectsState.sounds, {
    heal: true,
    damage: true,
    shield: true,
    dice: true,
  });
  assert.equal(initialEncounterEffectsState.visuals.healthNumbers, false);
  assert.equal(Object.entries(initialEncounterEffectsState.visuals)
    .filter(([setting]) => setting !== 'healthNumbers')
    .every(([, enabled]) => enabled), true);
  assert.equal(getEncounterSoundSetting('heal'), 'heal');
  assert.equal(getEncounterSoundSetting('damage'), 'damage');
  assert.equal(getEncounterSoundSetting('critical-damage'), 'damage');
  assert.equal(getEncounterSoundSetting('shield-impact'), 'shield');
  assert.equal(getEncounterSoundSetting('shield-break'), 'shield');
  assert.equal(getEncounterSoundSetting('dice-roll'), 'dice');
  assert.equal(getEncounterSoundSetting('natural-failure'), 'dice');
  assert.equal(getEncounterSoundSetting('natural-success-player'), 'dice');
  assert.equal(getEncounterSoundSetting('natural-success-enemy'), 'dice');
  assert.equal(getEncounterSoundSetting('grave-action'), 'damage');
  assert.equal(
    isEncounterSoundEnabled(initialEncounterEffectsState, 'shield-break'),
    true,
  );
});

test('reconhece as categorias configuráveis de efeitos sonoros e resultados naturais', () => {
  for (const kind of [
    'damage',
    'critical-damage',
    'heal',
    'shield-impact',
    'shield-break',
    'dice-roll',
    'natural-failure',
    'natural-success-player',
    'natural-success-enemy',
    'grave-action',
  ]) assert.equal(isEncounterSoundEffectKind(kind), true);
  assert.equal(isEncounterSoundEffectKind('music'), false);
  assert.equal(isEncounterSoundEffectKind(null), false);
});

test('aplica, renova e remove uma condição sem duplicar seu ícone', () => {
  let state = freshBattle();
  state = applyBattleCommand(state, {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'em-chamas',
    damageFormula: '2d6 + 3',
    turns: 3,
  });
  state = applyBattleCommand(state, {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'em-chamas',
    damageFormula: '4',
    turns: 5,
  });

  assert.deepEqual(state.bosses[0].activeStatuses, [{
    statusId: 'em-chamas',
    damageFormula: '4',
    turnsRemaining: 5,
  }]);

  state = applyBattleCommand(state, {
    type: 'remove-status',
    bossId: 'boss-1',
    statusId: 'em-chamas',
  });
  assert.deepEqual(state.bosses[0].activeStatuses, []);
});

test('integra progressões automáticas de condições ao estado da batalha', () => {
  let state = applyBattleCommand(freshBattle(), {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'abalado',
    damageFormula: null,
    turns: 3,
  });
  state = applyBattleCommand(state, {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'abalado',
    damageFormula: null,
    turns: 2,
  });

  assert.deepEqual(state.bosses[0].activeStatuses, [{
    statusId: 'apavorado',
    damageFormula: null,
    turnsRemaining: 5,
  }]);

  state = applyBattleCommand(state, {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'abalado',
    damageFormula: null,
    turns: 6,
  });
  assert.deepEqual(state.bosses[0].activeStatuses, [{
    statusId: 'apavorado',
    damageFormula: null,
    turnsRemaining: 6,
  }]);
});

test('dano de status ignora escudo e RD e expira após o último efeito', () => {
  let state = applyBattleCommand(freshBattle(), {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Guardião Incandescente',
    maxHealth: 500,
    attack: 10,
    rangedAttack: 10,
    defense: 10,
    shield: 4,
    skills: 10,
    damageReduction: 999,
  });
  state = applyBattleCommand(state, {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'em-chamas',
    damageFormula: '2d6 + 3',
    turns: 1,
  });

  const rolls = [4, 5];
  const advanced = advanceBossTurn(state, 'boss-1', () => rolls.shift());
  const boss = advanced.state.bosses[0];

  assert.equal(boss.turnCount, 1);
  assert.equal(boss.shield, 4);
  assert.equal(boss.currentHealth, 488);
  assert.deepEqual(boss.activeStatuses, []);
  assert.deepEqual(advanced.ticks, [{
    statusId: 'em-chamas',
    statusName: 'Em chamas',
    formula: '2d6 + 3',
    damage: 12,
    from: 500,
    to: 488,
    rolls: [4, 5],
    modifier: 3,
  }]);
});

test('dano de status pode ignorar RD sem consumir o escudo', () => {
  let state = applyBattleCommand(freshBattle(), {
    type: 'configure',
    bossId: 'boss-1',
    bossName: 'Guardião Incandescente',
    maxHealth: 500,
    attack: 10,
    rangedAttack: 10,
    defense: 10,
    shield: 4,
    skills: 10,
    damageReduction: 999,
    applyDamageReduction: false,
  });
  state = applyBattleCommand(state, {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'em-chamas',
    damageFormula: '12',
    turns: 1,
  });

  const advanced = advanceBossTurn(state, 'boss-1', () => 1);
  assert.equal(advanced.state.bosses[0].currentHealth, 488);
  assert.equal(advanced.state.bosses[0].shield, 4);
  assert.equal(advanced.ticks[0].damage, 12);
});

test('condições sem dano apenas reduzem sua duração por chefão', () => {
  let state = applyBattleCommand(freshBattle(), {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'vulneravel',
    damageFormula: null,
    turns: 2,
  });

  let advanced = advanceBossTurn(state, 'boss-1', () => 1);
  assert.equal(advanced.state.bosses[0].currentHealth, 500);
  assert.equal(advanced.state.bosses[0].turnCount, 1);
  assert.equal(advanced.state.bosses[0].activeStatuses[0].turnsRemaining, 1);
  assert.deepEqual(advanced.ticks, []);

  advanced = advanceBossTurn(advanced.state, 'boss-1', () => 1);
  assert.equal(advanced.state.bosses[0].turnCount, 2);
  assert.deepEqual(advanced.state.bosses[0].activeStatuses, []);
});

test('exige fórmula para condições de dano sem valor padrão', () => {
  assert.equal(isBattleCommand({
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'envenenado',
    damageFormula: null,
    turns: 2,
  }), false);
  assert.equal(isBattleCommand({
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'envenenado',
    damageFormula: '2d8 + 4',
    turns: 2,
  }), true);
  assert.equal(isBattleCommand({
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'em-chamas',
    damageFormula: null,
    turns: 2,
  }), true);
});

test('valida, persiste e executa um status Coringa personalizado', () => {
  const command = {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'coringa',
    damageFormula: '1d6 + 2d8 + 10',
    turns: 2,
    customName: 'Marca Rubra',
    customDescription: 'Sofre dano enquanto a marca permanecer ativa.',
  };
  assert.equal(isBattleCommand(command), true);
  assert.equal(isBattleCommand({ ...command, customName: '' }), false);
  assert.equal(isBattleCommand({ ...command, customDescription: '' }), false);
  assert.equal(isBattleCommand({ ...command, damageFormula: '2d6 * 4' }), false);

  const state = applyBattleCommand(freshBattle(), command);
  assert.deepEqual(state.bosses[0].activeStatuses, [{
    statusId: 'coringa',
    damageFormula: '1d6 + 2d8 + 10',
    turnsRemaining: 2,
    customName: 'Marca Rubra',
    customDescription: 'Sofre dano enquanto a marca permanecer ativa.',
  }]);

  const results = [3, 4, 5];
  const advanced = advanceBossTurn(state, 'boss-1', () => results.shift());
  assert.equal(advanced.state.bosses[0].currentHealth, 478);
  assert.equal(advanced.ticks[0].statusName, 'Marca Rubra');
  assert.equal(advanced.ticks[0].damage, 22);
});

test('aceita um status Coringa sem dano recorrente', () => {
  const command = {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'coringa',
    damageFormula: null,
    turns: 3,
    customName: 'Sem voz',
    customDescription: 'Não pode falar nem conjurar magias com componente verbal.',
  };
  assert.equal(isBattleCommand(command), true);
  const state = applyBattleCommand(freshBattle(), command);
  assert.equal(state.bosses[0].activeStatuses[0].damageFormula, null);
});
