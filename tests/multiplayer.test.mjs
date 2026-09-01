import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import { PlayerProfileStore } from '../src/multiplayer/player-profile-store.ts';

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

const connectPlayer = async (server, {
  clientId,
  playerName,
  token = server.credentials.playerToken,
  acknowledgeLatency = true,
  origin,
  hostToken,
}) => {
  const endpoint = new URL(server.info.invite.localUrl).origin;
  const accountName = normalizePlayerName(playerName) || `Player-${clientId}`;
  const headers = {
    Authorization: `Bearer ${server.credentials.playerToken}`,
    'Content-Type': 'application/json',
    'X-BossBar-Room': server.credentials.roomCode,
  };
  const statusResponse = await fetch(`${endpoint}/api/player/account-status`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: accountName }),
  });
  const status = await statusResponse.json();
  const authResponse = await fetch(`${endpoint}/api/player/authenticate`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      username: accountName,
      password: 'test-password',
      createAccount: !status.exists,
      clientId,
    }),
  });
  const authentication = await authResponse.json();
  assert.equal(authentication.ok, true);
  const socket = createSocketClient(endpoint, {
    auth: {
      roomCode: server.credentials.roomCode,
      playerToken: token,
      playerName,
      accountToken: authentication.sessionToken,
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

const createTestPlayerProfileStore = () => PlayerProfileStore.open(path.join(
  tmpdir(),
  `bossbar-unit-players-${Date.now()}-${Math.random().toString(36).slice(2)}`,
));

const createValidCharacterSheetValidation = ({
  characterName,
  currentHealth,
  maxHealth,
  currentMana,
  maxMana,
  defense,
  reflex,
  temporaryHealth = 0,
  initiative = reflex,
}) => ({
  supported: true,
  template: 'ficha-t20-editavel-v2',
  summary: {
    characterName,
    playerName: '',
    race: 'Humano',
    origin: 'Aventureiro',
    characterClass: 'Guerreiro',
    level: 3,
    currentHealth,
    maxHealth,
    temporaryHealth,
    currentMana,
    maxMana,
    defense,
    attributes: {
      for: 2,
      des: 1,
      con: 2,
      int: 0,
      sab: 0,
      car: 0,
    },
    defenses: {
      melee: defense,
      ranged: defense,
      calculation: `Defesa ${defense}`,
    },
    skills: [
      {
        id: '130',
        name: 'Iniciativa',
        total: initiative,
        trained: true,
        attribute: 'DES',
        attributeValue: 1,
        halfLevel: 1,
        trainingBonus: Math.max(0, initiative - 2),
        otherBonus: 0,
        armorPenalty: 0,
        sizeModifier: 0,
        calculation: `1 + 1 + ${Math.max(0, initiative - 2)} = ${initiative}`,
      },
      {
        id: '270',
        name: 'Reflexos',
        total: reflex,
        trained: true,
        attribute: 'DES',
        attributeValue: 1,
        halfLevel: 1,
        trainingBonus: Math.max(0, reflex - 2),
        otherBonus: 0,
        armorPenalty: 0,
        sizeModifier: 0,
        calculation: `1 + 1 + ${Math.max(0, reflex - 2)} = ${reflex}`,
      },
    ],
    attacks: [],
    movement: '9m',
    size: 'Médio',
    currentLoad: 4,
    maxLoad: 14,
  },
  issues: [],
  fieldCount: 50,
  checkedAt: Date.now(),
});

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

test('impede dois clientes de usarem o mesmo nome na sala', () => {
  const roster = new SessionRoster('ABCDEFGH');
  assert.equal(roster.register({
    clientId: 'client-a',
    name: '  Alice ',
    socketId: 'socket-a',
  }).accepted, true);
  const duplicate = roster.register({
    clientId: 'client-b',
    name: 'alice',
    socketId: 'socket-b',
  });
  assert.deepEqual(duplicate, {
    accepted: false,
    reason: 'name-in-use',
  });
  assert.equal(roster.presence().connectedPlayers, 1);
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
    playerProfileStore: await createTestPlayerProfileStore(),
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
  const revokedOrigin = await connectPlayer(server, {
    clientId: 'browser-origin-revoked',
    playerName: 'Origem removida',
    origin: 'https://bossbar.example.org',
  });
  t.after(() => revokedOrigin.close());
  await once(revokedOrigin, 'connect_error');
  server.publicInviteUrl('https://bossbar.example.org');

  const blockedOrigin = await connectPlayer(server, {
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

  const first = await connectPlayer(server, {
    clientId: 'browser-client-01',
    playerName: 'Alice',
    origin: 'https://bossbar.example.org',
    hostToken: server.credentials.hostToken,
  });
  t.after(() => first.close());
  const firstSnapshot = once(first, 'session:snapshot');
  await once(first, 'connect');
  assert.equal((await firstSnapshot)[0].protocolVersion, MULTIPLAYER_PROTOCOL_VERSION);

  const duplicateName = await connectPlayer(server, {
    clientId: 'browser-client-duplicate',
    playerName: 'Alice',
  });
  t.after(() => duplicateName.close());
  const [duplicateNameError] = await once(duplicateName, 'connect_error');
  assert.equal(duplicateNameError.data?.code, 'NAME_IN_USE');

  const second = await connectPlayer(server, {
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

  const extra = await connectPlayer(server, {
    clientId: 'browser-client-03',
    playerName: 'Carla',
  });
  t.after(() => extra.close());
  const [roomFullError] = await once(extra, 'connect_error');
  assert.equal(roomFullError.data?.code, 'ROOM_FULL');

  const invalid = await connectPlayer(server, {
    clientId: 'browser-client-04',
    playerName: 'Davi',
    token: 'x'.repeat(43),
  });
  t.after(() => invalid.close());
  const [invalidTokenError] = await once(invalid, 'connect_error');
  assert.equal(invalidTokenError.data?.code, 'INVALID_TOKEN');

  const invalidName = await connectPlayer(server, {
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

  const musicDuck = {
    id: 3,
    phase: 'duck',
    duration: 1_000,
    targetVolume: 0.2,
    soundEffect: null,
    targetPlayerIds: [],
  };
  const firstDuck = once(first, 'presentation:music-duck');
  const secondDuck = once(second, 'presentation:music-duck');
  server.publishMusicDuck(musicDuck);
  assert.deepEqual((await firstDuck)[0], musicDuck);
  assert.deepEqual((await secondDuck)[0], musicDuck);

  const closedNotice = once(first, 'session:closed');
  await server.close('host-ended-session');
  assert.deepEqual((await closedNotice)[0], { reason: 'host-ended-session' });
});

test('aplica dano em área de forma privada e preserva PV na reconexão', async (t) => {
  const profileStore = await createTestPlayerProfileStore();
  let combatRandomMode = 'ten';
  const rolledCallbacks = [];
  const playerDamageCallbacks = [];
  const bossCriticalThreats = [];
  const server = await MultiplayerSessionServer.start({
    playerProfileStore: profileStore,
    initialSnapshot: publicSnapshot(),
    port: 0,
    maxPlayers: 3,
    networkMode: 'loopback',
    combatRollDelayMs: 25,
    dramaticCombatRollDelayMs: 75,
    onDiceRolled: (result) => rolledCallbacks.push(result),
    onBossCriticalThreat: (context) => {
      bossCriticalThreats.push({ context, createdAt: Date.now() });
    },
    onPlayerDamaged: (context) => {
      playerDamageCallbacks.push({ ...context, createdAt: Date.now() });
    },
    randomInteger: (minimum, maximum) =>
      combatRandomMode === 'maximum'
        ? maximum - 1
        : Math.min(maximum - 1, Math.max(minimum, 10)),
  });
  t.after(async () => server.close('server-shutdown'));

  const alice = await connectPlayer(server, {
    clientId: 'area-client-alice',
    playerName: 'Alice',
  });
  t.after(() => alice.close());
  await once(alice, 'connect');

  const bruno = await connectPlayer(server, {
    clientId: 'area-client-bruno',
    playerName: 'Bruno',
  });
  t.after(() => bruno.close());
  await once(bruno, 'connect');

  const carla = await connectPlayer(server, {
    clientId: 'area-client-carla',
    playerName: 'Carla',
  });
  t.after(() => carla.close());
  await once(carla, 'connect');

  const aliceProfile = profileStore.profileByUsername('Alice');
  const brunoProfile = profileStore.profileByUsername('Bruno');
  assert.ok(aliceProfile);
  assert.ok(brunoProfile);

  await profileStore.saveSheet(
    aliceProfile.id,
    'alice.pdf',
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    createValidCharacterSheetValidation({
      characterName: 'Valora',
      currentHealth: 80,
      maxHealth: 80,
      currentMana: 12,
      maxMana: 12,
      defense: 18,
      reflex: 7,
    }),
  );
  const aliceInitialState = once(alice, 'player:state');
  server.refreshCharacterSheet('area-client-alice', true);
  assert.equal((await aliceInitialState)[0].currentHealth, 80);

  await profileStore.saveSheet(
    brunoProfile.id,
    'bruno.pdf',
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    createValidCharacterSheetValidation({
      characterName: 'Arton',
      currentHealth: 65,
      maxHealth: 70,
      currentMana: 9,
      maxMana: 10,
      defense: 16,
      reflex: 4,
    }),
  );
  const brunoInitialState = once(bruno, 'player:state');
  server.refreshCharacterSheet('area-client-bruno', true);
  assert.equal((await brunoInitialState)[0].currentHealth, 65);

  const aliceImpacts = [];
  const brunoImpacts = [];
  const carlaImpacts = [];
  alice.on('player:combat-impact', (impact) => aliceImpacts.push(impact));
  bruno.on('player:combat-impact', (impact) => brunoImpacts.push(impact));
  carla.on('player:combat-impact', (impact) => carlaImpacts.push(impact));

  const result = server.applyAreaDamage({
    damage: 20,
    hits: 2,
    reflexDc: 0,
    successRule: 'half',
  });
  assert.deepEqual(result, {
    ok: true,
    appliedPlayers: 2,
    skippedPlayers: ['Carla'],
    rolledDamage: 20,
  });
  assert.deepEqual(
    playerDamageCallbacks.at(-1)?.targetPlayerIds,
    [server.getPlayerHuds().find(({ characterName }) => characterName === 'Valora')?.id],
  );
  assert.equal(playerDamageCallbacks.at(-1)?.critical, false);

  await waitFor(() => aliceImpacts.length === 2 && brunoImpacts.length === 2);
  await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  assert.equal(aliceImpacts.length, 2);
  assert.equal(brunoImpacts.length, 2);
  assert.equal(carlaImpacts.length, 0);
  assert.equal(aliceImpacts[0].playerState.clientId, 'area-client-alice');
  assert.equal(brunoImpacts[0].playerState.clientId, 'area-client-bruno');
  assert.notEqual(aliceImpacts[0].id, brunoImpacts[0].id);
  assert.ok(aliceImpacts[0].playerState.currentHealth < 80);
  assert.ok(brunoImpacts[0].playerState.currentHealth < 65);

  const aliceHud = server.getPlayerHuds().find(
    ({ characterName }) => characterName === 'Valora',
  );
  assert.ok(aliceHud);
  const directStateEvent = once(alice, 'player:state');
  const directResult = await server.applyDirectPlayerDamage({
    playerIds: [aliceHud.id],
    damage: 3,
    hits: 2,
  });
  assert.equal(directResult.ok, true);
  assert.equal(directResult.appliedPlayers, 1);
  assert.deepEqual(directResult.skippedPlayers, []);
  assert.equal(directResult.rolledDamage, 3);
  assert.equal(directResult.impacts?.[0]?.appliedDamage, 3);
  const [directState] = await directStateEvent;
  assert.equal(
    directState.currentHealth,
    aliceImpacts.at(-1).playerState.currentHealth - 3,
  );

  const hitStateEvent = once(alice, 'player:state');
  const hitResult = await server.applyDirectPlayerDamage({
    playerIds: [aliceHud.id],
    damage: 1,
    damageFormula: '1d6 + 2',
    hits: 2,
    attackType: 'melee',
    attackBonus: 50,
    attackerParticipantId: 'boss:boss-1',
    actionId: 'boss-direct-hit-0001',
    correlationId: 'boss-direct-hit-0001',
  });
  assert.equal(hitResult.ok, true);
  assert.equal(hitResult.appliedPlayers, 1);
  assert.deepEqual(hitResult.missedPlayers ?? [], []);
  assert.equal(hitResult.rolledDamage, 8);
  assert.equal(hitResult.impacts?.[0]?.hit, true);
  assert.equal(hitResult.impacts?.[0]?.appliedDamage, 8);
  const directAttackResults = server.getTurnState().rollResults.filter(
    ({ actionId }) => actionId === 'boss-direct-hit-0001',
  );
  assert.equal(directAttackResults.length, 3);
  assert.ok(directAttackResults.every(({ targetName }) => targetName === 'Valora'));
  assert.ok(
    directAttackResults[2].createdAt - directAttackResults[1].createdAt >= 20,
  );
  const [hitState] = await hitStateEvent;
  assert.equal(hitState.currentHealth, directState.currentHealth - 8);

  const missResult = await server.applyDirectPlayerDamage({
    playerIds: [aliceHud.id],
    damage: 99,
    damageFormula: '1d6 + 2',
    attackType: 'ranged',
    attackBonus: -50,
    attackerParticipantId: 'boss:boss-1',
    actionId: 'boss-direct-miss-0001',
    correlationId: 'boss-direct-miss-0001',
  });
  assert.equal(missResult.ok, true);
  assert.equal(missResult.appliedPlayers, 0);
  assert.deepEqual(missResult.missedPlayers, ['Alice']);
  assert.equal(missResult.impacts?.[0]?.hit, false);
  assert.equal(missResult.impacts?.[0]?.healthAfter, hitState.currentHealth);

  combatRandomMode = 'maximum';
  const criticalStates = [];
  const captureCriticalState = (state) => criticalStates.push(state);
  alice.on('player:state', captureCriticalState);
  const criticalCallbackCount = playerDamageCallbacks.length;
  const threatCallbackCount = bossCriticalThreats.length;
  const pendingCriticalResult = await server.applyDirectPlayerDamage({
    playerIds: [aliceHud.id],
    damage: 1,
    damageFormula: '1d6 + 2',
    attackType: 'melee',
    attackBonus: 0,
    attackerParticipantId: 'boss:boss-1',
    actionId: 'boss-direct-critical-0001',
    correlationId: 'boss-direct-critical-0001',
    deferDamage: true,
  });
  assert.equal(pendingCriticalResult.ok, true);
  assert.ok(pendingCriticalResult.pendingDamageId);
  assert.equal(pendingCriticalResult.appliedPlayers, 0);
  assert.equal(playerDamageCallbacks.length, criticalCallbackCount);
  assert.equal(bossCriticalThreats.length, threatCallbackCount);
  assert.equal(
    server.getTurnState().rollResults.filter(
      ({ actionId }) => actionId === 'boss-direct-critical-0001',
    ).length,
    1,
  );
  const criticalResult = await server.resolvePendingDirectPlayerDamage(
    pendingCriticalResult.pendingDamageId,
  );
  assert.equal(criticalResult.impacts?.[0]?.critical, true);
  assert.equal(criticalResult.rolledDamage, 14);
  const criticalDamageResult = server.getTurnState().rollResults.find(
    ({ actionId, category }) =>
      actionId === 'boss-direct-critical-0001' && category === 'damage',
  );
  assert.equal(criticalDamageResult?.label, 'Dano crítico');
  assert.equal(criticalDamageResult?.expression, '2d6 + 2');
  assert.deepEqual(criticalDamageResult?.rolls, [6, 6]);
  const criticalAttackResult = server.getTurnState().rollResults.find(
    ({ actionId, category }) =>
      actionId === 'boss-direct-critical-0001' && category === 'attack',
  );
  assert.equal(criticalAttackResult?.natural, 20);
  assert.ok(
    (criticalDamageResult?.createdAt ?? 0) -
      (criticalAttackResult?.createdAt ?? 0) >= 70,
  );
  assert.ok(rolledCallbacks.some(
    ({ id, natural }) => id === criticalAttackResult?.id && natural === 20,
  ));
  assert.equal(playerDamageCallbacks.at(-1)?.critical, true);
  assert.deepEqual(playerDamageCallbacks.at(-1)?.targetPlayerIds, [aliceHud.id]);
  assert.equal(bossCriticalThreats.length, 1);
  assert.deepEqual(bossCriticalThreats[0].context.targetPlayerIds, [aliceHud.id]);
  assert.ok(
    playerDamageCallbacks.at(-1).createdAt - bossCriticalThreats[0].createdAt >= 70,
  );
  assert.equal(
    typeof server.getPlayerHuds().find(
      ({ characterName }) => characterName === 'Valora',
    )?.criticalThreatId,
    'number',
  );
  await waitFor(() => criticalStates.some(
    ({ criticalImpactId }) => typeof criticalImpactId === 'number',
  ));
  const criticalState = criticalStates.find(
    ({ criticalImpactId }) => typeof criticalImpactId === 'number',
  );
  alice.off('player:state', captureCriticalState);
  assert.equal(typeof criticalState.criticalImpactId, 'number');
  combatRandomMode = 'ten';

  const statusStateEvent = once(alice, 'player:state');
  assert.deepEqual(server.applyPlayerStatus({
    playerIds: [aliceHud.id],
    status: {
      statusId: 'abalado',
      damageFormula: null,
      turnsRemaining: 2,
    },
  }), {
    ok: true,
    appliedPlayers: 1,
    skippedPlayers: [],
  });
  const [statusState] = await statusStateEvent;
  assert.equal(statusState.statuses[0].statusId, 'abalado');

  const unconsciousStateEvent = once(alice, 'player:state');
  const unconsciousResult = await server.applyDirectPlayerDamage({
    playerIds: [aliceHud.id],
    damage: statusState.currentHealth,
  });
  assert.equal(unconsciousResult.ok, true);
  const [unconsciousState] = await unconsciousStateEvent;
  assert.equal(unconsciousState.currentHealth, 0);
  assert.equal(unconsciousState.dead, false);
  assert.equal(unconsciousState.stabilized, false);
  assert.ok(unconsciousState.statuses.some(({ statusId }) => statusId === 'inconsciente'));
  assert.ok(unconsciousState.statuses.some(({ statusId }) => statusId === 'indefeso'));
  assert.ok(unconsciousState.statuses.some(({ statusId }) => statusId === 'sangrando'));
  const unconsciousHud = server.getPlayerHuds().find(({ id }) => id === aliceHud.id);
  assert.equal(unconsciousHud?.actions.standard, false);
  assert.equal(unconsciousHud?.defenseMelee, 8);
  assert.ok(server.getTurnState().history.some(
    ({ kind, targetParticipantId, detail }) =>
      kind === 'damage' &&
      targetParticipantId === `player:${aliceHud.id}` &&
      detail.includes('PV'),
  ));

  const overkillStateEvent = once(alice, 'player:state');
  const overkillResult = await server.applyDirectPlayerDamage({
    playerIds: [aliceHud.id],
    damage: 1_000,
  });
  assert.equal(overkillResult.ok, true);
  const [overkillState] = await overkillStateEvent;
  assert.equal(overkillState.currentHealth, unconsciousState.currentHealth - 1_000);
  assert.ok(overkillState.currentHealth < 0);
  assert.equal(overkillState.dead, true);

  const aliceHealthAfterImpact = overkillState.currentHealth;
  const aliceRevisionAfterImpact = overkillState.revision;
  const aliceDisconnected = once(alice, 'disconnect');
  alice.disconnect();
  await aliceDisconnected;

  const reconnectedAlice = await connectPlayer(server, {
    clientId: 'area-client-alice',
    playerName: 'Alice',
  });
  t.after(() => reconnectedAlice.close());
  const reconnectedState = once(reconnectedAlice, 'player:state');
  await once(reconnectedAlice, 'connect');
  const [restoredState] = await reconnectedState;
  assert.equal(restoredState.currentHealth, aliceHealthAfterImpact);
  assert.equal(restoredState.revision, aliceRevisionAfterImpact);
});

test('exige aprovação do mestre para novos jogadores durante a batalha', async (t) => {
  const requests = [];
  const snapshot = publicSnapshot();
  const server = await MultiplayerSessionServer.start({
    playerProfileStore: await createTestPlayerProfileStore(),
    initialSnapshot: {
      ...snapshot,
      battle: { ...snapshot.battle, battleStarted: true },
    },
    port: 0,
    networkMode: 'loopback',
    combatRollDelayMs: 0,
    onJoinRequestsChanged: (pending) => requests.push(pending),
  });
  t.after(async () => server.close('server-shutdown'));

  const player = await connectPlayer(server, {
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
  const reconnectedPending = once(player, 'session:join-pending');
  const reconnectedSnapshot = once(player, 'session:snapshot');
  const reconnected = once(player, 'connect');
  player.connect();
  await reconnected;
  const [reconnectRequest] = await reconnectedPending;
  assert.equal(server.approveJoinRequest(reconnectRequest.id), true);
  assert.equal((await reconnectedSnapshot)[0].battle.battleStarted, true);

  const rejected = await connectPlayer(server, {
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

test('insere jogador aprovado em um turno exclusivo de iniciativa antes da próxima rodada', async (t) => {
  const profileStore = await createTestPlayerProfileStore();
  const snapshot = publicSnapshot();
  const server = await MultiplayerSessionServer.start({
    playerProfileStore: profileStore,
    initialSnapshot: snapshot,
    port: 0,
    networkMode: 'loopback',
    randomInteger: (minimum, maximum) =>
      Math.min(maximum - 1, Math.max(minimum, 10)),
  });
  t.after(async () => server.close('server-shutdown'));

  const alice = await connectPlayer(server, {
    clientId: 'late-turn-alice',
    playerName: 'Alice',
  });
  t.after(() => alice.close());
  await once(alice, 'connect');
  const aliceProfile = profileStore.profileByUsername('Alice');
  assert.ok(aliceProfile);
  await profileStore.saveSheet(
    aliceProfile.id,
    'alice-late-turn.pdf',
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    createValidCharacterSheetValidation({
      characterName: 'Valora',
      currentHealth: 60,
      maxHealth: 60,
      currentMana: 10,
      maxMana: 10,
      defense: 18,
      reflex: 7,
      initiative: 20,
    }),
  );
  server.refreshCharacterSheet('late-turn-alice', true);
  server.publishBattleState({ ...snapshot.battle, battleStarted: true });
  for (const participant of server.getTurnState().participants) {
    if (participant.kind === 'boss') {
      assert.equal(server.rollInitiativeAsHost(participant.id).ok, true);
    } else {
      const rolled = await new Promise((resolve) => {
        alice.emit('encounter:roll-initiative', false, resolve);
      });
      assert.equal(rolled.ok, true);
    }
  }
  assert.equal(server.advanceTurnAsHost().ok, true);
  const interruptedParticipantId = server.getTurnState().activeParticipantId;
  const interruptedRound = server.getTurnState().round;

  const bruno = await connectPlayer(server, {
    clientId: 'late-turn-bruno',
    playerName: 'Bruno',
  });
  t.after(() => bruno.close());
  const pending = once(bruno, 'session:join-pending');
  await once(bruno, 'connect');
  const [request] = await pending;
  const brunoProfile = profileStore.profileByUsername('Bruno');
  assert.ok(brunoProfile);
  await profileStore.saveSheet(
    brunoProfile.id,
    'bruno-late-turn.pdf',
    new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    createValidCharacterSheetValidation({
      characterName: 'Arton',
      currentHealth: 55,
      maxHealth: 55,
      currentMana: 8,
      maxMana: 8,
      defense: 16,
      reflex: 5,
      initiative: 5,
    }),
  );
  assert.equal(server.approveJoinRequest(request.id), true);
  assert.equal(
    server.getTurnState().participants.some(({ name }) => name === 'Arton'),
    false,
  );

  assert.equal(server.advanceTurnAsHost(interruptedParticipantId).ok, true);
  const initiativeTurn = server.getTurnState();
  const lateParticipant = initiativeTurn.participants.find(
    ({ name }) => name === 'Arton',
  );
  assert.ok(lateParticipant);
  assert.equal(initiativeTurn.activeParticipantId, lateParticipant.id);
  assert.equal(lateParticipant.initiativeRolled, false);
  const forbiddenAction = await new Promise((resolve) => {
    bruno.emit('player:use-action', 'standard', resolve);
  });
  assert.equal(forbiddenAction.ok, false);
  assert.match(forbiddenAction.error, /apenas a Iniciativa/i);

  const lateRoll = await new Promise((resolve) => {
    bruno.emit('encounter:roll-initiative', false, resolve);
  });
  assert.equal(lateRoll.ok, true);
  const resumed = server.getTurnState();
  const inserted = resumed.participants.find(({ id }) => id === lateParticipant.id);
  assert.equal(inserted.initiativeRolled, true);
  assert.equal(inserted.eligibleRound, interruptedRound + 1);
  assert.notEqual(resumed.activeParticipantId, lateParticipant.id);
});

test('sincroniza privacidade dos HUDs e controla turnos de forma autoritativa', async (t) => {
  const profileStore = await createTestPlayerProfileStore();
  const rejectedBossDamageContexts = [];
  let acceptBossDamage = false;
  let randomMode = 'maximum';
  const server = await MultiplayerSessionServer.start({
    playerProfileStore: profileStore,
    initialSnapshot: publicSnapshot(),
    port: 0,
    networkMode: 'loopback',
    combatRollDelayMs: 25,
    dramaticCombatRollDelayMs: 25,
    randomInteger: (minimum, maximum) =>
      randomMode === 'minimum' ? minimum : maximum - 1,
    getBossDefense: () => 10,
    applyBossDamage: (_bossId, damage, context) => {
      rejectedBossDamageContexts.push(context);
      if (acceptBossDamage) {
        return {
          ok: true,
          appliedDamage: damage,
        };
      }
      return {
        ok: false,
        appliedDamage: 0,
        error: 'Falha interna simulada.',
      };
    },
  });
  t.after(async () => server.close('server-shutdown'));

  const alice = await connectPlayer(server, {
    clientId: 'hud-client-alice',
    playerName: 'Alice',
  });
  t.after(() => alice.close());
  await once(alice, 'connect');
  const bruno = await connectPlayer(server, {
    clientId: 'hud-client-bruno',
    playerName: 'Bruno',
  });
  t.after(() => bruno.close());
  await once(bruno, 'connect');

  for (const [username, clientId, characterName, initiative] of [
    ['Alice', 'hud-client-alice', 'Valora', 12],
    ['Bruno', 'hud-client-bruno', 'Arton', 6],
  ]) {
    const profile = profileStore.profileByUsername(username);
    assert.ok(profile);
    await profileStore.saveSheet(
      profile.id,
      `${username}.pdf`,
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      createValidCharacterSheetValidation({
        characterName,
        currentHealth: 60,
        maxHealth: 60,
        currentMana: 10,
        maxMana: 10,
        defense: 18,
        reflex: 7,
        initiative,
      }),
    );
    server.refreshCharacterSheet(clientId, true);
  }

  const aliceHuds = [];
  const brunoHuds = [];
  const aliceResourceNotices = [];
  alice.on('players:hud-state', (state) => aliceHuds.push(state));
  bruno.on('players:hud-state', (state) => brunoHuds.push(state));
  alice.on('player:resource-notice', (notice) => aliceResourceNotices.push(notice));
  server.refreshCharacterSheet('hud-client-alice', true);
  await waitFor(() => aliceHuds.at(-1)?.length === 2 && brunoHuds.at(-1)?.length === 2);
  assert.equal(
    brunoHuds.at(-1).find(({ characterName }) => characterName === 'Valora')
      ?.redacted,
    true,
  );

  const privacyResult = await new Promise((resolve) => {
    alice.emit('player:set-private', true, resolve);
  });
  assert.deepEqual(privacyResult, { ok: true });
  await waitFor(() => brunoHuds.at(-1)?.find(({ characterName }) =>
    characterName === 'Valora')?.redacted === true);

  const aliceView = aliceHuds.at(-1).find(({ characterName }) => characterName === 'Valora');
  const brunoView = brunoHuds.at(-1).find(({ characterName }) => characterName === 'Valora');
  assert.equal(aliceView.isSelf, true);
  assert.equal(aliceView.redacted, false);
  assert.equal(aliceView.currentHealth, 60);
  assert.equal(brunoView.isSelf, false);
  assert.equal(brunoView.redacted, true);
  assert.equal(brunoView.currentHealth, null);
  assert.equal(brunoView.summary, null);
  const masterView = server.getPlayerHuds().find(
    ({ characterName }) => characterName === 'Valora',
  );
  assert.equal(masterView.redacted, false);
  assert.equal(masterView.currentHealth, 60);
  assert.ok(masterView.summary);

  const spectator = await connectPlayer(server, {
    clientId: 'hud-client-spectator',
    playerName: 'Carla',
  });
  t.after(() => spectator.close());
  await once(spectator, 'connect');

  const turnStates = [];
  alice.on('encounter:turn-state', (state) => turnStates.push(state));
  server.publishBattleState({
    ...publicSnapshot().battle,
    battleStarted: true,
    revision: 50,
  });
  await waitFor(() => turnStates.at(-1)?.participants.length === 3);
  assert.equal(
    turnStates.at(-1).participants.some(({ name }) => name === 'Carla'),
    false,
  );
  const prematureStart = server.advanceTurnAsHost();
  assert.equal(prematureStart.ok, false);
  assert.match(prematureStart.error, /Iniciativa/);
  for (let attempts = 0; attempts < 20; attempts += 1) {
    const pending = server.getTurnState().participants.filter(
      ({ initiativeRolled }) => initiativeRolled === false,
    );
    if (pending.length === 0) break;
    for (const participant of pending) {
      if (participant.kind === 'boss') {
        assert.equal(server.rollInitiativeAsHost(participant.id).ok, true);
      } else {
        const socket = participant.name === 'Valora' ? alice : bruno;
        const result = await new Promise((resolve) => {
          socket.emit('encounter:roll-initiative', false, resolve);
        });
        assert.equal(result.ok, true);
      }
    }
  }
  await waitFor(() => turnStates.at(-1)?.initiativeReady === true);
  assert.equal(turnStates.at(-1).round, 0);
  assert.equal(
    turnStates.at(-1).rollResults.filter(({ category }) =>
      category === 'initiative').length,
    3,
  );
  assert.ok(
    server.getTurnState().rollResults
      .filter(({ category }) => category === 'initiative')
      .every(({ visibility }) => visibility === 'full'),
  );
  assert.ok(
    server.getTurnState().rollResults
      .filter(({ category }) => category === 'initiative')
      .every(({ natural }) => natural === undefined || natural === null),
  );
  const privateInitiativeParticipant = server.getTurnState().participants.find(
    ({ name }) => name === 'Valora',
  );
  assert.ok(privateInitiativeParticipant);
  assert.ok(
    server.getTurnState('hud-client-bruno').rollResults
      .filter(({ participantId }) => participantId === privateInitiativeParticipant.id)
      .every(({ visibility }) => visibility === 'dice-only'),
  );

  assert.equal(server.advanceTurnAsHost().ok, true);
  let aliceTurnState = server.getTurnState('hud-client-alice');
  const aliceParticipant = aliceTurnState.participants.find(({ isSelf }) => isSelf);
  assert.ok(aliceParticipant);
  for (let attempts = 0;
    aliceTurnState.activeParticipantId !== aliceParticipant.id && attempts < 4;
    attempts += 1) {
    assert.equal(server.advanceTurnAsHost().ok, true);
    aliceTurnState = server.getTurnState('hud-client-alice');
  }
  assert.equal(aliceTurnState.activeParticipantId, aliceParticipant.id);
  const failedAttackRequest = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'attack',
      attackSource: { kind: 'unarmed' },
      attackType: 'melee',
      targetBossId: initialBattleState.bosses[0].id,
      damageFormula: '1d3 + 2',
      resource: { kind: 'action-point', ability: 'intervention' },
      actionId: 'failed-unarmed-attack-0001',
    }, resolve);
  });
  assert.equal(failedAttackRequest.pendingApproval, true);
  const failedAttackApproval = await server.approveActionPointRequest(
    failedAttackRequest.requestId,
  );
  assert.equal(failedAttackApproval.ok, true);
  assert.ok(failedAttackApproval.pendingDamageId);
  const failedDamageResolution = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'damage',
      pendingDamageId: failedAttackApproval.pendingDamageId,
    }, resolve);
  });
  assert.equal(failedDamageResolution.ok, false);
  assert.match(failedDamageResolution.error, /Falha interna simulada/);
  assert.equal(rejectedBossDamageContexts.at(-1)?.nonlethal, true);
  const hudAfterRejectedAttack = server.getPlayerHuds().find(
    ({ isSelf, characterName }) => isSelf || characterName === 'Valora',
  );
  assert.equal(hudAfterRejectedAttack.actions.standard, true);
  assert.equal(hudAfterRejectedAttack.actionPoints, 1);

  assert.equal(
    server.setUnarmedStrikeEnabled(aliceParticipant.sourceId, false).ok,
    true,
  );
  const disabledUnarmedAttack = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'attack',
      attackSource: { kind: 'unarmed' },
      attackType: 'melee',
      targetBossId: initialBattleState.bosses[0].id,
      damageFormula: '1d3 + 2',
      resource: null,
      actionId: 'disabled-unarmed-attack-0001',
    }, resolve);
  });
  assert.equal(disabledUnarmedAttack.ok, false);
  assert.match(disabledUnarmedAttack.error, /desativou ataques com os punhos/);
  assert.equal(
    server.getPlayerHuds().find(({ characterName }) =>
      characterName === 'Valora')?.actions.standard,
    true,
  );
  assert.equal(
    server.setUnarmedStrikeEnabled(aliceParticipant.sourceId, true).ok,
    true,
  );

  acceptBossDamage = true;
  const successfulAttack = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'attack',
      attackSource: { kind: 'unarmed' },
      attackType: 'melee',
      targetBossId: initialBattleState.bosses[0].id,
      damageFormula: '1d3 + 2',
      resource: null,
      actionId: 'successful-unarmed-attack-0001',
    }, resolve);
  });
  assert.equal(successfulAttack.ok, true);
  assert.ok(successfulAttack.pendingDamageId);
  assert.equal(
    server.getTurnState().rollResults.filter(
      ({ actionId }) => actionId === 'successful-unarmed-attack-0001',
    ).length,
    1,
  );
  const successfulDamage = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'damage',
      pendingDamageId: successfulAttack.pendingDamageId,
    }, resolve);
  });
  assert.deepEqual(successfulDamage, { ok: true });
  const successfulAttackResults = server.getTurnState().rollResults.filter(
    ({ actionId }) => actionId === 'successful-unarmed-attack-0001',
  );
  assert.equal(successfulAttackResults.length, 2);
  assert.equal(
    successfulAttackResults[1].sequence,
    successfulAttackResults[0].sequence + 1,
  );
  assert.ok(successfulAttackResults[1].createdAt >= successfulAttackResults[0].createdAt);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.actions.standard === false);
  assert.equal(rejectedBossDamageContexts.at(-1)?.nonlethal, true);

  assert.equal(server.advanceTurnAsHost().ok, true);
  for (let attempts = 0;
    server.getTurnState().activeParticipantId !== aliceParticipant.id &&
      attempts < 5;
    attempts += 1) {
    assert.equal(server.advanceTurnAsHost().ok, true);
  }
  assert.equal(server.getTurnState().activeParticipantId, aliceParticipant.id);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.actions.standard === true);

  const damageCallbackCount = rejectedBossDamageContexts.length;
  randomMode = 'minimum';
  const missedAttack = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'attack',
      attackSource: { kind: 'unarmed' },
      attackType: 'melee',
      targetBossId: initialBattleState.bosses[0].id,
      damageFormula: '1d3 + 2',
      resource: null,
      actionId: 'missed-unarmed-attack-0001',
    }, resolve);
  });
  assert.deepEqual(missedAttack, { ok: true });
  assert.equal(rejectedBossDamageContexts.length, damageCallbackCount);
  assert.equal(server.getTurnState().rollResults.at(-1).outcome, 'failure');
  assert.equal(server.getTurnState().rollResults.at(-1).sequence, 1);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.actions.standard === false);
  randomMode = 'maximum';

  const rollCountBeforeApproval = server.getTurnState().rollResults.length;
  const actionPointRequest = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'skill',
      skillId: '130',
      resource: { kind: 'action-point', ability: 'intervention' },
      actionId: 'action-ap-first-0001',
    }, resolve);
  });
  assert.equal(actionPointRequest.ok, true);
  assert.equal(actionPointRequest.pendingApproval, true);
  await waitFor(() => aliceResourceNotices.some(
    ({ id }) => id === actionPointRequest.requestId,
  ));
  assert.equal(
    aliceResourceNotices.find(({ id }) => id === actionPointRequest.requestId)
      ?.persistent,
    true,
  );
  assert.equal(server.getTurnState().rollResults.length, rollCountBeforeApproval);
  assert.equal(server.getPendingActionPointRequests().length, 1);
  assert.equal(
    (await server.approveActionPointRequest(actionPointRequest.requestId)).ok,
    true,
  );
  await waitFor(() => aliceResourceNotices.filter(
    ({ id }) => id === actionPointRequest.requestId,
  ).length === 2);
  assert.equal(
    aliceResourceNotices.filter(
      ({ id }) => id === actionPointRequest.requestId,
    ).at(-1)?.persistent,
    undefined,
  );
  assert.equal(server.getPendingActionPointRequests().length, 0);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.actionPointAvailable === false);
  assert.equal(
    aliceHuds.at(-1)?.find(({ isSelf }) => isSelf)?.actionPoints,
    0,
  );
  const actionPointRoll = server.getTurnState().rollResults.at(-1);
  assert.equal(actionPointRoll.resourceEffect, 'action-point');
  assert.equal(actionPointRoll.rolls.length, 2);

  assert.equal(server.grantActionPoint(aliceParticipant.sourceId, 2).ok, true);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.actionPoints === 2);
  const secondPointRequest = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'skill',
      skillId: '130',
      actionId: 'action-ap-0001',
      resource: { kind: 'action-point', ability: 'intervention' },
    }, resolve);
  });
  assert.equal(secondPointRequest.pendingApproval, true);
  const duplicatePendingPointRequest = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'skill',
      skillId: '130',
      actionId: 'action-ap-0001',
      resource: { kind: 'action-point', ability: 'intervention' },
    }, resolve);
  });
  assert.equal(duplicatePendingPointRequest.ok, false);
  assert.equal(duplicatePendingPointRequest.pendingApproval, true);
  assert.equal(
    duplicatePendingPointRequest.requestId,
    secondPointRequest.requestId,
  );
  assert.equal(server.getPendingActionPointRequests().length, 1);
  assert.equal(
    (await server.approveActionPointRequest(secondPointRequest.requestId)).ok,
    true,
  );
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.actionPoints === 1);
  const duplicatePointRequest = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'skill',
      skillId: '130',
      actionId: 'action-ap-0001',
      resource: { kind: 'action-point', ability: 'intervention' },
    }, resolve);
  });
  assert.equal(duplicatePointRequest.ok, false);
  assert.match(duplicatePointRequest.error, /nesta ação/);

  const rerollRequest = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'skill',
      skillId: '130',
      actionId: 'action-ap-reroll-0001',
      resource: { kind: 'action-point', ability: 'reroll' },
    }, resolve);
  });
  assert.equal(rerollRequest.pendingApproval, true);
  assert.equal(
    (await server.approveActionPointRequest(rerollRequest.requestId)).ok,
    true,
  );
  const rerollResult = server.getTurnState().rollResults.at(-1);
  assert.equal(rerollResult.rollMode, 'reroll');
  assert.equal(rerollResult.rolls.length, 2);
  assert.equal(
    rerollResult.total,
    rerollResult.rolls[1] + rerollResult.modifier,
  );
  assert.equal(
    server.getPlayerHuds().find(({ characterName }) =>
      characterName === 'Valora')?.actionPoints,
    0,
  );
  assert.equal(server.grantActionPoint(aliceParticipant.sourceId).ok, true);
  assert.equal(server.revokeActionPoint(aliceParticipant.sourceId).ok, true);

  assert.equal(
    server.getPlayerHuds().find(({ characterName }) =>
      characterName === 'Valora')?.heroPoints,
    1,
  );
  assert.equal(server.revokeHeroPoint(aliceParticipant.sourceId).ok, true);
  assert.equal(server.grantHeroPoint(aliceParticipant.sourceId).ok, true);
  assert.equal(server.grantHeroPoint(aliceParticipant.sourceId).ok, false);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.heroPointAvailable === true);
  const heroicResult = await new Promise((resolve) => {
    alice.emit('encounter:combat-action', {
      kind: 'skill',
      skillId: '130',
      resource: { kind: 'hero-point', ability: 'extreme-advantage' },
    }, resolve);
  });
  assert.equal(heroicResult.ok, true);
  assert.equal(heroicResult.pendingApproval, true);
  assert.equal(
    (await server.approveActionPointRequest(heroicResult.requestId)).ok,
    true,
  );
  const heroicRoll = server.getTurnState().rollResults.at(-1);
  assert.equal(heroicRoll.resourceEffect, 'hero-point');
  assert.equal(heroicRoll.rollMode, 'sum-capped');
  assert.equal(heroicRoll.rolls.length, 2);
  await waitFor(() => aliceHuds.at(-1)
    ?.find(({ isSelf }) => isSelf)?.heroPointAvailable === false);

  const endResult = await new Promise((resolve) => {
    alice.emit('encounter:end-own-turn', resolve);
  });
  assert.equal(endResult.ok, true);
  assert.notEqual(server.getTurnState().activeParticipantId, aliceParticipant.id);
});
