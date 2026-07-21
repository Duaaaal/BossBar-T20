import assert from 'node:assert/strict';
import test from 'node:test';
import { bundledAssetUrl } from '../src/shared/bundled-assets.ts';
import {
  toBattleState,
  toScenePlan,
  toSoundboardState,
} from '../src/web-player-api.ts';

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
