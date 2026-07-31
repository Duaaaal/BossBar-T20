import assert from 'node:assert/strict';
import test from 'node:test';
import {
  advanceEncounterTurns,
  actionPointRecoveryFormulas,
  beginEncounterTurns,
  createUnarmedAttack,
  criticalDamageExpression,
  emptyEncounterTurnState,
  formatEncounterDiceRolls,
  isAreaDamageRequest,
  isDirectPlayerDamageRequest,
  isPlayerCombatActionRequest,
  linkEncounterRollCorrelation,
  normalizeActionPointCount,
  normalizeEncounterFormulaRequest,
  normalizeHeroPointCount,
  attackTestFormulaExpression,
  parseAttackTestFormula,
  parseCriticalProfile,
  personalizeEncounterTurnState,
  prepareManualInitiative,
  resolveAreaDamage,
  resolveAttackCheck,
  resolveExtremeAdvantage,
  rollInitiativeOrder,
  rollManualInitiative,
  rollAttackTestExtraDice,
  rollCriticalDamageFormulaDetailed,
  splitDamageIntoHits,
} from '../src/shared/player-combat.ts';
import { parseDamageFormula } from '../src/shared/status.ts';

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
  actionPoints: 1,
  heroPoints: 1,
  actionPointAvailable: true,
  heroPointAvailable: true,
  unarmedStrikeEnabled: true,
  temporaryDefenseBonus: 0,
  protectionExpiresAtRound: null,
  criticalImpactId: null,
  revision: 3,
  ...overrides,
});

test('valida ações de perícia, ataque e recursos especiais sem aceitar fórmulas perigosas', () => {
  assert.equal(isPlayerCombatActionRequest({
    kind: 'skill',
    skillId: '130',
    resource: { kind: 'action-point', ability: 'intervention' },
  }), true);
  assert.equal(isPlayerCombatActionRequest({
    kind: 'attack',
    attackIndex: 0,
    attackType: 'ranged',
    targetBossId: 'boss-1',
    damageFormula: '1d8 + 2d6 + 4',
    resource: { kind: 'hero-point', ability: 'extreme-advantage' },
  }), true);
  assert.equal(isPlayerCombatActionRequest({
    kind: 'resource',
    resource: 'action-point',
    ability: 'recovery',
  }), true);
  assert.equal(isPlayerCombatActionRequest({
    kind: 'attack',
    attackIndex: 0,
    attackType: 'melee',
    targetBossId: 'boss-1',
    damageFormula: 'process.exit()',
    resource: null,
  }), false);
  assert.equal(isPlayerCombatActionRequest({
    kind: 'resource',
    resource: 'hero-point',
    ability: 'activate-power',
    actionId: '<script>alert(1)</script>',
  }), false);
});

test('normaliza e preserva correlação segura em rolagens de fórmula', () => {
  assert.deepEqual(normalizeEncounterFormulaRequest({
    participantId: 'boss:boss-1',
    label: 'Derrubar',
    formula: '1d20 + 8',
    category: 'test',
    correlationId: 'opposed-check:round-3',
  }), {
    participantId: 'boss:boss-1',
    label: 'Derrubar',
    formula: '1d20 + 8',
    category: 'test',
    correlationId: 'opposed-check:round-3',
  });
  assert.deepEqual(normalizeEncounterFormulaRequest({
    participantId: 'boss:boss-1',
    label: 'Iniciativa',
    formula: '1d20 + 4',
    category: 'initiative',
  }), {
    participantId: 'boss:boss-1',
    label: 'Iniciativa',
    formula: '1d20 + 4',
    category: 'initiative',
  });
  assert.equal(normalizeEncounterFormulaRequest({
    participantId: 'boss:boss-1',
    label: 'Derrubar',
    formula: '1d20 + 8',
    category: 'test',
    correlationId: '<script>alert(1)</script>',
  }), null);
  assert.equal(normalizeEncounterFormulaRequest({
    participantId: 'boss:boss-1',
    label: 'Derrubar',
    formula: '1d20 + 8',
    category: 'test',
    correlationId: 'short',
  }), null);
});

test('vincula o resultado local anterior por id ou identidade da ação', () => {
  const existing = [{
    id: 'roll:derrubar:1',
    actionId: 'opposed-action:round-3',
    participantId: 'boss:boss-1',
    label: 'Derrubar',
    expression: '1d20 + 8',
    rolls: [12],
    modifier: 8,
    total: 20,
    outcome: 'neutral',
    category: 'test',
    createdAt: 1,
    retainedByParticipantId: null,
  }];
  const linkedByAction = linkEncounterRollCorrelation(
    existing,
    'opposed-action:round-3',
  );
  assert.equal(
    linkedByAction[0].correlationId,
    'opposed-action:round-3',
  );
  assert.notEqual(linkedByAction, existing);

  const linkedById = linkEncounterRollCorrelation(
    existing,
    'roll:derrubar:1',
  );
  assert.equal(linkedById[0].correlationId, 'roll:derrubar:1');

  const unchanged = linkEncounterRollCorrelation(
    existing,
    'unrelated-action:round-3',
  );
  assert.equal(unchanged, existing);
});

test('usa patamares oficiais para a recuperação do Ponto de Ação', () => {
  assert.deepEqual(actionPointRecoveryFormulas(1), {
    tier: 'Iniciante',
    health: '2d8 + 2',
    mana: '1d4 + 1',
  });
  assert.equal(actionPointRecoveryFormulas(5).tier, 'Veterano');
  assert.equal(actionPointRecoveryFormulas(11).tier, 'Campeão');
  assert.equal(actionPointRecoveryFormulas(17).tier, 'Lenda');
});

test('seleciona a defesa correspondente ao ataque e respeita resultados naturais', () => {
  assert.equal(resolveAttackCheck(5, 15, 10).success, true);
  assert.equal(resolveAttackCheck(4, 15, 10).success, false);
  assert.equal(resolveAttackCheck(-999, 999, 20).success, true);
  assert.equal(resolveAttackCheck(999, 0, 1).success, false);
});

test('normaliza até cinco Pontos de Ação e um Ponto Heróico preservando estados legados', () => {
  assert.equal(normalizeActionPointCount(9, false), 5);
  assert.equal(normalizeActionPointCount(-2, true), 0);
  assert.equal(normalizeActionPointCount(undefined, true), 1);
  assert.equal(normalizeActionPointCount(undefined, false), 0);
  assert.equal(normalizeHeroPointCount(4, false), 1);
  assert.equal(normalizeHeroPointCount(undefined, true), 1);
  assert.equal(normalizeHeroPointCount(undefined, false), 0);
});

test('cria Punhos canônicos pela ficha e ajusta o dado conforme o tamanho', () => {
  const summary = {
    attributes: { for: 3 },
    skills: [{ id: '190', name: 'Luta', total: 8 }],
    size: 'Médio',
  };
  assert.deepEqual(createUnarmedAttack(summary), {
    source: { kind: 'unarmed' },
    name: 'Punhos',
    attackBonus: 8,
    damageFormula: '1d3 + 3',
    criticalThreat: 20,
    criticalMultiplier: 2,
    damageType: 'Impacto',
    range: 'Adjacente',
    nonlethal: true,
  });
  assert.equal(
    createUnarmedAttack({ ...summary, size: 'Colossal' }).damageFormula,
    '1d8 + 3',
  );
});

test('interpreta a margem crítica e multiplica apenas os dados da arma', () => {
  assert.deepEqual(parseCriticalProfile('19/x3'), {
    threat: 19,
    multiplier: 3,
  });
  assert.deepEqual(parseCriticalProfile('x4'), {
    threat: 20,
    multiplier: 4,
  });
  const formula = parseDamageFormula('1d8 + 1d6 + 3');
  assert.ok(formula);
  const values = [8, 7, 6, 5];
  let index = 0;
  const result = rollCriticalDamageFormulaDetailed(
    formula,
    3,
    () => values[index++],
  );
  assert.deepEqual(result.rolls, [8, 7, 6, 5]);
  assert.equal(result.total, 29);
  assert.equal(result.modifier, 3);
  assert.equal(criticalDamageExpression(formula, 3), '3d8 + 1d6 + 3');
});

test('combina o teste da arma com Luta ou Pontaria', () => {
  const parsed = parseAttackTestFormula('1d20 + 1d6 + 5');
  assert.equal(attackTestFormulaExpression(parsed, 12), '1d20 + 1d6 + 5 + 12');
  assert.equal(
    attackTestFormulaExpression(parseAttackTestFormula('2d20 + 3'), 12, 2),
    '3d20 + 3 + 12',
  );
  const rolled = rollAttackTestExtraDice(parsed, (minimum) => minimum);
  assert.deepEqual(rolled.rolls, [1]);
  assert.equal(rolled.total, 6);
});

test('usa 1d20 quando o teste de ataque está vazio ou ilegível', () => {
  assert.equal(attackTestFormulaExpression(parseAttackTestFormula(''), 8), '1d20 + 8');
  assert.equal(
    attackTestFormulaExpression(parseAttackTestFormula('texto ilegível'), -2),
    '1d20 - 2',
  );
  assert.equal(
    attackTestFormulaExpression(parseAttackTestFormula('+5'), 12),
    '1d20 + 12',
  );
  assert.equal(
    attackTestFormulaExpression(parseAttackTestFormula('5'), 12),
    '1d20 + 5 + 12',
  );
});

test('extrema vantagem soma dois d20 como um resultado natural limitado a 20', () => {
  assert.deepEqual(resolveExtremeAdvantage(13, 16), {
    rolls: [13, 16],
    chosenDie: 20,
  });
  assert.deepEqual(resolveExtremeAdvantage(1, 1), {
    rolls: [1, 1],
    chosenDie: 2,
  });
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

test('limita PV ao máximo antes do impacto e preserva dano excedente negativo', () => {
  const overMaximum = playerState({ currentHealth: 60, maxHealth: 40 });
  const impact = resolveAreaDamage(
    overMaximum,
    areaDamage({ damage: 100, reflexDc: 999 }),
    2,
    5,
  );

  assert.equal(impact.damage.healthBefore, 40);
  assert.equal(impact.damage.healthAfter, -60);
  assert.equal(impact.playerState.currentHealth, -60);
  assert.equal(impact.playerState.revision, 4);
  assert.equal(overMaximum.currentHealth, 60);
  assert.equal(overMaximum.revision, 3);
});

test('aceita somente requisiÃ§Ãµes de dano em Ã¡rea dentro dos limites', () => {
  assert.equal(isAreaDamageRequest(areaDamage()), true);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), hits: 5 }), true);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), hits: 0 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), hits: 1_001 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), damage: -1 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), damage: 1.5 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), reflexDc: 1000 }), false);
  assert.equal(isAreaDamageRequest({ ...areaDamage(), successRule: 'quarter' }), false);
});

test('parcela dano sem inflar nem perder o total autoritativo', () => {
  assert.deepEqual(splitDamageIntoHits(100, 3), [34, 33, 33]);
  assert.deepEqual(splitDamageIntoHits(3, 5), [1, 1, 1, 0, 0]);
  assert.equal(
    splitDamageIntoHits(999_999, 1_000)
      .reduce((total, parcel) => total + parcel, 0),
    999_999,
  );
  assert.equal(isDirectPlayerDamageRequest({
    playerIds: ['player-1'],
    damage: 100,
    hits: 5,
  }), true);
  assert.equal(isDirectPlayerDamageRequest({
    playerIds: ['player-1'],
    damage: 100,
    hits: 0,
  }), false);
});

test('ordena iniciativa e desempata pelo maior modificador', () => {
  const rolls = [10, 12, 10];
  const order = rollInitiativeOrder([
    { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 5, eligibleRound: 1 },
    { id: 'boss:b', kind: 'boss', sourceId: 'b', name: 'B', initiativeModifier: 3, eligibleRound: 1 },
    { id: 'player:c', kind: 'player', sourceId: 'c', name: 'C', initiativeModifier: 2, eligibleRound: 1 },
  ], () => rolls.shift() ?? 1);

  assert.deepEqual(order.map(({ id }) => id), ['player:a', 'boss:b', 'player:c']);
});

test('rerrola somente participantes que continuam empatados', () => {
  const rolls = [10, 10, 18, 4];
  const order = rollInitiativeOrder([
    { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 2, eligibleRound: 1 },
    { id: 'player:b', kind: 'player', sourceId: 'b', name: 'B', initiativeModifier: 2, eligibleRound: 1 },
  ], () => rolls.shift() ?? 1);

  assert.deepEqual(order.map(({ id }) => id), ['player:a', 'player:b']);
  assert.deepEqual(order.map(({ initiativeRoll }) => initiativeRoll), [18, 4]);
});

test('aguarda cada participante rolar a própria iniciativa', () => {
  const participants = prepareManualInitiative([
    { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 4, eligibleRound: 1 },
    { id: 'boss:b', kind: 'boss', sourceId: 'b', name: 'B', initiativeModifier: 2, eligibleRound: 1 },
  ]);
  const waiting = {
    ...emptyEncounterTurnState(),
    participants,
    initiativeReady: false,
  };
  const first = rollManualInitiative(waiting, 'player:a', () => 12);
  assert.ok(first);
  assert.equal(first.participant.initiativeTotal, 16);
  assert.equal(first.state.initiativeReady, false);
  const second = rollManualInitiative(first.state, 'boss:b', () => 9);
  assert.ok(second);
  assert.equal(second.state.initiativeReady, true);
  assert.deepEqual(
    second.state.participants.map(({ id }) => id),
    ['player:a', 'boss:b'],
  );
});

test('formata cada termo de dados com os resultados correspondentes', () => {
  assert.equal(
    formatEncounterDiceRolls(
      '1d20 + 3d5 - 2d2 + 10',
      [14, 2, 4, 5, -1, -2],
    ),
    '1d20(14) + 3d5(2, 4, 5) − 2d2(1, 2)',
  );
});

test('inicia no turno um e incrementa apos uma volta completa', () => {
  const rolled = rollInitiativeOrder([
    { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 4, eligibleRound: 1 },
    { id: 'boss:b', kind: 'boss', sourceId: 'b', name: 'B', initiativeModifier: 2, eligibleRound: 1 },
  ], () => 10);
  const first = beginEncounterTurns({
    ...emptyEncounterTurnState(),
    participants: rolled,
  });
  const second = advanceEncounterTurns(first);
  const wrapped = advanceEncounterTurns(second);

  assert.equal(first.round, 1);
  assert.equal(first.activeParticipantId, 'player:a');
  assert.equal(second.round, 1);
  assert.equal(second.activeParticipantId, 'boss:b');
  assert.equal(wrapped.round, 2);
  assert.equal(wrapped.activeParticipantId, 'player:a');
});

test('aguarda a revelacao da iniciativa e retém testes ate o fim do turno responsável', () => {
  const rolled = rollInitiativeOrder([
    { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 4, eligibleRound: 1 },
    { id: 'boss:b', kind: 'boss', sourceId: 'b', name: 'B', initiativeModifier: 2, eligibleRound: 1 },
  ], () => 10);
  const waiting = {
    ...emptyEncounterTurnState(),
    initiativeReady: false,
    participants: rolled,
  };
  assert.equal(beginEncounterTurns(waiting), waiting);

  const started = beginEncounterTurns({
    ...waiting,
    initiativeReady: true,
    rollResults: [{
      id: 'initiative:a',
      participantId: 'player:a',
      label: 'Iniciativa',
      expression: '1d20 + 4',
      rolls: [10],
      modifier: 4,
      total: 14,
      outcome: 'neutral',
      category: 'initiative',
      createdAt: 1,
      retainedByParticipantId: null,
    }, {
      id: 'test:a',
      participantId: 'player:a',
      label: 'Fortitude',
      expression: '1d20 + 4',
      rolls: [13],
      modifier: 4,
      total: 17,
      outcome: 'success',
      category: 'test',
      createdAt: 2,
      retainedByParticipantId: 'player:a',
    }],
  });
  assert.deepEqual(started.rollResults.map(({ id }) => id), ['test:a']);
  assert.deepEqual(advanceEncounterTurns(started).rollResults, []);
});

test('participante que entra durante a rodada so age na proxima', () => {
  const state = {
    round: 5,
    activeParticipantId: 'player:a',
    started: true,
    revision: 9,
    participants: [
      { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 10, initiativeRoll: 20, initiativeTotal: 30, eligibleRound: 1, isSelf: false },
      { id: 'player:new', kind: 'player', sourceId: 'new', name: 'Novo', initiativeModifier: 8, initiativeRoll: 18, initiativeTotal: 26, eligibleRound: 6, isSelf: false },
      { id: 'boss:b', kind: 'boss', sourceId: 'b', name: 'B', initiativeModifier: 2, initiativeRoll: 8, initiativeTotal: 10, eligibleRound: 1, isSelf: false },
    ],
  };

  const currentRound = advanceEncounterTurns(state);
  const nextRound = advanceEncounterTurns(currentRound);

  assert.equal(currentRound.activeParticipantId, 'boss:b');
  assert.equal(currentRound.round, 5);
  assert.equal(nextRound.activeParticipantId, 'player:a');
  assert.equal(nextRound.round, 6);
  assert.equal(advanceEncounterTurns(nextRound).activeParticipantId, 'player:new');
});

test('recupera a ordem quando o participante ativo deixa o encontro', () => {
  const recovered = advanceEncounterTurns({
    round: 3,
    activeParticipantId: 'player:missing',
    started: true,
    revision: 8,
    participants: [
      {
        id: 'boss:1',
        kind: 'boss',
        sourceId: '1',
        name: 'Chefao',
        initiativeModifier: 5,
        initiativeRoll: 13,
        initiativeTotal: 18,
        eligibleRound: 1,
        isSelf: false,
      },
      {
        id: 'player:late',
        kind: 'player',
        sourceId: 'late',
        name: 'Atrasado',
        initiativeModifier: 2,
        initiativeRoll: 10,
        initiativeTotal: 12,
        eligibleRound: 4,
        isSelf: false,
      },
    ],
  });

  assert.equal(recovered.round, 3);
  assert.equal(recovered.activeParticipantId, 'boss:1');
  assert.equal(recovered.revision, 9);
});

test('expõe somente os dados brutos de rolagens privadas e de chefão', () => {
  const state = {
    ...emptyEncounterTurnState(),
    participants: [
      { id: 'player:a', kind: 'player', sourceId: 'a', name: 'A', initiativeModifier: 4, initiativeRoll: 11, initiativeTotal: 15, eligibleRound: 1, isSelf: false },
      { id: 'player:b', kind: 'player', sourceId: 'b', name: 'B', initiativeModifier: 3, initiativeRoll: 12, initiativeTotal: 15, eligibleRound: 1, isSelf: false },
      { id: 'boss:1', kind: 'boss', sourceId: '1', name: 'Chefão', initiativeModifier: 9, initiativeRoll: 15, initiativeTotal: 24, eligibleRound: 1, isSelf: false },
    ],
    rollResults: [
      { id: 'roll:a', participantId: 'player:a', label: 'Reflexos', expression: '1d20 + 4', rolls: [11], modifier: 4, total: 15, outcome: 'success', category: 'test', createdAt: 1, retainedByParticipantId: null },
      { id: 'roll:b', participantId: 'player:b', label: 'Fortitude', expression: '1d20 + 3', rolls: [12], modifier: 3, total: 15, outcome: 'success', category: 'test', createdAt: 2, retainedByParticipantId: null },
      { id: 'roll:boss', participantId: 'boss:1', label: 'Iniciativa', expression: '1d20 + 9', rolls: [15], modifier: 9, total: 24, outcome: 'neutral', category: 'initiative', createdAt: 3, retainedByParticipantId: null },
    ],
  };

  const personalized = personalizeEncounterTurnState(
    state,
    'a',
    new Set(['player:b']),
  );

  assert.equal(personalized.participants[0].isSelf, true);
  assert.equal(personalized.rollResults[0].visibility, 'full');
  assert.deepEqual(personalized.rollResults[0].rolls, [11]);
  assert.equal(personalized.rollResults[1].visibility, 'dice-only');
  assert.deepEqual(personalized.rollResults[1].rolls, [12]);
  assert.equal(personalized.rollResults[1].total, 0);
  assert.equal(personalized.rollResults[2].visibility, 'dice-only');
  assert.deepEqual(personalized.rollResults[2].rolls, [15]);
  assert.equal(personalized.rollResults[2].expression, '1d20');
  assert.equal(personalized.rollResults[2].modifier, 0);
  assert.equal(personalized.rollResults[2].total, 0);

  const masterView = personalizeEncounterTurnState(
    state,
    null,
    new Set(['player:b']),
    true,
  );
  assert.equal(masterView.rollResults[1].visibility, 'full');
  assert.equal(masterView.rollResults[1].total, 15);
  assert.equal(masterView.rollResults[2].visibility, 'full');
  assert.equal(masterView.rollResults[2].total, 24);
});
