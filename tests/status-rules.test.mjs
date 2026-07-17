import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStatusRules as applyStatusWithAutomaticRules,
  deriveStatusAttributes,
  getStatusAttributeModifiers,
  getStatusSkillAnnotations,
  reconcileStatusIncompatibilities,
} from '../src/shared/status-rules.ts';

const status = (statusId, turnsRemaining = 3, overrides = {}) => ({
  statusId,
  damageFormula: null,
  turnsRemaining,
  ...overrides,
});

const statusesById = (statuses) =>
  new Map(statuses.map((activeStatus) => [activeStatus.statusId, activeStatus]));

const baseAttributes = (overrides = {}) => ({
  attack: 10,
  rangedAttack: 10,
  skills: 10,
  meleeDefense: 10,
  rangedDefense: 10,
  damageReduction: 10,
  shield: 10,
  ...overrides,
});

test('soma todos os modificadores numéricos e permite Ataque, Tiro e Perícias negativos', () => {
  const activeStatuses = [
    status('abalado'),
    status('agarrado'),
    status('caido'),
    status('desprevenido'),
    status('enredado'),
    status('indefeso'),
    status('ofuscado'),
    status('petrificado'),
    status('vulneravel'),
  ];

  assert.deepEqual(getStatusAttributeModifiers(activeStatuses), {
    attack: -11,
    rangedAttack: -6,
    skills: -2,
    meleeDefense: -22,
    rangedDefense: -12,
    damageReduction: 8,
    shield: 0,
  });

  assert.deepEqual(
    deriveStatusAttributes(
      baseAttributes({
        attack: 4,
        rangedAttack: 1,
        skills: 1,
        meleeDefense: 8,
        rangedDefense: 6,
        damageReduction: 0,
        shield: 0,
      }),
      activeStatuses,
    ),
    {
      values: {
        attack: -7,
        rangedAttack: -5,
        skills: -1,
        meleeDefense: 0,
        rangedDefense: 0,
        damageReduction: 8,
        shield: 0,
      },
      modifiers: {
        attack: -11,
        rangedAttack: -6,
        skills: -2,
        meleeDefense: -8,
        rangedDefense: -6,
        damageReduction: 8,
        shield: 0,
      },
    },
  );

  assert.equal(
    getStatusAttributeModifiers([status('apavorado')]).skills,
    -5,
  );
});

test('limita somente ambas as Defesas, RD e Escudo ao mínimo zero', () => {
  const derived = deriveStatusAttributes(baseAttributes({
    attack: -7,
    rangedAttack: -6,
    skills: -5,
    meleeDefense: -4,
    rangedDefense: -3,
    damageReduction: -2,
    shield: -1,
  }), []);

  assert.deepEqual(derived.values, {
    attack: -7,
    rangedAttack: -6,
    skills: -5,
    meleeDefense: 0,
    rangedDefense: 0,
    damageReduction: 0,
    shield: 0,
  });
  assert.deepEqual(derived.modifiers, {
    attack: 0,
    rangedAttack: 0,
    skills: 0,
    meleeDefense: 4,
    rangedDefense: 3,
    damageReduction: 2,
    shield: 1,
  });
});

test('desliga apenas os modificadores numéricos e preserva regras e adendos', () => {
  const result = applyStatusWithAutomaticRules(
    [status('abalado', 2), status('cego', 4)],
    status('abalado', 7),
  );

  assert.deepEqual(result, [status('cego', 4), status('apavorado', 9)]);
  assert.deepEqual(
    getStatusAttributeModifiers(result, false),
    {
      attack: 0,
      rangedAttack: 0,
      skills: 0,
      meleeDefense: 0,
      rangedDefense: 0,
      damageReduction: 0,
      shield: 0,
    },
  );
  assert.deepEqual(
    deriveStatusAttributes(baseAttributes(), result, false).values,
    baseAttributes(),
  );
  assert.deepEqual(
    getStatusSkillAnnotations(result).map(({ statusId }) => statusId),
    ['cego', 'apavorado'],
  );
});

test('transforma Abalado repetido em Apavorado e mantém a exclusividade', () => {
  let activeStatuses = applyStatusWithAutomaticRules([], status('abalado', 3));
  assert.deepEqual(activeStatuses, [status('abalado', 3)]);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('abalado', 5),
  );
  assert.deepEqual(activeStatuses, [status('apavorado', 8)]);
  assert.equal(
    deriveStatusAttributes(baseAttributes(), activeStatuses).values.skills,
    5,
  );

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('abalado', 7),
  );
  assert.deepEqual(activeStatuses, [status('apavorado', 8)]);

  activeStatuses = applyStatusWithAutomaticRules(
    [status('abalado', 9)],
    status('apavorado', 4),
  );
  assert.deepEqual(activeStatuses, [status('apavorado', 4)]);
});

test('repara combinações incompatíveis vindas de encontros antigos', () => {
  const activeStatuses = reconcileStatusIncompatibilities([
    status('abalado', 8),
    status('apavorado', 3),
    status('fraco', 6),
    status('debilitado', 4),
    status('fatigado', 7),
    status('exausto', 2),
  ]);
  const byId = statusesById(activeStatuses);

  assert.equal(byId.has('abalado'), false);
  assert.equal(byId.get('apavorado')?.turnsRemaining, 11);
  assert.equal(byId.has('fraco'), false);
  assert.equal(byId.get('debilitado')?.turnsRemaining, 10);
  assert.equal(byId.has('fatigado'), false);
  assert.equal(byId.get('exausto')?.turnsRemaining, 9);
});

test('Cego aplica Desprevenido e Lento e soma seus turnos quando já ativos', () => {
  let activeStatuses = applyStatusWithAutomaticRules([], status('cego', 3));
  let byId = statusesById(activeStatuses);
  assert.equal(byId.get('cego')?.turnsRemaining, 3);
  assert.deepEqual(byId.get('desprevenido'), status('desprevenido', 3));
  assert.deepEqual(byId.get('lento'), status('lento', 3));

  activeStatuses = applyStatusWithAutomaticRules(
    [status('desprevenido', 2), status('lento', 4)],
    status('cego', 3),
  );
  byId = statusesById(activeStatuses);
  assert.equal(byId.get('cego')?.turnsRemaining, 3);
  assert.equal(byId.get('desprevenido')?.turnsRemaining, 5);
  assert.equal(byId.get('lento')?.turnsRemaining, 7);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('cego', 2),
  );
  byId = statusesById(activeStatuses);
  assert.equal(byId.get('cego')?.turnsRemaining, 2);
  assert.equal(byId.get('desprevenido')?.turnsRemaining, 7);
  assert.equal(byId.get('lento')?.turnsRemaining, 9);
});

test('transforma Debilitado repetido em Inconsciente e aplica Indefeso em cascata', () => {
  let activeStatuses = applyStatusWithAutomaticRules([], status('debilitado', 3));
  assert.deepEqual(activeStatuses, [status('debilitado', 3)]);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('debilitado', 6),
  );
  const byId = statusesById(activeStatuses);
  assert.equal(byId.has('debilitado'), false);
  assert.deepEqual(byId.get('inconsciente'), status('inconsciente', 9));
  assert.deepEqual(byId.get('indefeso'), status('indefeso', 9));
  assert.equal(
    deriveStatusAttributes(baseAttributes(), activeStatuses).values.meleeDefense,
    0,
  );
  assert.equal(
    deriveStatusAttributes(baseAttributes(), activeStatuses).values.rangedDefense,
    0,
  );
});

test('Exausto aplica seus derivados e a repetição o transforma em Inconsciente', () => {
  let activeStatuses = applyStatusWithAutomaticRules([], status('exausto', 3));
  let byId = statusesById(activeStatuses);
  for (const statusId of ['exausto', 'debilitado', 'lento', 'vulneravel']) {
    assert.equal(byId.get(statusId)?.turnsRemaining, 3, statusId);
  }

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('exausto', 5),
  );
  byId = statusesById(activeStatuses);
  assert.equal(byId.has('exausto'), false);
  assert.equal(byId.has('debilitado'), false);
  assert.equal(byId.get('inconsciente')?.turnsRemaining, 8);
  assert.equal(byId.get('indefeso')?.turnsRemaining, 8);
  assert.equal(byId.get('lento')?.turnsRemaining, 3);
  assert.equal(byId.get('vulneravel')?.turnsRemaining, 3);
});

test('Exausto transforma um Debilitado preexistente em Inconsciente', () => {
  const activeStatuses = applyStatusWithAutomaticRules(
    [status('debilitado', 2)],
    status('exausto', 4),
  );
  const byId = statusesById(activeStatuses);

  assert.equal(byId.has('exausto'), false);
  assert.equal(byId.has('debilitado'), false);
  assert.equal(byId.get('inconsciente')?.turnsRemaining, 6);
  assert.equal(byId.get('indefeso')?.turnsRemaining, 6);
  assert.equal(byId.get('lento')?.turnsRemaining, 4);
  assert.equal(byId.get('vulneravel')?.turnsRemaining, 4);
});

test('Fatigado aplica derivados e sua repetição evolui para Exausto', () => {
  let activeStatuses = applyStatusWithAutomaticRules([], status('fatigado', 4));
  let byId = statusesById(activeStatuses);
  assert.equal(byId.get('fatigado')?.turnsRemaining, 4);
  assert.equal(byId.get('fraco')?.turnsRemaining, 4);
  assert.equal(byId.get('vulneravel')?.turnsRemaining, 4);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('fatigado', 6),
  );
  byId = statusesById(activeStatuses);
  assert.equal(byId.has('fraco'), false);
  assert.equal(byId.has('fatigado'), false);
  assert.equal(byId.get('exausto')?.turnsRemaining, 10);
  assert.equal(byId.get('debilitado')?.turnsRemaining, 10);
  assert.equal(byId.get('lento')?.turnsRemaining, 10);
  assert.equal(byId.get('vulneravel')?.turnsRemaining, 10);

  activeStatuses = applyStatusWithAutomaticRules([], status('fraco', 2));
  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('fraco', 5),
  );
  assert.deepEqual(activeStatuses, [status('debilitado', 7)]);
});

test('Fatigado evolui um Fraco preexistente para Debilitado somando turnos', () => {
  const byId = statusesById(applyStatusWithAutomaticRules(
    [status('fraco', 2)],
    status('fatigado', 4),
  ));

  assert.equal(byId.has('fraco'), false);
  assert.equal(byId.get('fatigado')?.turnsRemaining, 4);
  assert.equal(byId.get('debilitado')?.turnsRemaining, 6);
  assert.equal(byId.get('vulneravel')?.turnsRemaining, 4);
});

test('Fraco, Debilitado e Inconsciente nunca permanecem juntos', () => {
  let activeStatuses = applyStatusWithAutomaticRules(
    [status('fraco', 8)],
    status('debilitado', 3),
  );
  let byId = statusesById(activeStatuses);
  assert.equal(byId.has('fraco'), false);
  assert.equal(byId.get('debilitado')?.turnsRemaining, 3);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('fraco', 9),
  );
  byId = statusesById(activeStatuses);
  assert.equal(byId.has('fraco'), false);
  assert.equal(byId.get('debilitado')?.turnsRemaining, 9);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('inconsciente', 4),
  );
  byId = statusesById(activeStatuses);
  assert.equal(byId.has('fraco'), false);
  assert.equal(byId.has('debilitado'), false);
  assert.equal(byId.get('inconsciente')?.turnsRemaining, 4);
  assert.equal(byId.get('indefeso')?.turnsRemaining, 4);
});

test('Frustrado repetido progride para Esmorecido e respeita a dominância', () => {
  let activeStatuses = applyStatusWithAutomaticRules([], status('frustrado', 2));
  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('frustrado', 5),
  );
  assert.deepEqual(activeStatuses, [status('esmorecido', 7)]);

  activeStatuses = applyStatusWithAutomaticRules(
    activeStatuses,
    status('frustrado', 7),
  );
  assert.deepEqual(activeStatuses, [status('esmorecido', 7)]);

  activeStatuses = applyStatusWithAutomaticRules(
    [status('frustrado', 8)],
    status('esmorecido', 3),
  );
  assert.deepEqual(activeStatuses, [status('esmorecido', 3)]);
});

test('Paralisado aplica Imóvel e Indefeso com a mesma duração', () => {
  const byId = statusesById(
    applyStatusWithAutomaticRules([], status('paralisado', 4)),
  );
  assert.deepEqual(byId.get('paralisado'), status('paralisado', 4));
  assert.deepEqual(byId.get('imovel'), status('imovel', 4));
  assert.deepEqual(byId.get('indefeso'), status('indefeso', 4));
});

test('Petrificado aplica Inconsciente e Indefeso em cascata e concede +8 RD', () => {
  const activeStatuses = applyStatusWithAutomaticRules(
    [],
    status('petrificado', 5),
  );
  const byId = statusesById(activeStatuses);
  assert.deepEqual(byId.get('petrificado'), status('petrificado', 5));
  assert.deepEqual(byId.get('inconsciente'), status('inconsciente', 5));
  assert.deepEqual(byId.get('indefeso'), status('indefeso', 5));
  assert.equal(
    deriveStatusAttributes(
      baseAttributes({ damageReduction: 2 }),
      activeStatuses,
    ).values.damageReduction,
    10,
  );
});

test('Surpreendido aplica Desprevenido com a mesma duração', () => {
  const byId = statusesById(
    applyStatusWithAutomaticRules([], status('surpreendido', 6)),
  );
  assert.deepEqual(byId.get('surpreendido'), status('surpreendido', 6));
  assert.deepEqual(byId.get('desprevenido'), status('desprevenido', 6));
});

test('retorna um adendo de Perícias por condição relevante, na ordem ativa', () => {
  const ids = [
    'abalado',
    'apavorado',
    'cego',
    'debilitado',
    'desprevenido',
    'enfeiticado',
    'esmorecido',
    'fascinado',
    'fraco',
    'frustrado',
    'ofuscado',
    'surdo',
  ];
  const annotations = getStatusSkillAnnotations([
    ...ids.map((statusId) => status(statusId)),
    status('cego', 9),
    status('vulneravel'),
  ]);

  assert.deepEqual(
    annotations.map(({ statusId }) => statusId),
    ids,
  );
  assert.equal(annotations.length, 12);
  assert.equal(annotations.find(({ statusId }) => statusId === 'enfeiticado')?.tone, 'bonus');
  assert.match(
    annotations.find(({ statusId }) => statusId === 'enfeiticado')?.text ?? '',
    /\+10.*Diplomacia/,
  );
  for (const annotation of annotations.filter(
    ({ statusId }) => statusId !== 'enfeiticado',
  )) {
    assert.equal(annotation.tone, 'penalty', annotation.statusId);
    assert.ok(annotation.text.length > 10, annotation.statusId);
  }
});

test('preserva dano, nome e descrição do status aplicado diretamente', () => {
  const customStatus = status('coringa', 7, {
    damageFormula: '2d8 + 4',
    customName: 'Marca do Caos',
    customDescription: 'Causa dano no início de cada turno.',
  });
  assert.deepEqual(
    applyStatusWithAutomaticRules([status('lento', 2)], customStatus),
    [status('lento', 2), customStatus],
  );
});
