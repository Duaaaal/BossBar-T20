export const BOSS_SKILL_DEFINITIONS = [
  ['acrobacia', 'Acrobacia'],
  ['adestramento', 'Adestramento'],
  ['atletismo', 'Atletismo'],
  ['atuacao', 'Atuação'],
  ['cavalgar', 'Cavalgar'],
  ['conhecimento', 'Conhecimento'],
  ['cura', 'Cura'],
  ['diplomacia', 'Diplomacia'],
  ['enganacao', 'Enganação'],
  ['fortitude', 'Fortitude'],
  ['furtividade', 'Furtividade'],
  ['guerra', 'Guerra'],
  ['iniciativa', 'Iniciativa'],
  ['intimidacao', 'Intimidação'],
  ['intuicao', 'Intuição'],
  ['investigacao', 'Investigação'],
  ['jogatina', 'Jogatina'],
  ['ladinagem', 'Ladinagem'],
  ['luta', 'Luta'],
  ['misticismo', 'Misticismo'],
  ['pilotagem', 'Pilotagem'],
  ['nobreza', 'Nobreza'],
  ['oficio1', 'Ofício 1'],
  ['oficio2', 'Ofício 2'],
  ['percepcao', 'Percepção'],
  ['pontaria', 'Pontaria'],
  ['reflexos', 'Reflexos'],
  ['religiao', 'Religião'],
  ['sobrevivencia', 'Sobrevivência'],
  ['vontade', 'Vontade'],
] as const;

export type BossSkillId = typeof BOSS_SKILL_DEFINITIONS[number][0];
export type BossSkillValues = Record<BossSkillId, number>;
export type BossSkillOverrides = BossSkillId[];

const bossSkillIds = new Set<string>(BOSS_SKILL_DEFINITIONS.map(([id]) => id));

export const createBossSkillValues = (fallback = 10): BossSkillValues =>
  Object.fromEntries(
    BOSS_SKILL_DEFINITIONS.map(([id]) => [id, fallback]),
  ) as BossSkillValues;

export const inferManuallyEditedBossSkills = (
  base: number,
  values: BossSkillValues,
): BossSkillId[] => BOSS_SKILL_DEFINITIONS.flatMap(([id]) =>
  values[id] !== base ? [id] : []);

export const normalizeBossSkillOverrides = (
  value: unknown,
  base: number,
  values: BossSkillValues,
): BossSkillOverrides => {
  if (!Array.isArray(value)) return inferManuallyEditedBossSkills(base, values);
  return [...new Set(value.filter(
    (id): id is BossSkillId => typeof id === 'string' && bossSkillIds.has(id),
  ))];
};

export const resolveBossSkillValues = (
  base: number,
  values: BossSkillValues,
  overrides: readonly BossSkillId[],
): BossSkillValues => {
  const manual = new Set(overrides);
  return Object.fromEntries(
    BOSS_SKILL_DEFINITIONS.map(([id]) => [id, manual.has(id) ? values[id] : base]),
  ) as BossSkillValues;
};

export const updateInheritedBossSkillDrafts = (
  base: string,
  values: Record<BossSkillId, string>,
  manuallyEdited: ReadonlySet<BossSkillId> | readonly BossSkillId[],
): Record<BossSkillId, string> => {
  const manual = new Set(manuallyEdited);
  return Object.fromEntries(
    BOSS_SKILL_DEFINITIONS.map(([id]) => [
      id,
      manual.has(id) ? values[id] : base,
    ]),
  ) as Record<BossSkillId, string>;
};

export const normalizeBossSkillValues = (
  value: unknown,
  fallback = 10,
): BossSkillValues => {
  const source = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  return Object.fromEntries(
    BOSS_SKILL_DEFINITIONS.map(([id]) => {
      const candidate = Number(source[id]);
      const normalized = Number.isFinite(candidate)
        ? Math.min(999, Math.max(-999, Math.round(candidate)))
        : fallback;
      return [id, normalized];
    }),
  ) as BossSkillValues;
};
