import type { ActiveBossStatus } from './status';

export type AreaDamageSuccessRule = 'half' | 'none';

export type PlayerEncounterState = {
  clientId: string;
  characterName: string;
  currentHealth: number;
  maxHealth: number;
  currentMana: number;
  maxMana: number;
  defenseMelee: number;
  defenseRanged: number;
  reflex: number;
  statuses: ActiveBossStatus[];
  revision: number;
};

export type AreaDamageRequest = {
  damage: number;
  reflexDc: number;
  successRule: AreaDamageSuccessRule;
};

export type AreaDamageResult = {
  ok: boolean;
  appliedPlayers: number;
  skippedPlayers: string[];
  error?: string;
};

export type PlayerAreaDamageImpact = {
  id: number;
  playerState: PlayerEncounterState;
  check: {
    die: number;
    reflex: number;
    total: number;
    dc: number;
    success: boolean;
    natural: 1 | 20 | null;
  };
  damage: {
    requested: number;
    applied: number;
    healthBefore: number;
    healthAfter: number;
    successRule: AreaDamageSuccessRule;
  };
};

export const isAreaDamageRequest = (value: unknown): value is AreaDamageRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AreaDamageRequest>;
  return Number.isInteger(candidate.damage) && (candidate.damage ?? 0) >= 0 &&
    (candidate.damage ?? 0) <= 999_999 &&
    Number.isInteger(candidate.reflexDc) && (candidate.reflexDc ?? 0) >= 0 &&
    (candidate.reflexDc ?? 0) <= 999 &&
    (candidate.successRule === 'half' || candidate.successRule === 'none');
};

export const resolveAreaDamage = (
  state: PlayerEncounterState,
  request: AreaDamageRequest,
  die: number,
  id: number,
): PlayerAreaDamageImpact => {
  if (!isAreaDamageRequest(request)) throw new Error('O dano em área é inválido.');
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error('A rolagem de Reflexos é inválida.');
  const total = die + state.reflex;
  const success = die === 20 || (die !== 1 && total >= request.reflexDc);
  const applied = success
    ? request.successRule === 'none' ? 0 : Math.ceil(request.damage / 2)
    : request.damage;
  const healthBefore = Math.max(0, Math.min(state.maxHealth, state.currentHealth));
  const healthAfter = Math.max(0, healthBefore - applied);
  const playerState: PlayerEncounterState = {
    ...state,
    currentHealth: healthAfter,
    revision: state.revision + 1,
  };
  return {
    id,
    playerState,
    check: {
      die,
      reflex: state.reflex,
      total,
      dc: request.reflexDc,
      success,
      natural: die === 1 || die === 20 ? die : null,
    },
    damage: {
      requested: request.damage,
      applied,
      healthBefore,
      healthAfter,
      successRule: request.successRule,
    },
  };
};
