import { isStatusId, normalizeDamageFormula, type StatusId } from './status.ts';
import { BOSS_SKILL_DEFINITIONS, type BossSkillId } from './boss-skills.ts';

export type AttackStatusEffect = {
  statusId: StatusId;
  turns: number;
  damageFormula: string;
  resistanceSkill: BossSkillId;
  dc: number;
};

export const isAttackStatusEffect = (value: unknown): value is AttackStatusEffect => {
  if (!value || typeof value !== 'object') return false;
  const effect = value as Partial<AttackStatusEffect>;
  return isStatusId(effect.statusId) && effect.statusId !== 'coringa' &&
    BOSS_SKILL_DEFINITIONS.some(([id]) => id === effect.resistanceSkill) &&
    Number.isInteger(effect.dc) && Number(effect.dc) >= 0 && Number(effect.dc) <= 999 &&
    Number.isInteger(effect.turns) && Number(effect.turns) >= 1 && Number(effect.turns) <= 999 &&
    typeof effect.damageFormula === 'string' && normalizeDamageFormula(effect.damageFormula) !== null;
};

export const MAX_BOSS_ATTACKS = 20;

export type BossAttack = {
  id: string;
  name: string;
  attackType: 'melee' | 'ranged';
  /** Additional modifier applied after Luta or Pontaria. */
  attackModifier: number;
  damageFormula: string;
  criticalThreat: number;
  criticalMultiplier: number;
  damageType: string;
  range: string;
  tags?: string[];
  attackCount?: number;
  statusEffects?: AttackStatusEffect[];
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

const safeId = (value: unknown) =>
  typeof value === 'string' && /^[A-Za-z0-9:_-]{1,128}$/.test(value)
    ? value
    : null;

export const createInitialBossAttack = (bossId: string): BossAttack => ({
  id: `boss-attack:${bossId}:1`,
  name: 'Golpe',
  attackType: 'melee',
  attackModifier: 0,
  damageFormula: '1d8',
  criticalThreat: 20,
  criticalMultiplier: 2,
  damageType: 'Impacto',
  range: 'Adjacente',
});

export const normalizeBossAttack = (
  value: unknown,
  fallbackId: string,
): BossAttack | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<BossAttack>;
  const id = safeId(candidate.id) ?? safeId(fallbackId);
  const damageFormula = typeof candidate.damageFormula === 'string'
    ? normalizeDamageFormula(candidate.damageFormula)
    : null;
  if (
    !id ||
    typeof candidate.name !== 'string' ||
    (candidate.attackType !== 'melee' && candidate.attackType !== 'ranged') ||
    !Number.isFinite(candidate.attackModifier) ||
    !damageFormula ||
    !Number.isFinite(candidate.criticalThreat) ||
    !Number.isFinite(candidate.criticalMultiplier)
  ) return null;
  return {
    id,
    name: candidate.name.trim().slice(0, 60) || 'Ataque',
    attackType: candidate.attackType,
    attackModifier: clampInteger(Number(candidate.attackModifier), -99, 99),
    damageFormula,
    criticalThreat: clampInteger(Number(candidate.criticalThreat), 2, 20),
    criticalMultiplier: clampInteger(Number(candidate.criticalMultiplier), 2, 10),
    attackCount: clampInteger(Number.isFinite(candidate.attackCount) ? Number(candidate.attackCount) : 1, 1, 20),
    tags: Array.isArray(candidate.tags) ? [...new Set(candidate.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim().slice(0, 60)).filter(Boolean))].slice(0, 12) : [],
    statusEffects: Array.isArray(candidate.statusEffects) ? candidate.statusEffects.slice(0, 10).flatMap((effect) => {
      if (!effect || !isStatusId(effect.statusId) || effect.statusId === 'coringa' || !BOSS_SKILL_DEFINITIONS.some(([id]) => id === effect.resistanceSkill) || !Number.isFinite(effect.dc) || !Number.isFinite(effect.turns)) return [];
      return [{ statusId: effect.statusId, resistanceSkill: effect.resistanceSkill, dc: clampInteger(effect.dc, 0, 999), turns: clampInteger(effect.turns, 1, 999), damageFormula: normalizeDamageFormula(effect.damageFormula) ?? '0' }];
    }) : [],
    damageType: typeof candidate.damageType === 'string'
      ? candidate.damageType.trim().slice(0, 40)
      : '',
    range: typeof candidate.range === 'string'
      ? candidate.range.trim().slice(0, 40)
      : '',
  };
};

export const normalizeBossAttacks = (
  value: unknown,
  bossId: string,
): BossAttack[] => {
  if (!Array.isArray(value)) return [createInitialBossAttack(bossId)];
  const ids = new Set<string>();
  const attacks = value.slice(0, MAX_BOSS_ATTACKS).flatMap((attack, index) => {
    const normalized = normalizeBossAttack(
      attack,
      `boss-attack:${bossId}:${index + 1}`,
    );
    if (!normalized || ids.has(normalized.id)) return [];
    ids.add(normalized.id);
    return [normalized];
  });
  return attacks.length > 0 ? attacks : [createInitialBossAttack(bossId)];
};

export const selectedBossAttack = (
  attacks: readonly BossAttack[],
  selectedAttackId: unknown,
) => attacks.find(({ id }) => id === selectedAttackId) ?? attacks[0] ?? null;
