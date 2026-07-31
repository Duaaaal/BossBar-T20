import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
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
  MAX_CHARACTER_SHEET_BYTES,
  type PlayerAuthenticationRequest,
} from '../shared/character-sheet.ts';
import type {
  BackgroundState,
  EncounterEffectsState,
  EncounterSoundEffect,
  HealthEffect,
  SoundEffect,
  SoundboardStop,
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
import {
  advanceEncounterTurns,
  beginEncounterTurns,
  criticalDamageExpression,
  emptyEncounterTurnState,
  isAreaDamageRequest,
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
  rollInitiativeOrder,
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
import { applyStatusRules } from '../shared/status-rules.ts';
import { inspectCharacterSheetPdf } from './character-sheet-pdf.ts';
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
  onPlayerHudsChanged?: (huds: PlayerHudState[]) => void;
  onTurnStateChanged?: (state: EncounterTurnState) => void;
  onTurnStarted?: (participant: EncounterTurnParticipant) => void;
  onDiceRolled?: () => void;
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

  private readonly approvedClientIds = new Set<string>();

  private readonly probeInterval: ReturnType<typeof setInterval>;

  private readonly options: MultiplayerSessionServerOptions;

  private readonly snapshotReference: SnapshotReference;

  private readonly allowedOrigins: Set<string>;

  private readonly accountSessions: Map<string, AccountSession>;

  private readonly playerCombatStates = new Map<string, PlayerEncounterState>();

  private readonly playerPrivacy = new Map<string, boolean>();

  private readonly playerActions = new Map<string, PlayerHudActionState>();

  private readonly unarmedStrikeEnabled = new Map<string, boolean>();

  private readonly actionPointActionIds = new Map<string, Set<string>>();

  private readonly pendingPlayerAttacks = new Set<string>();

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
    });

    app.addContentTypeParser(
      'application/pdf',
      { parseAs: 'buffer', bodyLimit: MAX_CHARACTER_SHEET_BYTES },
      (_request, body, done) => done(null, body),
    );

    await app.register(helmet, {
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'none'"],
          connectSrc: ["'self'", 'ws:', 'wss:'],
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
      return { username: profile.username, sheet: profile.sheet, notes: profile.notes };
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
        const sheet = await options.playerProfileStore.readSheet(account.session.profileId);
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
      const sheet = await options.playerProfileStore.readSheet(authorization.profileId);
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
    app.delete('/api/player/sheet', {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    }, async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const account = authenticatedAccount(request.headers);
      if (!account) return reply.code(401).send({ ok: false, error: 'Entre novamente para continuar.' });
      try {
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
      const sheet = await options.playerProfileStore.readSheet(account.session.profileId);
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
    return this.roster.presence();
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
      this.encounterTurnState,
      viewerSourceId,
      hiddenParticipantIds,
      viewerClientId === null,
    );
  }

  advanceTurnAsHost(
    expectedParticipantId?: string | null,
  ): EncounterTurnActionResult {
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
    const previousActiveId = this.encounterTurnState.activeParticipantId;
    const nextState = this.encounterTurnState.started
      ? advanceEncounterTurns(this.encounterTurnState)
      : beginEncounterTurns(this.encounterTurnState);
    if (nextState === this.encounterTurnState) {
      return { ok: false, error: 'Nenhum participante pode iniciar o turno.' };
    }
    this.encounterRollSequence = 0;
    this.encounterTurnState = nextState;
    this.publishTurnState(previousActiveId);
    return { ok: true, state: this.getTurnState() };
  }

  rollInitiativeAsHost(
    participantId: string,
  ): EncounterTurnActionResult {
    const participant = this.encounterTurnState.participants.find(
      ({ id }) => id === participantId,
    );
    if (!participant || !['boss', 'npc'].includes(participant.kind)) {
      return { ok: false, error: 'Selecione um chefão ou NPC pendente.' };
    }
    return this.rollInitiativeParticipant(participantId);
  }

  private rollInitiativeAsPlayer(
    playerId: string,
  ): EncounterTurnActionResult {
    const participant = this.encounterTurnState.participants.find(
      ({ kind, sourceId }) => kind === 'player' && sourceId === playerId,
    );
    if (!participant) {
      return { ok: false, error: 'Seu personagem não participa desta iniciativa.' };
    }
    return this.rollInitiativeParticipant(participant.id);
  }

  private rollInitiativeParticipant(
    participantId: string,
  ): EncounterTurnActionResult {
    if (!this.currentSnapshot.battle.battleStarted) {
      return { ok: false, error: 'Inicie a batalha primeiro.' };
    }
    const rolled = rollManualInitiative(
      this.encounterTurnState,
      participantId,
      () => this.randomInteger(1, 21),
    );
    if (!rolled) {
      return { ok: false, error: 'Esta iniciativa já foi rolada ou não está disponível.' };
    }
    const rawResult = this.createInitiativeRollResult(rolled.participant, null);
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
    };
    this.options.onDiceRolled?.();
    this.publishTurnState();
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

  refreshCharacterSheet(clientId: string, hasCharacterSheet: boolean) {
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
    if (!isAreaDamageRequest(request)) throw new Error('Informe dano, CD e resultado de sucesso válidos.');
    const skippedPlayers: string[] = [];
    let appliedPlayers = 0;
    const rollResults: EncounterRollResult[] = [];
    const targets: Array<{
      socket: MultiplayerPlayerSocket;
      state: PlayerEncounterState;
    }> = [];
    const handledClients = new Set<string>();
    for (const socket of this.io.sockets.sockets.values()) {
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
        });
      }
      if (!impacted) continue;
      this.playerCombatStates.set(socket.data.clientId, currentState);
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
        revision: this.encounterTurnState.revision + 1,
      };
      orderedResults.forEach(() => this.options.onDiceRolled?.());
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
  ): Promise<PlayerTargetActionResult> {
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
    const impacts: NonNullable<PlayerTargetActionResult['impacts']> = [];
    const targets: Array<{
      socket: MultiplayerPlayerSocket;
      state: PlayerEncounterState;
    }> = [];
    let appliedPlayers = 0;
    for (const socket of this.io.sockets.sockets.values()) {
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
      socket: MultiplayerPlayerSocket;
      state: PlayerEncounterState;
      hits: Array<{ hit: boolean; critical: boolean }>;
    }> = [];
    let hasSuccessfulHit = false;
    let hasCriticalHit = false;
    let hasNormalHit = false;
    for (const target of targets) {
      const { socket, state } = target;
      const hitResults: Array<{ hit: boolean; critical: boolean }> = [];
      for (let hitIndex = 0; hitIndex < requestedHits; hitIndex += 1) {
        if (
          request.attackType &&
          request.attackBonus !== undefined &&
          request.attackerParticipantId
        ) {
          const check = resolveAttackCheck(
            request.attackBonus,
            request.attackType === 'melee'
              ? state.defenseMelee + state.temporaryDefenseBonus
              : state.defenseRanged + state.temporaryDefenseBonus,
            this.randomInteger(1, 21),
          );
          rollResults.push({
            id: `attack:${request.attackerParticipantId}:${randomUUID()}`,
            participantId: request.attackerParticipantId,
            label: request.attackType === 'melee' ? 'Luta' : 'Pontaria',
            expression: `1d20 ${check.attackBonus >= 0 ? '+' : '-'} ${Math.abs(check.attackBonus)}`,
            rolls: [check.die],
            modifier: check.attackBonus,
            total: check.total,
            outcome: check.success ? 'success' : 'failure',
            category: 'attack',
            createdAt: Date.now(),
            retainedByParticipantId: this.encounterTurnState.activeParticipantId,
            actionId: request.actionId,
            correlationId: request.correlationId,
            critical: check.success && check.die === 20,
            criticalMultiplier: check.success && check.die === 20
              ? 2
              : undefined,
          });
          hitResults.push({
            hit: check.success,
            critical: check.success && check.die === 20,
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
    if (hasSuccessfulHit && rollResults.length > 0) {
      await this.waitForCombatRollDelay();
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
        2,
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
      });
    }
    if (criticalDamageRoll && request.attackerParticipantId) {
      damageRollResults.push({
        id: `damage-critical:${request.attackerParticipantId}:${randomUUID()}`,
        participantId: request.attackerParticipantId,
        label: 'Dano crítico',
        expression: parsedDamage
          ? criticalDamageExpression(parsedDamage, 2)
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
        criticalMultiplier: 2,
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
          ...currentState,
          currentHealth: currentState.currentHealth - parcel,
          criticalImpactId: critical
            ? ++this.playerImpactSequence
            : currentState.criticalImpactId,
          revision: currentState.revision + 1,
        };
      });
      const targetWasHit = hits.some(({ hit }) => hit);
      const targetWasCritical = hits.some(({ critical }) => critical);
      if (targetWasHit) {
        this.playerCombatStates.set(socket.data.clientId, currentState);
        this.publishPlayerState(socket.data.clientId);
      }
      impacts.push({
        playerId: socket.data.playerId,
        hit: targetWasHit,
        appliedDamage: state.currentHealth - currentState.currentHealth,
        healthBefore: state.currentHealth,
        healthAfter: currentState.currentHealth,
        critical: targetWasCritical,
      });
      if (targetWasHit) appliedPlayers += 1;
    }
    if (damageRollResults.length > 0) this.appendRollResults(damageRollResults);
    if (appliedPlayers > 0) this.publishPlayerHuds();
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

  applyPlayerStatus(request: PlayerStatusRequest): PlayerTargetActionResult {
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
    for (const socket of this.io.sockets.sockets.values()) {
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
    const state = this.playerCombatStates.get(socket.data.clientId);
    if (!state) {
      return { ok: false, error: 'Vincule uma ficha válida antes de agir.' };
    }
    const actionId = request.actionId ?? randomUUID();
    const combatAction = { ...request, actionId } as PlayerCombatActionRequest;

    const usesActionPoint =
      (request.kind === 'resource' && request.resource === 'action-point') ||
      (request.kind !== 'resource' && request.resource?.kind === 'action-point');
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
        },
        socketId: socket.id,
        clientId: socket.data.clientId,
        profileId: socket.data.profileId,
        combatAction,
      };
      this.pendingActionPointRequests.set(id, pending);
      this.notifyActionPointRequestsChanged();
      this.emitResourceNotice(socket.data.clientId, {
        id: randomUUID(),
        tone: 'info',
        message: 'Ponto de Ação enviado para aprovação do mestre.',
      });
      return { ok: true, pendingApproval: true, requestId: id };
    }

    const usesHeroPoint = request.kind === 'resource'
      ? request.resource === 'hero-point'
      : request.resource?.kind === 'hero-point';
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
      !active ||
      active.kind !== 'player' ||
      active.sourceId !== socket.data.playerId
    ) {
      this.pendingActionPointRequests.delete(requestId);
      this.notifyActionPointRequestsChanged();
      return {
        ok: false,
        error: 'O turno mudou antes da aprovação deste Ponto de Ação.',
      };
    }
    this.pendingActionPointRequests.delete(requestId);
    this.notifyActionPointRequestsChanged();
    const result = await this.executePlayerCombatAction(
      socket,
      pending.combatAction,
      true,
    );
    this.emitResourceNotice(pending.clientId, {
      id: randomUUID(),
      tone: result.ok ? 'approved' : 'rejected',
      message: result.ok
        ? 'O mestre aprovou seu Ponto de Ação.'
        : result.error ?? 'O Ponto de Ação não pôde ser concluído.',
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
      id: randomUUID(),
      tone: 'rejected',
      message: 'O mestre não aprovou este Ponto de Ação.',
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
      message: 'O mestre concedeu a você um Ponto Heróico!',
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
      message: 'O mestre retirou seu Ponto Heróico.',
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
      message: actionPoints === 1
        ? 'O mestre concedeu a você um Ponto de Ação.'
        : `Você agora possui ${actionPoints} Pontos de Ação.`,
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
      message: actionPoints === 0
        ? 'O mestre retirou seu último Ponto de Ação.'
        : `Você agora possui ${actionPoints} Pontos de Ação.`,
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
    const summary = this.options.playerProfileStore.profileById(
      socket.data.profileId,
    )?.sheet.validation?.summary;
    if (request.kind === 'skill') {
      return summary?.skills.find(({ id }) => id === request.skillId)?.name ??
        'teste de perícia';
    }
    if (request.kind === 'attack') {
      if (request.attackSource?.kind === 'unarmed') return 'Punhos';
      const index = request.attackSource?.kind === 'sheet'
        ? request.attackSource.attackIndex
        : request.attackIndex;
      return index === undefined
        ? 'ataque'
        : summary?.attacks[index]?.name || 'ataque';
    }
    return request.ability;
  }

  private async executePlayerCombatAction(
    socket: MultiplayerPlayerSocket,
    request: PlayerCombatActionRequest,
    actionPointApproved = false,
  ): Promise<PlayerCombatActionResult> {
    const state = this.playerCombatStates.get(socket.data.clientId);
    const summary = this.options.playerProfileStore.profileById(
      socket.data.profileId,
    )?.sheet.validation?.summary;
    if (!state || !summary) {
      return { ok: false, error: 'A ficha do jogador não está disponível.' };
    }

    const actionPointUse =
      actionPointApproved ||
      (request.kind === 'resource' && request.resource === 'action-point');
    const heroPointUse =
      (request.kind === 'resource' && request.resource === 'hero-point') ||
      (request.kind !== 'resource' && request.resource?.kind === 'hero-point');
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
    const actionId = request.actionId ?? randomUUID();
    const correlationId = request.correlationId;
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
      const nextState: PlayerEncounterState = {
        ...state,
        currentHealth: Math.min(state.maxHealth, state.currentHealth + health.total),
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
        revision: state.revision + 1,
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
      const { baseDice, chosenDie, interventionDie, rollMode } = rollTestDice();
      const total = chosenDie + skill.total + interventionDie;
      this.consumePlayerResource(
        socket,
        state,
        resourceEffect,
        actionId,
      );
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
    if (this.pendingPlayerAttacks.has(socket.data.profileId)) {
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
    const critical = success && chosenDie >= criticalProfile.threat;
    const retainedBy = this.encounterTurnState.activeParticipantId;
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

    this.pendingPlayerAttacks.add(socket.data.profileId);
    try {
      this.appendRollResult(attackResult);
      await this.waitForCombatRollDelay();
    } finally {
      this.pendingPlayerAttacks.delete(socket.data.profileId);
    }

    // Damage dice are intentionally generated only after every validation,
    // approval, attack check and the presentation interval have completed.
    const damage = critical
      ? rollCriticalDamageFormulaDetailed(
        damageFormula,
        criticalProfile.multiplier,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      )
      : rollDamageFormulaDetailed(
        damageFormula,
        (minimum, maximum) => this.randomInteger(minimum, maximum),
      );
    const applied = this.options.applyBossDamage?.(
      request.targetBossId,
      damage.total,
      {
        critical,
        actionId,
        sourceParticipantId: `player:${socket.data.playerId}`,
        nonlethal: unarmed?.nonlethal === true,
      },
    );
    if (!applied?.ok) {
      return { ok: false, error: applied?.error ?? 'Não foi possível aplicar o dano.' };
    }
    this.commitPlayerAttackCosts(
      socket,
      state,
      actions,
      resourceEffect,
      actionId,
    );
    this.appendRollResult({
        id: `damage:${socket.data.playerId}:${randomUUID()}`,
        participantId: `player:${socket.data.playerId}`,
        label: `${critical ? 'Dano crítico' : 'Dano'}: ${attack.name || 'Ataque'}`,
        expression: critical
          ? criticalDamageExpression(damageFormula, criticalProfile.multiplier)
          : selectedDamageFormula,
        rolls: damage.rolls,
        modifier: damage.modifier,
        total: applied.appliedDamage,
        outcome: 'success',
        category: 'damage',
        createdAt: Date.now(),
        retainedByParticipantId: retainedBy,
        resourceEffect,
        actionId,
        correlationId,
        critical,
        criticalMultiplier: critical ? criticalProfile.multiplier : undefined,
      });
    return { ok: true };
  }

  private waitForCombatRollDelay() {
    const delayMs = Math.max(
      0,
      Math.min(10_000, Math.trunc(this.options.combatRollDelayMs ?? 1_000)),
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
      revision: this.encounterTurnState.revision + 1,
    };
    orderedResults.forEach(() => this.options.onDiceRolled?.());
    this.publishTurnState();
  }

  private orderRollResults(results: EncounterRollResult[]) {
    return results.map((result) => ({
      ...result,
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

  async playerSheet(playerId: string) {
    const socket = [...this.io.sockets.sockets.values()]
      .find((candidate) => candidate.data.playerId === playerId);
    if (!socket) return null;
    return this.options.playerProfileStore.readSheet(socket.data.profileId);
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
    this.approvedClientIds.add(pending.clientId);
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
    this.approvedClientIds.clear();
    this.accountSessions.clear();
    this.playerCombatStates.clear();
    this.playerPrivacy.clear();
    this.playerActions.clear();
    this.unarmedStrikeEnabled.clear();
    this.actionPointActionIds.clear();
    this.pendingPlayerAttacks.clear();
    this.encounterRollSequence = 0;
    this.encounterTurnState = emptyEncounterTurnState();
    if (this.fastify.server.listening) await this.fastify.close();
    await new Promise<void>((resolveClose) => {
      this.io.close(() => resolveClose());
    });
  }

  private createPlayerEncounterState(clientId: string, profileId: string) {
    const validation = this.options.playerProfileStore.profileById(profileId)?.sheet.validation;
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
    return {
      clientId,
      characterName: summary.characterName || 'Personagem',
      currentHealth: Math.min(summary.maxHealth, summary.currentHealth),
      maxHealth: Math.max(1, summary.maxHealth),
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
      revision: 0,
    } satisfies PlayerEncounterState;
  }

  private attachSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.registerConnectedSocket(socket);
    });
  }

  private registerConnectedSocket(socket: MultiplayerPlayerSocket) {
    socket.on('disconnect', () => {
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
      if (this.roster.unregisterSocket(socket.id)) {
        this.notifyPresenceChanged();
        this.syncTurnParticipants();
        this.publishPlayerHuds();
      }
    });

    if (
      this.currentSnapshot.battle.battleStarted &&
      !socket.data.isHost &&
      !this.approvedClientIds.has(socket.data.clientId)
    ) {
      this.queueJoinRequest(socket);
      return;
    }
    this.completePlayerRegistration(socket);
  }

  private completePlayerRegistration(socket: MultiplayerPlayerSocket) {
    const result = this.roster.register({
      clientId: socket.data.clientId,
      name: socket.data.playerName,
      socketId: socket.id,
      isHost: socket.data.isHost,
      now: socket.data.connectedAt,
      hasCharacterSheet: Boolean(
        this.options.playerProfileStore.profileById(socket.data.profileId)?.sheet.hasSheet
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
    this.approvedClientIds.add(socket.data.clientId);
    if (result.replacedSocketId && result.replacedSocketId !== socket.id) {
      this.io.sockets.sockets.get(result.replacedSocketId)?.disconnect(true);
    }
    if (typeof this.options.initialSnapshot === 'function') {
      this.setCurrentSnapshot(this.options.initialSnapshot({
        roomCode: this.credentials.roomCode,
        mediaUrl: (id) => this.mediaUrl(id),
      }));
    }
    socket.emit('session:snapshot', this.currentSnapshot);
    const playerState = this.playerCombatStates.get(socket.data.clientId) ??
      this.createPlayerEncounterState(socket.data.clientId, socket.data.profileId);
    if (playerState) {
      this.playerCombatStates.set(socket.data.clientId, playerState);
      socket.emit('player:state', playerState);
    }
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
      const result = this.advanceTurnAsHost(active.id);
      acknowledge({
        ...result,
        state: result.state ? this.getTurnState(socket.data.clientId) : undefined,
      });
    });
    socket.on('encounter:roll-initiative', (acknowledge) => {
      const result = this.rollInitiativeAsPlayer(socket.data.playerId);
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
    const presence = this.roster.presence();
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
    return this.roster.members().map(({ clientId, player }) => {
      const profile = [...this.io.sockets.sockets.values()]
        .find((socket) => socket.data.clientId === clientId);
      const summary = profile
        ? this.options.playerProfileStore.profileById(
          profile.data.profileId,
        )?.sheet.validation?.summary ?? null
        : null;
      const encounter = this.playerCombatStates.get(clientId) ?? null;
      const isSelf = clientId === viewerClientId;
      const privateMode = profile
        ? this.playerPrivacy.get(profile.data.profileId) ?? true
        : true;
      const actions = profile
        ? this.playerActions.get(profile.data.profileId) ?? {
          free: true,
          movement: true,
          standard: true,
        }
        : {
          free: true,
          movement: true,
          standard: true,
        };
      const redacted = !revealAll && privateMode && !isSelf;
      const actionPoints = normalizeActionPointCount(
        encounter?.actionPoints,
        encounter?.actionPointAvailable,
      );
      const heroPoints = normalizeHeroPointCount(
        encounter?.heroPoints,
        encounter?.heroPointAvailable,
      );
      return {
        id: player.id,
        faction: 'players',
        characterName:
          encounter?.characterName || summary?.characterName || player.name,
        isSelf,
        privateMode,
        redacted,
        currentHealth: redacted ? null : encounter?.currentHealth ?? summary?.currentHealth ?? null,
        maxHealth: redacted ? null : encounter?.maxHealth ?? summary?.maxHealth ?? null,
        currentMana: redacted ? null : encounter?.currentMana ?? summary?.currentMana ?? null,
        maxMana: redacted ? null : encounter?.maxMana ?? summary?.maxMana ?? null,
        defenseMelee: redacted
          ? null
          : (encounter?.defenseMelee ?? summary?.defenses.melee ?? summary?.defense ?? null) === null
            ? null
            : (encounter?.defenseMelee ?? summary?.defenses.melee ?? summary?.defense ?? 0) +
              (encounter?.temporaryDefenseBonus ?? 0),
        defenseRanged: redacted
          ? null
          : (encounter?.defenseRanged ?? summary?.defenses.ranged ?? summary?.defense ?? null) === null
            ? null
            : (encounter?.defenseRanged ?? summary?.defenses.ranged ?? summary?.defense ?? 0) +
              (encounter?.temporaryDefenseBonus ?? 0),
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
        summary: redacted ? null : summary,
        actions,
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
      this.encounterTurnState = emptyEncounterTurnState();
      return;
    }
    const previousActiveId = this.encounterTurnState.activeParticipantId;
    const members = this.roster.members();
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
      ...members.flatMap(({ clientId, player }) => {
        const encounter = this.playerCombatStates.get(clientId);
        // A connected account without a valid character sheet is a spectator,
        // not an encounter participant. Including it here would make round zero
        // wait for an initiative roll that the client cannot perform.
        if (!encounter || encounter.currentHealth <= 0) return [];
        const socket = [...this.io.sockets.sockets.values()]
          .find((candidate) => candidate.data.clientId === clientId);
        const summary = socket
          ? this.options.playerProfileStore.profileById(
            socket.data.profileId,
          )?.sheet.validation?.summary
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
          eligibleRound: this.encounterTurnState.started
            ? this.encounterTurnState.round + 1
            : 1,
        }];
      }),
    ];
    const actorIds = new Set(actors.map(({ id }) => id));
    const previousParticipants = new Map(
      this.encounterTurnState.participants.map((participant) => [
        participant.id,
        participant,
      ]),
    );
    const newlyRolledIds: string[] = [];
    let participants: EncounterTurnParticipant[];
    if (!this.encounterTurnState.started) {
      participants = prepareManualInitiative(
        actors,
        this.encounterTurnState.participants,
      );
    } else {
      participants = actors.map((actor) => {
        const existing = previousParticipants.get(actor.id);
        if (existing) {
          return {
            ...existing,
            name: actor.name,
            initiativeModifier: actor.initiativeModifier,
            initiativeTotal: existing.initiativeRoll + actor.initiativeModifier,
          };
        }
        const participant = rollInitiativeOrder(
          [actor],
          () => this.randomInteger(1, 21),
        )[0];
        newlyRolledIds.push(participant.id);
        return participant;
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
    const addedRollResults = this.encounterTurnState.started
      ? participants
        .filter(({ id }) => newlyRolledIds.includes(id))
        .map((participant) => this.createInitiativeRollResult(
          participant,
          this.encounterTurnState.activeParticipantId,
        ))
      : [];
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
      revision: this.encounterTurnState.revision + 1,
    };
    this.publishTurnState(previousActiveId);
    if (orderedAddedRollResults.length > 0) {
      orderedAddedRollResults.forEach(() => this.options.onDiceRolled?.());
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

  private publishTurnState(previousActiveId?: string | null) {
    const activeId = this.encounterTurnState.activeParticipantId;
    if (
      previousActiveId !== undefined &&
      activeId &&
      activeId !== previousActiveId
    ) {
      const activePlayer = this.encounterTurnState.participants.find(
        ({ id, kind }) => id === activeId && kind === 'player',
      );
      if (activePlayer) {
        const socket = [...this.io.sockets.sockets.values()].find(
          (candidate) => candidate.data.playerId === activePlayer.sourceId,
        );
        if (socket) {
          const combatState = this.playerCombatStates.get(socket.data.clientId);
          if (
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
          this.playerActions.set(socket.data.profileId, {
            free: true,
            movement: true,
            standard: true,
          });
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
    if (activeId && activeId !== previousActiveId) {
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
