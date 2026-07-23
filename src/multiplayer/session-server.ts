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
  isAreaDamageRequest,
  resolveAreaDamage,
  type AreaDamageRequest,
  type AreaDamageResult,
  type PlayerEncounterState,
} from '../shared/player-combat.ts';
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
  logger?: boolean;
  onPresenceChanged?: (presence: MultiplayerPresence) => void;
  onJoinRequestsChanged?: (requests: MultiplayerJoinRequest[]) => void;
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

  private readonly approvedClientIds = new Set<string>();

  private readonly probeInterval: ReturnType<typeof setInterval>;

  private readonly options: MultiplayerSessionServerOptions;

  private readonly snapshotReference: SnapshotReference;

  private readonly allowedOrigins: Set<string>;

  private readonly accountSessions: Map<string, AccountSession>;

  private readonly playerCombatStates = new Map<string, PlayerEncounterState>();

  private playerImpactSequence = 0;

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
      const sheet = await options.playerProfileStore.readSheet(account.session.profileId);
      if (!sheet) return reply.code(404).send({ ok: false, error: 'Nenhuma ficha foi enviada.' });
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
      reply.header('Cache-Control', 'private, no-store, max-age=0');
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

  getPendingJoinRequests() {
    return [...this.pendingJoinRequests.values()]
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
      return;
    }
    const socket = sockets[0];
    if (!socket) return;
    const state = this.createPlayerEncounterState(clientId, socket.data.profileId);
    if (!state) return;
    this.playerCombatStates.set(clientId, state);
    for (const candidate of sockets) candidate.emit('player:state', state);
  }

  applyAreaDamage(request: AreaDamageRequest): AreaDamageResult {
    if (!isAreaDamageRequest(request)) throw new Error('Informe dano, CD e resultado de sucesso válidos.');
    const skippedPlayers: string[] = [];
    let appliedPlayers = 0;
    const handledClients = new Set<string>();
    for (const socket of this.io.sockets.sockets.values()) {
      if (!socket.data.playerId || handledClients.has(socket.data.clientId)) continue;
      handledClients.add(socket.data.clientId);
      const state = this.playerCombatStates.get(socket.data.clientId) ??
        this.createPlayerEncounterState(socket.data.clientId, socket.data.profileId);
      if (!state) {
        skippedPlayers.push(socket.data.playerName);
        continue;
      }
      const impact = resolveAreaDamage(
        state,
        request,
        randomInt(1, 21),
        ++this.playerImpactSequence,
      );
      this.playerCombatStates.set(socket.data.clientId, impact.playerState);
      socket.emit('player:combat-impact', impact);
      appliedPlayers += 1;
    }
    return { ok: true, appliedPlayers, skippedPlayers };
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
    this.io.emit('session:snapshot', snapshot);
    if (!snapshot.battle.battleStarted) this.approveAllPendingJoinRequests();
  }

  publishBattleState(state: PublicBattlePresentationState) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, battle: state });
    this.io.emit('battle:state', state);
    if (!state.battleStarted) this.approveAllPendingJoinRequests();
  }

  publishHealthEffect(effect: HealthEffect) {
    this.io.emit('battle:health-effect', effect);
  }

  publishCombatImpact(impact: PublicCombatImpact) {
    this.setCurrentSnapshot({ ...this.currentSnapshot, battle: impact.battle });
    this.io.emit('battle:impact', impact);
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
    this.approvedClientIds.clear();
    this.accountSessions.clear();
    this.playerCombatStates.clear();
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
      currentHealth: Math.max(0, Math.min(summary.maxHealth, summary.currentHealth)),
      maxHealth: Math.max(1, summary.maxHealth),
      currentMana: Math.max(0, Math.min(summary.maxMana, summary.currentMana)),
      maxMana: Math.max(0, summary.maxMana),
      defenseMelee: Math.max(0, summary.defenses?.melee ?? summary.defense ?? 0),
      defenseRanged: Math.max(0, summary.defenses?.ranged ?? summary.defense ?? 0),
      reflex,
      statuses: [],
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
      if (this.roster.unregisterSocket(socket.id)) this.notifyPresenceChanged();
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
      socket.disconnect(true);
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

  private setCurrentSnapshot(snapshot: MultiplayerSessionSnapshot) {
    this.currentSnapshot = snapshot;
    this.snapshotReference.current = snapshot;
  }
}
