import { randomUUID } from 'node:crypto';
import {
  MAX_MULTIPLAYER_PLAYERS,
  type ConnectionQuality,
  type MultiplayerPlayer,
  type MultiplayerPresence,
} from '../shared/multiplayer.ts';

type RosterPlayer = MultiplayerPlayer & {
  clientId: string;
  socketId: string;
  missedProbes: number;
  latencySamples: number[];
};

export type RegisterPlayerRequest = {
  clientId: string;
  name: string;
  socketId: string;
  isHost?: boolean;
  now?: number;
};

export type RegisterPlayerResult =
  | {
    accepted: true;
    player: MultiplayerPlayer;
    replacedSocketId: string | null;
  }
  | {
    accepted: false;
    reason: 'room-full';
  };

export const normalizePlayerName = (name: string) => name
  .split('')
  .map((character) => {
    const code = character.charCodeAt(0);
    if (code === 127) return '';
    if (code <= 31) return /\s/.test(character) ? ' ' : '';
    return character;
  })
  .join('')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 40);

export const connectionQualityForLatency = (
  latencyMs: number | null,
  missedProbes = 0,
): ConnectionQuality => {
  if (missedProbes >= 2) return 'poor';
  if (latencyMs === null) return 'unknown';
  if (latencyMs <= 80) return 'excellent';
  if (latencyMs <= 180) return 'good';
  if (latencyMs <= 400) return 'unstable';
  return 'poor';
};

const publicPlayer = (player: RosterPlayer): MultiplayerPlayer => ({
  id: player.id,
  name: player.name,
  isHost: player.isHost,
  connectedAt: player.connectedAt,
  lastSeenAt: player.lastSeenAt,
  latencyMs: player.latencyMs,
  connectionQuality: player.connectionQuality,
  hasConnectionIssue: player.hasConnectionIssue,
});

export class SessionRoster {
  readonly maxPlayers: number;

  readonly roomCode: string;

  private readonly playersByClientId = new Map<string, RosterPlayer>();

  private readonly clientIdBySocketId = new Map<string, string>();

  constructor(roomCode: string, maxPlayers = MAX_MULTIPLAYER_PLAYERS) {
    this.roomCode = roomCode;
    this.maxPlayers = Math.max(
      1,
      Math.min(MAX_MULTIPLAYER_PLAYERS, Math.floor(maxPlayers)),
    );
  }

  canRegister(clientId: string) {
    return this.playersByClientId.has(clientId)
      || this.playersByClientId.size < this.maxPlayers;
  }

  register({
    clientId,
    name,
    socketId,
    isHost = false,
    now = Date.now(),
  }: RegisterPlayerRequest): RegisterPlayerResult {
    const existing = this.playersByClientId.get(clientId);
    if (!existing && this.playersByClientId.size >= this.maxPlayers) {
      return { accepted: false, reason: 'room-full' };
    }

    const normalizedName = normalizePlayerName(name);
    const replacedSocketId = existing?.socketId ?? null;
    if (replacedSocketId) this.clientIdBySocketId.delete(replacedSocketId);

    const player: RosterPlayer = {
      id: existing?.id ?? randomUUID(),
      clientId,
      socketId,
      name: normalizedName,
      isHost,
      connectedAt: existing?.connectedAt ?? now,
      lastSeenAt: now,
      latencyMs: existing?.latencyMs ?? null,
      connectionQuality: existing?.connectionQuality ?? 'unknown',
      hasConnectionIssue: existing?.hasConnectionIssue ?? false,
      missedProbes: 0,
      latencySamples: existing?.latencySamples ?? [],
    };
    this.playersByClientId.set(clientId, player);
    this.clientIdBySocketId.set(socketId, clientId);

    return {
      accepted: true,
      player: publicPlayer(player),
      replacedSocketId,
    };
  }

  unregisterSocket(socketId: string) {
    const clientId = this.clientIdBySocketId.get(socketId);
    if (!clientId) return false;
    const player = this.playersByClientId.get(clientId);
    this.clientIdBySocketId.delete(socketId);
    if (!player || player.socketId !== socketId) return false;
    this.playersByClientId.delete(clientId);
    return true;
  }

  recordLatency(socketId: string, latencyMs: number, now = Date.now()) {
    const player = this.playerForSocket(socketId);
    if (!player) return false;
    const normalizedLatency = Math.max(0, Math.min(120_000, Math.round(latencyMs)));
    player.latencySamples = [...player.latencySamples, normalizedLatency].slice(-5);
    const sortedSamples = [...player.latencySamples].sort((first, second) => first - second);
    const smoothedLatency = sortedSamples[Math.floor(sortedSamples.length / 2)];
    player.lastSeenAt = now;
    player.latencyMs = smoothedLatency;
    player.missedProbes = 0;
    player.connectionQuality = connectionQualityForLatency(smoothedLatency);
    player.hasConnectionIssue = player.connectionQuality === 'poor';
    return true;
  }

  recordMissedProbe(socketId: string, now = Date.now()) {
    const player = this.playerForSocket(socketId);
    if (!player) return false;
    player.lastSeenAt = now;
    player.missedProbes += 1;
    player.connectionQuality = connectionQualityForLatency(
      player.latencyMs,
      player.missedProbes,
    );
    player.hasConnectionIssue = player.missedProbes >= 2
      || player.connectionQuality === 'poor';
    return true;
  }

  presence(): MultiplayerPresence {
    const players = [...this.playersByClientId.values()]
      .sort((first, second) => first.connectedAt - second.connectedAt
        || first.id.localeCompare(second.id))
      .map(publicPlayer);
    return {
      roomCode: this.roomCode,
      connectedPlayers: players.length,
      maxPlayers: this.maxPlayers,
      players,
    };
  }

  private playerForSocket(socketId: string) {
    const clientId = this.clientIdBySocketId.get(socketId);
    return clientId ? this.playersByClientId.get(clientId) : undefined;
  }
}
