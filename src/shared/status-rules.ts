import type { ActiveBossStatus, StatusId } from './status';

export type StatusAttributeKey =
  | 'attack'
  | 'rangedAttack'
  | 'skills'
  | 'meleeDefense'
  | 'rangedDefense'
  | 'damageReduction'
  | 'shield';

export type StatusAttributes = Readonly<Record<StatusAttributeKey, number>>;

export type StatusAttributeModifiers = Readonly<
  Record<StatusAttributeKey, number>
>;

export type DerivedStatusAttributes = Readonly<{
  values: StatusAttributes;
  modifiers: StatusAttributeModifiers;
}>;

export type StatusSkillAnnotationTone = 'penalty' | 'bonus' | 'neutral';

export type StatusSkillAnnotation = Readonly<{
  statusId: StatusId;
  text: string;
  tone: StatusSkillAnnotationTone;
}>;

const EMPTY_MODIFIERS: StatusAttributeModifiers = Object.freeze({
  attack: 0,
  rangedAttack: 0,
  skills: 0,
  meleeDefense: 0,
  rangedDefense: 0,
  damageReduction: 0,
  shield: 0,
});

const STATUS_ATTRIBUTE_MODIFIERS: Readonly<
  Partial<Record<StatusId, Partial<StatusAttributeModifiers>>>
> = Object.freeze({
  abalado: Object.freeze({ skills: -2 }),
  agarrado: Object.freeze({ attack: -2, rangedAttack: -2 }),
  apavorado: Object.freeze({ skills: -5 }),
  caido: Object.freeze({
    attack: -5,
    meleeDefense: -5,
    rangedDefense: 5,
  }),
  desprevenido: Object.freeze({
    meleeDefense: -5,
    rangedDefense: -5,
  }),
  enredado: Object.freeze({ attack: -2, rangedAttack: -2 }),
  indefeso: Object.freeze({
    meleeDefense: -10,
    rangedDefense: -10,
  }),
  ofuscado: Object.freeze({ attack: -2, rangedAttack: -2 }),
  petrificado: Object.freeze({ damageReduction: 8 }),
  vulneravel: Object.freeze({
    meleeDefense: -2,
    rangedDefense: -2,
  }),
});

const STATUS_SKILL_ANNOTATIONS: Readonly<
  Partial<Record<StatusId, Omit<StatusSkillAnnotation, 'statusId'>>>
> = Object.freeze({
  abalado: Object.freeze({
    text: '−2 em testes de perícia.',
    tone: 'penalty',
  }),
  apavorado: Object.freeze({
    text: '−5 em testes de perícia.',
    tone: 'penalty',
  }),
  cego: Object.freeze({
    text: '−5 apenas em perícias de Força ou Destreza.',
    tone: 'penalty',
  }),
  debilitado: Object.freeze({
    text: '−5 apenas em perícias de Força, Destreza ou Constituição.',
    tone: 'penalty',
  }),
  desprevenido: Object.freeze({
    text: '−5 apenas em Reflexos.',
    tone: 'penalty',
  }),
  enfeiticado: Object.freeze({
    text: '+10 apenas em Diplomacia.',
    tone: 'bonus',
  }),
  esmorecido: Object.freeze({
    text: '−5 em Inteligência, Sabedoria e Carisma e nas perícias baseadas nesses atributos.',
    tone: 'penalty',
  }),
  fascinado: Object.freeze({
    text: '−5 apenas em Percepção.',
    tone: 'penalty',
  }),
  fraco: Object.freeze({
    text: '−2 em Força, Destreza e Constituição e nas perícias baseadas nesses atributos.',
    tone: 'penalty',
  }),
  frustrado: Object.freeze({
    text: '−2 em Inteligência, Sabedoria e Carisma e nas perícias baseadas nesses atributos.',
    tone: 'penalty',
  }),
  ofuscado: Object.freeze({
    text: '−2 apenas em Percepção.',
    tone: 'penalty',
  }),
  surdo: Object.freeze({
    text: '−5 em Iniciativa e não pode usar Percepção para ouvir.',
    tone: 'penalty',
  }),
});

const ATTRIBUTE_KEYS: readonly StatusAttributeKey[] = [
  'attack',
  'rangedAttack',
  'skills',
  'meleeDefense',
  'rangedDefense',
  'damageReduction',
  'shield',
];

const NON_NEGATIVE_ATTRIBUTES = new Set<StatusAttributeKey>([
  'meleeDefense',
  'rangedDefense',
  'damageReduction',
  'shield',
]);

export const getStatusAttributeModifiers = (
  activeStatuses: readonly ActiveBossStatus[],
  enabled = true,
): StatusAttributeModifiers => {
  if (!enabled) return EMPTY_MODIFIERS;

  const modifiers: Record<StatusAttributeKey, number> = {
    ...EMPTY_MODIFIERS,
  };
  for (const status of activeStatuses) {
    const statusModifiers = STATUS_ATTRIBUTE_MODIFIERS[status.statusId];
    if (!statusModifiers) continue;
    for (const key of ATTRIBUTE_KEYS) {
      modifiers[key] += statusModifiers[key] ?? 0;
    }
  }
  return modifiers;
};

export const deriveStatusAttributes = (
  base: StatusAttributes,
  activeStatuses: readonly ActiveBossStatus[],
  enabled = true,
): DerivedStatusAttributes => {
  const rawModifiers = getStatusAttributeModifiers(activeStatuses, enabled);
  const values = {} as Record<StatusAttributeKey, number>;
  const modifiers = {} as Record<StatusAttributeKey, number>;

  for (const key of ATTRIBUTE_KEYS) {
    const unboundedValue = base[key] + rawModifiers[key];
    const value = NON_NEGATIVE_ATTRIBUTES.has(key)
      ? Math.max(0, unboundedValue)
      : unboundedValue;
    values[key] = value;
    modifiers[key] = value - base[key];
  }

  return { values, modifiers };
};

export const getStatusSkillAnnotations = (
  activeStatuses: readonly ActiveBossStatus[],
): StatusSkillAnnotation[] => {
  const seen = new Set<StatusId>();
  return activeStatuses.flatMap((status): StatusSkillAnnotation[] => {
    if (seen.has(status.statusId)) return [];
    seen.add(status.statusId);
    const annotation = STATUS_SKILL_ANNOTATIONS[status.statusId];
    return annotation
      ? [{ statusId: status.statusId, ...annotation }]
      : [];
  });
};

type StatusApplicationMode = 'replace' | 'add-turns';

type DerivedStatusRule = Readonly<{
  statusId: StatusId;
  mode?: StatusApplicationMode;
}>;

const REPEAT_TRANSFORMATIONS: Readonly<Partial<Record<StatusId, StatusId>>> =
  Object.freeze({
    abalado: 'apavorado',
    debilitado: 'inconsciente',
    exausto: 'inconsciente',
    fatigado: 'exausto',
    fraco: 'debilitado',
    frustrado: 'esmorecido',
  });

const DERIVED_STATUSES: Readonly<
  Partial<Record<StatusId, readonly DerivedStatusRule[]>>
> = Object.freeze({
  cego: Object.freeze([
    Object.freeze({ statusId: 'desprevenido', mode: 'add-turns' }),
    Object.freeze({ statusId: 'lento', mode: 'add-turns' }),
  ]),
  exausto: Object.freeze([
    Object.freeze({ statusId: 'debilitado' }),
    Object.freeze({ statusId: 'lento' }),
    Object.freeze({ statusId: 'vulneravel' }),
  ]),
  fatigado: Object.freeze([
    Object.freeze({ statusId: 'fraco' }),
    Object.freeze({ statusId: 'vulneravel' }),
  ]),
  inconsciente: Object.freeze([
    Object.freeze({ statusId: 'indefeso' }),
  ]),
  paralisado: Object.freeze([
    Object.freeze({ statusId: 'imovel' }),
    Object.freeze({ statusId: 'indefeso' }),
  ]),
  petrificado: Object.freeze([
    Object.freeze({ statusId: 'inconsciente' }),
  ]),
  surpreendido: Object.freeze([
    Object.freeze({ statusId: 'desprevenido' }),
  ]),
});

type StatusDominanceGroup = Readonly<{
  statusIds: readonly StatusId[];
}>;

const dominanceGroup = (...statusIds: StatusId[]): StatusDominanceGroup =>
  Object.freeze({ statusIds: Object.freeze(statusIds) });

const STATUS_DOMINANCE_GROUPS: readonly StatusDominanceGroup[] = Object.freeze([
  dominanceGroup('abalado', 'apavorado'),
  dominanceGroup('fraco', 'debilitado', 'inconsciente'),
  dominanceGroup('frustrado', 'esmorecido'),
  dominanceGroup('fatigado', 'exausto', 'inconsciente'),
]);

const dominanceByStatus = new Map<
  StatusId,
  ReadonlyArray<Readonly<{ group: StatusDominanceGroup; rank: number }>>
>();
for (const group of STATUS_DOMINANCE_GROUPS) {
  group.statusIds.forEach((statusId, rank) => {
    dominanceByStatus.set(statusId, [
      ...(dominanceByStatus.get(statusId) ?? []),
      { group, rank },
    ]);
  });
}

const standardStatus = (
  statusId: StatusId,
  turnsRemaining: number,
): ActiveBossStatus => ({
  statusId,
  damageFormula: null,
  turnsRemaining,
});

const capTurns = (turns: number) => Math.min(999, Math.max(1, turns));

const setStatus = (
  statuses: Map<StatusId, ActiveBossStatus>,
  status: ActiveBossStatus,
) => {
  statuses.delete(status.statusId);
  statuses.set(status.statusId, status);
};

const removeWeakerStatuses = (
  statuses: Map<StatusId, ActiveBossStatus>,
  statusId: StatusId,
) => {
  for (const dominance of dominanceByStatus.get(statusId) ?? []) {
    dominance.group.statusIds.slice(0, dominance.rank).forEach((weakerId) => {
      statuses.delete(weakerId);
    });
  }
};

const findStrongerStatus = (
  statuses: ReadonlyMap<StatusId, ActiveBossStatus>,
  statusId: StatusId,
) => {
  for (const dominance of dominanceByStatus.get(statusId) ?? []) {
    for (
      let rank = dominance.group.statusIds.length - 1;
      rank > dominance.rank;
      rank -= 1
    ) {
      const strongerStatus = statuses.get(dominance.group.statusIds[rank]);
      if (strongerStatus) return strongerStatus;
    }
  }
  return null;
};

const reconcileDominanceGroups = (
  statuses: Map<StatusId, ActiveBossStatus>,
) => {
  for (const group of STATUS_DOMINANCE_GROUPS) {
    let strongestRank = -1;
    group.statusIds.forEach((statusId, rank) => {
      if (statuses.has(statusId)) strongestRank = rank;
    });
    if (strongestRank < 0) continue;
    const strongestId = group.statusIds[strongestRank];
    const strongestStatus = statuses.get(strongestId);
    if (!strongestStatus) continue;
    let turnsRemaining = strongestStatus.turnsRemaining;
    group.statusIds.slice(0, strongestRank).forEach((statusId) => {
      const weakerStatus = statuses.get(statusId);
      if (weakerStatus) turnsRemaining += weakerStatus.turnsRemaining;
      statuses.delete(statusId);
    });
    statuses.set(strongestId, {
      ...strongestStatus,
      turnsRemaining: capTurns(turnsRemaining),
    });
  }
};

export const reconcileStatusIncompatibilities = (
  activeStatuses: readonly ActiveBossStatus[],
): ActiveBossStatus[] => {
  const statuses = new Map(
    activeStatuses.map((status) => [status.statusId, status]),
  );
  reconcileDominanceGroups(statuses);
  return [...statuses.values()];
};

const applyOneStatus = (
  statuses: Map<StatusId, ActiveBossStatus>,
  incoming: ActiveBossStatus,
  mode: StatusApplicationMode,
  depth: number,
) => {
  if (depth > 36) return;

  const strongerStatus = findStrongerStatus(statuses, incoming.statusId);
  if (strongerStatus) {
    setStatus(statuses, {
      ...strongerStatus,
      turnsRemaining: Math.max(
        strongerStatus.turnsRemaining,
        incoming.turnsRemaining,
      ),
    });
    return;
  }

  const existingStatus = statuses.get(incoming.statusId);
  const transformation = existingStatus
    ? REPEAT_TRANSFORMATIONS[incoming.statusId]
    : undefined;
  if (transformation) {
    statuses.delete(incoming.statusId);
    applyOneStatus(
      statuses,
      standardStatus(
        transformation,
        capTurns((existingStatus?.turnsRemaining ?? 0) + incoming.turnsRemaining),
      ),
      'replace',
      depth + 1,
    );
    return;
  }

  removeWeakerStatuses(statuses, incoming.statusId);

  const status = mode === 'add-turns' && existingStatus
    ? {
        ...existingStatus,
        turnsRemaining: capTurns(
          existingStatus.turnsRemaining + incoming.turnsRemaining,
        ),
      }
    : incoming;
  setStatus(statuses, status);

  for (const rule of DERIVED_STATUSES[status.statusId] ?? []) {
    applyOneStatus(
      statuses,
      standardStatus(rule.statusId, status.turnsRemaining),
      rule.mode ?? 'replace',
      depth + 1,
    );
  }
};

export const applyStatusRules = (
  activeStatuses: readonly ActiveBossStatus[],
  incomingStatus: ActiveBossStatus,
): ActiveBossStatus[] => {
  const statuses = new Map(
    reconcileStatusIncompatibilities(activeStatuses).map(
      (status) => [status.statusId, status],
    ),
  );
  applyOneStatus(statuses, incomingStatus, 'replace', 0);
  return [...statuses.values()];
};
