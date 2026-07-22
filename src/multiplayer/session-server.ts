import { randomUUID } from 'node:crypto';
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
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
  protocolVersion: z.number().int(),
  hostToken: z.string().min(32).max(128).optional(),
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
      if (!roster.canRegister(result.auth.clientId)) {
        next(socketError(
          'ROOM_FULL',
          `Esta sessão já atingiu o limite de ${roster.maxPlayers} jogadores.`,
        ));
        return;
      }
      socket.data = {
        playerId: '',
        playerName: result.auth.playerName,
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
    );
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
    if (this.fastify.server.listening) await this.fastify.close();
    await new Promise<void>((resolveClose) => {
      this.io.close(() => resolveClose());
    });
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
