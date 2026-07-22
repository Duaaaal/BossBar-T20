import assert from 'node:assert/strict';
import test from 'node:test';
import { bundledAssetUrl } from '../src/shared/bundled-assets.ts';
import {
  createOrderedEventQueue,
  publicMediaUrlsFromSnapshot,
  toBattleState,
  toScenePlan,
  toSoundboardState,
} from '../src/web-player-api.ts';
import { MULTIPLAYER_PROTOCOL_VERSION } from '../src/shared/multiplayer.ts';

const publicBattle = {
  bosses: [{
    id: 'boss-1',
    setupStatus: 'ready',
    bossName: 'Dragão',
    maxHealth: 500,
    currentHealth: 375,
    shield: 2,
    nextAction: 'Sopro flamejante',
    actionSeverity: 'grave',
    turnCount: 3,
    activeStatuses: [],
  }],
  battleStarted: true,
  hudVisible: true,
  revision: 7,
};

test('mantém eventos na ordem de chegada mesmo quando a primeira mídia demora', async () => {
  const queue = createOrderedEventQueue();
  const published = [];
  const first = queue.enqueue(async (isCurrent) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (isCurrent()) published.push('primeiro');
  });
  const second = queue.enqueue(() => published.push('segundo'));
  await Promise.all([first, second]);
  assert.deepEqual(published, ['primeiro', 'segundo']);
});

test('descarta eventos antigos quando um snapshot substitui a fila', async () => {
  const queue = createOrderedEventQueue();
  const published = [];
  const stale = queue.enqueue(async (isCurrent) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (isCurrent()) published.push('antigo');
  });
  queue.reset();
  const current = queue.enqueue(() => published.push('atual'));
  await Promise.all([stale, current]);
  assert.deepEqual(published, ['atual']);
});

test('adapta somente o estado público ao HUD legado do Electron', () => {
  const result = toBattleState(publicBattle);
  assert.equal(result.bosses[0].bossName, 'Dragão');
  assert.equal(result.bosses[0].currentHealth, 375);
  assert.equal(result.bosses[0].attack, 0);
  assert.equal(result.bosses[0].damageReduction, 0);
  assert.equal(result.activeBossId, 'boss-1');
  assert.equal(result.battleStarted, true);
});

test('reconstrói apenas os marcadores necessários para a apresentação', () => {
  const battle = toBattleState(publicBattle);
  const result = toScenePlan({
    phaseMarkers: [
      { phaseId: 'phase-2', triggerBossId: 'boss-1', startHealth: 300 },
      { phaseId: 'phase-3', triggerBossId: 'boss-1', startHealth: 100 },
    ],
    activePhaseIndex: 1,
    blackoutActive: false,
    revision: 4,
  }, battle);
  assert.deepEqual(
    result.phases.map((phase) => phase.startHealth),
    [500, 300, 100],
  );
  assert.equal(result.activePhaseIndex, 1);
});

test('mantém controles sonoros públicos sem expor atalhos privados', () => {
  const result = toSoundboardState({
    volume: 0.4,
    muted: true,
    loop: false,
    universalMuted: false,
    revision: 2,
  });
  assert.equal(result.volume, 0.4);
  assert.equal(result.muted, true);
  assert.equal(result.slots.length, 20);
  assert.equal(result.slots.every((slot) => !slot.assigned), true);
});

test('usa rota HTTP somente quando o renderer web a habilita', () => {
  const previousWindow = globalThis.window;
  globalThis.window = { __BOSS_WEB_PLAYER__: true };
  try {
    assert.equal(
      bundledAssetUrl('status-icons/status icon.png'),
      '/session-assets/status-icons/status%20icon.png',
    );
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('pré-carrega apenas as mídias públicas presentes no snapshot atual', () => {
  const urls = publicMediaUrlsFromSnapshot({
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    revision: 1,
    battle: publicBattle,
    background: {
      url: '/session-media/background?access=token',
      name: null,
      mediaType: 'image',
    },
    scene: {
      phaseMarkers: [],
      activePhaseIndex: 0,
      blackoutActive: false,
      revision: 1,
    },
    encounterEffects: {
      volume: 0.8,
      universalMuted: false,
      general: { automaticStatusEffects: true, showPhaseMarkers: false },
      sounds: {
        damage: true,
        criticalDamage: true,
        heal: true,
        shield: true,
      },
      visuals: {
        screenShake: true,
        healthBarShake: true,
        damageEffect: true,
        healEffect: true,
        particles: true,
        floatingDamageNumbers: true,
        healthValues: false,
      },
    },
    music: {
      tracks: [{
        id: 'track-1',
        name: 'Tema',
        url: '/session-media/music?access=token',
        duration: 90,
      }],
      currentTrackId: 'track-1',
      isPlaying: false,
      loop: false,
      volume: 0.8,
      muted: false,
      universalMuted: false,
      playbackVersion: 0,
      currentTime: 0,
      synchronizedAt: 0,
      revision: 1,
    },
    soundboard: {
      volume: 0.8,
      muted: false,
      loop: false,
      universalMuted: false,
      revision: 1,
    },
    encounterSoundUrls: [
      '/session-media/damage?access=token',
      '/session-media/damage?access=token',
    ],
  });
  assert.deepEqual(urls, [
    '/session-media/background?access=token',
    '/session-media/music?access=token',
    '/session-media/damage?access=token',
  ]);
});
