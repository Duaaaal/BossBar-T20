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

export const createBossSkillValues = (fallback = 10): BossSkillValues =>
  Object.fromEntries(
    BOSS_SKILL_DEFINITIONS.map(([id]) => [id, fallback]),
  ) as BossSkillValues;

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
