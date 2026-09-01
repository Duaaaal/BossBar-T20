import type { BossState } from './battle.ts';
import {
  normalizeBossSkillOverrides,
  normalizeBossSkillValues,
} from './boss-skills.ts';
import type {
  EncounterTurnParticipant,
  PlayerEncounterState,
} from './player-combat.ts';
import { normalizeActiveStatuses } from './status.ts';
import { normalizeBossAttacks, selectedBossAttack } from './boss-attacks.ts';

export type EncounterDebugCreature =
  | { id: string; kind: 'boss'; name: string; data: BossState }
  | { id: string; kind: 'player'; name: string; data: PlayerEncounterState }
  | { id: string; kind: 'npc'; name: string; data: EncounterTurnParticipant };

export type EncounterDebugSnapshot = {
  creatures: EncounterDebugCreature[];
  revision: number;
};

export type EncounterDebugOverrideRequest = {
  id: string;
  kind: EncounterDebugCreature['kind'];
  data: unknown;
};

export type EncounterDebugResult = {
  ok: boolean;
  snapshot?: EncounterDebugSnapshot;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const integer = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const candidate = Number(value);
  return Number.isFinite(candidate)
    ? Math.max(minimum, Math.min(maximum, Math.trunc(candidate)))
    : fallback;
};

const text = (value: unknown, fallback: string, maximum: number) =>
  typeof value === 'string' ? value.trim().slice(0, maximum) : fallback;

const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export const isEncounterDebugOverrideRequest = (
  value: unknown,
): value is EncounterDebugOverrideRequest => {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  return typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 160 &&
    (value.kind === 'boss' || value.kind === 'player' || value.kind === 'npc');
};

export const normalizeDebugBoss = (
  value: unknown,
  current: BossState,
): BossState | null => {
  if (!isRecord(value)) return null;
  const maxHealth = integer(value.maxHealth, current.maxHealth, 1, 1_000_000);
  const skills = integer(value.skills, current.skills, -999, 999);
  const skillValues = normalizeBossSkillValues(value.skillValues, skills);
  const attacks = normalizeBossAttacks(value.attacks, current.id);
  return {
    id: current.id,
    setupStatus:
      value.setupStatus === 'initial' ||
      value.setupStatus === 'pending' ||
      value.setupStatus === 'ready'
        ? value.setupStatus
        : current.setupStatus,
    identityPrepared: bool(value.identityPrepared, current.identityPrepared),
    actionPrepared: bool(value.actionPrepared, current.actionPrepared),
    bossName: text(value.bossName, current.bossName, 100) || current.bossName,
    controlAmount: text(value.controlAmount, current.controlAmount, 60),
    applyDamageReduction: bool(
      value.applyDamageReduction,
      current.applyDamageReduction,
    ),
    maxHealth,
    currentHealth: integer(value.currentHealth, current.currentHealth, 0, maxHealth),
    attack: integer(value.attack, current.attack, -999, 999),
    rangedAttack: integer(value.rangedAttack, current.rangedAttack, -999, 999),
    defense: integer(value.defense, current.defense, 0, 999),
    rangedDefense: integer(value.rangedDefense, current.rangedDefense, 0, 999),
    shield: integer(value.shield, current.shield, 0, 999),
    skills,
    skillValues,
    skillOverrides: normalizeBossSkillOverrides(
      value.skillOverrides,
      skills,
      skillValues,
    ),
    damageReduction: integer(value.damageReduction, current.damageReduction, 0, 999),
    attacks,
    selectedAttackId:
      selectedBossAttack(attacks, value.selectedAttackId ?? current.selectedAttackId)?.id ??
      attacks[0].id,
    nextAction: text(value.nextAction, current.nextAction, 100),
    actionSeverity: value.actionSeverity === 'grave' ? 'grave' : 'normal',
    turnCount: integer(value.turnCount, current.turnCount, 0, 999_999),
    activeStatuses: normalizeActiveStatuses(value.activeStatuses),
  };
};

export const normalizeDebugPlayer = (
  value: unknown,
  current: PlayerEncounterState,
): PlayerEncounterState | null => {
  if (!isRecord(value)) return null;
  const maxHealth = integer(value.maxHealth, current.maxHealth, 1, 1_000_000);
  const maxMana = integer(value.maxMana, current.maxMana, 0, 1_000_000);
  const actionPoints = integer(value.actionPoints, current.actionPoints, 0, 5);
  const heroPoints = integer(value.heroPoints, current.heroPoints, 0, 1);
  return {
    clientId: current.clientId,
    characterName:
      text(value.characterName, current.characterName, 100) || current.characterName,
    currentHealth: integer(value.currentHealth, current.currentHealth, -1_000_000, maxHealth),
    maxHealth,
    temporaryHealth: integer(
      value.temporaryHealth,
      current.temporaryHealth,
      0,
      1_000_000,
    ),
    currentMana: integer(value.currentMana, current.currentMana, 0, maxMana),
    maxMana,
    defenseMelee: integer(value.defenseMelee, current.defenseMelee, -999, 999),
    defenseRanged: integer(value.defenseRanged, current.defenseRanged, -999, 999),
    reflex: integer(value.reflex, current.reflex, -999, 999),
    statuses: normalizeActiveStatuses(value.statuses),
    actionPoints,
    heroPoints,
    actionPointAvailable: actionPoints > 0,
    heroPointAvailable: heroPoints > 0,
    unarmedStrikeEnabled: bool(
      value.unarmedStrikeEnabled,
      current.unarmedStrikeEnabled,
    ),
    temporaryDefenseBonus: integer(
      value.temporaryDefenseBonus,
      current.temporaryDefenseBonus,
      -999,
      999,
    ),
    protectionExpiresAtRound: value.protectionExpiresAtRound === null
      ? null
      : integer(
        value.protectionExpiresAtRound,
        current.protectionExpiresAtRound ?? 0,
        0,
        999_999,
      ),
    criticalImpactId: value.criticalImpactId === null
      ? null
      : integer(value.criticalImpactId, current.criticalImpactId ?? 0, 0, 2_147_483_647),
    criticalThreatId: value.criticalThreatId === null
      ? null
      : integer(value.criticalThreatId, current.criticalThreatId ?? 0, 0, 2_147_483_647),
    stabilized: bool(value.stabilized, current.stabilized),
    dead: bool(value.dead, current.dead),
    revision: current.revision + 1,
  };
};

export const normalizeDebugNpc = (
  value: unknown,
  current: EncounterTurnParticipant,
): EncounterTurnParticipant | null => {
  if (!isRecord(value) || current.kind !== 'npc') return null;
  const initiativeModifier = integer(
    value.initiativeModifier,
    current.initiativeModifier,
    -999,
    999,
  );
  const initiativeRoll = integer(value.initiativeRoll, current.initiativeRoll, 0, 20);
  return {
    ...current,
    name: text(value.name, current.name, 100) || current.name,
    faction: value.faction === 'bosses' || value.faction === 'players'
      ? value.faction
      : current.faction,
    initiativeModifier,
    initiativeRoll,
    initiativeTotal: integer(
      value.initiativeTotal,
      initiativeRoll + initiativeModifier,
      -999,
      1_019,
    ),
    initiativeRolled: bool(value.initiativeRolled, current.initiativeRolled ?? false),
    eligibleRound: integer(value.eligibleRound, current.eligibleRound, 0, 999_999),
  };
};
