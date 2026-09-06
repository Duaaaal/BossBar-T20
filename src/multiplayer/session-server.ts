import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat, writeFile, rm } from 'node:fs/promises';
import { networkInterfaces, tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  Server as SocketIOServer,
  type Socket as ServerSocket,
} from 'socket.io';
import { z } from 'zod';
import {
  BLANK_CHARACTER_SHEET_ASSET_PATH,
  MAX_CHARACTER_PORTRAIT_BYTES,
  MAX_CHARACTER_SHEET_BYTES,
  type CharacterSheetEditorField,
  type CharacterSheetEditorResult,
  type CharacterSheetInteractionState,
  type PlayerAuthenticationRequest,
  type PlayerSheetChangeDecisionResult,
  type PlayerSheetChangeRequest,
} from '../shared/character-sheet.ts';
import {
  BOSS_CRITICAL_THREAT_DURATION_MS,
  type BackgroundState,
  type EncounterEffectsState,
  type EncounterSoundEffect,
  type HealthEffect,
  type MusicDuckEvent,
  type SoundEffect,
  type SoundboardStop,
} from '../shared/battle.ts';
import {
  MAX_MULTIPLAYER_PLAYERS,
  MULTIPLAYER_PROTOCOL_VERSION,
  type LatencyProbeAcknowledgement,
  type MultiplayerClientToServerEvents,
  type MultiplayerConnectionErrorCode,
  type MultiplayerConnectionErrorData,
  type MultiplayerInterServerEvents,
  type MultiplayerJoinRequest,
  type MultiplayerPlayerAuth,
  type MultiplayerPresence,
  type MultiplayerServerToClientEvents,
  type MultiplayerSessionSnapshot,
  type MultiplayerSocketData,
  type PublicBattlePresentationState,
  type PublicCombatImpact,
  type PublicMusicPresentationState,
  type PublicScenePresentationState,
  type PublicSoundboardPresentationState,
  type SessionClosedNotice,
} from '../shared/multiplayer.ts';
import { resolveByteRange } from '../shared/media.ts';
import type { SceneTransitionEvent } from '../shared/scene.ts';
import type { MultiplayerEncounterCheckpoint, SavedPlayerEncounter, SavedSessionMember, PendingPlayerDamageInternal, PendingDirectPlayerDamageInternal } from '../shared/encounter-checkpoint.ts';
import { effectivePlayerDefenses } from '../shared/player-defenses.ts';
import { resolveD20Check } from '../shared/d20-rules.ts';
import {
  historyEntriesForRolls,
  historyEntryForVitalChange,
  type EncounterHistoryEntry,
} from '../shared/encounter-history.ts';
import {
  normalizeDebugNpc,
  normalizeDebugPlayer,
  type EncounterDebugCreature,
  type EncounterDebugOverrideRequest,
} from '../shared/encounter-debugger.ts';
import {
  advanceEncounterTurns,
  beginEncounterTurns,
  criticalDamageExpression,
  emptyEncounterTurnState,
  getEncounterRollNatural,
  isAreaDamageRequest,
  isCriticalAttack,
  isDirectPlayerDamageRequest,
  linkEncounterRollCorrelation,
  personalizeEncounterTurnState,
  prepareManualInitiative,
  resolveAreaDamage,
  resolveAttackCheck,
  resolveExtremeAdvantage,
  normalizeActionPointCount,
  normalizeHeroPointCount,
  attackTestFormulaExpression,
  parseAttackTestFormula,
  parseCriticalProfile,
  rollAttackTestExtraDice,
  rollCriticalDamageFormulaDetailed,
  createUnarmedAttack,
  splitDamageIntoHits,
  rollManualInitiative,
  actionPointRecoveryFormulas,
  isPlayerCombatActionRequest,
  type AreaDamageRequest,
  type AreaDamageResult,
  type DirectPlayerDamageRequest,
  type EncounterTurnActionResult,
  type EncounterTurnParticipant,
  type EncounterTurnState,
  type EncounterRollResult,
  type InitiativeActor,
  type PlayerActionKind,
  type PlayerEncounterState,
  type PlayerHudActionState,
  type PlayerHudState,
  type PendingActionPointRequest,
  type PlayerCombatActionRequest,
  type PlayerCombatActionResult,
  type PlayerResourceNotice,
  type PlayerStatusRequest,
  type PlayerTargetActionResult,
} from '../shared/player-combat.ts';
import {
  normalizeActiveStatuses,
  parseDamageFormula,
  rollDamageFormulaDetailed,
} from '../shared/status.ts';
import {
  applyStatusRules,
} from '../shared/status-rules.ts';
import {
  applyPlayerDamage,
  applyPlayerHealing,
  BLEEDING_CONSTITUTION_DC,
  FIRST_AID_CURE_DC,
  isPlayerIncapacitated,
  playerDeathThreshold,
  stabilizePlayer,
} from '../shared/player-survival.ts';
import {
  applyCharacterSheetEditorFields,
  inspectCharacterSheetPdf,
  readCharacterSheetEditorFields,
  validateCharacterSheetEditorUpdates,
} from './character-sheet-pdf.ts';
import { PlayerProfileStore } from './player-profile-store.ts';
import { SessionRoster, normalizePlayerName } from './session-roster.ts';
import {
  createSessionCredentials,
  SessionConnectionRateLimiter,
  tokensMatch,
  type SessionCredentials,
} from './session-security.ts';

export const DEFAULT_MULTIPLAYER_PORT = 43_120;
const DEFAULT_PROBE_INTERVAL_MS = 5_000;

const DEFAULT_PROBE_TIMEOUT_MS = 4_000;

type MultiplayerSocketServer = SocketIOServer<
  MultiplayerClientToServerEvents,
  MultiplayerServerToClientEvents,
  MultiplayerInterServerEvents,
  MultiplayerSocketData
>;

type MultiplayerPlayerSocket = ServerSocket<
  MultiplayerClientToServerEvents,
  MultiplayerServerToClientEvents,
  MultiplayerInterServerEvents,
  MultiplayerSocketData
>;

export type MultiplayerNetworkMode = 'loopback' | 'lan';

export type MultiplayerSessionServerOptions = {
  initialSnapshot:
    | MultiplayerSessionSnapshot
    | ((context: MultiplayerSnapshotContext) => MultiplayerSessionSnapshot);
  networkMode?: MultiplayerNetworkMode;
  port?: number;
  maxPlayers?: number;
  webRoot?: string;
  webIndexFile?: string;
  assetRoot?: string;
  resolveMedia?: SessionMediaResolver;
  preloadMediaUrls?: (context: MultiplayerSnapshotContext) => string[];
  publicBaseUrl?: string;
  allowedOrigins?: readonly string[];
  latencyProbeIntervalMs?: number;
  latencyProbeTimeoutMs?: number;
  /** Test seam; production keeps a one-second pause between attack and damage. */
  combatRollDelayMs?: number;
  /** Test seam; natural and enemy-critical rolls pause for three seconds. */
  dramaticCombatRollDelayMs?: number;
  /** Player natural 20s pause for two seconds before a following damage roll. */
  playerNaturalCombatRollDelayMs?: number;
  /** Test seam; production uses node:crypto.randomInt. */
  randomInteger?: (
    minimumInclusive: number,
    maximumExclusive: number,
  ) => number;
  logger?: boolean;
  onPresenceChanged?: (presence: MultiplayerPresence) => void;
  onJoinRequestsChanged?: (requests: MultiplayerJoinRequest[]) => void;
  onActionPointRequestsChanged?: (
    requests: PendingActionPointRequest[],
  ) => void;
  onSheetChangeRequestsChanged?: (
    requests: PlayerSheetChangeRequest[],
  ) => void;
  onPlayerHudsChanged?: (huds: PlayerHudState[]) => void;
  onTurnStateChanged?: (state: EncounterTurnState) => void;
  onCutsceneReady?: (playerId: string, id: string, duration: number | null) => void;
  onTurnStarted?: (participant: EncounterTurnParticipant) => void;
  onDiceRolled?: (result: EncounterRollResult) => void;
  onBossCriticalThreat?: (context: { targetPlayerIds: string[] }) => void;
  onPlayerDamaged?: (context: {
    critical: boolean;
    targetPlayerIds: string[];
  }) => void;
  getBossDefense?: (
    bossId: string,
    attackType: 'melee' | 'ranged',
  ) => number | null;
  applyBossDamage?: (
    bossId: string,
    damage: number,
    context?: {
      critical?: boolean;
      actionId?: string;
      sourceParticipantId?: string;
      nonlethal?: boolean;
    },
  ) => { ok: boolean; appliedDamage: number; error?: string };
  playerProfileStore: PlayerProfileStore;
};

export type MultiplayerSnapshotContext = {
  roomCode: string;
  mediaUrl: (id: string) => string;
};

export type SessionMediaRequest = {
  id: string;
};

export type SessionMediaResource = {
  filePath: string;
  contentType: string;
};

export type SessionMediaResolver = (
  request: SessionMediaRequest,
) => SessionMediaResource | null | Promise<SessionMediaResource | null>;

export type MultiplayerSessionInvite = {
  roomCode: string;
  localUrl: string;
  lanUrls: string[];
  publicUrl: string | null;
};

export type MultiplayerSessionServerInfo = {
  address: string;
  port: number;
  networkMode: MultiplayerNetworkMode;
  maxPlayers: number;
  invite: MultiplayerSessionInvite;
};

type PendingProbe = {
  id: string;
  timeout: ReturnType<typeof setTimeout>;
};

type PendingJoinRequest = {
  request: MultiplayerJoinRequest;
  socketId: string;
  clientId: string;
};

type PendingActionPointRequestInternal = {
  request: PendingActionPointRequest;
  socketId: string;
  clientId: string;
  profileId: string;
  combatAction: PlayerCombatActionRequest;
  approvesActionPoint: boolean;
  approvesMissingStandardAction: boolean;
};

type PendingSheetChangeRequestInternal = {
  request: PlayerSheetChangeRequest;
  profileId: string;
  clientId: string;
  bytes: Uint8Array;
  validation: Awaited<ReturnType<typeof inspectCharacterSheetPdf>>['validation'];
  fields: CharacterSheetEditorField[];
};


type SnapshotReference = {
  current: MultiplayerSessionSnapshot;
};

type AccountSession = {
  profileId: string;
  username: string;
  clientId: string;
  expiresAt: number;
};

const ACCOUNT_SESSION_DURATION_MS = 12 * 60 * 60 * 1_000;
const SHEET_VIEW_TICKET_DURATION_MS = 10 * 60 * 1_000;

const publicSnapshotMediaUrls = (snapshot: MultiplayerSessionSnapshot) =>
  [...new Set([
    snapshot.background.url,
    ...snapshot.music.tracks.map(({ url }) => url),
    ...snapshot.encounterSoundUrls,
  ].filter((url): url is string => Boolean(url)))];

type AuthenticationResult =
  | { ok: true; auth: MultiplayerPlayerAuth }
  | {
    ok: false;
    code: MultiplayerConnectionErrorCode;
    message: string;
  };

const playerAuthSchema = z.object({
  roomCode: z.string().min(1).max(32),
  playerToken: z.string().min(32).max(128),
  playerName: z.string().min(1).max(80),
  accountToken: z.string().min(32).max(128),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  protocolVersion: z.number().int(),
  hostToken: z.string().min(32).max(128).optional(),
}).strict();

const accountStatusSchema = z.object({
  username: z.string().min(1).max(80),
}).strict();

const accountAuthenticationSchema = z.object({
  username: z.string().min(1).max(80),
  password: z.string().min(3).max(128),
  createAccount: z.boolean(),
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
}).strict() satisfies z.ZodType<PlayerAuthenticationRequest>;

const notesSchema = z.object({
  content: z.string().max(100_000),
}).strict();

const sheetEditorFieldSchema = z.object({
  name: z.string().min(1).max(180),
  label: z.string().min(1).max(120),
  section: z.string().min(1).max(80),
  group: z.string().min(1).max(80).optional(),
  kind: z.enum(['text', 'checkbox', 'choice']),
  value: z.string().max(2_000),
  options: z.array(z.string().max(500)).max(100).optional(),
  validation: z.object({
    kind: z.enum(['integer', 'decimal', 'formula', 'text']),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    maxLength: z.number().int().min(1).max(2_000).optional(),
  }).strict().optional(),
}).strict();

const sheetEditorUpdateSchema = z.object({
  fields: z.array(sheetEditorFieldSchema).max(1_500),
}).strict();

const mediaIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

const isAllowedMediaContentType = (contentType: string) =>
  /^(?:audio|image|video)\/[A-Za-z0-9.+-]+$/.test(contentType);

export const buildSessionMediaUrl = (id: string, playerToken: string) => {
  const parsedId = mediaIdSchema.safeParse(id);
  if (!parsedId.success) throw new Error('O identificador da mídia é inválido.');
  const parameters = new URLSearchParams({ access: playerToken });
  return `/session-media/${encodeURIComponent(parsedId.data)}?${parameters}`;
};

const originIsAllowed = (
  origin: string | undefined,
  requestHost: string | undefined,
  allowedOrigins: ReadonlySet<string>,
) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (!requestHost) return false;
  try {
    const parsed = new URL(origin);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && parsed.host === requestHost;
  } catch {
    return false;
  }
};

const socketError = (
  code: MultiplayerConnectionErrorCode,
  message: string,
) => {
  const error = new Error(message) as Error & {
    data: MultiplayerConnectionErrorData;
  };
  error.data = { code };
  return error;
};

const authenticatePlayer = (
  input: unknown,
  credentials: SessionCredentials,
): AuthenticationResult => {
  const parsed = playerAuthSchema.safeParse(input);
  if (!parsed.success) {
    const candidate = input && typeof input === 'object'
      ? input as Record<string, unknown>
      : {};
    if (
      typeof candidate.playerName !== 'string'
      || normalizePlayerName(candidate.playerName).length === 0
    ) {
      return {
        ok: false,
        code: 'INVALID_NAME',
        message: 'Informe um nome válido para entrar na sessão.',
      };
    }
    if (
      typeof candidate.clientId !== 'string'
      || !/^[A-Za-z0-9_-]{8,128}$/.test(candidate.clientId)
    ) {
      return {
        ok: false,
        code: 'INVALID_CLIENT_ID',
        message: 'A identificação deste navegador é inválida.',
      };
    }
    return {
      ok: false,
      code: 'INVALID_AUTH',
      message: 'Os dados de entrada da sessão são inválidos.',
    };
  }

  const auth = {
    ...parsed.data,
    roomCode: parsed.data.roomCode.trim().toUpperCase(),
    playerName: normalizePlayerName(parsed.data.playerName),
  };
  if (!auth.playerName) {
    return {
      ok: false,
      code: 'INVALID_NAME',
      message: 'Informe um nome válido para entrar na sessão.',
    };
  }
  if (auth.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
    return {
      ok: false,
      code: 'PROTOCOL_MISMATCH',
      message: 'A versão da apresentação não é compatível com o mestre.',
    };
  }
  if (auth.roomCode !== credentials.roomCode) {
    return {
      ok: false,
      code: 'ROOM_NOT_FOUND',
      message: 'A sala informada não está disponível.',
    };
  }
  if (!tokensMatch(auth.playerToken, credentials.playerToken)) {
    return {
      ok: false,
      code: 'INVALID_TOKEN',
      message: 'O convite desta sessão é inválido ou expirou.',
    };
  }
  return { ok: true, auth };
};

const buildJoinUrl = (
  baseUrl: string,
  credentials: SessionCredentials,
  includeHostToken = false,
) => {
  const url = new URL(baseUrl);
  url.searchParams.set('room', credentials.roomCode);
  const fragment = new URLSearchParams({ token: credentials.playerToken });
  if (includeHostToken) fragment.set('host', credentials.hostToken);
  url.hash = fragment.toString();
  return url.toString();
};

const localIpv4Addresses = () => [...new Set(
  Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter(({ family, internal }) => family === 'IPv4' && !internal)
    .map(({ address }) => address),
)];

export const normalizePublicBaseUrl = (value: string) => {
  const candidate = value.trim();
  if (!candidate) throw new Error('Informe um endereço público.');
  const url = new URL(
    /^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(candidate)
      ? candidate
      : `https://${candidate}`,
  );
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Use um endereço HTTP ou HTTPS válido.');
  }
  if (url.username || url.password) {
    throw new Error('O endereço público não pode conter usuário ou senha.');
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Informe apenas o domínio ou IP, sem caminhos ou parâmetros.');
  }
  url.search = '';
  url.hash = '';
  url.pathname = '/';
  return url.toString();
};

export class MultiplayerSessionServer {
  readonly credentials: SessionCredentials;

  readonly info: MultiplayerSessionServerInfo;

  private currentSnapshot: MultiplayerSessionSnapshot;

  private readonly fastify: FastifyInstance;

  private readonly io: MultiplayerSocketServer;

  private readonly roster: SessionRoster;

  private readonly pendingProbes = new Map<string, PendingProbe>();

  private readonly pendingJoinRequests = new Map<string, PendingJoinRequest>();

  private readonly pendingActionPointRequests = new Map<
    string,
    PendingActionPointRequestInternal
  >();

  private readonly pendingSheetChangeRequests = new Map<
    string,
    PendingSheetChangeRequestInternal
  >();

  /** Tracks the socket that currently owns each unsaved sheet-editing session. */
  private readonly activeSheetEditors = new Map<string, string>();

  /** Late entrants become eligible to roll only after the current actor ends. */
  private readonly deferredInitiativeActors = new Map<
    string,
    { blockedBy: string; eligibleRound: number }
  >();

  private lateInitiativeQueue: string[] = [];

  private interruptedTurnParticipantId: string | null = null;

  private readonly probeInterval: ReturnType<typeof setInterval>;

  private readonly options: MultiplayerSessionServerOptions;

  private readonly snapshotReference: SnapshotReference;

  private readonly allowedOrigins: Set<string>;

  private readonly accountSessions: Map<string, AccountSession>;

  private readonly playerCombatStates = new Map<string, PlayerEncounterState>();
  private readonly savedEncounterPlayers = new Map<string, SavedPlayerEncounter>();
  private readonly savedSessionMembers = new Map<string, SavedSessionMember>();
  private readonly awaitingSavedPlayers = new Set<string>();
  private readonly seenEncounterPlayers = new Set<string>();
  private readonly kickedProfiles = new Set<string>();
  private deferredDisconnectedTurn: string | null = null;
  private encounterGeneration = 0;
  private readonly sheetPreviewFiles = new Set<string>();

  captureEncounter(): MultiplayerEncounterCheckpoint {
    const members = new Map(this.savedSessionMembers);
    const players = new Map(this.savedEncounterPlayers);
    for (const [id, saved] of players) {
      players.set(id, { ...saved, state: this.playerCombatStates.get(saved.clientId) ?? saved.state });
    }
    for (const { clientId, profileId, player } of this.roster.members()) {
      if (!profileId) continue;
      members.set(profileId, { profileId, clientId, playerId: player.id, name: player.name });
      const state = this.playerCombatStates.get(clientId);
      if (!state) continue;
      players.set(profileId, {
        ...(players.get(profileId)?.sheetDocument ? { sheetDocument: players.get(profileId)!.sheetDocument } : {}),
        profileId, clientId, playerId: player.id, name: player.name,
        state: { ...state, sheetInteractionState: 'idle' },
        privateMode: this.playerPrivacy.get(profileId) ?? true,
        actions: this.playerActions.get(profileId) ?? { free: true, movement: true, standard: true },
        validation: this.profileForEncounter(profileId)?.sheet.validation ?? null,
        usedActionIds: [...(this.actionPointActionIds.get(profileId) ?? [])],
      });
    }
    return structuredClone({ members: [...members.values()], players: [...players.values()], turns: this.encounterTurnState,
      pendingPlayerDamages: [...this.pendingPlayerDamages.values()],
      pendingDirectPlayerDamages: [...this.pendingDirectPlayerDamages.values()],
      deferredInitiativeActors: [...this.deferredInitiativeActors.entries()],
      lateInitiativeQueue: this.lateInitiativeQueue, interruptedTurnParticipantId: this.interruptedTurnParticipantId,
    });
  }

  forgetSavedParticipants() {
    this.savedSessionMembers.clear();
    this.savedEncounterPlayers.clear(); this.awaitingSavedPlayers.clear();
    this.seenEncounterPlayers.clear(); this.kickedProfiles.clear();
    this.deferredDisconnectedTurn = null;
    this.syncTurnParticipants(); this.publishPlayerHuds(); this.publishTurnState(); this.notifyPresenceChanged();
  }

  restoreEncounter(checkpoint: MultiplayerEncounterCheckpoint) {
    this.encounterGeneration += 1;
    this.savedEncounterPlayers.clear();
    this.savedSessionMembers.clear();
    this.awaitingSavedPlayers.clear();
    this.seenEncounterPlayers.clear();
    this.kickedProfiles.clear();
    this.deferredDisconnectedTurn = null;
    this.playerCombatStates.clear();
    this.playerActions.clear();
    this.playerPrivacy.clear();
    this.actionPointActionIds.clear();
    this.pendingPlayerDamages.clear();
    this.pendingDirectPlayerDamages.clear();
    this.pendingActionPointRequests.clear();
    this.pendingSheetChangeRequests.clear();
    this.activeSheetEditors.clear();
    this.deferredInitiativeActors.clear();
    this.lateInitiativeQueue = [];
    this.interruptedTurnParticipantId = null;
    for (const pending of structuredClone(checkpoint.pendingPlayerDamages ?? [])) this.pendingPlayerDamages.set(pending.id, pending);
    for (const pending of structuredClone(checkpoint.pendingDirectPlayerDamages ?? [])) this.pendingDirectPlayerDamages.set(pending.id, pending);
    for (const [id, actor] of checkpoint.deferredInitiativeActors ?? []) this.deferredInitiativeActors.set(id, { ...actor });
    this.lateInitiativeQueue = [...(checkpoint.lateInitiativeQueue ?? [])];
    this.interruptedTurnParticipantId = checkpoint.interruptedTurnParticipantId ?? null;
    this.encounterTurnState = structuredClone(checkpoint.turns);
    this.encounterRollSequence = Math.max(0, ...checkpoint.turns.rollResults.map((roll) => roll.sequence ?? 0));
    for (const { profileId, clientId, playerId, name } of checkpoint.members ?? checkpoint.players) {
      const connected = this.roster.members().find((member) => member.profileId === profileId);
      this.savedSessionMembers.set(profileId, { profileId, clientId: connected?.clientId ?? clientId, playerId: connected?.player.id ?? playerId, name });
      if (connected) this.seenEncounterPlayers.add(profileId);
      else this.awaitingSavedPlayers.add(profileId);
    }
    for (const saved of structuredClone(checkpoint.players)) {
      const connected = this.roster.members().find(({ profileId }) => profileId === saved.profileId);
      const oldPlayerId = saved.playerId;
      if (connected) {
        this.seenEncounterPlayers.add(saved.profileId);
        saved.clientId = connected.clientId;
        saved.playerId = connected.player.id;
        this.remapEncounterParticipant(oldPlayerId, saved.playerId);
      } else this.awaitingSavedPlayers.add(saved.profileId);
      saved.state = { ...saved.state, clientId: saved.clientId, sheetInteractionState: 'idle', revision: saved.state.revision + 1 };
      this.savedEncounterPlayers.set(saved.profileId, saved);
      this.playerCombatStates.set(saved.clientId, saved.state);
      this.playerActions.set(saved.profileId, saved.actions);
      this.playerPrivacy.set(saved.profileId, saved.privateMode);
      this.unarmedStrikeEnabled.set(saved.profileId, saved.state.unarmedStrikeEnabled);
      this.actionPointActionIds.set(saved.profileId, new Set(saved.usedActionIds));
    }
    for (const socket of this.io.sockets.sockets.values()) {
      const state = this.playerCombatStates.get(socket.data.clientId);
      if (state && socket.data.playerId) socket.emit('player:state', state);
    }
    this.publishPlayerHuds();
    this.publishTurnState();
    this.notifyPresenceChanged();
    this.notifyActionPointRequestsChanged();
    this.options.onSheetChangeRequestsChanged?.(this.getPendingSheetChangeRequests());
  }

  async includeCharacterSheets(checkpoint: MultiplayerEncounterCheckpoint) {
    const snapshot = structuredClone(checkpoint);
    await Promise.all(snapshot.players.map(async (player) => {
      if (player.sheetDocument) return;
      const sheet = await this.options.playerProfileStore.readSheet(player.profileId).catch(() => null);
      if (sheet) player.sheetDocument = { fileName: sheet.fileName, base64: sheet.bytes.toString('base64') };
    }));
    return snapshot;
  }

  async readEncounterSheet(profileId: string) {
    const saved = this.savedEncounterPlayers.get(profileId);
    if (saved?.sheetDocument && saved.validation) return {
      bytes: Buffer.from(saved.sheetDocument.base64, 'base64'), fileName: saved.sheetDocument.fileName, validation: saved.validation, filePath: null,
    };
    return this.options.playerProfileStore.readSheet(profileId);
  }

  private remapEncounterParticipant(previousId: string, nextId: string) {
    if (previousId === nextId) return;
    const previous = `player:${previousId}`;
    const next = `player:${nextId}`;
    const remap = (id: string | null | undefined) => id === previous ? next : id;
    for (const pending of this.pendingPlayerDamages.values()) {
      if (pending.playerId === previousId) pending.playerId = nextId;
      pending.retainedByParticipantId = remap(pending.retainedByParticipantId) ?? null;
    }
    for (const pending of this.pendingDirectPlayerDamages.values()) {
      pending.request.playerIds = pending.request.playerIds.map((id) => id === previousId ? nextId : id);
      for (const target of pending.targets) if (target.playerId === previousId) target.playerId = nextId;
    }
    const deferred = this.deferredInitiativeActors.get(previous);
    if (deferred) { this.deferredInitiativeActors.delete(previous); this.deferredInitiativeActors.set(next, deferred); }
    for (const actor of this.deferredInitiativeActors.values()) actor.blockedBy = remap(actor.blockedBy) as string;
    this.lateInitiativeQueue = this.lateInitiativeQueue.map((id) => remap(id) as string);
    this.interruptedTurnParticipantId = remap(this.interruptedTurnParticipantId) ?? null;
    this.encounterTurnState = {
      ...this.encounterTurnState,
      activeParticipantId: remap(this.encounterTurnState.activeParticipantId) ?? null,
      participants: this.encounterTurnState.participants.map((participant) => participant.id === previous
        ? { ...participant, id: next, sourceId: nextId } : participant),
      rollResults: this.encounterTurnState.rollResults.map((roll) => ({
        ...roll, participantId: remap(roll.participantId) as string,
        targetParticipantId: remap(roll.targetParticipantId) ?? undefined,
        retainedByParticipantId: remap(roll.retainedByParticipantId) ?? null,
      })),
      history: this.encounterTurnState.history.map((entry) => ({ ...entry,
        actorParticipantId: remap(entry.actorParticipantId) ?? null,
        targetParticipantId: remap(entry.targetParticipantId) ?? null,
        turnParticipantId: remap(entry.turnParticipantId) ?? null,
      })),
    };
  }

  private profileForEncounter(profileId: string) {
    const profile = this.options.playerProfileStore.profileById(profileId);
    const validation = this.savedEncounterPlayers.get(profileId)?.validation;
    const document = this.savedEncounterPlayers.get(profileId)?.sheetDocument;
    return profile && validation ? { ...profile, sheet: { ...profile.sheet, validation, ...(document ? { hasSheet: true, fileName: document.fileName } : {}) } } : profile;
  }

  private encounterMembers() {
    const members = this.roster.members();
    const connectedProfiles = new Set(members.map(({ profileId }) => profileId));
    for (const saved of this.savedSessionMembers.values()) {
      if (connectedProfiles.has(saved.profileId)) continue;
      members.push({ clientId: saved.clientId, profileId: saved.profileId, player: {
        id: saved.playerId, name: saved.name, isHost: false, connectedAt: 0, lastSeenAt: 0,
        latencyMs: null, connectionQuality: 'unknown', hasConnectionIssue: true, hasCharacterSheet: this.savedEncounterPlayers.has(saved.profileId),
      } });
    }
    return members;
  }

  // Encounter targets survive a dropped socket. Transport is optional; identity
  // and combat state, not the current connection, determine target eligibility.
  private encounterTargets() {
    return this.encounterMembers().filter(({ profileId }) => Boolean(profileId)).map(({ clientId, profileId, player }) => ({
      data: { clientId, profileId: profileId!, playerId: player.id, playerName: player.name },
      emit: (event: 'player:combat-impact', impact: import('../shared/player-combat').PlayerAreaDamageImpact) => {
        for (const socket of this.io.sockets.sockets.values()) {
          if (socket.data.clientId === clientId) socket.emit(event, impact);
        }
      },
    }));
  }

  private readonly playerPrivacy = new Map<string, boolean>();

  private readonly playerActions = new Map<string, PlayerHudActionState>();

  private readonly unarmedStrikeEnabled = new Map<string, boolean>();

  private readonly actionPointActionIds = new Map<string, Set<string>>();

  private readonly pendingPlayerDamages = new Map<string, PendingPlayerDamageInternal>();

  private readonly pendingDirectPlayerDamages = new Map<
    string,
    PendingDirectPlayerDamageInternal
  >();

  private encounterTurnState = emptyEncounterTurnState();

  private playerImpactSequence = 0;

  private encounterRollSequence = 0;

  private publicOrigin: string | null;

  private closing = false;

  private constructor(
    fastify: FastifyInstance,
    io: MultiplayerSocketServer,
    roster: SessionRoster,
    credentials: SessionCredentials,
    info: MultiplayerSessionServerInfo,
    initialSnapshot: MultiplayerSessionSnapshot,
    snapshotReference: SnapshotReference,
    options: MultiplayerSessionServerOptions,
    allowedOrigins: Set<string>,
    publicOrigin: string | null,
    accountSessions: Map<string, AccountSession>,
  ) {
    this.fastify = fastify;
    this.io = io;
    this.roster = roster;
    this.credentials = credentials;
    this.info = info;
    this.options = options;
    this.snapshotReference = snapshotReference;
    this.allowedOrigins = allowedOrigins;
    this.publicOrigin = publicOrigin;
    this.accountSessions = accountSessions;
    this.currentSnapshot = initialSnapshot;
    const intervalMs = Math.max(
      250,
      options.latencyProbeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS,
    );
    this.probeInterval = setInterval(() => this.probeLatencies(), intervalMs);
    this.probeInterval.unref?.();
  }

  static async start(
    options: MultiplayerSessionServerOptions,
  ): Promise<MultiplayerSessionServer> {
    const credentials = createSessionCredentials();
    const initialSnapshot = typeof options.initialSnapshot === 'function'
      ? options.initialSnapshot({
        roomCode: credentials.roomCode,
        mediaUrl: (id) => buildSessionMediaUrl(id, credentials.playerToken),
      })
      : options.initialSnapshot;
    const snapshotReference: SnapshotReference = { current: initialSnapshot };
    const accountSessions = new Map<string, AccountSession>();
    const sheetViewTickets = new Map<string, { profileId: string; expiresAt: number }>();
    let serverReference: MultiplayerSessionServer | null = null;
    if (initialSnapshot.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
      throw new Error('O snapshot inicial usa uma versão de protocolo inválida.');
    }

    const networkMode = options.networkMode ?? 'loopback';
    const normalizedPublicBaseUrl = options.publicBaseUrl
      ? normalizePublicBaseUrl(options.publicBaseUrl)
      : null;
    const host = networkMode === 'lan' ? '0.0.0.0' : '127.0.0.1';
    const roster = new SessionRoster(
      credentials.roomCode,
      options.maxPlayers ?? MAX_MULTIPLAYER_PLAYERS,
    );
    const app = Fastify({
      logger: options.logger ?? false,
      trustProxy: false,
      bodyLimit: 64 * 1024,
      // Once the room is closed, abandoned uploads/media requests must not
      // keep its HTTP listener alive indefinitely.
      forceCloseConnections: true,
    });

    app.addContentTypeParser(
      'application/pdf',
      { parseAs: 'buffer', bodyLimit: MAX_CHARACTER_SHEET_BYTES },
      (_request, body, done) => done(null, body),
    );
    app.addContentTypeParser(
      ['image/png', 'image/jpeg', 'image/webp'],
      { parseAs: 'buffer', bodyLimit: MAX_CHARACTER_PORTRAIT_BYTES },
      (_request, body, done) => done(null, body),
    );

    await app.register(helmet, {
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'none'"],
          connectSrc: ["'self'", 'blob:', 'ws:', 'wss:'],
          fontSrc: ["'self'", 'data:'],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'blob:', 'data:'],
          mediaSrc: ["'self'", 'blob:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
        },
      },
    });
    await app.register(rateLimit, { global: false });

    const bearerToken = (authorization: string | undefined) =>
      authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    const inviteIsValid = (headers: {
      authorization?: string;
      'x-bossbar-room'?: string | string[];
    }) => {
      const room = headers['x-bossbar-room'];
      return typeof room === 'string' &&
        room.trim().toUpperCase() === credentials.roomCode &&
        tokensMatch(bearerToken(headers.authorization), credentials.playerToken);
    };
    const authenticatedAccount = (headers: {
      authorization?: string;
      'x-bossbar-room'?: string | string[];
    }) => {
      const room = headers['x-bossbar-room'];
      const token = bearerToken(headers.authorization);
      const session = accountSessions.get(token);
      if (
        typeof room !== 'string' ||
        room.trim().toUpperCase() !== credentials.roomCode ||
        !session ||
        session.expiresAt <= Date.now()
      ) {
        if (session) accountSessions.delete(token);
        return null;
      }
      return { token, session };
    };

    app.get('/api/health', {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return {
        ok: true,
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      };
    });
    app.get('/api/session', {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const presence = roster.presence();
      return {
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        roomCode: credentials.roomCode,
        connectedPlayers: presence.connectedPlayers,
        maxPlayers: presence.maxPlayers,
      };
    });
    app.post('/api/player/account-status', {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!inviteIsValid(request.headers)) {
        return reply.code(403).send({ error: 'Convite inválido.' });
      }
      const parsed = accountStatusSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Usuário inválido.' });
      try {
        return options.playerProfileStore.accountStatus(parsed.data.username);
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : 'Usuário inválido.',
        });
      }
    });
    app.post('/api/player/authenticate', {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!inviteIsValid(request.headers)) {
        return reply.code(403).send({ ok: false, error: 'Convite inválido.' });
      }
      const parsed = accountAuthenticationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: 'Informe um usuário e uma senha válidos.' });
      }
      try {
        const profile = parsed.data.createAccount
          ? await options.playerProfileStore.register(parsed.data.username, parsed.data.password)
          : await options.playerProfileStore.authenticate(parsed.data.username, parsed.data.password);
        const sessionToken = randomBytes(32).toString('base64url');
        accountSessions.set(sessionToken, {
          profileId: profile.id,
          username: profile.username,
          clientId: parsed.data.clientId,
          expiresAt: Date.now() + ACCOUNT_SESSION_DURATION_MS,
        });
        return {
          ok: true,
          username: profile.username,
          sessionToken,
          sheet: profile.sheet,
          portrait: profile.portrait,
          notes: profile.notes,
        };
      } catch (error) {
        return reply.code(401).send({
          ok: false,
          error: error instanceof Error ? error.message : 'Não foi possível entrar.',
        });
      }
    });
    app.get('/api/player/profile', {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ error: 'Entre novamente para continuar.' });
      const profile = options.playerProfileStore.profileById(account.session.profileId);
      if (!profile) return reply.code(404).send({ error: 'Perfil não encontrado.' });
      return {
        username: profile.username,
        sheet: profile.sheet,
        portrait: profile.portrait,
        notes: profile.notes,
      };
    });
    app.route({
      method: ['GET', 'HEAD'],
      url: '/api/player/portrait/:profileId',
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      handler: async (request, reply) => {
        const query = request.query as { access?: unknown };
        if (typeof query.access !== 'string' || !tokensMatch(query.access, credentials.playerToken)) {
          return reply.code(403).type('text/plain').send('Convite inválido.');
        }
        const { profileId } = request.params as { profileId: string };
        const portrait = await options.playerProfileStore.readPortrait(profileId);
        if (!portrait) return reply.code(404).type('text/plain').send('Retrato não encontrado.');
        reply
          .header('Cache-Control', 'private, max-age=3600, immutable')
          .header('Content-Type', portrait.contentType)
          .header('Content-Length', portrait.bytes.byteLength)
          .header('X-Content-Type-Options', 'nosniff');
        return request.method === 'HEAD' ? reply.send() : reply.send(portrait.bytes);
      },
    });
    app.post('/api/player/portrait', {
      bodyLimit: MAX_CHARACTER_PORTRAIT_BYTES,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      const bytes = request.body;
      const contentType = request.headers['content-type'];
      const normalizedType = contentType === 'image/png' || contentType === 'image/jpeg' || contentType === 'image/webp'
        ? contentType
        : null;
      const validSignature = Buffer.isBuffer(bytes) && normalizedType && (
        (normalizedType === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (normalizedType === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) ||
        (normalizedType === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
      );
      if (!Buffer.isBuffer(bytes) || !validSignature || !normalizedType) {
        return reply.code(400).send({ ok: false, error: 'Selecione uma imagem PNG, JPEG ou WebP válida.' });
      }
      const encodedFileName = request.headers['x-bossbar-filename'];
      let fileName = 'retrato';
      if (typeof encodedFileName === 'string') {
        try {
          fileName = decodeURIComponent(encodedFileName);
        } catch {
          return reply.code(400).send({ ok: false, error: 'O nome do arquivo é inválido.' });
        }
      }
      const profile = await options.playerProfileStore.savePortrait(
        account.session.profileId,
        fileName,
        bytes,
        normalizedType,
      );
      serverReference?.refreshPlayerPortrait();
      return { ok: true, portrait: profile.portrait };
    });
    app.delete('/api/player/portrait', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      const profile = await options.playerProfileStore.removePortrait(account.session.profileId);
      serverReference?.refreshPlayerPortrait();
      return { ok: true, portrait: profile.portrait };
    });
    app.put('/api/player/notes', {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      const parsed = notesSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'O texto das notas é inválido.' });
      try {
        const profile = await options.playerProfileStore.saveNotes(
          account.session.profileId,
          parsed.data.content,
        );
        return { ok: true, content: profile.notes };
      } catch (error) {
        return reply.code(400).send({
          ok: false,
          error: error instanceof Error ? error.message : 'Não foi possível salvar as notas.',
        });
      }
    });
    app.get('/api/player/blank-sheet', {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    }, async (_request, reply) => reply.redirect(
      `/session-assets/${encodeURIComponent(BLANK_CHARACTER_SHEET_ASSET_PATH)}`,
    ));
    app.route({
      method: ['GET', 'HEAD'],
      url: '/api/player/sheet',
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      handler: async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const account = authenticatedAccount(request.headers);
        if (!account) return reply.code(401).send({ error: 'Entre novamente para continuar.' });
        const sheet = await (serverReference?.readEncounterSheet(account.session.profileId) ?? options.playerProfileStore.readSheet(account.session.profileId));
        if (!sheet) return reply.code(404).send({ error: 'Nenhuma ficha foi enviada.' });
        reply
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(sheet.fileName)}`)
          .header('Content-Length', sheet.bytes.byteLength);
        return request.method === 'HEAD' ? reply.send() : reply.send(sheet.bytes);
      },
    });
    app.post('/api/player/sheet/view-ticket', {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      const profile = options.playerProfileStore.profileById(account.session.profileId);
      if (!profile?.sheet.hasSheet) {
        return reply.code(404).send({ ok: false, error: 'Nenhuma ficha foi enviada.' });
      }
      const now = Date.now();
      for (const [ticket, value] of sheetViewTickets) {
        if (value.expiresAt <= now) sheetViewTickets.delete(ticket);
      }
      const ticket = randomBytes(32).toString('base64url');
      sheetViewTickets.set(ticket, {
        profileId: account.session.profileId,
        expiresAt: now + SHEET_VIEW_TICKET_DURATION_MS,
      });
      return { ok: true, url: `/api/player/sheet/view?ticket=${encodeURIComponent(ticket)}` };
    });
    app.get('/api/player/sheet/view', {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'private, max-age=300');
      const query = request.query as { ticket?: unknown };
      const ticket = typeof query.ticket === 'string' ? query.ticket : '';
      const authorization = sheetViewTickets.get(ticket);
      if (!authorization || authorization.expiresAt <= Date.now()) {
        if (authorization) sheetViewTickets.delete(ticket);
        return reply.code(403).type('text/plain').send(
          'O acesso temporário a esta ficha expirou. Abra-a novamente pelo BossBar.',
        );
      }
      const sheet = await (serverReference?.readEncounterSheet(authorization.profileId) ?? options.playerProfileStore.readSheet(authorization.profileId));
      if (!sheet) {
        return reply.code(404).type('text/plain').send(
          'Esta ficha não está mais vinculada ao jogador.',
        );
      }
      return reply
        .type('application/pdf')
        .header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(sheet.fileName)}`)
        .header('Content-Length', sheet.bytes.byteLength)
        .send(sheet.bytes);
    });
    app.get('/api/player/sheet/editor', {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    }, async (request, reply): Promise<CharacterSheetEditorResult> => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account || !serverReference) {
        reply.code(401);
        return { ok: false, error: 'Entre novamente para ajustar a ficha.' };
      }
      return serverReference.getCharacterSheetEditor(account.session.profileId);
    });
    app.put('/api/player/sheet/editor', {
      bodyLimit: 512 * 1024,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply): Promise<CharacterSheetEditorResult> => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account || !serverReference) {
        reply.code(401);
        return { ok: false, error: 'Entre novamente para ajustar a ficha.' };
      }
      const parsed = sheetEditorUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        reply.code(400);
        return { ok: false, error: 'Os campos enviados são inválidos.' };
      }
      return serverReference.proposeCharacterSheetChanges(
        account.session.profileId,
        account.session.clientId,
        parsed.data.fields,
      );
    });
    app.delete('/api/player/sheet', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      try {
        serverReference?.discardCharacterSheetChanges(account.session.profileId);
        const profile = await options.playerProfileStore.removeSheet(account.session.profileId);
        serverReference?.refreshCharacterSheet(account.session.clientId, false);
        return { ok: true, sheet: profile.sheet };
      } catch (error) {
        return reply.code(400).send({
          ok: false,
          error: error instanceof Error ? error.message : 'Não foi possível remover a ficha.',
        });
      }
    });
    app.post('/api/player/sheet', {
      bodyLimit: MAX_CHARACTER_SHEET_BYTES,
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      const bytes = request.body;
      if (!Buffer.isBuffer(bytes) || bytes.byteLength < 5 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return reply.code(400).send({ ok: false, error: 'Selecione um arquivo PDF válido.' });
      }
      try {
        const inspected = await inspectCharacterSheetPdf(bytes);
        if (!inspected.validation.supported) {
          return reply.code(422).send({
            ok: false,
            sheet: {
              hasSheet: false,
              fileName: null,
              uploadedAt: null,
              validation: inspected.validation,
            },
            error: inspected.validation.issues[0]?.message,
          });
        }
        const encodedFileName = request.headers['x-bossbar-filename'];
        const fileName = typeof encodedFileName === 'string'
          ? decodeURIComponent(encodedFileName)
          : 'ficha-t20.pdf';
        const profile = await options.playerProfileStore.saveSheet(
          account.session.profileId,
          fileName,
          bytes,
          inspected.validation,
        );
        serverReference?.refreshCharacterSheet(account.session.clientId, true);
        return { ok: true, sheet: profile.sheet, corrected: false };
      } catch (error) {
        return reply.code(422).send({
          ok: false,
          error: error instanceof Error ? error.message : 'Não foi possível ler esta ficha.',
        });
      }
    });
    app.post('/api/player/sheet/autofix', {
      config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      const sheet = await (serverReference?.readEncounterSheet(account.session.profileId) ?? options.playerProfileStore.readSheet(account.session.profileId));
      if (!sheet) return reply.code(404).send({ ok: false, error: 'Nenhuma ficha foi enviada.' });
      try {
        const inspected = await inspectCharacterSheetPdf(sheet.bytes, true);
        const correctedBytes = inspected.bytes ?? sheet.bytes;
        const profile = await options.playerProfileStore.saveSheet(
          account.session.profileId,
          sheet.fileName,
          correctedBytes,
          inspected.validation,
        );
        return { ok: true, sheet: profile.sheet, corrected: true };
      } catch (error) {
        return reply.code(422).send({
          ok: false,
          error: error instanceof Error ? error.message : 'Não foi possível corrigir a ficha.',
        });
      }
    });
    app.get('/api/preload', {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const authorization = request.headers.authorization;
      const roomCode = request.headers['x-bossbar-room'];
      const token = typeof authorization === 'string' &&
        authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';
      if (
        typeof roomCode !== 'string' ||
        roomCode.trim().toUpperCase() !== credentials.roomCode ||
        !tokensMatch(token, credentials.playerToken)
      ) {
        return reply.code(403).send({ error: 'Convite inválido.' });
      }
      return {
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        urls: [...new Set([
          ...publicSnapshotMediaUrls(snapshotReference.current),
          ...(options.preloadMediaUrls?.({
            roomCode: credentials.roomCode,
            mediaUrl: (id) => buildSessionMediaUrl(id, credentials.playerToken),
          }) ?? []),
        ])],
      };
    });
    app.post('/api/session-cache/clear', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const authorization = request.headers.authorization;
      const roomCode = request.headers['x-bossbar-room'];
      const token = typeof authorization === 'string' &&
        authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : '';
      if (
        typeof roomCode !== 'string' ||
        roomCode.trim().toUpperCase() !== credentials.roomCode ||
        !tokensMatch(token, credentials.playerToken)
      ) {
        return reply.code(403).send({ error: 'Convite inválido.' });
      }
      return reply
        .header('Clear-Site-Data', '"cache"')
        .send({ ok: true });
    });

    if (options.resolveMedia) {
      app.route({
        method: ['GET', 'HEAD'],
        url: '/session-media/:id',
        config: { rateLimit: { max: 1_200, timeWindow: '1 minute' } },
        handler: async (request, reply) => {
          const parsedId = mediaIdSchema.safeParse(
            (request.params as { id?: unknown }).id,
          );
          if (!parsedId.success) return reply.code(404).send();

          const access = (request.query as { access?: unknown }).access;
          if (typeof access !== 'string') return reply.code(401).send();
          if (!tokensMatch(access, credentials.playerToken)) {
            return reply.code(403).send();
          }

          const resource = await options.resolveMedia?.({ id: parsedId.data });
          if (!resource || !isAllowedMediaContentType(resource.contentType)) {
            return reply.code(404).send();
          }
          try {
            const file = await stat(resource.filePath);
            if (!file.isFile()) return reply.code(404).send();
            const rangeHeader = typeof request.headers.range === 'string'
              ? request.headers.range
              : null;
            const range = file.size === 0 && !rangeHeader
              ? { start: 0, end: -1, partial: false }
              : resolveByteRange(rangeHeader, file.size);
            if (!range) {
              return reply
                .code(416)
                .header('Content-Range', `bytes */${file.size}`)
                .send();
            }

            const contentLength = Math.max(0, range.end - range.start + 1);
            reply
              .code(range.partial ? 206 : 200)
              .header('Accept-Ranges', 'bytes')
              .header('Cache-Control', 'private, max-age=3600')
              .header('Content-Length', contentLength)
              .header('Content-Type', resource.contentType);
            if (range.partial) {
              reply.header(
                'Content-Range',
                `bytes ${range.start}-${range.end}/${file.size}`,
              );
            }
            if (request.method === 'HEAD' || contentLength === 0) {
              return reply.send();
            }
            return reply.send(createReadStream(resource.filePath, {
              start: range.start,
              end: range.end,
            }));
          } catch {
            return reply.code(404).send();
          }
        },
      });
    }

    if (options.assetRoot) {
      const assetRoot = resolve(options.assetRoot);
      if (!existsSync(assetRoot)) {
        throw new Error(`A pasta de assets da sessão não existe: ${assetRoot}`);
      }
      await app.register(fastifyStatic, {
        root: assetRoot,
        prefix: '/session-assets/',
        decorateReply: false,
        cacheControl: true,
        immutable: true,
        maxAge: '1d',
      });
    }

    if (options.webRoot) {
      const webRoot = resolve(options.webRoot);
      const webIndexFile = options.webIndexFile ?? 'web-player.html';
      if (!existsSync(webRoot)) {
        throw new Error(`A pasta do cliente web não existe: ${webRoot}`);
      }
      await app.register(fastifyStatic, {
        root: webRoot,
        index: [webIndexFile],
        allowedPath: (pathName) =>
          pathName === '/' ||
          pathName === `/${webIndexFile}` ||
          pathName.startsWith('/assets/'),
        cacheControl: true,
        immutable: false,
        maxAge: '1h',
        setHeaders: (response, filePath) => {
          if (basename(filePath) === webIndexFile) {
            response.header('Cache-Control', 'no-store');
          }
        },
      });
    } else {
      app.get('/', async (_request, reply) => reply
        .code(503)
        .header('Cache-Control', 'no-store')
        .send({ error: 'O cliente web ainda não foi configurado.' }));
    }

    const allowedOrigins = new Set(
      (options.allowedOrigins ?? []).map((origin) => new URL(origin).origin),
    );
    if (normalizedPublicBaseUrl) {
      allowedOrigins.add(new URL(normalizedPublicBaseUrl).origin);
    }
    const connectionRateLimiter = new SessionConnectionRateLimiter();
    const io = new SocketIOServer<
      MultiplayerClientToServerEvents,
      MultiplayerServerToClientEvents,
      MultiplayerInterServerEvents,
      MultiplayerSocketData
    >(app.server, {
      serveClient: false,
      maxHttpBufferSize: 64 * 1024,
      transports: ['websocket', 'polling'],
      allowRequest: (request, callback) => {
        if (!connectionRateLimiter.allow(request.socket.remoteAddress ?? 'unknown')) {
          callback('Muitas tentativas de conexão. Aguarde um minuto.', false);
          return;
        }
        callback(null, originIsAllowed(
          request.headers.origin,
          request.headers.host,
          allowedOrigins,
        ));
      },
    });

    io.use((socket, next) => {
      const result = authenticatePlayer(socket.handshake.auth, credentials);
      if (!result.ok) {
        next(socketError(result.code, result.message));
        return;
      }
      const accountSession = accountSessions.get(result.auth.accountToken);
      if (
        !accountSession ||
        accountSession.expiresAt <= Date.now() ||
        accountSession.clientId !== result.auth.clientId ||
        normalizePlayerName(accountSession.username) !== result.auth.playerName
      ) {
        if (accountSession && accountSession.expiresAt <= Date.now()) {
          accountSessions.delete(result.auth.accountToken);
        }
        next(socketError(
          'ACCOUNT_AUTH_REQUIRED',
          'Entre com seu usuário e senha antes de conectar.',
        ));
        return;
      }
      if (!roster.canRegister(result.auth.clientId)) {
        next(socketError(
          'ROOM_FULL',
          `Esta sessão já atingiu o limite de ${roster.maxPlayers} jogadores.`,
        ));
        return;
      }
      if (!roster.canRegisterName(result.auth.clientId, accountSession.username)) {
        next(socketError(
          'NAME_IN_USE',
          'Este usuário já está conectado nesta sala.',
        ));
        return;
      }
      socket.data = {
        playerId: '',
        playerName: accountSession.username,
        profileId: accountSession.profileId,
        clientId: result.auth.clientId,
        isHost: typeof result.auth.hostToken === 'string'
          && tokensMatch(result.auth.hostToken, credentials.hostToken),
        connectedAt: Date.now(),
      };
      next();
    });

    try {
      await app.listen({
        host,
        port: options.port ?? DEFAULT_MULTIPLAYER_PORT,
      });
    } catch (error) {
      await app.close();
      if (
        error && typeof error === 'object'
        && 'code' in error && error.code === 'EADDRINUSE'
      ) {
        throw new Error(
          `A porta ${options.port ?? DEFAULT_MULTIPLAYER_PORT} já está em uso.`,
          { cause: error },
        );
      }
      throw error;
    }
    const address = app.server.address();
    if (!address || typeof address === 'string') {
      await app.close();
      throw new Error('Não foi possível determinar a porta da sessão.');
    }
    const port = address.port;
    const localBaseUrl = `http://127.0.0.1:${port}/`;
    const lanUrls = networkMode === 'lan'
      ? localIpv4Addresses().map((ip) => buildJoinUrl(
        `http://${ip}:${port}/`,
        credentials,
      ))
      : [];
    const publicUrl = options.publicBaseUrl
      ? buildJoinUrl(normalizedPublicBaseUrl!, credentials)
      : null;
    const info: MultiplayerSessionServerInfo = {
      address: host,
      port,
      networkMode,
      maxPlayers: roster.maxPlayers,
      invite: {
        roomCode: credentials.roomCode,
        localUrl: buildJoinUrl(localBaseUrl, credentials, true),
        lanUrls,
        publicUrl,
      },
    };
    const server = new MultiplayerSessionServer(
      app,
      io,
      roster,
      credentials,
      info,
      initialSnapshot,
      snapshotReference,
      options,
      allowedOrigins,
      normalizedPublicBaseUrl
        ? new URL(normalizedPublicBaseUrl).origin
        : null,
      accountSessions,
    );
    serverReference = server;
    server.attachSocketHandlers();
    server.notifyPresenceChanged();
    return server;
  }

  getPresence() {
    return { ...this.roster.presence(), waitingPlayers: [...this.awaitingSavedPlayers].flatMap((profileId) => {
      const member = this.savedSessionMembers.get(profileId);
      return member ? [{ id: member.playerId, name: this.savedEncounterPlayers.get(profileId)?.state.characterName || member.name }] : [];
    }) };
  }

  getConnectionPause(): EncounterTurnState['connectionPause'] {
    if (this.awaitingSavedPlayers.size) return { reason: 'restoring', names: this.getPresence().waitingPlayers.map(({ name }) => name) };
    const active = this.encounterTurnState.participants.find(({ id }) => id === this.encounterTurnState.activeParticipantId);
    const connectedIds = new Set(this.roster.members().map(({ player }) => player.id));
    const required = new Set([...this.pendingPlayerDamages.values()].map(({ playerId }) => playerId));
    if (active?.kind === 'player') required.add(active.sourceId);
    const names = this.encounterMembers().filter(({ player }) => required.has(player.id) && !connectedIds.has(player.id))
      .map(({ player, clientId }) => this.playerCombatStates.get(clientId)?.characterName || player.name);
    return names.length ? { reason: 'reconnecting', names } : null;
  }

  private connectionLockError() {
    const pause = this.getConnectionPause();
    return pause ? `Aguardando ${pause.reason === 'restoring' ? 'o retorno' : 'a reconexão'} de ${pause.names.join(', ')}.` : null;
  }

  kickPlayer(playerId: string) {
    const member = this.encounterMembers().find(({ player }) => player.id === playerId);
    if (!member?.profileId) return false;
    const profileId = member.profileId;
    this.kickedProfiles.add(profileId);
    this.savedEncounterPlayers.delete(profileId);
    this.savedSessionMembers.delete(profileId);
    this.awaitingSavedPlayers.delete(profileId);
    this.seenEncounterPlayers.delete(profileId);
    this.playerCombatStates.delete(member.clientId);
    this.playerActions.delete(profileId);
    this.deferredInitiativeActors.delete(`player:${playerId}`);
    this.lateInitiativeQueue = this.lateInitiativeQueue.filter((id) => id !== `player:${playerId}`);
    for (const [id, pending] of this.pendingPlayerDamages) if (pending.playerId === playerId) this.pendingPlayerDamages.delete(id);
    for (const socket of this.io.sockets.sockets.values()) if (socket.data.profileId === profileId) {
      this.roster.unregisterSocket(socket.id);
      socket.emit('session:join-rejected', 'O mestre removeu você deste encontro.', () => undefined);
      socket.disconnect(true);
    }
    this.syncTurnParticipants(); this.publishTurnState(); this.publishPlayerHuds(); this.notifyPresenceChanged();
    return true;
  }

  getPlayerHuds(viewerClientId: string | null = null) {
    return this.createPlayerHuds(viewerClientId, viewerClientId === null);
  }

  getTurnState(viewerClientId: string | null = null) {
    const viewerSourceId = this.roster.members().find(
      ({ clientId }) => clientId === viewerClientId,
    )?.player.id ?? null;
    const hiddenParticipantIds = new Set(
      this.createPlayerHuds(viewerClientId)
        .filter(({ redacted }) => redacted)
        .map(({ id }) => `player:${id}`),
    );
    return personalizeEncounterTurnState(
      { ...this.encounterTurnState, connectionPause: this.getConnectionPause() },
      viewerSourceId,
      hiddenParticipantIds,
      viewerClientId === null,
    );
  }

  advanceTurnAsHost(
    expectedParticipantId?: string | null,
  ): EncounterTurnActionResult {
    const connectionError = this.connectionLockError();
    if (connectionError) return { ok: false, error: connectionError };
    if (!this.currentSnapshot.battle.battleStarted) {
      return { ok: false, error: 'Inicie a batalha primeiro.' };
    }
    if (
      expectedParticipantId &&
      this.encounterTurnState.activeParticipantId &&
      expectedParticipantId !== this.encounterTurnState.activeParticipantId
    ) {
      return { ok: false, error: 'O turno ativo mudou. Tente novamente.' };
    }
    if (
      !this.encounterTurnState.started &&
      this.encounterTurnState.initiativeReady === false
    ) {
      return {
        ok: false,
        error: 'Aguarde todos os testes de Iniciativa terminarem.',
      };
    }
    if (this.lateInitiativeQueue.length > 0) {
      return {
        ok: false,
        error: 'O participante recém-chegado deve rolar Iniciativa primeiro.',
      };
    }
    if (this.pendingPlayerDamages.size > 0 || this.pendingDirectPlayerDamages.size > 0) {
      return {
        ok: false,
        error: 'Resolva a rolagem de dano pendente antes de avançar o turno.',
      };
    }
    const currentActiveId = this.encounterTurnState.activeParticipantId;
    const releasedLateActors = currentActiveId
      ? [...this.deferredInitiativeActors.entries()]
        .filter(([, deferred]) => deferred.blockedBy === currentActiveId)
        .map(([participantId]) => participantId)
      : [];
    if (releasedLateActors.length > 0 && currentActiveId) {
      for (const participantId of releasedLateActors) {
        const deferred = this.deferredInitiativeActors.get(participantId);
        if (deferred) {
          this.deferredInitiativeActors.set(participantId, {
            ...deferred,
            blockedBy: '',
          });
        }
      }
      this.syncTurnParticipants();
      this.lateInitiativeQueue = releasedLateActors.filter((participantId) =>
        this.encounterTurnState.participants.some(
          ({ id, initiativeRolled }) =>
            id === participantId && initiativeRolled === false,
        ));
      if (this.lateInitiativeQueue.length > 0) {
        this.interruptedTurnParticipantId = currentActiveId;
        this.encounterTurnState = {
          ...this.encounterTurnState,
          activeParticipantId: this.lateInitiativeQueue[0],
          revision: this.encounterTurnState.revision + 1,
        };
        this.publishTurnState(currentActiveId);
        return { ok: true, state: this.getTurnState() };
      }
    }
    const previousActiveId = this.encounterTurnState.activeParticipantId;
    const nextState = this.encounterTurnState.started
      ? advanceEncounterTurns(this.encounterTurnState)
      : beginEncounterTurns(this.encounterTurnState);
    if (nextState === this.encounterTurnState) {
      return { ok: false, error: 'Nenhum participante pode iniciar o turno.' };
    }
    this.encounterRollSequence = 0;
    this.encounterTurnState = nextState;
    this.syncTurnParticipants();
    this.publishTurnState(previousActiveId);
    return { ok: true, state: this.getTurnState() };
  }

  rollInitiativeAsHost(
    participantId: string,
    extremeAdvantage = false,
  ): EncounterTurnActionResult {
    const lock = this.connectionLockError();
    if (lock) return { ok: false, error: lock };
    const participant = this.encounterTurnState.participants.find(
      ({ id }) => id === participantId,
    );
    if (!participant || !['boss', 'npc'].includes(participant.kind)) {
      return { ok: false, error: 'Selecione um chefão ou NPC pendente.' };
    }
    return this.rollInitiativeParticipant(participantId, extremeAdvantage);
  }

  private rollInitiativeAsPlayer(
    playerId: string,
    extremeAdvantage = false,
  ): EncounterTurnActionResult {
    const participant = this.encounterTurnState.participants.find(
      ({ kind, sourceId }) => kind === 'player' && sourceId === playerId,
    );
    if (!participant) {
      return { ok: false, error: 'Seu personagem não participa desta iniciativa.' };
    }
    const socket = [...this.io.sockets.sockets.values()].find(
      (candidate) => candidate.data.playerId === playerId,
    );
    const sheetLockError = socket
      ? this.characterSheetLockError(socket.data.profileId)
      : null;
    if (sheetLockError) return { ok: false, error: sheetLockError };
    const combatState = socket
      ? this.playerCombatStates.get(socket.data.clientId)
      : null;
    if (
      extremeAdvantage &&
      (!combatState || normalizeHeroPointCount(
        combatState.heroPoints,
        combatState.heroPointAvailable,
      ) <= 0)
    ) {
      return { ok: false, error: 'Nenhum Ponto Heróico está disponível.' };
    }
    const result = this.rollInitiativeParticipant(
      participant.id,
      extremeAdvantage,
    );
    if (result.ok && extremeAdvantage && socket && combatState) {
      const nextState = {
        ...combatState,
        heroPoints: 0,
        heroPointAvailable: false,
        revision: combatState.revision + 1,
      };
      this.playerCombatStates.set(socket.data.clientId, nextState);
      this.publishPlayerState(socket.data.clientId);
      this.publishPlayerHuds();
    }
    return result;
  }

  private rollInitiativeParticipant(
    participantId: string,
    extremeAdvantage = false,
  ): EncounterTurnActionResult {
    if (!this.currentSnapshot.battle.battleStarted) {
      return { ok: false, error: 'Inicie a batalha primeiro.' };
    }
    let initiativeDice: number[] = [];
    const rolled = rollManualInitiative(
      this.encounterTurnState,
      participantId,
      () => {
        initiativeDice = extremeAdvantage
          ? [this.randomInteger(1, 21), this.randomInteger(1, 21)]
          : [this.randomInteger(1, 21)];
        return extremeAdvantage
          ? resolveExtremeAdvantage(initiativeDice[0], initiativeDice[1]).chosenDie
          : initiativeDice[0];
      },
    );
    if (!rolled) {
      return { ok: false, error: 'Esta iniciativa já foi rolada ou não está disponível.' };
    }
    const baseResult: EncounterRollResult = {
      ...this.createInitiativeRollResult(rolled.participant, null),
      ...(extremeAdvantage ? { resourceEffect: 'hero-point' as const } : {}),
    };
    const rawResult: EncounterRollResult = extremeAdvantage
      ? {
        ...baseResult,
        expression: `2d20 ${rolled.participant.initiativeModifier >= 0 ? '+' : '-'} ${Math.abs(rolled.participant.initiativeModifier)}`,
        rolls: initiativeDice,
        rollMode: 'sum-capped',
        natural: null,
      }
      : baseResult;
    const result = this.orderRollResults([rawResult])[0] ?? rawResult;
    const rerollIds = new Set(rolled.tiedParticipantIds);
    this.encounterTurnState = {
      ...rolled.state,
      rollResults: [
        ...(this.encounterTurnState.rollResults ?? []).filter(
          (candidate) =>
            candidate.category !== 'initiative' ||
            candidate.participantId !== participantId,
        ),
        result,
      ],
      history: [
        ...(rolled.state.history ?? []),
        ...historyEntriesForRolls(
          [result],
          rolled.state.round,
          rolled.state.activeParticipantId,
          rolled.state.participants,
        ),
      ],
    };
    this.options.onDiceRolled?.(result);
    if (this.lateInitiativeQueue[0] === participantId) {
      const previousActiveId = participantId;
      this.lateInitiativeQueue.shift();
      if (this.lateInitiativeQueue.length > 0) {
        this.encounterTurnState = {
          ...this.encounterTurnState,
          activeParticipantId: this.lateInitiativeQueue[0],
          revision: this.encounterTurnState.revision + 1,
        };
      } else {
        const interrupted = this.interruptedTurnParticipantId;
        this.interruptedTurnParticipantId = null;
        const resumableState = {
          ...this.encounterTurnState,
          activeParticipantId: interrupted,
        };
        this.encounterTurnState = advanceEncounterTurns(resumableState);
        this.encounterRollSequence = 0;
      }
      this.publishTurnState(previousActiveId);
    } else {
      this.publishTurnState();
    }
    return {
      ok: true,
      state: this.getTurnState(),
      ...(rerollIds.size > 0
        ? { error: 'Houve empate. Os participantes empatados devem rolar novamente.' }
        : {}),
    };
  }

  getPendingJoinRequests() {
    return [...this.pendingJoinRequests.values()]
      .map(({ request }) => ({ ...request }))
      .sort((first, second) => first.requestedAt - second.requestedAt);
  }

  getPendingActionPointRequests() {
    return [...this.pendingActionPointRequests.values()]
      .map(({ request }) => ({ ...request }))
      .sort((first, second) => first.requestedAt - second.requestedAt);
  }

  refreshPlayerPortrait() {
    this.publishPlayerHuds();
  }

  getEncounterDebugCreatures(): EncounterDebugCreature[] {
    const creatures: EncounterDebugCreature[] = [];
    const seenClients = new Set<string>();
    for (const socket of this.io.sockets.sockets.values()) {
      if (
        !socket.data.playerId ||
        seenClients.has(socket.data.clientId)
      ) continue;
      const state = this.playerCombatStates.get(socket.data.clientId);
      if (!state) continue;
      seenClients.add(socket.data.clientId);
      creatures.push({
        id: socket.data.playerId,
        kind: 'player',
        name: state.characterName,
        data: structuredClone(state),
      });
    }
    for (const participant of this.encounterTurnState.participants) {
      if (participant.kind !== 'npc') continue;
      creatures.push({
        id: participant.id,
        kind: 'npc',
        name: participant.name,
        data: structuredClone(participant),
      });
    }
    return creatures;
  }

  overwriteEncounterDebugCreature(
    request: EncounterDebugOverrideRequest,
  ): { ok: boolean; error?: string } {
    if (request.kind === 'player') {
      const socket = [...this.io.sockets.sockets.values()].find(
        (candidate) => candidate.data.playerId === request.id,
      );
      const current = socket
        ? this.playerCombatStates.get(socket.data.clientId)
        : null;
      if (!socket || !current) {
        return { ok: false, error: 'O jogador não está mais conectado.' };
      }
      const next = normalizeDebugPlayer(request.data, current);
      if (!next) return { ok: false, error: 'Os valores do jogador são inválidos.' };
      this.playerCombatStates.set(socket.data.clientId, next);
      this.publishPlayerState(socket.data.clientId);
      this.publishPlayerHuds();
      return { ok: true };
    }
    if (request.kind === 'npc') {
      const index = this.encounterTurnState.participants.findIndex(
        ({ id, kind }) => id === request.id && kind === 'npc',
      );
      const current = this.encounterTurnState.participants[index];
      if (!current) return { ok: false, error: 'O NPC não está mais no encontro.' };
      const next = normalizeDebugNpc(request.data, current);
      if (!next) return { ok: false, error: 'Os valores do NPC são inválidos.' };
      const participants = [...this.encounterTurnState.participants];
      participants[index] = next;
      this.encounterTurnState = {
        ...this.encounterTurnState,
        participants,
        revision: this.encounterTurnState.revision + 1,
      };
      this.publishTurnState();
      return { ok: true };
    }
    return { ok: false, error: 'Este tipo de criatura não pertence à sessão.' };
  }

  refreshCharacterSheet(clientId: string, hasCharacterSheet: boolean) {
    const saved = [...this.savedEncounterPlayers.values()].find((player) => player.clientId === clientId);
    if (saved) {
      if (!hasCharacterSheet) this.savedEncounterPlayers.delete(saved.profileId);
      else {
        saved.validation = this.options.playerProfileStore.profileById(saved.profileId)?.sheet.validation ?? null;
        delete saved.sheetDocument;
      }
    }
    if (this.roster.setCharacterSheet(clientId, hasCharacterSheet)) {
      this.notifyPresenceChanged();
    }
    const sockets = [...this.io.sockets.sockets.values()]
      .filter((socket) => socket.data.clientId === clientId);
    if (!hasCharacterSheet) {
      this.playerCombatStates.delete(clientId);
      for (const socket of sockets) socket.emit('player:state', null);
      this.syncTurnParticipants();
      this.publishPlayerHuds();
      return;
    }
    const socket = sockets[0];
    if (!socket) return;
    const state = this.createPlayerEncounterState(clientId, socket.data.profileId);
    if (!state) return;
    this.playerCombatStates.set(clientId, state);
    for (const candidate of sockets) candidate.emit('player:state', state);
    this.syncTurnParticipants();
    this.publishPlayerHuds();
  }

  applyAreaDamage(request: AreaDamageRequest): AreaDamageResult {
    const lock = this.connectionLockError();
    if (lock) return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: lock };
    if (!isAreaDamageRequest(request)) throw new Error('Informe dano, CD e resultado de sucesso válidos.');
    const skippedPlayers: string[] = [];
    let appliedPlayers = 0;
    const rollResults: EncounterRollResult[] = [];
    const vitalHistory = [] as ReturnType<typeof historyEntryForVitalChange>[];
    const targets: Array<{
      socket: ReturnType<MultiplayerSessionServer['encounterTargets']>[number];
      state: PlayerEncounterState;
    }> = [];
    const handledClients = new Set<string>();
    for (const socket of this.encounterTargets()) {
      if (!socket.data.playerId || handledClients.has(socket.data.clientId)) continue;
      if (
        request.playerIds &&
        !request.playerIds.includes(socket.data.playerId)
      ) continue;
      handledClients.add(socket.data.clientId);
      const state = this.playerCombatStates.get(socket.data.clientId) ??
        this.createPlayerEncounterState(socket.data.clientId, socket.data.profileId);
      if (!state) {
        skippedPlayers.push(socket.data.playerName);
        continue;
      }
      targets.push({ socket, state });
    }
    const parsedDamage = request.damageFormula
      ? parseDamageFormula(request.damageFormula)
      : null;
    const damageRoll = targets.length > 0 && parsedDamage
      ? rollDamageFormulaDetailed(
        parsedDamage,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      )
      : null;
    const resolvedRequest: AreaDamageRequest = {
      ...request,
      damage: damageRoll?.total ?? request.damage,
    };
    const damageParcels = splitDamageIntoHits(
      resolvedRequest.damage,
      request.hits ?? 1,
    ).filter((damage) => damage > 0);
    const areaTargetNames = targets.map(({ state }) => state.characterName).join(', ');
    let playerDamageSoundPublished = false;
    if (
      damageRoll &&
      request.attackerParticipantId &&
      damageRoll.rolls.length > 0
    ) {
      rollResults.push({
        id: `area-damage:${request.attackerParticipantId}:${randomUUID()}`,
        participantId: request.attackerParticipantId,
        label: 'Dano em área',
        expression: request.damageFormula ?? String(request.damage),
        rolls: damageRoll.rolls,
        modifier: damageRoll.modifier,
        total: damageRoll.total,
        outcome: 'neutral',
        category: 'damage',
        createdAt: Date.now(),
        retainedByParticipantId: this.encounterTurnState.activeParticipantId,
        actionId: request.actionId,
        correlationId: request.correlationId,
        targetName: areaTargetNames,
      });
    }
    for (const { socket, state } of targets) {
      let currentState = state;
      let impacted = false;
      for (const parcel of damageParcels) {
        const impact = resolveAreaDamage(
          currentState,
          {
            ...resolvedRequest,
            damage: parcel,
            damageFormula: undefined,
            hits: undefined,
          },
          this.randomInteger(1, 21),
          ++this.playerImpactSequence,
        );
        currentState = impact.playerState;
        impacted = true;
        if (!playerDamageSoundPublished && impact.damage.applied > 0) {
          playerDamageSoundPublished = true;
          this.options.onPlayerDamaged?.({
            critical: false,
            targetPlayerIds: [socket.data.playerId],
          });
        }
        socket.emit('player:combat-impact', impact);
        rollResults.push({
          id: `reflex:${socket.data.playerId}:${impact.id}`,
          participantId: `player:${socket.data.playerId}`,
          label: `Reflexos CD ${impact.check.dc}`,
          expression: `1d20 ${impact.check.reflex >= 0 ? '+' : '-'} ${Math.abs(impact.check.reflex)}`,
          rolls: [impact.check.die],
          modifier: impact.check.reflex,
          total: impact.check.total,
          outcome: impact.check.success ? 'success' : 'failure',
          category: 'test',
          createdAt: Date.now(),
          retainedByParticipantId:
            this.encounterTurnState.activeParticipantId,
          actionId: request.actionId,
          correlationId: request.correlationId,
          targetParticipantId: request.attackerParticipantId,
          targetName: this.encounterTurnState.participants.find(
            ({ id }) => id === request.attackerParticipantId,
          )?.name ?? 'Atacante',
          natural: impact.check.natural,
        });
      }
      if (!impacted) continue;
      this.playerCombatStates.set(socket.data.clientId, currentState);
      vitalHistory.push(historyEntryForVitalChange({
        id: `history:area-damage:${socket.data.playerId}:${randomUUID()}`,
        kind: 'damage',
        round: this.encounterTurnState.round,
        activeParticipantId: this.encounterTurnState.activeParticipantId,
        actorParticipantId: request.attackerParticipantId ?? null,
        actorName: this.encounterTurnState.participants.find(
          ({ id }) => id === request.attackerParticipantId,
        )?.name ?? 'Mestre',
        targetParticipantId: `player:${socket.data.playerId}`,
        targetName: currentState.characterName,
        amount:
          state.currentHealth + state.temporaryHealth -
          currentState.currentHealth - currentState.temporaryHealth,
        detail: 'dano em área',
      }));
      appliedPlayers += 1;
    }
    if (appliedPlayers > 0) {
      const orderedResults = this.orderRollResults(rollResults);
      this.syncTurnParticipants();
      this.encounterTurnState = {
        ...this.encounterTurnState,
        rollResults: [
          ...(this.encounterTurnState.rollResults ?? []),
          ...orderedResults,
        ],
        history: [
          ...(this.encounterTurnState.history ?? []),
          ...historyEntriesForRolls(
            orderedResults,
            this.encounterTurnState.round,
            this.encounterTurnState.activeParticipantId,
            this.encounterTurnState.participants,
          ),
          ...vitalHistory,
        ],
        revision: this.encounterTurnState.revision + 1,
      };
      orderedResults.forEach((result) => this.options.onDiceRolled?.(result));
      this.publishTurnState();
      this.publishPlayerHuds();
    }
    return {
      ok: true,
      appliedPlayers,
      skippedPlayers,
      rolledDamage: resolvedRequest.damage,
    };
  }

  async applyDirectPlayerDamage(
    request: DirectPlayerDamageRequest,
    precomputedHits?: ReadonlyMap<
      string,
      ReadonlyArray<{ hit: boolean; critical: boolean }>
    >,
  ): Promise<PlayerTargetActionResult> {
    const generation = this.encounterGeneration;
    const lock = this.connectionLockError();
    if (lock) return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: lock };
    if (this.currentSnapshot.scene.cutscenePlayback) return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: 'Aguarde o fim da cutscene para agir.' };
    if (!isDirectPlayerDamageRequest(request)) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: 'Informe os jogadores e um dano válido.',
      };
    }
    const selected = new Set(request.playerIds);
    const handledClients = new Set<string>();
    const skippedPlayers: string[] = [];
    const missedPlayers: string[] = [];
    const rollResults: EncounterRollResult[] = [];
    const vitalHistory = [] as ReturnType<typeof historyEntryForVitalChange>[];
    const impacts: NonNullable<PlayerTargetActionResult['impacts']> = [];
    const targets: Array<{
      socket: ReturnType<MultiplayerSessionServer['encounterTargets']>[number];
      state: PlayerEncounterState;
    }> = [];
    let appliedPlayers = 0;
    for (const socket of this.encounterTargets()) {
      if (
        !socket.data.playerId ||
        !selected.has(socket.data.playerId) ||
        handledClients.has(socket.data.clientId)
      ) continue;
      handledClients.add(socket.data.clientId);
      const state = this.playerCombatStates.get(socket.data.clientId) ??
        this.createPlayerEncounterState(socket.data.clientId, socket.data.profileId);
      if (!state) {
        skippedPlayers.push(socket.data.playerName);
        continue;
      }
      targets.push({ socket, state });
    }
    const requestedHits = request.hits ?? 1;
    const targetOutcomes: Array<{
      socket: ReturnType<MultiplayerSessionServer['encounterTargets']>[number];
      state: PlayerEncounterState;
      hits: Array<{ hit: boolean; critical: boolean }>;
    }> = [];
    let hasSuccessfulHit = false;
    let hasCriticalHit = false;
    let hasNormalHit = false;
    for (const target of targets) {
      const { socket, state } = target;
      const hitResults: Array<{ hit: boolean; critical: boolean }> = [];
      const preparedHits = precomputedHits?.get(socket.data.playerId);
      if (preparedHits) {
        hitResults.push(...preparedHits.map(({ hit, critical }) => ({ hit, critical })));
      } else for (let hitIndex = 0; hitIndex < requestedHits; hitIndex += 1) {
        if (
          request.attackType &&
          request.attackBonus !== undefined &&
          request.attackerParticipantId
        ) {
          const baseDice = request.extremeAdvantage
            ? [this.randomInteger(1, 21), this.randomInteger(1, 21)]
            : [this.randomInteger(1, 21)];
          const effectiveDie = request.extremeAdvantage
            ? resolveExtremeAdvantage(baseDice[0], baseDice[1]).chosenDie
            : baseDice[0];
          const targetDefenses = effectivePlayerDefenses(state);
          const check = resolveAttackCheck(
            request.attackBonus,
            request.attackType === 'melee'
              ? targetDefenses.melee
              : targetDefenses.ranged,
            effectiveDie,
          );
          const critical = isCriticalAttack(
            check.success,
            check.die,
            request.criticalThreat ?? 20,
          );
          rollResults.push({
            id: `attack:${request.attackerParticipantId}:${randomUUID()}`,
            participantId: request.attackerParticipantId,
            label: request.attackName?.trim() ||
              (request.attackType === 'melee' ? 'Luta' : 'Pontaria'),
            expression: `${baseDice.length}d20 ${check.attackBonus >= 0 ? '+' : '-'} ${Math.abs(check.attackBonus)}`,
            rolls: baseDice,
            modifier: check.attackBonus,
            total: check.total,
            outcome: check.success ? 'success' : 'failure',
            category: 'attack',
            createdAt: Date.now(),
            retainedByParticipantId: this.encounterTurnState.activeParticipantId,
            actionId: request.actionId,
            correlationId: request.correlationId,
            critical,
            criticalMultiplier: critical
              ? request.criticalMultiplier ?? 2
              : undefined,
            rollMode: request.extremeAdvantage ? 'sum-capped' : 'sum',
            // Threat range never changes the natural d20. It only upgrades an
            // attack that already hit; only a real/effective 20 auto-hits.
            natural: check.natural,
            targetParticipantId: `player:${socket.data.playerId}`,
            targetName: state.characterName,
          });
          hitResults.push({
            hit: check.success,
            critical,
          });
        } else {
          hitResults.push({ hit: true, critical: false });
        }
      }
      const targetWasHit = hitResults.some(({ hit }) => hit);
      hasCriticalHit ||= hitResults.some(({ critical }) => critical);
      hasNormalHit ||= hitResults.some(({ hit, critical }) => hit && !critical);
      hasSuccessfulHit ||= targetWasHit;
      if (!targetWasHit) missedPlayers.push(socket.data.playerName);
      targetOutcomes.push({ socket, state, hits: hitResults });
    }
    if (rollResults.length > 0) this.appendRollResults(rollResults);
    if (request.deferDamage && hasSuccessfulHit && !precomputedHits) {
      const pendingDamageId = `boss-damage:${randomUUID()}`;
      this.pendingDirectPlayerDamages.set(pendingDamageId, {
        id: pendingDamageId,
        request: { ...request, deferDamage: false },
        targets: targetOutcomes.map(({ socket, state, hits }) => ({
          playerId: socket.data.playerId,
          playerName: state.characterName,
          hits: hits.map(({ hit, critical }) => ({ hit, critical })),
        })),
        skippedPlayers: [...skippedPlayers],
        missedPlayers: [...missedPlayers],
        createdAt: Date.now(),
      });
      return {
        ok: true,
        appliedPlayers: 0,
        skippedPlayers,
        ...(missedPlayers.length > 0 ? { missedPlayers } : {}),
        pendingDamageId,
        impacts: targetOutcomes.map(({ socket, state, hits }) => ({
          playerId: socket.data.playerId,
          hit: hits.some(({ hit }) => hit),
          appliedDamage: 0,
          healthBefore: state.currentHealth,
          healthAfter: state.currentHealth,
          critical: hits.some(({ critical }) => critical),
        })),
      };
    }
    if (hasCriticalHit) {
      let warned = false;
      for (const outcome of targetOutcomes) {
        if (!outcome.hits.some(({ critical }) => critical)) continue;
        const warningState: PlayerEncounterState = {
          ...outcome.state,
          criticalThreatId: ++this.playerImpactSequence,
          revision: outcome.state.revision + 1,
        };
        outcome.state = warningState;
        this.playerCombatStates.set(outcome.socket.data.clientId, warningState);
        this.publishPlayerState(outcome.socket.data.clientId);
        warned = true;
      }
      if (warned) {
        this.publishPlayerHuds();
        this.options.onBossCriticalThreat?.({
          targetPlayerIds: targetOutcomes
            .filter(({ hits }) => hits.some(({ critical }) => critical))
            .map(({ socket }) => socket.data.playerId),
        });
      }
    }
    if (hasSuccessfulHit && (hasCriticalHit || !precomputedHits)) {
      await this.waitForCombatRollDelay(hasCriticalHit ? 'dramatic' : 'normal');
      if (generation !== this.encounterGeneration || this.closing) return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: 'O encontro foi substituído; o ataque anterior foi cancelado.' };
    }

    const parsedDamage = request.damageFormula
      ? parseDamageFormula(request.damageFormula)
      : null;
    const normalDamageRoll = hasNormalHit && parsedDamage
      ? rollDamageFormulaDetailed(
        parsedDamage,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      )
      : null;
    const criticalDamageRoll = hasCriticalHit && parsedDamage
      ? rollCriticalDamageFormulaDetailed(
        parsedDamage,
        request.criticalMultiplier ?? 2,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      )
      : null;
    const resolvedNormalDamage = normalDamageRoll?.total ?? request.damage;
    const resolvedCriticalDamage = criticalDamageRoll?.total ?? request.damage;
    const normalDamageParcels = splitDamageIntoHits(
      resolvedNormalDamage,
      requestedHits,
    );
    const criticalDamageParcels = splitDamageIntoHits(
      resolvedCriticalDamage,
      requestedHits,
    );
    const damageRollResults: EncounterRollResult[] = [];
    const hitTargetNames = targetOutcomes
      .filter(({ hits }) => hits.some(({ hit }) => hit))
      .map(({ state }) => state.characterName)
      .join(', ');
    if (normalDamageRoll && request.attackerParticipantId) {
      damageRollResults.push({
        id: `damage:${request.attackerParticipantId}:${randomUUID()}`,
        participantId: request.attackerParticipantId,
        label: 'Dano',
        expression: request.damageFormula ?? String(request.damage),
        rolls: normalDamageRoll.rolls,
        modifier: normalDamageRoll.modifier,
        total: normalDamageRoll.total,
        outcome: 'success',
        category: 'damage',
        createdAt: Date.now(),
        retainedByParticipantId: this.encounterTurnState.activeParticipantId,
        actionId: request.actionId,
        correlationId: request.correlationId,
        targetName: hitTargetNames,
      });
    }
    if (criticalDamageRoll && request.attackerParticipantId) {
      damageRollResults.push({
        id: `damage-critical:${request.attackerParticipantId}:${randomUUID()}`,
        participantId: request.attackerParticipantId,
        label: 'Dano crítico',
        expression: parsedDamage
          ? criticalDamageExpression(parsedDamage, request.criticalMultiplier ?? 2)
          : request.damageFormula ?? String(request.damage),
        rolls: criticalDamageRoll.rolls,
        modifier: criticalDamageRoll.modifier,
        total: criticalDamageRoll.total,
        outcome: 'success',
        category: 'damage',
        createdAt: Date.now(),
        retainedByParticipantId: this.encounterTurnState.activeParticipantId,
        actionId: request.actionId,
        correlationId: request.correlationId,
        critical: true,
        criticalMultiplier: request.criticalMultiplier ?? 2,
        targetName: hitTargetNames,
      });
    }
    if (hasSuccessfulHit) {
      this.options.onPlayerDamaged?.({
        critical: hasCriticalHit,
        targetPlayerIds: targetOutcomes
          .filter(({ hits }) => hits.some(({ hit, critical }) => (
            hasCriticalHit ? critical : hit
          )))
          .map(({ socket }) => socket.data.playerId),
      });
    }
    for (const { socket, state, hits } of targetOutcomes) {
      let currentState = state;
      hits.forEach(({ hit, critical }, index) => {
        if (!hit) return;
        const parcel = critical
          ? criticalDamageParcels[index] ?? 0
          : normalDamageParcels[index] ?? 0;
        currentState = {
          ...applyPlayerDamage(currentState, parcel).state,
          criticalImpactId: critical
            ? ++this.playerImpactSequence
            : currentState.criticalImpactId,
        };
      });
      const targetWasHit = hits.some(({ hit }) => hit);
      const targetWasCritical = hits.some(({ critical }) => critical);
      if (targetWasHit) {
        this.playerCombatStates.set(socket.data.clientId, currentState);
        this.publishPlayerState(socket.data.clientId);
        vitalHistory.push(historyEntryForVitalChange({
          id: `history:direct-damage:${socket.data.playerId}:${randomUUID()}`,
          kind: 'damage',
          round: this.encounterTurnState.round,
          activeParticipantId: this.encounterTurnState.activeParticipantId,
          actorParticipantId: request.attackerParticipantId ?? null,
          actorName: this.encounterTurnState.participants.find(
            ({ id }) => id === request.attackerParticipantId,
          )?.name ?? 'Mestre',
          targetParticipantId: `player:${socket.data.playerId}`,
          targetName: currentState.characterName,
          amount:
            state.currentHealth + state.temporaryHealth -
            currentState.currentHealth - currentState.temporaryHealth,
          detail: request.attackType === 'ranged' ? 'à distância' : 'corpo a corpo',
        }));
      }
      impacts.push({
        playerId: socket.data.playerId,
        hit: targetWasHit,
        appliedDamage:
          state.currentHealth + state.temporaryHealth -
          currentState.currentHealth - currentState.temporaryHealth,
        healthBefore: state.currentHealth,
        healthAfter: currentState.currentHealth,
        critical: targetWasCritical,
      });
      if (targetWasHit) appliedPlayers += 1;
    }
    if (damageRollResults.length > 0) {
      this.appendRollResults(damageRollResults);
    }
    if (vitalHistory.length > 0) {
      this.encounterTurnState = {
        ...this.encounterTurnState,
        history: [...(this.encounterTurnState.history ?? []), ...vitalHistory],
        revision: this.encounterTurnState.revision + 1,
      };
      this.publishTurnState();
    }
    if (appliedPlayers > 0) {
      if (this.currentSnapshot.battle.battleStarted) {
        this.syncTurnParticipants();
      }
      this.publishPlayerHuds();
    }
    return {
      ok: true,
      appliedPlayers,
      skippedPlayers,
      ...(missedPlayers.length > 0 ? { missedPlayers } : {}),
      impacts,
      rolledDamage: hasCriticalHit
        ? resolvedCriticalDamage
        : resolvedNormalDamage,
    };
  }

  async resolvePendingDirectPlayerDamage(
    pendingDamageId: string,
  ): Promise<PlayerTargetActionResult> {
    const pending = this.pendingDirectPlayerDamages.get(pendingDamageId);
    if (!pending) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: 'Esta rolagem de dano não está mais disponível.',
      };
    }
    const hitMap = new Map(
      pending.targets.map(({ playerId, hits }) => [playerId, hits] as const),
    );
    const result = await this.applyDirectPlayerDamage(
      { ...pending.request, deferDamage: false },
      hitMap,
    );
    if (result.ok) this.pendingDirectPlayerDamages.delete(pendingDamageId);
    return result;
  }

  getPendingBossDamage(bossId: string) {
    const pending = [...this.pendingDirectPlayerDamages.values()].find(({ request }) => request.attackerParticipantId === `boss:${bossId}`);
    return pending ? { id: pending.id, bossId, attackName: pending.request.attackName ?? 'Ataque',
      bossTargetIds: pending.request.bossTargetIds ?? [], fallbackDamage: pending.request.damage, hits: pending.request.hits ?? 1 } : null;
  }

  applyPlayerStatus(request: PlayerStatusRequest): PlayerTargetActionResult {
    const lock = this.connectionLockError();
    if (lock) return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: lock };
    const status = normalizeActiveStatuses([request?.status])[0];
    if (
      !request ||
      !Array.isArray(request.playerIds) ||
      request.playerIds.length < 1 ||
      request.playerIds.length > 10 ||
      !request.playerIds.every(
        (id) => typeof id === 'string' && id.length > 0 && id.length <= 128,
      ) ||
      !status
    ) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: 'Informe os jogadores e uma condição válida.',
      };
    }
    const selected = new Set(request.playerIds);
    const handledClients = new Set<string>();
    const skippedPlayers: string[] = [];
    let appliedPlayers = 0;
    for (const socket of this.encounterTargets()) {
      if (
        !socket.data.playerId ||
        !selected.has(socket.data.playerId) ||
        handledClients.has(socket.data.clientId)
      ) continue;
      handledClients.add(socket.data.clientId);
      const state = this.playerCombatStates.get(socket.data.clientId) ??
        this.createPlayerEncounterState(socket.data.clientId, socket.data.profileId);
      if (!state) {
        skippedPlayers.push(socket.data.playerName);
        continue;
      }
      const nextState: PlayerEncounterState = {
        ...state,
        statuses: applyStatusRules(state.statuses, status),
        revision: state.revision + 1,
      };
      this.playerCombatStates.set(socket.data.clientId, nextState);
      for (const candidate of this.io.sockets.sockets.values()) {
        if (candidate.data.clientId === socket.data.clientId) {
          candidate.emit('player:state', nextState);
        }
      }
      appliedPlayers += 1;
    }
    if (appliedPlayers > 0) this.publishPlayerHuds();
    return { ok: true, appliedPlayers, skippedPlayers };
  }

  async requestPlayerCombatAction(
    socket: MultiplayerPlayerSocket,
    request: PlayerCombatActionRequest,
  ): Promise<PlayerCombatActionResult> {
    if (!isPlayerCombatActionRequest(request)) {
      return { ok: false, error: 'A ação de combate é inválida.' };
    }
    const sheetLockError = this.characterSheetLockError(socket.data.profileId);
    if (sheetLockError) return { ok: false, error: sheetLockError };
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (!state) {
      return { ok: false, error: 'Vincule uma ficha válida antes de agir.' };
    }
    const beforeInitiative = this.currentSnapshot.battle.battleStarted &&
      !this.encounterTurnState.started;
    if (beforeInitiative && request.kind !== 'damage') {
      const existing = [...this.pendingActionPointRequests.values()].find(
        ({ clientId }) => clientId === socket.data.clientId,
      );
      if (existing) {
        return {
          ok: false,
          pendingApproval: true,
          requestId: existing.request.id,
          error: 'Aguarde o mestre avaliar sua solicitação.',
        };
      }
      const actionId = request.actionId ?? randomUUID();
      const combatAction = { ...request, actionId } as PlayerCombatActionRequest;
      const approvesActionPoint =
        (request.kind === 'resource' && request.resource === 'action-point') ||
        ((request.kind === 'skill' || request.kind === 'attack') &&
          request.resource?.kind === 'action-point');
      const id = randomUUID();
      this.pendingActionPointRequests.set(id, {
        request: {
          id,
          playerId: socket.data.playerId,
          playerName: state.characterName || socket.data.playerName,
          label: `Ação antes da iniciativa: ${this.combatActionLabel(socket, request)}`,
          requestedAt: Date.now(),
          actionId,
          kind: 'pre-initiative-action',
        },
        socketId: socket.id,
        clientId: socket.data.clientId,
        profileId: socket.data.profileId,
        combatAction,
        approvesActionPoint,
        approvesMissingStandardAction: true,
      });
      this.notifyActionPointRequestsChanged();
      this.emitResourceNotice(socket.data.clientId, {
        id,
        tone: 'info',
        message: 'A ação foi enviada ao mestre porque a iniciativa ainda não terminou.',
        persistent: true,
      });
      return { ok: true, pendingApproval: true, requestId: id };
    }
    const active = this.encounterTurnState.participants.find(
      ({ id }) => id === this.encounterTurnState.activeParticipantId,
    );
    if (
      !active ||
      active.kind !== 'player' ||
      active.sourceId !== socket.data.playerId
    ) {
      return {
        ok: false,
        error: 'Você só pode realizar este teste durante o próprio turno.',
      };
    }
    if (this.lateInitiativeQueue.includes(active.id)) {
      return {
        ok: false,
        error: 'Neste turno de entrada, apenas a Iniciativa está disponível.',
      };
    }
    if (request.kind === 'damage') {
      return this.executePlayerCombatAction(socket, request);
    }
    if (state.dead) {
      return { ok: false, error: 'Este personagem morreu e não pode agir.' };
    }
    if (isPlayerIncapacitated(state) && request.kind !== 'skill') {
      return {
        ok: false,
        error: 'Um personagem inconsciente não pode realizar ações ou reações.',
      };
    }
    if (
      isPlayerIncapacitated(state) &&
      request.kind === 'skill' &&
      request.resource !== null
    ) {
      return {
        ok: false,
        error: 'Um personagem inconsciente só pode realizar o teste, sem usar recursos.',
      };
    }
    const actionId = request.actionId ?? randomUUID();
    const combatAction = { ...request, actionId } as PlayerCombatActionRequest;
    const currentActions = this.playerActions.get(socket.data.profileId) ?? {
      free: true,
      movement: true,
      standard: true,
    };
    const needsSkillApproval =
      request.kind === 'skill' && !currentActions.standard;

    const usesActionPoint =
      (request.kind === 'resource' && request.resource === 'action-point') ||
      ((request.kind === 'skill' || request.kind === 'attack') &&
        request.resource?.kind === 'action-point');
    if (usesActionPoint) {
      if (
        normalizeActionPointCount(
          state.actionPoints,
          state.actionPointAvailable,
        ) <= 0
      ) {
        return { ok: false, error: 'Nenhum Ponto de Ação está disponível.' };
      }
      if (this.actionPointActionIds.get(socket.data.profileId)?.has(actionId)) {
        return {
          ok: false,
          error: 'Um Ponto de Ação já foi usado nesta ação.',
        };
      }
      const existing = [...this.pendingActionPointRequests.values()].find(
        ({ clientId }) => clientId === socket.data.clientId,
      );
      if (existing) {
        return {
          ok: false,
          pendingApproval: true,
          requestId: existing.request.id,
          error: 'Aguarde o mestre avaliar seu Ponto de Ação.',
        };
      }
      const id = randomUUID();
      const label = request.kind === 'resource'
        ? request.ability === 'protection' ? 'Proteção' : 'Recuperação'
        : request.resource?.ability === 'intervention'
          ? `Intervenção em ${this.combatActionLabel(socket, request)}`
          : `Rolar novamente: ${this.combatActionLabel(socket, request)}`;
      const pending: PendingActionPointRequestInternal = {
        request: {
          id,
          playerId: socket.data.playerId,
          playerName: state.characterName || socket.data.playerName,
          label,
          requestedAt: Date.now(),
          actionId,
          kind: 'action-point',
        },
        socketId: socket.id,
        clientId: socket.data.clientId,
        profileId: socket.data.profileId,
        combatAction,
        approvesActionPoint: true,
        approvesMissingStandardAction: needsSkillApproval,
      };
      this.pendingActionPointRequests.set(id, pending);
      this.notifyActionPointRequestsChanged();
      this.emitResourceNotice(socket.data.clientId, {
        id,
        tone: 'info',
        message: 'Ponto de Ação enviado para aprovação do mestre.',
        persistent: true,
      });
      return { ok: true, pendingApproval: true, requestId: id };
    }

    if (needsSkillApproval) {
      const existing = [...this.pendingActionPointRequests.values()].find(
        ({ clientId }) => clientId === socket.data.clientId,
      );
      if (existing) {
        return {
          ok: false,
          pendingApproval: true,
          requestId: existing.request.id,
          error: 'Aguarde o mestre avaliar sua solicitação.',
        };
      }
      const id = randomUUID();
      const pending: PendingActionPointRequestInternal = {
        request: {
          id,
          playerId: socket.data.playerId,
          playerName: state.characterName || socket.data.playerName,
          label: `Teste sem ação padrão: ${this.combatActionLabel(socket, request)}`,
          requestedAt: Date.now(),
          actionId,
          kind: 'skill-without-standard-action',
        },
        socketId: socket.id,
        clientId: socket.data.clientId,
        profileId: socket.data.profileId,
        combatAction,
        approvesActionPoint: false,
        approvesMissingStandardAction: true,
      };
      this.pendingActionPointRequests.set(id, pending);
      this.notifyActionPointRequestsChanged();
      this.emitResourceNotice(socket.data.clientId, {
        id,
        tone: 'info',
        message: 'Teste enviado para autorização do mestre.',
        persistent: true,
      });
      return { ok: true, pendingApproval: true, requestId: id };
    }

    const usesHeroPoint = request.kind === 'resource'
      ? request.resource === 'hero-point'
      : (request.kind === 'skill' || request.kind === 'attack') &&
        request.resource?.kind === 'hero-point';
    if (
      usesHeroPoint &&
      normalizeHeroPointCount(state.heroPoints, state.heroPointAvailable) <= 0
    ) {
      return { ok: false, error: 'Nenhum Ponto Heróico está disponível.' };
    }
    return this.executePlayerCombatAction(socket, combatAction);
  }

  async approveActionPointRequest(
    requestId: string,
  ): Promise<PlayerCombatActionResult> {
    const lock = this.connectionLockError();
    if (lock) return { ok: false, error: lock };
    const pending = this.pendingActionPointRequests.get(requestId);
    if (!pending) {
      return { ok: false, error: 'Este pedido não está mais disponível.' };
    }
    const socket = this.io.sockets.sockets.get(pending.socketId);
    if (!socket?.connected) {
      this.pendingActionPointRequests.delete(requestId);
      this.notifyActionPointRequestsChanged();
      return { ok: false, error: 'O jogador não está mais conectado.' };
    }
    const active = this.encounterTurnState.participants.find(
      ({ id }) => id === this.encounterTurnState.activeParticipantId,
    );
    if (
      pending.request.kind !== 'pre-initiative-action' &&
      (!active || active.kind !== 'player' || active.sourceId !== socket.data.playerId)
    ) {
      this.pendingActionPointRequests.delete(requestId);
      this.notifyActionPointRequestsChanged();
      return {
        ok: false,
        error: 'O turno mudou antes da aprovação deste Ponto de Ação.',
      };
    }
    if (
      pending.request.kind === 'pre-initiative-action' &&
      this.encounterTurnState.started
    ) {
      this.pendingActionPointRequests.delete(requestId);
      this.notifyActionPointRequestsChanged();
      return { ok: false, error: 'A iniciativa terminou antes da aprovação.' };
    }
    this.pendingActionPointRequests.delete(requestId);
    this.notifyActionPointRequestsChanged();
    const result = await this.executePlayerCombatAction(
      socket,
      pending.combatAction,
      pending.approvesActionPoint,
      pending.approvesMissingStandardAction,
    );
    this.emitResourceNotice(pending.clientId, {
      id: requestId,
      tone: result.ok ? 'approved' : 'rejected',
      message: result.ok
        ? pending.request.kind === 'pre-initiative-action'
          ? 'O mestre autorizou sua ação antes da iniciativa.'
          : pending.approvesMissingStandardAction && !pending.approvesActionPoint
          ? 'O mestre autorizou seu teste de perícia.'
          : 'O mestre aprovou seu Ponto de Ação.'
        : result.error ?? 'A solicitação não pôde ser concluída.',
    });
    return result;
  }

  rejectActionPointRequest(requestId: string): PlayerCombatActionResult {
    const pending = this.pendingActionPointRequests.get(requestId);
    if (!pending) {
      return { ok: false, error: 'Este pedido não está mais disponível.' };
    }
    this.pendingActionPointRequests.delete(requestId);
    this.notifyActionPointRequestsChanged();
    this.emitResourceNotice(pending.clientId, {
      id: requestId,
      tone: 'rejected',
      message: pending.request.kind === 'pre-initiative-action'
        ? 'O mestre não autorizou sua ação antes da iniciativa.'
        : pending.approvesMissingStandardAction && !pending.approvesActionPoint
        ? 'O mestre não autorizou este teste de perícia.'
        : 'O mestre não aprovou este Ponto de Ação.',
    });
    return { ok: true };
  }

  grantHeroPoint(playerId: string): PlayerCombatActionResult {
    const socket = [...this.io.sockets.sockets.values()].find(
      (candidate) => candidate.data.playerId === playerId,
    );
    if (!socket) return { ok: false, error: 'O jogador não está conectado.' };
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (!state) return { ok: false, error: 'O jogador ainda não possui ficha válida.' };
    const current = normalizeHeroPointCount(
      state.heroPoints,
      state.heroPointAvailable,
    );
    if (current >= 1) {
      return { ok: false, error: 'Este personagem já possui um Ponto Heróico.' };
    }
    this.updatePlayerCombatState(socket.data.clientId, {
      ...state,
      heroPoints: 1,
      heroPointAvailable: true,
      revision: state.revision + 1,
    });
    this.emitResourceNotice(socket.data.clientId, {
      id: randomUUID(),
      tone: 'heroic',
      message: 'O mestre concedeu a você um ponto heróico.',
    });
    return { ok: true };
  }

  revokeHeroPoint(playerId: string): PlayerCombatActionResult {
    const socket = [...this.io.sockets.sockets.values()].find(
      (candidate) => candidate.data.playerId === playerId,
    );
    if (!socket) return { ok: false, error: 'O jogador não está conectado.' };
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (!state) return { ok: false, error: 'O jogador ainda não possui ficha válida.' };
    const current = normalizeHeroPointCount(
      state.heroPoints,
      state.heroPointAvailable,
    );
    if (current <= 0) {
      return { ok: false, error: 'Este personagem não possui Ponto Heróico.' };
    }
    this.updatePlayerCombatState(socket.data.clientId, {
      ...state,
      heroPoints: 0,
      heroPointAvailable: false,
      revision: state.revision + 1,
    });
    this.emitResourceNotice(socket.data.clientId, {
      id: randomUUID(),
      tone: 'info',
      message: 'O mestre retirou de você um ponto heróico.',
    });
    return { ok: true };
  }

  grantActionPoint(
    playerId: string,
    amount = 1,
  ): PlayerCombatActionResult {
    const socket = [...this.io.sockets.sockets.values()].find(
      (candidate) => candidate.data.playerId === playerId,
    );
    if (!socket) return { ok: false, error: 'O jogador não está conectado.' };
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (!state) {
      return { ok: false, error: 'O jogador ainda não possui ficha válida.' };
    }
    const current = normalizeActionPointCount(
      state.actionPoints,
      state.actionPointAvailable,
    );
    if (current >= 5) {
      return { ok: false, error: 'Este personagem já possui cinco Pontos de Ação.' };
    }
    const actionPoints = Math.min(
      5,
      current + Math.max(1, Math.min(5, Math.trunc(amount))),
    );
    this.updatePlayerCombatState(socket.data.clientId, {
      ...state,
      actionPoints,
      actionPointAvailable: actionPoints > 0,
      revision: state.revision + 1,
    });
    this.emitResourceNotice(socket.data.clientId, {
      id: randomUUID(),
      tone: 'approved',
      message: 'O mestre concedeu a você um ponto de ação.',
    });
    return { ok: true };
  }

  revokeActionPoint(
    playerId: string,
    amount = 1,
  ): PlayerCombatActionResult {
    const socket = [...this.io.sockets.sockets.values()].find(
      (candidate) => candidate.data.playerId === playerId,
    );
    if (!socket) return { ok: false, error: 'O jogador não está conectado.' };
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (!state) {
      return { ok: false, error: 'O jogador ainda não possui ficha válida.' };
    }
    const current = normalizeActionPointCount(
      state.actionPoints,
      state.actionPointAvailable,
    );
    if (current <= 0) {
      return { ok: false, error: 'Este personagem não possui Pontos de Ação.' };
    }
    const actionPoints = Math.max(
      0,
      current - Math.max(1, Math.min(5, Math.trunc(amount))),
    );
    this.updatePlayerCombatState(socket.data.clientId, {
      ...state,
      actionPoints,
      actionPointAvailable: actionPoints > 0,
      revision: state.revision + 1,
    });
    this.emitResourceNotice(socket.data.clientId, {
      id: randomUUID(),
      tone: 'info',
      message: 'O mestre retirou de você um ponto de ação.',
    });
    return { ok: true };
  }

  setUnarmedStrikeEnabled(
    playerId: string,
    enabled: boolean,
  ): PlayerCombatActionResult {
    const socket = [...this.io.sockets.sockets.values()].find(
      (candidate) => candidate.data.playerId === playerId,
    );
    if (!socket) return { ok: false, error: 'O jogador não está conectado.' };
    this.unarmedStrikeEnabled.set(socket.data.profileId, enabled);
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (state) {
      this.updatePlayerCombatState(socket.data.clientId, {
        ...state,
        unarmedStrikeEnabled: enabled,
        revision: state.revision + 1,
      });
    } else {
      this.publishPlayerHuds();
    }
    return { ok: true };
  }

  private combatActionLabel(
    socket: MultiplayerPlayerSocket,
    request: PlayerCombatActionRequest,
  ) {
    const summary = this.profileForEncounter(
      socket.data.profileId,
    )?.sheet.validation?.summary;
    if (request.kind === 'skill') {
      return summary?.skills.find(({ id }) => id === request.skillId)?.name ??
        'teste de perícia';
    }
    if (request.kind === 'stabilize') return 'Primeiros socorros';
    if (request.kind === 'attack') {
      if (request.attackSource?.kind === 'unarmed') return 'Punhos';
      const index = request.attackSource?.kind === 'sheet'
        ? request.attackSource.attackIndex
        : request.attackIndex;
      return index === undefined
        ? 'ataque'
        : summary?.attacks[index]?.name || 'ataque';
    }
    if (request.kind === 'damage') return 'rolagem de dano';
    return request.ability;
  }

  private async executePlayerCombatAction(
    socket: MultiplayerPlayerSocket,
    request: PlayerCombatActionRequest,
    actionPointApproved = false,
    missingStandardActionApproved = false,
  ): Promise<PlayerCombatActionResult> {
    const state = this.playerCombatStates.get(socket.data.clientId);
    const summary = this.profileForEncounter(
      socket.data.profileId,
    )?.sheet.validation?.summary;
    if (!state || !summary) {
      return { ok: false, error: 'A ficha do jogador não está disponível.' };
    }

    if (request.kind === 'damage') {
      return this.resolvePendingPlayerDamage(socket, request.pendingDamageId);
    }

    const actionId = request.actionId ?? randomUUID();
    const correlationId = request.correlationId;

    if (request.kind === 'stabilize') {
      if (isPlayerIncapacitated(state)) {
        return { ok: false, error: 'Você precisa estar consciente para prestar primeiros socorros.' };
      }
      const actions = this.playerActions.get(socket.data.profileId) ?? {
        free: true,
        movement: true,
        standard: true,
      };
      if (!actions.standard) {
        return { ok: false, error: 'A ação padrão deste turno já foi usada.' };
      }
      if (request.targetPlayerId === socket.data.playerId) {
        return { ok: false, error: 'Primeiros socorros devem ser usados em outro personagem.' };
      }
      const targetSocket = [...this.io.sockets.sockets.values()].find(
        (candidate) => candidate.data.playerId === request.targetPlayerId,
      );
      const targetState = targetSocket
        ? this.playerCombatStates.get(targetSocket.data.clientId)
        : null;
      if (
        !targetSocket ||
        !targetState ||
        targetState.dead ||
        targetState.currentHealth > 0 ||
        !targetState.statuses.some(({ statusId }) => statusId === 'sangrando')
      ) {
        return { ok: false, error: 'O alvo não está sangrando ou não pode ser estabilizado.' };
      }
      const cure = summary.skills.find(
        ({ id, name }) => id === '070' || name.toLocaleLowerCase('pt-BR') === 'cura',
      );
      if (!cure || cure.total === null) {
        return { ok: false, error: 'A perícia Cura não está disponível na ficha.' };
      }
      const die = this.randomInteger(1, 21);
      const check = resolveD20Check(die, cure.total, FIRST_AID_CURE_DC);
      this.playerActions.set(socket.data.profileId, {
        ...actions,
        standard: false,
      });
      if (check.success) {
        this.updatePlayerCombatState(
          targetSocket.data.clientId,
          stabilizePlayer(targetState).state,
        );
      }
      this.publishPlayerHuds();
      this.appendRollResult({
        id: `first-aid:${socket.data.playerId}:${randomUUID()}`,
        participantId: `player:${socket.data.playerId}`,
        label: `Cura CD ${FIRST_AID_CURE_DC}: ${targetState.characterName}`,
        expression: `1d20 ${cure.total >= 0 ? '+' : '-'} ${Math.abs(cure.total)}`,
        rolls: [die],
        modifier: cure.total,
        total: check.total,
        outcome: check.success ? 'success' : 'failure',
        category: 'test',
        createdAt: Date.now(),
        retainedByParticipantId: this.encounterTurnState.activeParticipantId,
        actionId,
        correlationId,
      });
      return { ok: true };
    }

    const actionPointUse =
      actionPointApproved ||
      (request.kind === 'resource' && request.resource === 'action-point');
    const heroPointUse =
      (request.kind === 'resource' && request.resource === 'hero-point') ||
      ((request.kind === 'skill' || request.kind === 'attack') &&
        request.resource?.kind === 'hero-point');
    if (
      actionPointUse &&
      normalizeActionPointCount(
        state.actionPoints,
        state.actionPointAvailable,
      ) <= 0
    ) {
      return { ok: false, error: 'Nenhum Ponto de Ação está disponível.' };
    }
    if (
      heroPointUse &&
      normalizeHeroPointCount(state.heroPoints, state.heroPointAvailable) <= 0
    ) {
      return { ok: false, error: 'Nenhum Ponto Heróico está disponível.' };
    }
    if (
      actionPointUse &&
      this.actionPointActionIds.get(socket.data.profileId)?.has(actionId)
    ) {
      return { ok: false, error: 'Um Ponto de Ação já foi usado nesta ação.' };
    }

    if (request.kind === 'resource') {
      if (request.resource === 'hero-point') {
        this.updatePlayerCombatState(socket.data.clientId, {
          ...state,
          heroPoints: 0,
          heroPointAvailable: false,
          revision: state.revision + 1,
        });
        this.emitResourceNotice(socket.data.clientId, {
          id: randomUUID(),
          tone: 'heroic',
          message: 'Ponto Heróico consumido para ativar o poder ou habilidade.',
        });
        return { ok: true };
      }
      if (!actionPointApproved) {
        return { ok: false, error: 'Este Ponto de Ação precisa da aprovação do mestre.' };
      }
      if (request.ability === 'protection') {
        const die = this.randomInteger(1, 7);
        const actionPoints = normalizeActionPointCount(
          state.actionPoints,
          state.actionPointAvailable,
        ) - 1;
        const nextState: PlayerEncounterState = {
          ...state,
          actionPoints,
          actionPointAvailable: actionPoints > 0,
          temporaryDefenseBonus: die,
          protectionExpiresAtRound: Math.max(1, this.encounterTurnState.round + 1),
          revision: state.revision + 1,
        };
        this.updatePlayerCombatState(socket.data.clientId, nextState);
        this.appendRollResult({
          id: `action-protection:${socket.data.playerId}:${randomUUID()}`,
          participantId: `player:${socket.data.playerId}`,
          label: 'Proteção',
          expression: '1d6',
          rolls: [die],
          modifier: 0,
          total: die,
          outcome: 'success',
          category: 'test',
          createdAt: Date.now(),
          retainedByParticipantId: this.encounterTurnState.activeParticipantId,
          resourceEffect: 'action-point',
          actionId,
          correlationId,
        });
        this.markActionPointUsed(socket.data.profileId, actionId);
        return { ok: true };
      }
      const formulas = actionPointRecoveryFormulas(summary.level);
      const healthFormula = parseDamageFormula(formulas.health);
      const manaFormula = parseDamageFormula(formulas.mana);
      if (!healthFormula || !manaFormula) {
        return { ok: false, error: 'Não foi possível preparar a Recuperação.' };
      }
      const health = rollDamageFormulaDetailed(
        healthFormula,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      );
      const mana = rollDamageFormulaDetailed(
        manaFormula,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      );
      const healedState = applyPlayerHealing(state, health.total).state;
      const nextState: PlayerEncounterState = {
        ...healedState,
        currentMana: Math.min(state.maxMana, state.currentMana + mana.total),
        actionPoints: normalizeActionPointCount(
          state.actionPoints,
          state.actionPointAvailable,
        ) - 1,
        actionPointAvailable:
          normalizeActionPointCount(
            state.actionPoints,
            state.actionPointAvailable,
          ) - 1 > 0,
        revision: healedState.revision + 1,
      };
      this.updatePlayerCombatState(socket.data.clientId, nextState);
      const retainedBy = this.encounterTurnState.activeParticipantId;
      this.appendRollResults([
        {
          id: `action-recovery-health:${socket.data.playerId}:${randomUUID()}`,
          participantId: `player:${socket.data.playerId}`,
          label: `Recuperação de PV (${formulas.tier})`,
          expression: formulas.health,
          rolls: health.rolls,
          modifier: health.modifier,
          total: health.total,
          outcome: 'success',
          category: 'test',
          createdAt: Date.now(),
          retainedByParticipantId: retainedBy,
          resourceEffect: 'action-point',
          actionId,
          correlationId,
        },
        {
          id: `action-recovery-mana:${socket.data.playerId}:${randomUUID()}`,
          participantId: `player:${socket.data.playerId}`,
          label: `Recuperação de PM (${formulas.tier})`,
          expression: formulas.mana,
          rolls: mana.rolls,
          modifier: mana.modifier,
          total: mana.total,
          outcome: 'success',
          category: 'test',
          createdAt: Date.now(),
          retainedByParticipantId: retainedBy,
          resourceEffect: 'action-point',
          actionId,
          correlationId,
        },
      ]);
      const appliedHealing = nextState.currentHealth - state.currentHealth;
      if (appliedHealing > 0) {
        this.encounterTurnState = {
          ...this.encounterTurnState,
          history: [
            ...(this.encounterTurnState.history ?? []),
            historyEntryForVitalChange({
              id: `history:recovery:${socket.data.playerId}:${randomUUID()}`,
              kind: 'heal',
              round: this.encounterTurnState.round,
              activeParticipantId: this.encounterTurnState.activeParticipantId,
              actorParticipantId: `player:${socket.data.playerId}`,
              actorName: nextState.characterName,
              targetParticipantId: `player:${socket.data.playerId}`,
              targetName: nextState.characterName,
              amount: appliedHealing,
              detail: 'Recuperação',
            }),
          ],
          revision: this.encounterTurnState.revision + 1,
        };
        this.publishTurnState();
      }
      this.markActionPointUsed(socket.data.profileId, actionId);
      return { ok: true };
    }

    const resourceEffect = actionPointUse
      ? 'action-point' as const
      : heroPointUse ? 'hero-point' as const : undefined;
    const rerollUse =
      actionPointUse &&
      request.resource?.kind === 'action-point' &&
      request.resource.ability === 'reroll';
    const rollTestDice = () => {
      const baseDice = heroPointUse || rerollUse
        ? [this.randomInteger(1, 21), this.randomInteger(1, 21)]
        : [this.randomInteger(1, 21)];
      const extremeAdvantage = heroPointUse
        ? resolveExtremeAdvantage(baseDice[0], baseDice[1])
        : null;
      const interventionDie = actionPointUse &&
        request.resource?.kind === 'action-point' &&
        request.resource.ability === 'intervention'
        ? this.randomInteger(1, 7)
        : 0;
      return {
        baseDice,
        chosenDie: extremeAdvantage
          ? extremeAdvantage.chosenDie
          : rerollUse ? baseDice[1] : baseDice[0],
        interventionDie,
        rollMode: heroPointUse
          ? 'sum-capped' as const
          : rerollUse ? 'reroll' as const : 'sum' as const,
      };
    };

    if (request.kind === 'skill') {
      const skill = summary.skills.find(({ id }) => id === request.skillId);
      if (!skill || skill.total === null) {
        return { ok: false, error: 'Esta perícia não está disponível na ficha.' };
      }
      const actions = this.playerActions.get(socket.data.profileId) ?? {
        free: true,
        movement: true,
        standard: true,
      };
      if (!actions.standard && !missingStandardActionApproved) {
        return {
          ok: false,
          error: 'A ação padrão deste turno já foi usada.',
        };
      }
      const { baseDice, chosenDie, interventionDie, rollMode } = rollTestDice();
      const total = chosenDie + skill.total + interventionDie;
      this.playerActions.set(socket.data.profileId, {
        ...actions,
        standard: false,
      });
      this.consumePlayerResource(
        socket,
        state,
        resourceEffect,
        actionId,
      );
      if (!resourceEffect) this.publishPlayerHuds();
      this.appendRollResult({
        id: `skill:${socket.data.playerId}:${randomUUID()}`,
        participantId: `player:${socket.data.playerId}`,
        label: skill.name,
        expression: `${baseDice.length}d20${interventionDie ? ' + 1d6' : ''} ${skill.total >= 0 ? '+' : '-'} ${Math.abs(skill.total)}`,
        rolls: [...baseDice, ...(interventionDie ? [interventionDie] : [])],
        modifier: skill.total,
        total,
        outcome: 'neutral',
        category: 'test',
        createdAt: Date.now(),
        retainedByParticipantId: this.encounterTurnState.activeParticipantId,
        resourceEffect,
        rollMode,
        natural: chosenDie === 1 || chosenDie === 20 ? chosenDie : null,
        actionId,
        correlationId,
      });
      return { ok: true };
    }

    const source = request.attackSource ??
      (
        request.attackIndex === undefined
          ? null
          : { kind: 'sheet' as const, attackIndex: request.attackIndex }
      );
    const unarmed = source?.kind === 'unarmed'
      ? createUnarmedAttack(summary)
      : null;
    if (
      unarmed &&
      !(this.unarmedStrikeEnabled.get(socket.data.profileId) ??
        state.unarmedStrikeEnabled)
    ) {
      return { ok: false, error: 'O mestre desativou ataques com os punhos.' };
    }
    const sheetAttack = source?.kind === 'sheet'
      ? summary.attacks[source.attackIndex]
      : null;
    const attack = unarmed ?? sheetAttack;
    const attackSkill = unarmed
      ? unarmed.attackBonus
      : summary.skills.find(({ id, name }) =>
        request.attackType === 'melee'
          ? id === '190' || name.toLocaleLowerCase('pt-BR') === 'luta'
          : id === '260' || name.toLocaleLowerCase('pt-BR') === 'pontaria')?.total ?? null;
    const attackTestFormula = parseAttackTestFormula(
      unarmed ? '1d20' : sheetAttack?.attackBonus,
    );
    const selectedDamageFormula = unarmed?.damageFormula ?? request.damageFormula;
    const damageFormula = parseDamageFormula(selectedDamageFormula);
    const defense = this.options.getBossDefense?.(
      request.targetBossId,
      request.attackType,
    );
    if (!attack || attackSkill === null || !damageFormula || defense === null || defense === undefined) {
      return { ok: false, error: 'O ataque, dano ou alvo não está disponível.' };
    }
    const actions = this.playerActions.get(socket.data.profileId) ?? {
      free: true,
      movement: true,
      standard: true,
    };
    if (!actions.standard) {
      return { ok: false, error: 'A ação padrão deste turno já foi usada.' };
    }
    if ([...this.pendingPlayerDamages.values()].some(
      ({ profileId }) => profileId === socket.data.profileId,
    )) {
      return { ok: false, error: 'Aguarde a resolução do ataque anterior.' };
    }
    const { baseDice, chosenDie, interventionDie, rollMode } = rollTestDice();
    const attackFormulaExtras = rollAttackTestExtraDice(
      attackTestFormula,
      (minimum, maximum) => this.randomInteger(minimum, maximum),
    );
    const attackModifier = attackFormulaExtras.total + attackSkill;
    const total = chosenDie + attackModifier + interventionDie;
    const success =
      chosenDie === 20 ||
      (heroPointUse && baseDice.includes(20)) ||
      ((chosenDie !== 1 || heroPointUse) && total >= defense);
    const criticalProfile = unarmed
      ? {
        threat: unarmed.criticalThreat,
        multiplier: unarmed.criticalMultiplier,
      }
      : parseCriticalProfile(sheetAttack?.critical);
    const critical = isCriticalAttack(
      success,
      chosenDie,
      criticalProfile.threat,
    );
    const retainedBy = this.encounterTurnState.activeParticipantId;
    const targetBossName = this.currentSnapshot.battle.bosses.find(
      ({ id }) => id === request.targetBossId,
    )?.bossName ?? 'Chefão';
    const attackResult: EncounterRollResult = {
      id: `attack:${socket.data.playerId}:${randomUUID()}`,
      participantId: `player:${socket.data.playerId}`,
      label: attack.name || (request.attackType === 'melee' ? 'Luta' : 'Pontaria'),
      expression: attackTestFormulaExpression(
        attackTestFormula,
        attackSkill,
        baseDice.length,
        Boolean(interventionDie),
      ),
      rolls: [
        ...baseDice,
        ...attackFormulaExtras.rolls,
        ...(interventionDie ? [interventionDie] : []),
      ],
      modifier: attackModifier,
      total,
      outcome: success ? 'success' : 'failure',
      category: 'attack',
      createdAt: Date.now(),
      retainedByParticipantId: retainedBy,
      resourceEffect,
      rollMode,
      actionId,
      correlationId,
      critical,
      criticalMultiplier: critical ? criticalProfile.multiplier : undefined,
      natural: chosenDie === 1 || chosenDie === 20 ? chosenDie : null,
      targetParticipantId: `boss:${request.targetBossId}`,
      targetName: targetBossName,
    };
    if (!success) {
      this.commitPlayerAttackCosts(
        socket,
        state,
        actions,
        resourceEffect,
        actionId,
      );
      this.appendRollResult(attackResult);
      return { ok: true };
    }

    this.commitPlayerAttackCosts(
      socket,
      state,
      actions,
      resourceEffect,
      actionId,
    );
    this.appendRollResult(attackResult);
    const pendingDamageId = `player-damage:${randomUUID()}`;
    this.pendingPlayerDamages.set(pendingDamageId, {
      id: pendingDamageId,
      profileId: socket.data.profileId,
      playerId: socket.data.playerId,
      targetBossId: request.targetBossId,
      targetBossName,
      attackName: attack.name || 'Ataque',
      damageFormula: selectedDamageFormula,
      critical,
      criticalMultiplier: criticalProfile.multiplier,
      nonlethal: unarmed?.nonlethal === true,
      actionId,
      correlationId,
      resourceEffect,
      stateBefore: state,
      actionsBefore: actions,
      retainedByParticipantId: retainedBy,
      createdAt: Date.now(),
    });
    this.publishPlayerHuds();
    return { ok: true, pendingDamageId };
  }

  private resolvePendingPlayerDamage(
    socket: MultiplayerPlayerSocket,
    pendingDamageId: string,
  ): PlayerCombatActionResult {
    const pending = this.pendingPlayerDamages.get(pendingDamageId);
    if (!pending || pending.profileId !== socket.data.profileId) {
      return { ok: false, error: 'Esta rolagem de dano não está mais disponível.' };
    }
    const formula = parseDamageFormula(pending.damageFormula);
    if (!formula) {
      this.pendingPlayerDamages.delete(pendingDamageId);
      this.publishPlayerHuds();
      return { ok: false, error: 'A fórmula de dano pendente é inválida.' };
    }
    const damage = pending.critical
      ? rollCriticalDamageFormulaDetailed(
        formula,
        pending.criticalMultiplier,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      )
      : rollDamageFormulaDetailed(
        formula,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      );
    const applied = this.options.applyBossDamage?.(
      pending.targetBossId,
      damage.total,
      {
        critical: pending.critical,
        actionId: pending.actionId,
        sourceParticipantId: `player:${pending.playerId}`,
        nonlethal: pending.nonlethal,
      },
    );
    if (!applied?.ok) {
      this.pendingPlayerDamages.delete(pendingDamageId);
      this.playerActions.set(pending.profileId, pending.actionsBefore);
      if (pending.resourceEffect === 'action-point') {
        this.actionPointActionIds.get(pending.profileId)?.delete(pending.actionId);
      }
      this.updatePlayerCombatState(socket.data.clientId, {
        ...pending.stateBefore,
        revision: pending.stateBefore.revision + 1,
      });
      return { ok: false, error: applied?.error ?? 'Não foi possível aplicar o dano.' };
    }
    this.pendingPlayerDamages.delete(pendingDamageId);
    this.appendRollResult({
      id: `damage:${pending.playerId}:${randomUUID()}`,
      participantId: `player:${pending.playerId}`,
      label: `${pending.critical ? 'Dano crítico' : 'Dano'}: ${pending.attackName}`,
      expression: pending.critical
        ? criticalDamageExpression(formula, pending.criticalMultiplier)
        : pending.damageFormula,
      rolls: damage.rolls,
      modifier: damage.modifier,
      total: applied.appliedDamage,
      outcome: 'success',
      category: 'damage',
      createdAt: Date.now(),
      retainedByParticipantId: pending.retainedByParticipantId,
      resourceEffect: pending.resourceEffect,
      actionId: pending.actionId,
      correlationId: pending.correlationId,
      critical: pending.critical,
      criticalMultiplier: pending.critical ? pending.criticalMultiplier : undefined,
      targetParticipantId: `boss:${pending.targetBossId}`,
      targetName: pending.targetBossName,
    });
    this.publishPlayerHuds();
    return { ok: true };
  }

  private waitForCombatRollDelay(
    mode: 'normal' | 'dramatic' | 'player-natural' = 'normal',
  ) {
    const delayMs = Math.max(
      0,
      Math.min(
        10_000,
        Math.trunc(
          mode === 'dramatic'
            ? this.options.dramaticCombatRollDelayMs ??
              BOSS_CRITICAL_THREAT_DURATION_MS
            : mode === 'player-natural'
              ? this.options.playerNaturalCombatRollDelayMs ?? 2_000
              : this.options.combatRollDelayMs ?? 1_000,
        ),
      ),
    );
    if (delayMs === 0) return Promise.resolve();
    return new Promise<void>((resolveDelay) => {
      const timer = setTimeout(resolveDelay, delayMs);
      timer.unref?.();
    });
  }

  private commitPlayerAttackCosts(
    socket: MultiplayerPlayerSocket,
    state: PlayerEncounterState,
    actions: PlayerHudActionState,
    resourceEffect: EncounterRollResult['resourceEffect'],
    actionId: string,
  ) {
    this.playerActions.set(socket.data.profileId, {
      ...actions,
      standard: false,
    });
    if (resourceEffect) {
      this.consumePlayerResource(
        socket,
        state,
        resourceEffect,
        actionId,
      );
    } else {
      this.publishPlayerHuds();
    }
  }

  private consumePlayerResource(
    socket: MultiplayerPlayerSocket,
    state: PlayerEncounterState,
    resourceEffect: EncounterRollResult['resourceEffect'],
    actionId: string,
  ) {
    if (!resourceEffect) return;
    const actionPoints = normalizeActionPointCount(
      state.actionPoints,
      state.actionPointAvailable,
    );
    const heroPoints = normalizeHeroPointCount(
      state.heroPoints,
      state.heroPointAvailable,
    );
    const nextActionPoints = resourceEffect === 'action-point'
      ? Math.max(0, actionPoints - 1)
      : actionPoints;
    const nextHeroPoints = resourceEffect === 'hero-point'
      ? 0
      : heroPoints;
    if (resourceEffect === 'action-point') {
      this.markActionPointUsed(socket.data.profileId, actionId);
    }
    this.updatePlayerCombatState(socket.data.clientId, {
      ...state,
      actionPoints: nextActionPoints,
      heroPoints: nextHeroPoints,
      actionPointAvailable: nextActionPoints > 0,
      heroPointAvailable: nextHeroPoints > 0,
      revision: state.revision + 1,
    });
  }

  private markActionPointUsed(profileId: string, actionId: string) {
    const used = this.actionPointActionIds.get(profileId) ?? new Set<string>();
    used.add(actionId);
    // The ledger only needs to cover recent actions. Bounding it prevents a
    // long encounter from retaining unbounded client-provided identifiers.
    while (used.size > 50) {
      const oldest = used.values().next().value;
      if (typeof oldest !== 'string') break;
      used.delete(oldest);
    }
    this.actionPointActionIds.set(profileId, used);
  }

  private appendRollResult(result: EncounterRollResult) {
    this.appendRollResults([result]);
  }

  private appendRollResults(results: EncounterRollResult[]) {
    const orderedResults = this.orderRollResults(results);
    const linkedExistingResults = orderedResults.reduce(
      (currentResults, result) =>
        linkEncounterRollCorrelation(currentResults, result.correlationId),
      this.encounterTurnState.rollResults ?? [],
    );
    this.encounterTurnState = {
      ...this.encounterTurnState,
      rollResults: [
        ...linkedExistingResults,
        ...orderedResults,
      ],
      history: [
        ...(this.encounterTurnState.history ?? []),
        ...historyEntriesForRolls(
          orderedResults,
          this.encounterTurnState.round,
          this.encounterTurnState.activeParticipantId,
          this.encounterTurnState.participants,
        ),
      ],
      revision: this.encounterTurnState.revision + 1,
    };
    orderedResults.forEach((result) => this.options.onDiceRolled?.(result));
    this.publishTurnState();
  }

  private orderRollResults(results: EncounterRollResult[]) {
    return results.map((result) => ({
      ...result,
      natural: result.category === 'initiative'
        ? null
        : result.natural ?? getEncounterRollNatural(
          result.expression,
          result.rolls,
          result.rollMode,
        ),
      sequence: result.sequence ?? ++this.encounterRollSequence,
    }));
  }

  private updatePlayerCombatState(
    clientId: string,
    state: PlayerEncounterState,
  ) {
    this.playerCombatStates.set(clientId, state);
    this.publishPlayerState(clientId);
    this.publishPlayerHuds();
  }

  private publishPlayerState(clientId: string) {
    const state = this.playerCombatStates.get(clientId) ?? null;
    for (const socket of this.io.sockets.sockets.values()) {
      if (socket.data.clientId === clientId) socket.emit('player:state', state);
    }
  }

  private emitResourceNotice(
    clientId: string,
    notice: PlayerResourceNotice,
  ) {
    for (const socket of this.io.sockets.sockets.values()) {
      if (socket.data.clientId === clientId) {
        socket.emit('player:resource-notice', notice);
      }
    }
  }

  private notifySheetChangeRequestsChanged() {
    this.options.onSheetChangeRequestsChanged?.(
      this.getPendingSheetChangeRequests(),
    );
  }

  private characterSheetInteractionState(
    profileId: string,
  ): CharacterSheetInteractionState {
    if (this.pendingSheetChangeRequests.has(profileId)) return 'pending-approval';
    if (this.activeSheetEditors.has(profileId)) return 'editing';
    return 'idle';
  }

  private publishCharacterSheetInteractionState(profileId: string) {
    const interactionState = this.characterSheetInteractionState(profileId);
    const clientIds = new Set(
      [...this.io.sockets.sockets.values()]
        .filter((socket) => socket.data.profileId === profileId)
        .map((socket) => socket.data.clientId),
    );
    for (const clientId of clientIds) {
      const current = this.playerCombatStates.get(clientId);
      if (!current || current.sheetInteractionState === interactionState) continue;
      this.playerCombatStates.set(clientId, {
        ...current,
        sheetInteractionState: interactionState,
        revision: current.revision + 1,
      });
      this.publishPlayerState(clientId);
    }
    if (clientIds.size > 0) this.publishPlayerHuds();
  }

  private characterSheetLockError(profileId: string) {
    const connectionError = this.connectionLockError();
    if (connectionError) return connectionError;
    if (this.currentSnapshot.scene.cutscenePlayback) return 'Aguarde o fim da cutscene para agir.';
    const state = this.characterSheetInteractionState(profileId);
    if (state === 'editing') {
      return 'Feche a ficha antes de realizar ações com este personagem.';
    }
    if (state === 'pending-approval') {
      return 'Aguarde o mestre aprovar ou recusar as alterações da ficha.';
    }
    return null;
  }

  setCharacterSheetEditorOpen(
    profileId: string,
    socketId: string,
    open: boolean,
  ) {
    if (open) {
      if (this.pendingSheetChangeRequests.has(profileId)) {
        return {
          ok: false,
          error: 'Aguarde o mestre avaliar as alterações já enviadas.',
        };
      }
      if (!this.profileForEncounter(profileId)?.sheet.hasSheet) {
        return { ok: false, error: 'Nenhuma ficha foi enviada.' };
      }
      this.activeSheetEditors.set(profileId, socketId);
    } else if (this.activeSheetEditors.get(profileId) === socketId) {
      this.activeSheetEditors.delete(profileId);
    }
    this.publishCharacterSheetInteractionState(profileId);
    return { ok: true };
  }

  getPendingSheetChangeRequests() {
    return [...this.pendingSheetChangeRequests.values()]
      .map(({ request }) => request)
      .sort((left, right) => left.requestedAt - right.requestedAt);
  }

  discardCharacterSheetChanges(profileId: string) {
    this.activeSheetEditors.delete(profileId);
    if (this.pendingSheetChangeRequests.delete(profileId)) {
      this.notifySheetChangeRequestsChanged();
    }
    this.publishCharacterSheetInteractionState(profileId);
  }

  async getCharacterSheetEditor(
    profileId: string,
  ): Promise<CharacterSheetEditorResult> {
    const sheet = await this.readEncounterSheet(profileId);
    if (!sheet) return { ok: false, error: 'Nenhuma ficha foi enviada.' };
    const pending = this.pendingSheetChangeRequests.get(profileId);
    return {
      ok: true,
      document: {
        fileName: sheet.fileName,
        fields: pending?.fields ?? await readCharacterSheetEditorFields(sheet.bytes),
        pendingApproval: Boolean(pending),
        requestId: pending?.request.id ?? null,
      },
    };
  }

  async proposeCharacterSheetChanges(
    profileId: string,
    clientId: string,
    fields: CharacterSheetEditorField[],
  ): Promise<CharacterSheetEditorResult> {
    const sheet = await this.readEncounterSheet(profileId);
    const profile = this.options.playerProfileStore.profileById(profileId);
    if (!sheet || !profile) return { ok: false, error: 'Nenhuma ficha foi enviada.' };
    const invalidUpdate = validateCharacterSheetEditorUpdates(fields);
    if (invalidUpdate) return { ok: false, error: invalidUpdate };
    const originalFields = await readCharacterSheetEditorFields(sheet.bytes);
    const originalByName = new Map(originalFields.map((field) => [field.name, field.value]));
    let applied: Awaited<ReturnType<typeof applyCharacterSheetEditorFields>>;
    try {
      applied = await applyCharacterSheetEditorFields(sheet.bytes, fields);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Os valores da ficha são inválidos.',
      };
    }
    const appliedByName = new Map(applied.fields.map((field) => [field.name, field.value]));
    const changes = fields.flatMap((field) => {
      const before = originalByName.get(field.name);
      const after = appliedByName.get(field.name) ?? field.value;
      return (before ?? '') === after
        ? []
        : [{ field: field.name, before: before ?? '', after }];
    }).slice(0, 600);
    if (changes.length === 0) {
      this.activeSheetEditors.delete(profileId);
      if (this.pendingSheetChangeRequests.delete(profileId)) {
        this.notifySheetChangeRequestsChanged();
      }
      this.publishCharacterSheetInteractionState(profileId);
      return {
        ok: true,
        document: {
          fileName: sheet.fileName,
          fields: originalFields,
          pendingApproval: false,
          requestId: null,
        },
      };
    }
    const previous = this.pendingSheetChangeRequests.get(profileId);
    const request: PlayerSheetChangeRequest = {
      id: previous?.request.id ?? randomUUID(),
      profileId,
      username: profile.username,
      fileName: sheet.fileName,
      requestedAt: previous?.request.requestedAt ?? Date.now(),
      changes,
    };
    this.pendingSheetChangeRequests.set(profileId, {
      request,
      profileId,
      clientId,
      bytes: applied.bytes,
      validation: applied.validation,
      fields: applied.fields,
    });
    this.activeSheetEditors.delete(profileId);
    this.notifySheetChangeRequestsChanged();
    this.publishCharacterSheetInteractionState(profileId);
    this.emitResourceNotice(clientId, {
      id: `sheet-change:${request.id}`,
      tone: 'info',
      message: 'Ajustes da ficha aguardam aprovação do mestre. Se for seu turno, suas ações permanecerão bloqueadas até a decisão.',
      persistent: true,
    });
    return {
      ok: true,
      document: {
        fileName: sheet.fileName,
        fields: applied.fields,
        pendingApproval: true,
        requestId: request.id,
      },
    };
  }

  async decideCharacterSheetChanges(
    requestId: string,
    approved: boolean,
  ): Promise<PlayerSheetChangeDecisionResult> {
    const pending = [...this.pendingSheetChangeRequests.values()]
      .find(({ request }) => request.id === requestId);
    if (!pending) return { ok: false, error: 'A proposta de ficha não está mais pendente.' };
    if (approved) {
      const profile = await this.options.playerProfileStore.saveSheet(
        pending.profileId,
        pending.request.fileName,
        pending.bytes,
        pending.validation,
      );
      // Clear the review lock before rebuilding the approved combat state.
      this.pendingSheetChangeRequests.delete(pending.profileId);
      const affectedClientIds = new Set(
        [...this.io.sockets.sockets.values()]
          .filter((socket) => socket.data.profileId === pending.profileId)
          .map((socket) => socket.data.clientId),
      );
      affectedClientIds.forEach((clientId) => {
        this.refreshCharacterSheet(clientId, true);
        this.emitResourceNotice(clientId, {
          id: `sheet-change:${requestId}`,
          tone: 'approved',
          message: 'O mestre aprovou as alterações da sua ficha.',
        });
      });
      if (!profile.sheet.hasSheet) {
        return { ok: false, error: 'A ficha aprovada não pôde ser salva.' };
      }
    } else {
      this.emitResourceNotice(pending.clientId, {
        id: `sheet-change:${requestId}`,
        tone: 'rejected',
        message: 'O mestre recusou as alterações da sua ficha.',
      });
    }
    this.pendingSheetChangeRequests.delete(pending.profileId);
    this.notifySheetChangeRequestsChanged();
    this.publishCharacterSheetInteractionState(pending.profileId);
    return { ok: true };
  }

  async playerSheet(playerId: string) {
    const socket = [...this.io.sockets.sockets.values()]
      .find((candidate) => candidate.data.playerId === playerId);
    if (!socket) return null;
    const sheet = await this.readEncounterSheet(socket.data.profileId);
    if (!sheet || sheet.filePath) return sheet;
    const filePath = resolve(tmpdir(), `bossbar-sheet-${randomUUID()}.pdf`);
    await writeFile(filePath, sheet.bytes, { flag: 'wx', mode: 0o600 });
    this.sheetPreviewFiles.add(filePath);
    return { ...sheet, filePath };
  }

  async resetPlayerPassword(playerId: string, password: string) {
    const sockets = [...this.io.sockets.sockets.values()]
      .filter((candidate) => candidate.data.playerId === playerId);
    const profileId = sockets[0]?.data.profileId;
    if (!profileId) throw new Error('O jogador não está conectado.');
    await this.resetProfilePassword(profileId, password);
  }

  async resetProfilePassword(profileId: string, password: string) {
    await this.options.playerProfileStore.resetPassword(profileId, password);
    for (const [token, session] of this.accountSessions) {
      if (session.profileId === profileId) this.accountSessions.delete(token);
    }
    for (const socket of this.io.sockets.sockets.values()) {
      if (socket.data.profileId === profileId) socket.disconnect(true);
    }
  }

  async deletePlayerProfile(playerId: string) {
    const socket = [...this.io.sockets.sockets.values()]
      .find((candidate) => candidate.data.playerId === playerId);
    if (!socket) throw new Error('O jogador não está conectado.');
    await this.deleteProfile(socket.data.profileId);
  }

  async deleteProfile(profileId: string) {
    this.activeSheetEditors.delete(profileId);
    if (this.pendingSheetChangeRequests.delete(profileId)) {
      this.notifySheetChangeRequestsChanged();
    }
    await this.options.playerProfileStore.deleteProfile(profileId);
    for (const [token, session] of this.accountSessions) {
      if (session.profileId === profileId) this.accountSessions.delete(token);
    }
    for (const socket of this.io.sockets.sockets.values()) {
      if (socket.data.profileId === profileId) socket.disconnect(true);
    }
  }

  approveJoinRequest(requestId: string) {
    const pending = this.pendingJoinRequests.get(requestId);
    if (!pending) return false;
    const socket = this.io.sockets.sockets.get(pending.socketId);
    this.pendingJoinRequests.delete(requestId);
    this.notifyJoinRequestsChanged();
    if (!socket?.connected) return false;
    if (!this.roster.canRegister(pending.clientId)) {
      socket.timeout(1_000).emit(
        'session:join-rejected',
        'A sala atingiu o limite de jogadores.',
        () => socket.disconnect(true),
      );
      return false;
    }
    this.completePlayerRegistration(socket);
    return true;
  }

  rejectJoinRequest(requestId: string) {
    const pending = this.pendingJoinRequests.get(requestId);
    if (!pending) return false;
    this.pendingJoinRequests.delete(requestId);
    this.notifyJoinRequestsChanged();
    const socket = this.io.sockets.sockets.get(pending.socketId);
    if (socket?.connected) {
      socket.timeout(1_000).emit(
        'session:join-rejected',
        'O mestre não autorizou sua entrada neste momento.',
        () => socket.disconnect(true),
      );
    }
    return true;
  }

  mediaUrl(id: string) {
    return buildSessionMediaUrl(id, this.credentials.playerToken);
  }

  publicInviteUrl(publicBaseUrl: string) {
    const normalizedBaseUrl = normalizePublicBaseUrl(publicBaseUrl);
    if (this.publicOrigin) this.allowedOrigins.delete(this.publicOrigin);
    this.publicOrigin = new URL(normalizedBaseUrl).origin;
    this.allowedOrigins.add(this.publicOrigin);
    return {
      baseUrl: normalizedBaseUrl,
      inviteUrl: buildJoinUrl(normalizedBaseUrl, this.credentials),
    };
  }

  clearPublicInviteUrl() {
    if (this.publicOrigin) this.allowedOrigins.delete(this.publicOrigin);
    this.publicOrigin = null;
  }

  updateSnapshot(snapshot: MultiplayerSessionSnapshot) {
    if (snapshot.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
      throw new Error('Não é possível publicar um snapshot incompatível.');
    }
    this.setCurrentSnapshot(snapshot);
    this.syncTurnParticipants();
    this.io.emit('session:snapshot', snapshot);
    if (!snapshot.battle.battleStarted) this.approveAllPendingJoinRequests();
  }

  publishBattleState(state: PublicBattlePresentationState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, battle: state });
    if (!state.battleStarted) {
      this.encounterTurnState = emptyEncounterTurnState();
    }
    this.syncTurnParticipants();
    this.io.emit('battle:state', state);
    if (!state.battleStarted) {
      this.publishTurnState();
    }
    if (!state.battleStarted) this.approveAllPendingJoinRequests();
  }

  publishHealthEffect(effect: HealthEffect) {
    this.io.emit('battle:health-effect', effect);
  }

  publishCombatImpact(impact: PublicCombatImpact) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, battle: impact.battle });
    this.syncTurnParticipants();
    this.io.emit('battle:impact', impact);
  }

  publishRollResult(result: EncounterRollResult) {
    const orderedResult = this.orderRollResults([result])[0] ?? result;
    const existingResults = (
      this.encounterTurnState.rollResults ?? []
    ).filter((candidate) => candidate.id !== result.id);
    const linkedExistingResults = linkEncounterRollCorrelation(
      existingResults,
      orderedResult.correlationId,
    );
    this.encounterTurnState = {
      ...this.encounterTurnState,
      rollResults: [
        ...linkedExistingResults,
        orderedResult,
      ],
      history: [
        ...(this.encounterTurnState.history ?? []),
        ...historyEntriesForRolls(
          [orderedResult],
          this.encounterTurnState.round,
          this.encounterTurnState.activeParticipantId,
          this.encounterTurnState.participants,
        ),
      ],
      revision: this.encounterTurnState.revision + 1,
    };
    this.options.onDiceRolled?.(orderedResult);
    this.publishTurnState();
  }

  publishHistoryEntry(entry: EncounterHistoryEntry) {
    if (this.encounterTurnState.history.some(({ id }) => id === entry.id)) return;
    this.encounterTurnState = {
      ...this.encounterTurnState,
      history: [...(this.encounterTurnState.history ?? []), entry],
      revision: this.encounterTurnState.revision + 1,
    };
    this.publishTurnState();
  }

  publishBackground(background: BackgroundState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, background });
    this.io.emit('presentation:background', background);
  }

  publishScene(scene: PublicScenePresentationState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, scene });
    this.io.emit('presentation:scene', scene);
  }

  publishSceneTransition(transition: SceneTransitionEvent) {
    this.io.emit('presentation:scene-transition', transition);
  }

  publishEncounterEffects(effects: EncounterEffectsState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, encounterEffects: effects });
    this.io.emit('presentation:effects', effects);
  }

  publishMusic(music: PublicMusicPresentationState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, music });
    this.io.emit('presentation:music', music);
  }

  publishMusicSeek(time: number) {
    this.io.emit('presentation:music-seek', time);
  }

  publishMusicFadeOut(duration: number) {
    this.io.emit('presentation:music-fade-out', duration);
  }

  publishMusicDuck(event: MusicDuckEvent) {
    this.io.emit('presentation:music-duck', event);
  }

  publishSoundboard(soundboard: PublicSoundboardPresentationState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, soundboard });
    this.io.emit('presentation:soundboard', soundboard);
  }

  publishSoundboardStop(stop: SoundboardStop) {
    this.io.emit('presentation:soundboard-stop', stop);
  }

  publishSoundEffect(effect: SoundEffect) {
    this.io.emit('presentation:sound-effect', effect);
  }

  publishEncounterEffect(effect: EncounterSoundEffect) {
    this.io.emit('presentation:encounter-effect', effect);
  }

  publishEncounterSoundLibrary(urls: string[]) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, encounterSoundUrls: urls });
    this.io.emit('presentation:encounter-sound-library', urls);
  }

  async close(
    reason: SessionClosedNotice['reason'] = 'host-ended-session',
  ) {
    if (this.closing) return;
    this.closing = true;
    clearInterval(this.probeInterval);
    for (const { timeout } of this.pendingProbes.values()) clearTimeout(timeout);
    this.pendingProbes.clear();
    await new Promise<void>((resolveFlush) => {
      if (this.io.sockets.sockets.size === 0) {
        resolveFlush();
        return;
      }
      this.io.timeout(2_000).emit(
        'session:closed',
        { reason },
        () => resolveFlush(),
      );
    });
    this.io.disconnectSockets(true);
    this.pendingJoinRequests.clear();
    this.pendingActionPointRequests.clear();
    this.pendingSheetChangeRequests.clear();
    this.activeSheetEditors.clear();
    this.accountSessions.clear();
    this.savedEncounterPlayers.clear();
    this.savedSessionMembers.clear();
    this.awaitingSavedPlayers.clear();
    this.seenEncounterPlayers.clear();
    this.kickedProfiles.clear();
    this.deferredDisconnectedTurn = null;
    this.playerCombatStates.clear();
    this.playerPrivacy.clear();
    this.playerActions.clear();
    this.unarmedStrikeEnabled.clear();
    this.actionPointActionIds.clear();
    this.pendingPlayerDamages.clear();
    this.pendingDirectPlayerDamages.clear();
    this.encounterRollSequence = 0;
    this.encounterTurnState = emptyEncounterTurnState();
    // Close Engine.IO transports as well as HTTP requests. Waiting for HTTP
    // first can deadlock on pending polls or an unfinished WebSocket upgrade.
    await Promise.all([this.io.close(), this.fastify.close()]);
    await Promise.all([...this.sheetPreviewFiles].map((file) => rm(file, { force: true }).catch(() => undefined)));
    this.sheetPreviewFiles.clear();
  }

  private createPlayerEncounterState(clientId: string, profileId: string) {
    const validation = this.profileForEncounter(profileId)?.sheet.validation;
    if (
      !validation?.supported ||
      validation.issues.some(({ severity }) => severity === 'error')
    ) return null;
    const summary = validation.summary;
    const reflex = Array.isArray(summary?.skills)
      ? summary.skills.find(({ id }) => id === '270')?.total
      : null;
    if (
      !summary || summary.currentHealth === null || summary.maxHealth === null ||
      summary.currentMana === null || summary.maxMana === null || reflex === null || reflex === undefined
    ) return null;
    const state = {
      clientId,
      characterName: summary.characterName || 'Personagem',
      currentHealth: Math.min(summary.maxHealth, summary.currentHealth),
      maxHealth: Math.max(1, summary.maxHealth),
      temporaryHealth: Math.max(0, Math.floor(summary.temporaryHealth ?? 0)),
      currentMana: Math.max(0, Math.min(summary.maxMana, summary.currentMana)),
      maxMana: Math.max(0, summary.maxMana),
      defenseMelee: Math.max(0, summary.defenses?.melee ?? summary.defense ?? 0),
      defenseRanged: Math.max(0, summary.defenses?.ranged ?? summary.defense ?? 0),
      reflex,
      statuses: [],
      actionPoints: 1,
      heroPoints: 1,
      actionPointAvailable: true,
      heroPointAvailable: true,
      unarmedStrikeEnabled: true,
      temporaryDefenseBonus: 0,
      protectionExpiresAtRound: null,
      criticalImpactId: null,
      criticalThreatId: null,
      stabilized: false,
      dead: false,
      sheetInteractionState: this.characterSheetInteractionState(profileId),
      revision: 0,
    } satisfies PlayerEncounterState;
    return state.currentHealth <= 0
      ? applyPlayerDamage(
        { ...state, currentHealth: 1 },
        1 - state.currentHealth,
      ).state
      : state;
  }

  private attachSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.registerConnectedSocket(socket);
    });
  }

  private registerConnectedSocket(socket: MultiplayerPlayerSocket) {
    socket.on('disconnect', () => {
      if (!this.closing && !this.kickedProfiles.has(socket.data.profileId)) {
        const checkpoint = this.captureEncounter();
        for (const saved of checkpoint.players) if (!this.kickedProfiles.has(saved.profileId)) this.savedEncounterPlayers.set(saved.profileId, saved);
        for (const member of checkpoint.members ?? []) if (!this.kickedProfiles.has(member.profileId)) this.savedSessionMembers.set(member.profileId, member);
      }
      const pendingProbe = this.pendingProbes.get(socket.id);
      if (pendingProbe) clearTimeout(pendingProbe.timeout);
      this.pendingProbes.delete(socket.id);
      const pendingRequest = [...this.pendingJoinRequests.entries()]
        .find(([, pending]) => pending.socketId === socket.id);
      if (pendingRequest) {
        this.pendingJoinRequests.delete(pendingRequest[0]);
        this.notifyJoinRequestsChanged();
      }
      let removedActionPointRequest = false;
      for (const [requestId, pending] of this.pendingActionPointRequests) {
        if (pending.socketId !== socket.id) continue;
        this.pendingActionPointRequests.delete(requestId);
        removedActionPointRequest = true;
      }
      if (removedActionPointRequest) this.notifyActionPointRequestsChanged();
      if (this.activeSheetEditors.get(socket.data.profileId) === socket.id) {
        this.activeSheetEditors.delete(socket.data.profileId);
        this.publishCharacterSheetInteractionState(socket.data.profileId);
      }
      if (this.roster.unregisterSocket(socket.id)) {
        this.notifyPresenceChanged();
        this.syncTurnParticipants();
        this.publishPlayerHuds();
        this.publishTurnState();
      }
    });

    const replacingConnectedClient = this.roster.members().some(
      ({ clientId }) => clientId === socket.data.clientId,
    );
    if (
      this.currentSnapshot.battle.battleStarted &&
      !socket.data.isHost &&
      !replacingConnectedClient &&
      (!this.savedSessionMembers.has(socket.data.profileId) || this.kickedProfiles.has(socket.data.profileId))
    ) {
      this.queueJoinRequest(socket);
      return;
    }
    this.completePlayerRegistration(socket);
  }

  private completePlayerRegistration(socket: MultiplayerPlayerSocket) {
    const savedPlayer = this.savedEncounterPlayers.get(socket.data.profileId);
    const savedMember = this.savedSessionMembers.get(socket.data.profileId);
    const result = this.roster.register({
      playerId: savedPlayer?.playerId ?? savedMember?.playerId,
      clientId: socket.data.clientId,
      profileId: socket.data.profileId,
      name: socket.data.playerName,
      socketId: socket.id,
      isHost: socket.data.isHost,
      now: socket.data.connectedAt,
      hasCharacterSheet: Boolean(
        this.profileForEncounter(socket.data.profileId)?.sheet.hasSheet
      ),
    });
    if (!result.accepted) {
      const message = result.reason === 'name-in-use'
        ? 'Este usuário já está conectado nesta sala.'
        : `Esta sessão já atingiu o limite de ${this.roster.maxPlayers} jogadores.`;
      const fallbackDisconnect = setTimeout(() => socket.disconnect(true), 1_000);
      fallbackDisconnect.unref();
      socket.emit('session:join-rejected', message, () => {
        clearTimeout(fallbackDisconnect);
        socket.disconnect(true);
      });
      return;
    }
    socket.data.playerId = result.player.id;
    if (savedMember) { savedMember.clientId = socket.data.clientId; savedMember.playerId = result.player.id; }
    this.kickedProfiles.delete(socket.data.profileId);
    this.awaitingSavedPlayers.delete(socket.data.profileId);
    this.seenEncounterPlayers.add(socket.data.profileId);
    socket.on('session:clock', (acknowledge) => {
      if (typeof acknowledge === 'function') acknowledge(Date.now());
    });
    socket.on('presentation:cutscene-ready', (id, duration) => {
      const cutscene = this.currentSnapshot.scene.cutscenePlayback;
      if (typeof id !== 'string' || id !== cutscene?.id || cutscene.stage !== 'loading') return;
      if (duration !== null && (!Number.isFinite(duration) || duration <= 0 || duration > 3600)) return;
      this.options.onCutsceneReady?.(result.player.id, id, duration);
    });
    if (savedPlayer && savedPlayer.clientId !== socket.data.clientId) {
      this.playerCombatStates.delete(savedPlayer.clientId);
      savedPlayer.clientId = socket.data.clientId;
      savedPlayer.state = { ...savedPlayer.state, clientId: socket.data.clientId };
      this.playerCombatStates.set(socket.data.clientId, savedPlayer.state);
    }
    if (
      result.replacedSocketId &&
      this.activeSheetEditors.get(socket.data.profileId) === result.replacedSocketId
    ) {
      // A reload preserves the client id and the draft in localStorage. Release
      // only the transient editor ownership before the replacement socket is
      // initialized, otherwise it receives a stale, permanently locked HUD.
      this.activeSheetEditors.delete(socket.data.profileId);
    }
    const alreadyInTurnOrder = this.encounterTurnState.participants.some(
      ({ kind, sourceId }) => kind === 'player' && sourceId === result.player.id,
    );
    if (
      !alreadyInTurnOrder &&
      this.encounterTurnState.started &&
      this.encounterTurnState.activeParticipantId
    ) {
      this.deferredInitiativeActors.set(
        `player:${result.player.id}`,
        {
          blockedBy: this.encounterTurnState.activeParticipantId,
          eligibleRound: this.encounterTurnState.round + 1,
        },
      );
    }
    if (result.replacedSocketId && result.replacedSocketId !== socket.id) {
      this.io.sockets.sockets.get(result.replacedSocketId)?.disconnect(true);
    }
    if (typeof this.options.initialSnapshot === 'function') {
      const liveMedia = this.options.initialSnapshot({
        roomCode: this.credentials.roomCode,
        mediaUrl: (id) => this.mediaUrl(id),
      });
      // A new connection must never roll back the battle or phase to an
      // initializer's state. Refresh only playback clocks for the same media.
      this.setCurrentSnapshot({ ...this.currentSnapshot,
        music: liveMedia.music.currentTrackId === this.currentSnapshot.music.currentTrackId
          ? { ...this.currentSnapshot.music, currentTime: liveMedia.music.currentTime, synchronizedAt: liveMedia.music.synchronizedAt }
          : this.currentSnapshot.music,
        background: liveMedia.background.url === this.currentSnapshot.background.url
          ? { ...this.currentSnapshot.background, resumeTime: liveMedia.background.resumeTime }
          : this.currentSnapshot.background,
      });
    }
    socket.emit('session:snapshot', this.currentSnapshot);
    const existingPlayerState = this.playerCombatStates.get(socket.data.clientId);
    const interactionState = this.characterSheetInteractionState(socket.data.profileId);
    const playerState = existingPlayerState
      ? {
          ...existingPlayerState,
          sheetInteractionState: interactionState,
          revision: existingPlayerState.sheetInteractionState === interactionState
            ? existingPlayerState.revision
            : existingPlayerState.revision + 1,
        }
      : this.createPlayerEncounterState(socket.data.clientId, socket.data.profileId);
    if (playerState) {
      this.playerCombatStates.set(socket.data.clientId, playerState);
      socket.emit('player:state', playerState);
    }
    socket.on('player:set-sheet-editor-open', (open, acknowledge) => {
      if (typeof open !== 'boolean') {
        acknowledge({ ok: false, error: 'Estado do editor de ficha inválido.' });
        return;
      }
      acknowledge(this.setCharacterSheetEditorOpen(
        socket.data.profileId,
        socket.id,
        open,
      ));
    });
    socket.on('player:set-private', (privateMode, acknowledge) => {
      if (typeof privateMode !== 'boolean') {
        acknowledge({ ok: false, error: 'Preferência de privacidade inválida.' });
        return;
      }
      this.playerPrivacy.set(socket.data.profileId, privateMode);
      this.publishPlayerHuds();
      acknowledge({ ok: true });
    });
    socket.on('player:use-action', (action, acknowledge) => {
      if (!['free', 'movement', 'standard'].includes(action)) {
        acknowledge({ ok: false, error: 'Tipo de ação inválido.' });
        return;
      }
      const sheetLockError = this.characterSheetLockError(socket.data.profileId);
      if (sheetLockError) {
        acknowledge({ ok: false, error: sheetLockError });
        return;
      }
      const active = this.encounterTurnState.participants.find(
        ({ id }) => id === this.encounterTurnState.activeParticipantId,
      );
      if (
        !active ||
        active.kind !== 'player' ||
        active.sourceId !== socket.data.playerId
      ) {
        acknowledge({
          ok: false,
          error: 'Você só pode usar ações durante o próprio turno.',
        });
        return;
      }
      if (this.lateInitiativeQueue.includes(active.id)) {
        acknowledge({
          ok: false,
          error: 'Neste turno de entrada, role apenas a Iniciativa.',
        });
        return;
      }
      const combatState = this.playerCombatStates.get(socket.data.clientId);
      if (combatState && isPlayerIncapacitated(combatState)) {
        acknowledge({
          ok: false,
          error: 'Um personagem inconsciente não pode realizar ações ou reações.',
        });
        return;
      }
      const current = this.playerActions.get(socket.data.profileId) ?? {
        free: true,
        movement: true,
        standard: true,
      };
      const key = action as PlayerActionKind;
      if (!current[key]) {
        acknowledge({ ok: false, error: 'Esta ação já foi usada.' });
        return;
      }
      this.playerActions.set(socket.data.profileId, {
        ...current,
        [key]: false,
      });
      this.publishPlayerHuds();
      acknowledge({ ok: true });
    });
    socket.on('encounter:end-own-turn', (acknowledge) => {
      const sheetLockError = this.characterSheetLockError(socket.data.profileId);
      if (sheetLockError) {
        acknowledge({ ok: false, error: sheetLockError });
        return;
      }
      const active = this.encounterTurnState.participants.find(
        ({ id }) => id === this.encounterTurnState.activeParticipantId,
      );
      if (
        !active ||
        active.kind !== 'player' ||
        active.sourceId !== socket.data.playerId
      ) {
        acknowledge({
          ok: false,
          error: 'Somente o participante ativo pode encerrar o próprio turno.',
        });
        return;
      }
      if (this.lateInitiativeQueue.includes(active.id)) {
        acknowledge({
          ok: false,
          error: 'Role a Iniciativa antes de continuar o encontro.',
        });
        return;
      }
      const result = this.advanceTurnAsHost(active.id);
      acknowledge({
        ...result,
        state: result.state ? this.getTurnState(socket.data.clientId) : undefined,
      });
    });
    socket.on('encounter:roll-initiative', (extremeAdvantage, acknowledge) => {
      const result = this.rollInitiativeAsPlayer(
        socket.data.playerId,
        extremeAdvantage === true,
      );
      acknowledge({
        ...result,
        state: result.state ? this.getTurnState(socket.data.clientId) : undefined,
      });
    });
    socket.on('encounter:combat-action', async (request, acknowledge) => {
      acknowledge(await this.requestPlayerCombatAction(socket, request));
    });
    this.syncTurnParticipants();
    this.publishPlayerHuds();
    this.notifyPresenceChanged();
    this.publishTurnState();
  }

  private queueJoinRequest(socket: MultiplayerPlayerSocket) {
    const existing = [...this.pendingJoinRequests.entries()]
      .find(([, pending]) => pending.clientId === socket.data.clientId);
    if (existing) {
      this.pendingJoinRequests.delete(existing[0]);
      const previousSocket = this.io.sockets.sockets.get(existing[1].socketId);
      if (previousSocket && previousSocket.id !== socket.id) {
        previousSocket.disconnect(true);
      }
    }
    const request: MultiplayerJoinRequest = {
      id: randomUUID(),
      name: socket.data.playerName,
      requestedAt: Date.now(),
    };
    this.pendingJoinRequests.set(request.id, {
      request,
      socketId: socket.id,
      clientId: socket.data.clientId,
    });
    socket.emit('session:join-pending', request);
    this.notifyJoinRequestsChanged();
  }

  private approveAllPendingJoinRequests() {
    for (const requestId of [...this.pendingJoinRequests.keys()]) {
      this.approveJoinRequest(requestId);
    }
  }

  private probeLatencies() {
    if (this.closing) return;
    const timeoutMs = Math.max(
      250,
      this.options.latencyProbeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    );
    for (const socket of this.io.sockets.sockets.values()) {
      if (!socket.data.playerId) continue;
      if (this.pendingProbes.has(socket.id)) continue;
      const sentAt = Date.now();
      const id = randomUUID();
      const timeout = setTimeout(() => {
        this.pendingProbes.delete(socket.id);
        if (this.roster.recordMissedProbe(socket.id)) {
          this.notifyPresenceChanged();
        }
      }, timeoutMs);
      timeout.unref?.();
      this.pendingProbes.set(socket.id, { id, timeout });
      socket.emit(
        'session:latency-probe',
        { id, sentAt },
        (acknowledgement: LatencyProbeAcknowledgement) => {
          const pending = this.pendingProbes.get(socket.id);
          if (!pending || pending.id !== id || acknowledgement?.id !== id) return;
          clearTimeout(pending.timeout);
          this.pendingProbes.delete(socket.id);
          if (this.roster.recordLatency(socket.id, Date.now() - sentAt)) {
            this.notifyPresenceChanged();
          }
        },
      );
    }
  }

  private notifyPresenceChanged() {
    const presence = this.getPresence();
    this.io.emit('session:occupancy', {
      connectedPlayers: presence.connectedPlayers,
      maxPlayers: presence.maxPlayers,
    });
    this.options.onPresenceChanged?.(presence);
  }

  private notifyJoinRequestsChanged() {
    this.options.onJoinRequestsChanged?.(this.getPendingJoinRequests());
  }

  private notifyActionPointRequestsChanged() {
    this.options.onActionPointRequestsChanged?.(
      this.getPendingActionPointRequests(),
    );
  }

  private createPlayerHuds(
    viewerClientId: string | null,
    revealAll = false,
  ): PlayerHudState[] {
    const connectedProfiles = new Set(this.roster.members().map(({ profileId }) => profileId));
    return this.encounterMembers().filter(({ profileId }) => profileId && (connectedProfiles.has(profileId) || this.seenEncounterPlayers.has(profileId))).map(({ clientId, profileId, player }) => {
      const profile = [...this.io.sockets.sockets.values()]
        .find((socket) => socket.data.clientId === clientId);
      const resolvedProfileId = profileId ?? profile?.data.profileId ?? null;
      const storedProfile = resolvedProfileId
        ? this.profileForEncounter(resolvedProfileId)
        : null;
      const summary = storedProfile?.sheet.validation?.summary ?? null;
      const encounter = this.playerCombatStates.get(clientId) ?? null;
      const isSelf = clientId === viewerClientId;
      const privateMode = this.playerPrivacy.get(resolvedProfileId ?? '') ?? true;
      const storedActions = resolvedProfileId
        ? this.playerActions.get(resolvedProfileId) ?? {
          free: true,
          movement: true,
          standard: true,
        }
        : {
          free: true,
          movement: true,
          standard: true,
        };
      const sheetInteractionState = profile && isSelf
        ? this.characterSheetInteractionState(profile.data.profileId)
        : 'idle';
      const actions = sheetInteractionState !== 'idle' ||
        (encounter ? isPlayerIncapacitated(encounter) : false)
        ? { free: false, movement: false, standard: false }
        : storedActions;
      const redacted = !revealAll && privateMode && !isSelf;
      const actionPoints = normalizeActionPointCount(
        encounter?.actionPoints,
        encounter?.actionPointAvailable,
      );
      const heroPoints = normalizeHeroPointCount(
        encounter?.heroPoints,
        encounter?.heroPointAvailable,
      );
      const effectiveDefenses = encounter
        ? effectivePlayerDefenses(encounter)
        : null;
      const pendingDamage = profile && (isSelf || revealAll)
        ? [...this.pendingPlayerDamages.values()].find(
          ({ profileId }) => profileId === profile.data.profileId,
        ) ?? null
        : null;
      return {
        id: player.id,
        faction: 'players',
        characterName:
          encounter?.characterName || summary?.characterName || player.name,
        portraitUrl: storedProfile?.portrait.hasPortrait
          ? `${revealAll ? new URL(this.info.invite.localUrl).origin : ''}/api/player/portrait/${encodeURIComponent(storedProfile.id)}?access=${encodeURIComponent(this.credentials.playerToken)}&v=${storedProfile.portrait.uploadedAt ?? 0}`
          : null,
        isSelf,
        privateMode,
        redacted,
        currentHealth: redacted ? null : encounter?.currentHealth ?? summary?.currentHealth ?? null,
        maxHealth: redacted ? null : encounter?.maxHealth ?? summary?.maxHealth ?? null,
        temporaryHealth: redacted
          ? null
          : encounter?.temporaryHealth ?? summary?.temporaryHealth ?? 0,
        currentMana: redacted ? null : encounter?.currentMana ?? summary?.currentMana ?? null,
        maxMana: redacted ? null : encounter?.maxMana ?? summary?.maxMana ?? null,
        defenseMelee: redacted
          ? null
          : effectiveDefenses?.melee ?? summary?.defenses.melee ?? summary?.defense ?? null,
        defenseRanged: redacted
          ? null
          : effectiveDefenses?.ranged ?? summary?.defenses.ranged ?? summary?.defense ?? null,
        statuses: encounter?.statuses ?? [],
        actionPoints: redacted ? null : actionPoints,
        heroPoints: redacted ? null : heroPoints,
        actionPointAvailable: redacted
          ? null
          : actionPoints > 0,
        heroPointAvailable: redacted
          ? null
          : heroPoints > 0,
        unarmedStrikeEnabled: profile
          ? this.unarmedStrikeEnabled.get(profile.data.profileId) ?? true
          : encounter?.unarmedStrikeEnabled ?? true,
        temporaryDefenseBonus: redacted
          ? null
          : encounter?.temporaryDefenseBonus ?? 0,
        criticalImpactId: encounter?.criticalImpactId ?? null,
        criticalThreatId: encounter?.criticalThreatId ?? null,
        stabilized: encounter?.stabilized ?? false,
        dead: encounter?.dead ?? false,
        deathThreshold: redacted || !encounter
          ? null
          : playerDeathThreshold(encounter.maxHealth),
        summary: redacted ? null : summary,
        actions,
        pendingDamage: pendingDamage
          ? {
            id: pendingDamage.id,
            attackerKind: 'player',
            attackerParticipantId: `player:${pendingDamage.playerId}`,
            label: pendingDamage.attackName,
            targetName: pendingDamage.targetBossName,
            critical: pendingDamage.critical,
            createdAt: pendingDamage.createdAt,
          }
          : null,
        sheetInteractionState,
        disconnected: !connectedProfiles.has(profileId),
        revision: encounter?.revision ?? 0,
      };
    });
  }

  private publishPlayerHuds() {
    for (const socket of this.io.sockets.sockets.values()) {
      if (!socket.data.playerId) continue;
      socket.emit('players:hud-state', this.createPlayerHuds(socket.data.clientId));
    }
    this.options.onPlayerHudsChanged?.(this.createPlayerHuds(null, true));
  }

  private syncTurnParticipants() {
    if (!this.currentSnapshot.battle.battleStarted) {
      this.deferredInitiativeActors.clear();
      this.lateInitiativeQueue = [];
      this.interruptedTurnParticipantId = null;
      this.encounterTurnState = emptyEncounterTurnState();
      return;
    }
    const previousActiveId = this.encounterTurnState.activeParticipantId;
    if (this.encounterTurnState.startedAt === null) {
      this.encounterTurnState = {
        ...this.encounterTurnState,
        startedAt: Date.now(),
      };
    }
    const members = this.encounterMembers();
    const actors: InitiativeActor[] = [
      ...this.currentSnapshot.battle.bosses
        .filter(({ currentHealth }) => currentHealth > 0)
        .map((boss) => ({
          id: `boss:${boss.id}`,
          kind: 'boss' as const,
          sourceId: boss.id,
          name: boss.bossName,
          faction: 'bosses' as const,
          initiativeModifier: boss.initiative,
          eligibleRound: this.encounterTurnState.started
            ? this.encounterTurnState.round + 1
            : 1,
        })),
      ...members.flatMap(({ clientId, profileId, player }) => {
        const encounter = this.playerCombatStates.get(clientId);
        // A connected account without a valid character sheet is a spectator,
        // not an encounter participant. Including it here would make round zero
        // wait for an initiative roll that the client cannot perform.
        if (!encounter || encounter.dead) return [];
        const socket = [...this.io.sockets.sockets.values()]
          .find((candidate) => candidate.data.clientId === clientId);
        const summary = (profileId ?? socket?.data.profileId)
          ? this.profileForEncounter(profileId ?? socket?.data.profileId ?? '')?.sheet.validation?.summary
          : null;
        const initiative = summary?.skills.find(
          ({ id, name }) => id === '130' || name === 'Iniciativa',
        )?.total ?? 0;
        return [{
          id: `player:${player.id}`,
          kind: 'player' as const,
          sourceId: player.id,
          name:
            this.playerCombatStates.get(clientId)?.characterName ||
            summary?.characterName ||
            player.name,
          faction: 'players' as const,
          initiativeModifier: initiative,
          eligibleRound: this.deferredInitiativeActors.get(
            `player:${player.id}`,
          )?.eligibleRound ?? (this.encounterTurnState.started
            ? this.encounterTurnState.round + 1
            : 1),
        }];
      }),
    ];
    const readyActors = actors.filter((actor) => {
      const deferred = this.deferredInitiativeActors.get(actor.id);
      if (!deferred) return true;
      if (deferred.blockedBy === this.encounterTurnState.activeParticipantId) {
        return false;
      }
      this.deferredInitiativeActors.delete(actor.id);
      return true;
    });
    const actorIds = new Set(readyActors.map(({ id }) => id));
    const previousParticipants = new Map(
      this.encounterTurnState.participants.map((participant) => [
        participant.id,
        participant,
      ]),
    );
    let participants: EncounterTurnParticipant[];
    if (!this.encounterTurnState.started) {
      participants = prepareManualInitiative(
        readyActors,
        this.encounterTurnState.participants,
      );
    } else {
      participants = readyActors.map((actor) => {
        const existing = previousParticipants.get(actor.id);
        if (existing) {
          return {
            ...existing,
            name: actor.name,
            initiativeModifier: actor.initiativeModifier,
            initiativeTotal: existing.initiativeRoll + actor.initiativeModifier,
          };
        }
        return {
          ...actor,
          initiativeRoll: 0,
          initiativeTotal: 0,
          initiativeRolled: false,
          isSelf: false,
        };
      }).sort((left, right) =>
        right.initiativeTotal - left.initiativeTotal ||
        right.initiativeModifier - left.initiativeModifier ||
        left.id.localeCompare(right.id)
      );
    }
    const activeStillExists = this.encounterTurnState.activeParticipantId
      ? actorIds.has(this.encounterTurnState.activeParticipantId)
      : true;
    const nextActiveParticipantId = activeStillExists
      ? this.encounterTurnState.activeParticipantId
      : participants.find(
        ({ eligibleRound }) => eligibleRound <= this.encounterTurnState.round,
      )?.id ?? null;
    const participantsUnchanged =
      participants.length === this.encounterTurnState.participants.length &&
      participants.every((participant, index) => {
        const previous = this.encounterTurnState.participants[index];
        return previous &&
          participant.id === previous.id &&
          participant.name === previous.name &&
          participant.initiativeModifier === previous.initiativeModifier &&
          participant.initiativeRoll === previous.initiativeRoll &&
          participant.initiativeTotal === previous.initiativeTotal &&
          participant.eligibleRound === previous.eligibleRound;
      });
    if (
      participantsUnchanged &&
      nextActiveParticipantId === this.encounterTurnState.activeParticipantId
    ) return;
    const addedRollResults: EncounterRollResult[] = [];
    const orderedAddedRollResults = this.orderRollResults(addedRollResults);
    this.encounterTurnState = {
      ...this.encounterTurnState,
      participants,
      activeParticipantId: nextActiveParticipantId,
      initiativeReady: this.encounterTurnState.started
        ? this.encounterTurnState.initiativeReady
        : participants.length > 0 &&
          participants.every(({ initiativeRolled }) => initiativeRolled !== false),
      rollResults: [
        ...(this.encounterTurnState.rollResults ?? []),
        ...orderedAddedRollResults,
      ],
      history: [
        ...(this.encounterTurnState.history ?? []),
        ...historyEntriesForRolls(
          orderedAddedRollResults,
          this.encounterTurnState.round,
          nextActiveParticipantId,
          participants,
        ),
      ],
      revision: this.encounterTurnState.revision + 1,
    };
    this.publishTurnState(previousActiveId);
    if (orderedAddedRollResults.length > 0) {
      orderedAddedRollResults.forEach((result) => this.options.onDiceRolled?.(result));
    }
  }

  private createInitiativeRollResult(
    participant: EncounterTurnParticipant,
    retainedByParticipantId: string | null,
  ): EncounterRollResult {
    return {
      id: `initiative:${participant.id}:${participant.initiativeRoll}:${Date.now()}`,
      participantId: participant.id,
      label: 'Iniciativa',
      expression: `1d20 ${participant.initiativeModifier >= 0 ? '+' : '-'} ${Math.abs(participant.initiativeModifier)}`,
      rolls: [participant.initiativeRoll],
      modifier: participant.initiativeModifier,
      total: participant.initiativeTotal,
      outcome: 'neutral',
      category: 'initiative',
      createdAt: Date.now(),
      retainedByParticipantId,
    };
  }

  private processBleedingAtTurnStart(
    participant: EncounterTurnParticipant,
    socket: MultiplayerPlayerSocket,
  ) {
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (
      !state ||
      state.dead ||
      state.currentHealth > 0 ||
      state.stabilized ||
      !state.statuses.some(({ statusId }) => statusId === 'sangrando')
    ) return;

    const summary = this.profileForEncounter(
      socket.data.profileId,
    )?.sheet.validation?.summary;
    const constitution = Math.trunc(summary?.attributes.con ?? 0);
    const die = this.randomInteger(1, 21);
    const check = resolveD20Check(
      die,
      constitution,
      BLEEDING_CONSTITUTION_DC,
    );
    const results: EncounterRollResult[] = [{
      id: `bleeding-save:${participant.sourceId}:${randomUUID()}`,
      participantId: participant.id,
      label: `Sangramento — Constituição CD ${BLEEDING_CONSTITUTION_DC}`,
      expression: `1d20 ${constitution >= 0 ? '+' : '-'} ${Math.abs(constitution)}`,
      rolls: [die],
      modifier: constitution,
      total: check.total,
      outcome: check.success ? 'success' : 'failure',
      category: 'status',
      createdAt: Date.now(),
      retainedByParticipantId: participant.id,
    }];

    let nextState = state;
    if (check.success) {
      nextState = stabilizePlayer(state).state;
    } else {
      const bleedingDamage = this.randomInteger(1, 7);
      const transition = applyPlayerDamage(state, bleedingDamage);
      nextState = transition.state;
      results.push({
        id: `bleeding-damage:${participant.sourceId}:${randomUUID()}`,
        participantId: participant.id,
        label: 'Sangramento',
        expression: '1d6',
        rolls: [bleedingDamage],
        modifier: 0,
        total: bleedingDamage,
        outcome: 'failure',
        category: 'status',
        createdAt: Date.now(),
        retainedByParticipantId: participant.id,
      });
    }

    this.playerCombatStates.set(socket.data.clientId, nextState);
    this.publishPlayerState(socket.data.clientId);
    const orderedResults = this.orderRollResults(results);
    this.encounterTurnState = {
      ...this.encounterTurnState,
      rollResults: [
        ...(this.encounterTurnState.rollResults ?? []),
        ...orderedResults,
      ],
      history: [
        ...(this.encounterTurnState.history ?? []),
        ...historyEntriesForRolls(
          orderedResults,
          this.encounterTurnState.round,
          participant.id,
          this.encounterTurnState.participants,
        ),
        ...(!check.success
          ? [historyEntryForVitalChange({
            id: `history:bleeding:${participant.sourceId}:${randomUUID()}`,
            kind: 'damage',
            round: this.encounterTurnState.round,
            activeParticipantId: participant.id,
            actorParticipantId: participant.id,
            actorName: 'Sangramento',
            targetParticipantId: participant.id,
            targetName: nextState.characterName,
            amount:
              state.currentHealth + state.temporaryHealth -
              nextState.currentHealth - nextState.temporaryHealth,
          })]
          : []),
      ],
      revision: this.encounterTurnState.revision + 1,
    };
    orderedResults.forEach((result) => this.options.onDiceRolled?.(result));
    this.publishPlayerHuds();
  }

  private publishTurnState(previousActiveId?: string | null) {
    const activeId = this.encounterTurnState.activeParticipantId;
    if (this.deferredDisconnectedTurn === activeId && !this.getConnectionPause()) {
      previousActiveId = null;
      this.deferredDisconnectedTurn = null;
    }
    if (
      previousActiveId !== undefined &&
      activeId &&
      activeId !== previousActiveId
    ) {
      if (this.getConnectionPause()) this.deferredDisconnectedTurn = activeId;
      const activePlayer = this.encounterTurnState.participants.find(
        ({ id, kind }) => id === activeId && kind === 'player',
      );
      if (activePlayer && !this.getConnectionPause()) {
        const initiativeOnly = this.lateInitiativeQueue.includes(activePlayer.id);
        const socket = [...this.io.sockets.sockets.values()].find(
          (candidate) => candidate.data.playerId === activePlayer.sourceId,
        );
        if (socket) {
          if (!initiativeOnly) this.processBleedingAtTurnStart(activePlayer, socket);
          const combatState = this.playerCombatStates.get(socket.data.clientId);
          if (
            !initiativeOnly &&
            combatState &&
            combatState.temporaryDefenseBonus > 0 &&
            combatState.protectionExpiresAtRound !== null &&
            this.encounterTurnState.round >= combatState.protectionExpiresAtRound
          ) {
            this.playerCombatStates.set(socket.data.clientId, {
              ...combatState,
              temporaryDefenseBonus: 0,
              protectionExpiresAtRound: null,
              revision: combatState.revision + 1,
            });
            this.publishPlayerState(socket.data.clientId);
          }
          this.playerActions.set(
            socket.data.profileId,
            initiativeOnly || (combatState && isPlayerIncapacitated(combatState))
              ? { free: false, movement: false, standard: false }
              : { free: true, movement: true, standard: true },
          );
          this.actionPointActionIds.delete(socket.data.profileId);
          this.publishPlayerHuds();
        }
      }
    }
    for (const socket of this.io.sockets.sockets.values()) {
      if (!socket.data.playerId) continue;
      socket.emit(
        'encounter:turn-state',
        this.getTurnState(socket.data.clientId),
      );
    }
    this.options.onTurnStateChanged?.(this.getTurnState());
    if (previousActiveId !== undefined && activeId && activeId !== previousActiveId && !this.getConnectionPause()) {
      const participant = this.encounterTurnState.participants.find(
        ({ id }) => id === activeId,
      );
      if (participant) this.options.onTurnStarted?.({ ...participant });
    }
  }

  private randomInteger(
    minimumInclusive: number,
    maximumExclusive: number,
  ) {
    return this.options.randomInteger
      ? this.options.randomInteger(minimumInclusive, maximumExclusive)
      : randomInt(minimumInclusive, maximumExclusive);
  }

  private setCurrentSnapshot(snapshot: MultiplayerSessionSnapshot) {
    this.currentSnapshot = snapshot;
    this.snapshotReference.current = snapshot;
  }
}
