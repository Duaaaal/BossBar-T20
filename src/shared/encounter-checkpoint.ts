import { z } from 'zod';
import { MAX_CHARACTER_SHEET_BYTES, type CharacterSheetValidation } from './character-sheet.ts';
import { isDirectPlayerDamageRequest, type DirectPlayerDamageRequest, type EncounterRollResult, type EncounterTurnState, type PlayerEncounterState, type PlayerHudActionState, type PlayerHudState } from './player-combat.ts';
import { playerDeathThreshold } from './player-survival.ts';
import { effectivePlayerDefenses } from './player-defenses.ts';
import type { BossState } from './battle';
import { isAreaDamageRequest } from './player-combat.ts';
import { isAttackStatusEffect } from './boss-attacks.ts';

export type PendingPlayerDamageInternal = {
  id: string;
  profileId: string;
  playerId: string;
  targetBossId: string;
  targetBossName: string;
  attackName: string;
  damageFormula: string;
  critical: boolean;
  criticalMultiplier: number;
  nonlethal: boolean;
  actionId: string;
  correlationId?: string;
  resourceEffect?: EncounterRollResult['resourceEffect'];
  stateBefore: PlayerEncounterState;
  actionsBefore: PlayerHudActionState;
  retainedByParticipantId: string | null;
  createdAt: number;
};

export type PendingBossDamageSummary = {
  id: string; bossId: string; attackName: string;
  bossTargetIds: string[]; fallbackDamage: number; hits: number;
};

export type PendingDirectPlayerDamageInternal = {
  id: string;
  request: DirectPlayerDamageRequest;
  targets: Array<{
    playerId: string;
    playerName: string;
    hits: Array<{ hit: boolean; critical: boolean }>;
  }>;
  skippedPlayers: string[];
  missedPlayers: string[];
  createdAt: number;
};

/** Local-only data: never put this object in a public presentation snapshot. */
export type SavedPlayerEncounter = {
  sheetDocument?: { fileName: string; base64: string };
  profileId: string;
  clientId: string;
  playerId: string;
  name: string;
  state: PlayerEncounterState;
  privateMode: boolean;
  actions: PlayerHudActionState;
  validation: CharacterSheetValidation | null;
  usedActionIds: string[];
};

export type SavedSessionMember = Pick<SavedPlayerEncounter, 'profileId' | 'clientId' | 'playerId' | 'name'>;

export type MultiplayerEncounterCheckpoint = {
  pendingResistances?: import('./resistance').PendingResistance[];
  /** Includes authenticated spectators who have not uploaded a character yet. */
  members?: SavedSessionMember[];
  pendingPlayerDamages?: PendingPlayerDamageInternal[];
  pendingDirectPlayerDamages?: PendingDirectPlayerDamageInternal[];
  deferredInitiativeActors?: Array<[string, { blockedBy: string; eligibleRound: number }]>;
  lateInitiativeQueue?: string[];
  interruptedTurnParticipantId?: string | null;
  players: SavedPlayerEncounter[];
  turns: EncounterTurnState;
};

export type EncounterCheckpoint = {
  bossRuntime?: Array<Pick<BossState, 'id' | 'setupStatus' | 'identityPrepared' | 'actionPrepared' | 'applyDamageReduction' | 'actionVersion'>>;
  savedAt: number;
  battleStarted: boolean;
  hudVisible: boolean;
  musicPlaying: boolean;
  musicTime: number;
  backgroundTime: number;
  activeBackgroundPath: string | null;
  pendingBlackoutPhaseIndex: number | null;
  queuedPhaseIndexes: number[];
  resumeMusicAfterBlackout: boolean;
  multiplayer: MultiplayerEncounterCheckpoint;
};

const finite = z.number().finite();
const id = z.string().min(1).max(160);
const actions = z.object({ free: z.boolean(), movement: z.boolean(), standard: z.boolean() });
const playerState = z.object({
  clientId: id, characterName: z.string().max(200),
  currentHealth: finite, maxHealth: finite.positive(), temporaryHealth: finite.nonnegative(),
  currentMana: finite, maxMana: finite.nonnegative(),
  defenseMelee: finite, defenseRanged: finite, reflex: finite,
  statuses: z.array(z.object({ statusId: id, turnsRemaining: finite, damageFormula: z.string().nullable() }).passthrough()).max(100),
  actionPoints: finite.int().min(0).max(5), heroPoints: finite.int().min(0).max(1),
  actionPointAvailable: z.boolean(), heroPointAvailable: z.boolean(),
  unarmedStrikeEnabled: z.boolean(), temporaryDefenseBonus: finite,
  protectionExpiresAtRound: finite.nullable(), criticalImpactId: finite.nullable(),
  criticalThreatId: finite.nullable(), stabilized: z.boolean(), dead: z.boolean(),
  revision: finite,
}).passthrough();
const turns = z.object({
  round: finite.int().nonnegative(), startedAt: finite.nullable(),
  activeParticipantId: id.nullable(), started: z.boolean(), initiativeReady: z.boolean(),
  participants: z.array(z.object({
    id, sourceId: id, kind: z.enum(['player', 'boss', 'npc']), name: z.string(),
    initiativeModifier: finite, initiativeRoll: finite, initiativeTotal: finite,
    eligibleRound: finite, isSelf: z.boolean(),
  }).passthrough()).max(30),
  rollResults: z.array(z.object({ id, participantId: id, rolls: z.array(finite), total: finite }).passthrough()).max(10_000),
  history: z.array(z.object({ id }).passthrough()).max(100_000), revision: finite,
}).passthrough();
const checkpointSchema = z.object({
  bossRuntime: z.array(z.object({ id, setupStatus: z.enum(['initial', 'pending', 'ready']), identityPrepared: z.boolean(), actionPrepared: z.boolean(), applyDamageReduction: z.boolean(), actionVersion: finite.optional() })).max(3).optional(),
  savedAt: finite, battleStarted: z.boolean(), hudVisible: z.boolean(),
  musicPlaying: z.boolean(), musicTime: finite.nonnegative(), backgroundTime: finite.nonnegative().default(0),
  activeBackgroundPath: z.string().max(32_768).nullable(),
  pendingBlackoutPhaseIndex: finite.int().min(0).max(7).nullable(),
  queuedPhaseIndexes: z.array(finite.int().min(0).max(7)).max(8),
  resumeMusicAfterBlackout: z.boolean(),
  multiplayer: z.object({
    pendingResistances: z.array(z.object({
      id, profileId: id, playerId: id, label: z.string().max(200), skill: z.string().max(80), dc: finite.int().min(0).max(999),
      area: z.custom<import('./player-combat').AreaDamageRequest>((value) => isAreaDamageRequest(value)).optional(),
      effect: z.custom<import('./boss-attacks').AttackStatusEffect>(isAttackStatusEffect).optional(),
      attackerParticipantId: id.optional(), correlationId: id.optional(),
    })).max(200).optional(),
    members: z.array(z.object({ profileId: id, clientId: id, playerId: id, name: z.string().max(200) })).max(10).optional(),
    pendingPlayerDamages: z.array(z.object({
      id, profileId: id, playerId: id, targetBossId: id, targetBossName: z.string().max(200),
      attackName: z.string().max(200), damageFormula: z.string().max(200), critical: z.boolean(),
      criticalMultiplier: finite.int().min(1).max(10), nonlethal: z.boolean(), actionId: id,
      correlationId: id.optional(), resourceEffect: z.enum(['action-point', 'hero-point']).optional(),
      stateBefore: playerState, actionsBefore: actions, retainedByParticipantId: id.nullable(), createdAt: finite,
    })).max(30).optional(),
    pendingDirectPlayerDamages: z.array(z.object({
      id, request: z.custom<DirectPlayerDamageRequest>(isDirectPlayerDamageRequest),
      targets: z.array(z.object({ playerId: id, playerName: z.string().max(200), hits: z.array(z.object({ hit: z.boolean(), critical: z.boolean() })).max(1000) })).max(10),
      skippedPlayers: z.array(z.string()).max(10), missedPlayers: z.array(z.string()).max(10), createdAt: finite,
    })).max(30).optional(),
    deferredInitiativeActors: z.array(z.tuple([id, z.object({ blockedBy: id, eligibleRound: finite.int().nonnegative() })])).max(10).optional(),
    lateInitiativeQueue: z.array(id).max(10).optional(),
    interruptedTurnParticipantId: id.nullable().optional(),
    turns,
    players: z.array(z.object({
      profileId: id, clientId: id, playerId: id, name: z.string().max(200),
      sheetDocument: z.object({ fileName: z.string().max(255), base64: z.string().max(Math.ceil(MAX_CHARACTER_SHEET_BYTES / 3) * 4).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).optional(),
      state: playerState, privateMode: z.boolean(), actions,
      validation: z.object({ supported: z.boolean(), summary: z.object({}).passthrough().nullable(), issues: z.array(z.object({}).passthrough()) }).passthrough().nullable(),
      usedActionIds: z.array(id).max(10_000),
    })).max(10),
  }),
});

export const normalizeEncounterCheckpoint = (value: unknown): EncounterCheckpoint | null => {
  const result = checkpointSchema.safeParse(value);
  return result.success ? result.data as EncounterCheckpoint : null;
};

/** Keep elapsed encounter time, rather than counting the days between sessions. */
export const resumeEncounterTurns = (turns: EncounterTurnState, savedAt: number, now = Date.now()): EncounterTurnState => ({
  ...structuredClone(turns),
  startedAt: turns.startedAt === null ? null : now - Math.max(0, savedAt - turns.startedAt),
  revision: turns.revision + 1,
});

export const savedPlayerHud = (player: SavedPlayerEncounter): PlayerHudState => {
  const state = player.state;
  const defenses = effectivePlayerDefenses(state);
  return {
    ...state, id: player.playerId, faction: 'players', isSelf: false,
    privateMode: player.privateMode, redacted: false,
    defenseMelee: defenses.melee, defenseRanged: defenses.ranged,
    summary: player.validation?.summary ?? null, actions: player.actions,
    pendingDamage: null, deathThreshold: playerDeathThreshold(state.maxHealth),
  };
};
