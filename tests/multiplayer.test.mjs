import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { io as createSocketClient } from 'socket.io-client';
import {
  initialEncounterEffectsState,
  initialBattleState,
} from '../src/shared/battle.ts';
import {
  MAX_MULTIPLAYER_PLAYERS,
  MULTIPLAYER_PROTOCOL_VERSION,
} from '../src/shared/multiplayer.ts';
import { createScenePlan } from '../src/shared/scene.ts';
import {
  createPublicPresentationSnapshot,
} from '../src/multiplayer/public-presentation.ts';
import {
  MultiplayerSessionServer,
  normalizePublicBaseUrl,
} from '../src/multiplayer/session-server.ts';
import {
  connectionQualityForLatency,
  normalizePlayerName,
  SessionRoster,
} from '../src/multiplayer/session-roster.ts';
import {
  createSessionCredentials,
  SessionConnectionRateLimiter,
  tokensMatch,
} from '../src/multiplayer/session-security.ts';

const initialMusic = {
  tracks: [],
  currentTrackId: null,
  isPlaying: false,
  loop: false,
  volume: 0.8,
  muted: false,
  universalMuted: false,
  playbackVersion: 0,
  revision: 0,
};

const initialSoundboard = {
  slots: [],
  volume: 0.8,
  muted: false,
  loop: false,
  universalMuted: false,
  revision: 0,
};

const publicSnapshot = () => createPublicPresentationSnapshot({
  battle: {
    ...initialBattleState,
    bosses: initialBattleState.bosses.map((boss) => ({
      ...boss,
      setupStatus: 'ready',
    })),
  },
  background: {
    url: 'boss-media://background/current',
    name: 'fase-secreta.png',
    mediaType: 'image',
  },
  scenePlan: createScenePlan(initialBattleState.bosses),
  encounterEffects: initialEncounterEffectsState,
  music: {
    ...initialMusic,
    tracks: [
      { id: 'current', name: 'tema-atual.mp3', url: 'boss-media://audio/current', duration: 120 },
      { id: 'future', name: 'spoiler-proxima-fase.mp3', url: 'boss-media://audio/future', duration: 180 },
    ],
    currentTrackId: 'current',
  },
  soundboard: initialSoundboard,
}, {
  rewriteMediaUrl: (url) => `/session-media/${encodeURIComponent(url)}`,
});

const waitFor = async (predicate, timeoutMs = 2_000) => {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Tempo limite excedido aguardando o estado esperado.');
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
};

const connectPlayer = (server, {
  clientId,
  playerName,
  token = server.credentials.playerToken,
  acknowledgeLatency = true,
  origin,
  hostToken,
}) => {
  const endpoint = new URL(server.info.invite.localUrl).origin;
  const socket = createSocketClient(endpoint, {
    auth: {
      roomCode: server.credentials.roomCode,
      playerToken: token,
      playerName,
      clientId,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      ...(hostToken ? { hostToken } : {}),
    },
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
    ...(origin ? { extraHeaders: { Origin: origin } } : {}),
  });
  if (acknowledgeLatency) {
    socket.on('session:latency-probe', (probe, acknowledge) => {
      acknowledge({ id: probe.id });
    });
  }
  socket.on('session:closed', (_notice, acknowledge) => acknowledge());
  socket.on('session:join-rejected', (_message, acknowledge) => acknowledge());
  return socket;
};

test('gera credenciais fortes e compara tokens sem aceitar variações', () => {
  const first = createSessionCredentials();
  const second = createSessionCredentials();

  assert.match(first.roomCode, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
  assert.ok(first.hostToken.length >= 40);
  assert.ok(first.playerToken.length >= 40);
  assert.notEqual(first.roomCode, second.roomCode);
  assert.notEqual(first.playerToken, second.playerToken);
  assert.equal(tokensMatch(first.playerToken, first.playerToken), true);
  assert.equal(tokensMatch(`${first.playerToken}x`, first.playerToken), false);
  assert.equal(tokensMatch(second.playerToken, first.playerToken), false);
});

test('limita rajadas de conexão por origem sem bloquear após a janela', () => {
  const limiter = new SessionConnectionRateLimiter(2, 1_000);
  assert.equal(limiter.allow('203.0.113.10', 10_000), true);
  assert.equal(limiter.allow('203.0.113.10', 10_100), true);
  assert.equal(limiter.allow('203.0.113.10', 10_200), false);
  assert.equal(limiter.allow('203.0.113.11', 10_200), true);
  assert.equal(limiter.allow('203.0.113.10', 11_000), true);
});

test('normaliza apenas endereços públicos HTTP ou HTTPS na raiz', () => {
  assert.equal(
    normalizePublicBaseUrl('bossbar.example.org'),
    'https://bossbar.example.org/',
  );
  assert.equal(
    normalizePublicBaseUrl('http://203.0.113.10:43120'),
    'http://203.0.113.10:43120/',
  );
  assert.throws(() => normalizePublicBaseUrl('ftp://bossbar.example.org'));
  assert.throws(() => normalizePublicBaseUrl('https://user:pass@bossbar.example.org'));
  assert.throws(() => normalizePublicBaseUrl('https://bossbar.example.org/sala'));
});

test('normaliza nomes e classifica latência sem confiar em valores ilimitados', () => {
  assert.equal(normalizePlayerName('  Ana\n\tMaria  '), 'Ana Maria');
  assert.equal(normalizePlayerName(String.fromCharCode(1, 2)), '');
  assert.equal(connectionQualityForLatency(null), 'unknown');
  assert.equal(connectionQualityForLatency(50), 'excellent');
  assert.equal(connectionQualityForLatency(150), 'good');
  assert.equal(connectionQualityForLatency(300), 'unstable');
  assert.equal(connectionQualityForLatency(800), 'poor');
  assert.equal(connectionQualityForLatency(20, 2), 'poor');
});

test('limita a sala a dez jogadores e substitui uma reconexão sem ocupar vaga', () => {
  const roster = new SessionRoster('ABCDEFGH', 99);
  assert.equal(roster.maxPlayers, MAX_MULTIPLAYER_PLAYERS);

  for (let index = 0; index < MAX_MULTIPLAYER_PLAYERS; index += 1) {
    assert.equal(roster.register({
      clientId: `client-${index}`,
      name: `Jogador ${index + 1}`,
      socketId: `socket-${index}`,
      now: index,
    }).accepted, true);
  }
  assert.equal(roster.register({
    clientId: 'client-extra',
    name: 'Extra',
    socketId: 'socket-extra',
  }).accepted, false);

  const reconnected = roster.register({
    clientId: 'client-0',
    name: 'Jogador reconectado',
    socketId: 'socket-new',
  });
  assert.equal(reconnected.accepted, true);
  assert.equal(reconnected.replacedSocketId, 'socket-0');
  assert.equal(roster.presence().connectedPlayers, MAX_MULTIPLAYER_PLAYERS);
  assert.equal(roster.unregisterSocket('socket-0'), false);
  assert.equal(roster.unregisterSocket('socket-new'), true);
});

test('sinaliza problemas depois de duas sondagens de latência perdidas', () => {
  const roster = new SessionRoster('ABCDEFGH');
  roster.register({
    clientId: 'browser-client-probe',
    name: 'Jogador',
    socketId: 'socket-probe',
  });
  roster.recordLatency('socket-probe', 42);
  assert.equal(roster.presence().players[0].hasConnectionIssue, false);
  roster.recordMissedProbe('socket-probe');
  assert.equal(roster.presence().players[0].hasConnectionIssue, false);
  roster.recordMissedProbe('socket-probe');
  assert.equal(roster.presence().players[0].hasConnectionIssue, true);
  assert.equal(roster.presence().players[0].connectionQuality, 'poor');
});

test('suaviza picos isolados de latência pela mediana recente', () => {
  const roster = new SessionRoster('ABCDEFGH');
  roster.register({
    clientId: 'browser-client-latency',
    name: 'Jogador',
    socketId: 'socket-latency',
  });
  roster.recordLatency('socket-latency', 38);
  roster.recordLatency('socket-latency', 1_200);
  roster.recordLatency('socket-latency', 42);
  assert.equal(roster.presence().players[0].latencyMs, 42);
  assert.equal(roster.presence().players[0].connectionQuality, 'excellent');
});

test('projeta apenas dados públicos e não revela atributos ou fases futuras', () => {
  const snapshot = publicSnapshot();
  const boss = snapshot.battle.bosses[0];

  assert.equal('attack' in boss, false);
  assert.equal('rangedAttack' in boss, false);
  assert.equal('skills' in boss, false);
  assert.equal('damageReduction' in boss, false);
  assert.equal('controlAmount' in boss, false);
  assert.equal('bossSlots' in snapshot.scene, false);
  assert.equal('phases' in snapshot.scene, false);
  assert.equal('slots' in snapshot.soundboard, false);
  assert.equal(snapshot.background.name, null);
  assert.deepEqual(snapshot.music.tracks.map(({ id, name }) => ({ id, name })), [
    { id: 'current', name: 'Trilha atual' },
  ]);
});

test('hospeda uma sessão temporária, autentica, limita jogadores e mede ping', async (t) => {
  const presenceUpdates = [];
  const mediaFile = fileURLToPath(new URL('../package.json', import.meta.url));
  const webRoot = fileURLToPath(new URL('..', import.meta.url));
  const server = await MultiplayerSessionServer.start({
    initialSnapshot: publicSnapshot(),
    port: 0,
    maxPlayers: 2,
    networkMode: 'loopback',
    latencyProbeIntervalMs: 250,
    latencyProbeTimeoutMs: 250,
    webRoot,
    webIndexFile: 'web-player.html',
    resolveMedia: ({ id }) => id === 'media-test-000001'
      ? { filePath: mediaFile, contentType: 'audio/mpeg' }
      : null,
    preloadMediaUrls: ({ mediaUrl }) => [mediaUrl('media-test-000001')],
    onPresenceChanged: (presence) => presenceUpdates.push(presence),
  });
  t.after(async () => server.close('server-shutdown'));

  const invite = new URL(server.info.invite.localUrl);
  assert.equal(invite.searchParams.get('room'), server.credentials.roomCode);
  assert.equal(invite.hash.startsWith('#token='), true);
  assert.equal(new URLSearchParams(invite.hash.slice(1)).get('host'), server.credentials.hostToken);
  assert.equal(invite.searchParams.has('token'), false);

  const publicInvite = new URL(
    server.publicInviteUrl('https://bossbar.example.org').inviteUrl,
  );
  assert.equal(publicInvite.origin, 'https://bossbar.example.org');
  assert.equal(publicInvite.searchParams.get('room'), server.credentials.roomCode);
  assert.equal(publicInvite.hash.startsWith('#token='), true);
  assert.equal(new URLSearchParams(publicInvite.hash.slice(1)).has('host'), false);

  server.clearPublicInviteUrl();
  const revokedOrigin = connectPlayer(server, {
    clientId: 'browser-origin-revoked',
    playerName: 'Origem removida',
    origin: 'https://bossbar.example.org',
  });
  t.after(() => revokedOrigin.close());
  await once(revokedOrigin, 'connect_error');
  server.publicInviteUrl('https://bossbar.example.org');

  const blockedOrigin = connectPlayer(server, {
    clientId: 'browser-origin-blocked',
    playerName: 'Origem bloqueada',
    origin: 'https://malicioso.example.org',
  });
  t.after(() => blockedOrigin.close());
  await once(blockedOrigin, 'connect_error');

  const health = await fetch(`${invite.origin}/api/health`).then((response) => response.json());
  assert.deepEqual(health, {
    ok: true,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  });
  assert.equal((await fetch(`${invite.origin}/`)).status, 200);
  assert.equal((await fetch(`${invite.origin}/master.html`)).status, 404);
  assert.equal((await fetch(`${invite.origin}/api/preload`)).status, 403);
  const preloadManifest = await fetch(`${invite.origin}/api/preload`, {
    headers: {
      Authorization: `Bearer ${server.credentials.playerToken}`,
      'X-BossBar-Room': server.credentials.roomCode,
    },
  }).then((response) => response.json());
  assert.equal(preloadManifest.protocolVersion, MULTIPLAYER_PROTOCOL_VERSION);
  assert.ok(preloadManifest.urls.length >= 2);
  assert.ok(preloadManifest.urls.includes(server.mediaUrl('media-test-000001')));
  assert.equal(
    preloadManifest.urls.every((url) => url.startsWith('/session-media/')),
    true,
  );
  assert.equal((await fetch(`${invite.origin}/api/session-cache/clear`, {
    method: 'POST',
  })).status, 403);
  const cacheClearResponse = await fetch(`${invite.origin}/api/session-cache/clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${server.credentials.playerToken}`,
      'X-BossBar-Room': server.credentials.roomCode,
    },
  });
  assert.equal(cacheClearResponse.status, 200);
  assert.equal(cacheClearResponse.headers.get('clear-site-data'), '"cache"');

  const missingAccessResponse = await fetch(
    `${invite.origin}/session-media/media-test-000001`,
  );
  assert.equal(missingAccessResponse.status, 401);
  const invalidAccessResponse = await fetch(
    `${invite.origin}/session-media/media-test-000001?access=invalid`,
  );
  assert.equal(invalidAccessResponse.status, 403);

  const rangeResponse = await fetch(
    `${invite.origin}${server.mediaUrl('media-test-000001')}`,
    { headers: { Range: 'bytes=0-9' } },
  );
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range')?.startsWith('bytes 0-9/'), true);
  assert.equal((await rangeResponse.arrayBuffer()).byteLength, 10);

  const first = connectPlayer(server, {
    clientId: 'browser-client-01',
    playerName: 'Alice',
    origin: 'https://bossbar.example.org',
    hostToken: server.credentials.hostToken,
  });
  t.after(() => first.close());
  const firstSnapshot = once(first, 'session:snapshot');
  await once(first, 'connect');
  assert.equal((await firstSnapshot)[0].protocolVersion, MULTIPLAYER_PROTOCOL_VERSION);

  const second = connectPlayer(server, {
    clientId: 'browser-client-02',
    playerName: 'Bruno',
  });
  t.after(() => second.close());
  await once(second, 'connect');

  await waitFor(() => server.getPresence().players.every(
    ({ latencyMs }) => latencyMs !== null,
  ));
  assert.equal(server.getPresence().connectedPlayers, 2);
  assert.equal(server.getPresence().players.find(({ name }) => name === 'Alice')?.isHost, true);
  assert.equal(server.getPresence().players.find(({ name }) => name === 'Bruno')?.isHost, false);
  assert.equal(server.getPresence().players.every(
    ({ hasConnectionIssue }) => !hasConnectionIssue,
  ), true);

  const extra = connectPlayer(server, {
    clientId: 'browser-client-03',
    playerName: 'Carla',
  });
  t.after(() => extra.close());
  const [roomFullError] = await once(extra, 'connect_error');
  assert.equal(roomFullError.data?.code, 'ROOM_FULL');

  const invalid = connectPlayer(server, {
    clientId: 'browser-client-04',
    playerName: 'Davi',
    token: 'x'.repeat(43),
  });
  t.after(() => invalid.close());
  const [invalidTokenError] = await once(invalid, 'connect_error');
  assert.equal(invalidTokenError.data?.code, 'INVALID_TOKEN');

  const invalidName = connectPlayer(server, {
    clientId: 'browser-client-05',
    playerName: String.fromCharCode(1, 2),
  });
  t.after(() => invalidName.close());
  const [invalidNameError] = await once(invalidName, 'connect_error');
  assert.equal(invalidNameError.data?.code, 'INVALID_NAME');
  assert.ok(presenceUpdates.length >= 3);

  const impact = {
    battle: {
      ...publicSnapshot().battle,
      revision: 99,
    },
    healthEffect: {
      id: 77,
      bossId: initialBattleState.bosses[0].id,
      type: 'damage',
      intensity: 'normal',
      from: 500,
      to: 450,
      maximum: 500,
      shieldFrom: 0,
      shieldTo: 0,
    },
    soundEffect: null,
  };
  const receivedImpact = once(first, 'battle:impact');
  server.publishCombatImpact(impact);
  assert.deepEqual((await receivedImpact)[0], impact);

  const closedNotice = once(first, 'session:closed');
  await server.close('host-ended-session');
  assert.deepEqual((await closedNotice)[0], { reason: 'host-ended-session' });
});

test('exige aprovação do mestre para novos jogadores durante a batalha', async (t) => {
  const requests = [];
  const snapshot = publicSnapshot();
  const server = await MultiplayerSessionServer.start({
    initialSnapshot: {
      ...snapshot,
      battle: { ...snapshot.battle, battleStarted: true },
    },
    port: 0,
    networkMode: 'loopback',
    onJoinRequestsChanged: (pending) => requests.push(pending),
  });
  t.after(async () => server.close('server-shutdown'));

  const player = connectPlayer(server, {
    clientId: 'approval-player-01',
    playerName: 'Alice',
  });
  t.after(() => player.close());
  const pendingRequest = once(player, 'session:join-pending');
  const acceptedSnapshot = once(player, 'session:snapshot');
  await once(player, 'connect');
  const [request] = await pendingRequest;
  assert.equal(request.name, 'Alice');
  assert.equal(server.getPresence().connectedPlayers, 0);
  assert.equal(server.getPendingJoinRequests().length, 1);
  assert.equal(server.approveJoinRequest(request.id), true);
  assert.equal((await acceptedSnapshot)[0].battle.battleStarted, true);
  assert.equal(server.getPresence().connectedPlayers, 1);

  player.disconnect();
  const reconnectedSnapshot = once(player, 'session:snapshot');
  const reconnected = once(player, 'connect');
  player.connect();
  await reconnected;
  assert.equal((await reconnectedSnapshot)[0].battle.battleStarted, true);

  const rejected = connectPlayer(server, {
    clientId: 'approval-player-02',
    playerName: 'Bruno',
  });
  t.after(() => rejected.close());
  const rejectedPending = once(rejected, 'session:join-pending');
  const rejectionNotice = once(rejected, 'session:join-rejected');
  await once(rejected, 'connect');
  const [rejectedRequest] = await rejectedPending;
  assert.equal(server.rejectJoinRequest(rejectedRequest.id), true);
  assert.match((await rejectionNotice)[0], /não autorizou/i);
  assert.equal(server.getPresence().connectedPlayers, 1);
  assert.ok(requests.some((pending) => pending.length === 1));
  assert.equal(requests.at(-1).length, 0);
});
