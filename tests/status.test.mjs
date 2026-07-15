import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  STATUS_DEFINITIONS,
  getDamageFormulaRange,
  getStatusDefinition,
  isStatusId,
  normalizeActiveStatuses,
  normalizeDamageFormula,
  parseDamageFormula,
  rollDamageFormula,
  tokenizeStatusDescription,
} from '../src/shared/status.ts';

test('mantém os 36 status em ordem e com identificadores, nomes e ícones únicos', () => {
  assert.equal(STATUS_DEFINITIONS.length, 36);
  assert.equal(new Set(STATUS_DEFINITIONS.map(({ id }) => id)).size, 36);
  assert.equal(new Set(STATUS_DEFINITIONS.map(({ name }) => name)).size, 36);
  assert.equal(new Set(STATUS_DEFINITIONS.map(({ iconFile }) => iconFile)).size, 36);
  assert.equal(STATUS_DEFINITIONS[0].id, 'abalado');
  assert.equal(STATUS_DEFINITIONS[34].id, 'vulneravel');
  assert.equal(STATUS_DEFINITIONS[35].id, 'coringa');
  assert.equal(STATUS_DEFINITIONS[0].iconFile, 'status-01-abalado.png');
  assert.equal(STATUS_DEFINITIONS[34].iconFile, 'status-35-vulneravel.png');
  assert.equal(STATUS_DEFINITIONS[35].iconFile, 'status-36-coringa.png');
});

test('mantém todos os ícones empacotáveis em PNG RGBA de 160px', () => {
  for (const definition of STATUS_DEFINITIONS) {
    const file = readFileSync(new URL(
      `../assets/status-icons/${definition.iconFile}`,
      import.meta.url,
    ));
    assert.deepEqual([...file.subarray(1, 4)], [80, 78, 71], definition.iconFile);
    assert.equal(file.readUInt32BE(16), 160, definition.iconFile);
    assert.equal(file.readUInt32BE(20), 160, definition.iconFile);
    assert.equal(file[25], 6, `${definition.iconFile} precisa usar RGBA`);
  }
});

test('identifica status oficiais de dano e mantém o Coringa configurável', () => {
  assert.equal(isStatusId('em-chamas'), true);
  assert.equal(isStatusId('desconhecido'), false);
  assert.deepEqual(
    STATUS_DEFINITIONS.filter(({ damageCapable }) => damageCapable).map(({ id }) => id),
    ['em-chamas', 'envenenado', 'sangrando', 'coringa'],
  );
  assert.equal(getStatusDefinition('em-chamas').defaultDamageFormula, '1d6');
  assert.equal(getStatusDefinition('envenenado').defaultDamageFormula, null);
  assert.equal(getStatusDefinition('sangrando').defaultDamageFormula, '1d6');
  assert.equal(getStatusDefinition('coringa').customizable, true);
  assert.equal(getStatusDefinition('coringa').defaultDamageFormula, null);
});

test('interpreta dano fixo e expressões de dados sem executar código', () => {
  assert.deepEqual(parseDamageFormula('0'), { kind: 'fixed', value: 0 });
  assert.deepEqual(parseDamageFormula('1000000'), {
    kind: 'fixed',
    value: 1_000_000,
  });
  assert.deepEqual(parseDamageFormula(' 2D6 + 3 '), {
    kind: 'dice',
    diceCount: 2,
    sides: 6,
    modifier: 3,
  });
  assert.deepEqual(parseDamageFormula('4d10-7'), {
    kind: 'dice',
    diceCount: 4,
    sides: 10,
    modifier: -7,
  });
  assert.equal(normalizeDamageFormula('002D006+0003'), '2d6 + 3');
  assert.equal(normalizeDamageFormula('1d6 - 0'), '1d6');
  assert.deepEqual(parseDamageFormula('1d6 + 2d8 + 7d2 + 10'), {
    kind: 'expression',
    terms: [
      { diceCount: 1, sides: 6, sign: 1 },
      { diceCount: 2, sides: 8, sign: 1 },
      { diceCount: 7, sides: 2, sign: 1 },
    ],
    modifier: 10,
  });
  assert.equal(
    normalizeDamageFormula('01D006+02d008+007d2+0010'),
    '1d6 + 2d8 + 7d2 + 10',
  );
});

test('rejeita fórmulas perigosas, ambíguas ou fora dos limites', () => {
  for (const formula of [
    '',
    '-1',
    '1000001',
    '0d6',
    '101d6',
    '1d1',
    '1d1001',
    '2d6 + 1000001',
    '60d6 + 41d4',
    '2d6 * 3',
    'Math.random()',
    '1; process.exit()',
    '1'.repeat(129),
  ]) {
    assert.equal(parseDamageFormula(formula), null, formula);
  }
});

test('faz rolagens determinísticas com RNG injetado e limita o resultado', () => {
  const parsed = parseDamageFormula('3d6 + 2');
  assert.ok(parsed);
  const rolls = [1, 4, 6];
  const calls = [];
  const result = rollDamageFormula(parsed, (minimum, maximumExclusive) => {
    calls.push([minimum, maximumExclusive]);
    return rolls.shift();
  });
  assert.equal(result, 13);
  assert.deepEqual(calls, [[1, 7], [1, 7], [1, 7]]);

  const modified = parseDamageFormula('4d8 + 7');
  assert.ok(modified);
  assert.equal(rollDamageFormula(modified, (() => {
    const results = [2, 4, 6, 8];
    return () => results.shift();
  })()), 27);

  const penalized = parseDamageFormula('3d20 - 5');
  assert.ok(penalized);
  assert.equal(rollDamageFormula(penalized, (() => {
    const results = [1, 10, 20];
    return () => results.shift();
  })()), 26);

  const mixedDice = parseDamageFormula('1d6 + 2d8 + 7d2 + 10');
  assert.ok(mixedDice);
  const mixedRolls = [4, 5, 8, 1, 2, 1, 2, 1, 2, 1];
  const mixedCalls = [];
  assert.equal(rollDamageFormula(mixedDice, (minimum, maximumExclusive) => {
    mixedCalls.push([minimum, maximumExclusive]);
    return mixedRolls.shift();
  }), 37);
  assert.deepEqual(mixedCalls, [
    [1, 7],
    [1, 9], [1, 9],
    [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3],
  ]);

  const subtractiveDice = parseDamageFormula('2d8 - 1d4 + 3');
  assert.ok(subtractiveDice);
  const subtractiveRolls = [8, 4, 3];
  assert.equal(
    rollDamageFormula(subtractiveDice, () => subtractiveRolls.shift()),
    12,
  );

  const belowZero = parseDamageFormula('1d2 - 1000000');
  assert.ok(belowZero);
  assert.equal(rollDamageFormula(belowZero, () => 1), 0);

  const aboveMaximum = parseDamageFormula('100d1000 + 1000000');
  assert.ok(aboveMaximum);
  assert.equal(rollDamageFormula(aboveMaximum, () => 1000), 1_000_000);
});

test('recusa resultados inválidos fornecidos pelo gerador aleatório', () => {
  const parsed = parseDamageFormula('1d6');
  assert.ok(parsed);
  assert.throws(() => rollDamageFormula(parsed, () => 0), RangeError);
  assert.throws(() => rollDamageFormula(parsed, () => 7), RangeError);
  assert.throws(() => rollDamageFormula(parsed, () => 1.5), RangeError);
});

test('normaliza status ativos, aplica defaults e mantém a última configuração duplicada', () => {
  assert.deepEqual(normalizeActiveStatuses([
    { statusId: 'abalado', damageFormula: '99', turnsRemaining: 2 },
    { statusId: 'em-chamas', damageFormula: null, turnsRemaining: 3 },
    { statusId: 'envenenado', damageFormula: '2D8+4', turnsRemaining: 4 },
    { statusId: 'abalado', damageFormula: null, turnsRemaining: 5 },
  ]), [
    { statusId: 'abalado', damageFormula: null, turnsRemaining: 5 },
    { statusId: 'em-chamas', damageFormula: '1d6', turnsRemaining: 3 },
    { statusId: 'envenenado', damageFormula: '2d8 + 4', turnsRemaining: 4 },
  ]);
});

test('normaliza o status Coringa com nome, descrição e dano opcional', () => {
  assert.deepEqual(normalizeActiveStatuses([
    {
      statusId: 'coringa',
      damageFormula: '4D8+7',
      turnsRemaining: 6,
      customName: '  Marcado  ',
      customDescription: '  Sofre 4d8 + 7 de dano.  ',
    },
  ]), [{
    statusId: 'coringa',
    damageFormula: '4d8 + 7',
    turnsRemaining: 6,
    customName: 'Marcado',
    customDescription: 'Sofre 4d8 + 7 de dano.',
  }]);
  assert.deepEqual(normalizeActiveStatuses([{
    statusId: 'coringa',
    damageFormula: null,
    turnsRemaining: 2,
    customName: 'Silenciado',
    customDescription: 'Não pode conjurar magias.',
  }])[0].damageFormula, null);
});

test('classifica valores de condição para destaque semântico', () => {
  const tokens = tokenizeStatusDescription(
    'Sofre 1d6 de dano, −5 em Inteligência, gasta +1 PM, anda 1,5m, testa CD 15 e recebe +2 na Defesa.',
  ).filter(({ kind }) => kind);
  assert.deepEqual(tokens.map(({ text, kind }) => [text, kind]), [
    ['1d6', 'damage'],
    ['−5', 'modifier'],
    ['+1 PM', 'mana'],
    ['1,5m', 'distance'],
    ['CD 15', 'difficulty'],
    ['+2', 'defense'],
  ]);
});

test('descarta status ativos inválidos sem contaminar entradas válidas', () => {
  assert.deepEqual(normalizeActiveStatuses([
    null,
    { statusId: 'desconhecido', damageFormula: null, turnsRemaining: 2 },
    { statusId: 'cego', damageFormula: null, turnsRemaining: 0 },
    { statusId: 'surdo', damageFormula: null, turnsRemaining: 1000 },
    { statusId: 'sangrando', damageFormula: '2d1', turnsRemaining: 2 },
    { statusId: 'envenenado', damageFormula: null, turnsRemaining: 6 },
  ]), []);
  assert.deepEqual(normalizeActiveStatuses({}), []);
});

test('calcula os danos minimo e maximo possiveis de cada formula', () => {
  assert.deepEqual(getDamageFormulaRange('2d8 + 3'), {
    minimum: 5,
    maximum: 19,
  });
  assert.deepEqual(getDamageFormulaRange('1d6 + 2d8 + 7d2 + 10'), {
    minimum: 20,
    maximum: 46,
  });
  assert.deepEqual(getDamageFormulaRange('2d8 - 1d4 + 3'), {
    minimum: 1,
    maximum: 18,
  });
  assert.deepEqual(getDamageFormulaRange('12'), {
    minimum: 12,
    maximum: 12,
  });
  assert.equal(getDamageFormulaRange('2d6 * 3'), null);
});
