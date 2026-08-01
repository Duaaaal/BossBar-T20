import { normalizeDamageFormula } from './status.ts';

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
