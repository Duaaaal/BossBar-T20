import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBoss } from '../src/shared/battle.ts';
import {
  adjacentScenePlaylistTrackId,
  applySceneBossPatch,
  createScenePlan,
  createSceneRanges,
  crossedScenePhaseIndexes,
  scenePhaseAtHealth,
  sceneTransitionSourceIndex,
  validateSceneRanges,
} from '../src/shared/scene.ts';

test('usa a fase anterior como origem da transição e não a fase final', () => {
  assert.equal(sceneTransitionSourceIndex(1, 3), 0);
  assert.equal(sceneTransitionSourceIndex(2, 3), 1);
  assert.equal(sceneTransitionSourceIndex(0, 3), -1);
});

test('navega na playlist da fase em ciclo e preserva playlists unitárias', () => {
  const tracks = [
    { id: 'a', name: 'A', duration: 1, url: 'a' },
    { id: 'b', name: 'B', duration: 1, url: 'b' },
    { id: 'c', name: 'C', duration: 1, url: 'c' },
  ];
  assert.equal(adjacentScenePlaylistTrackId({ tracks, currentTrackId: 'a' }, -1), 'c');
  assert.equal(adjacentScenePlaylistTrackId({ tracks, currentTrackId: 'c' }, 1), 'a');
  assert.equal(adjacentScenePlaylistTrackId({ tracks: tracks.slice(0, 1), currentTrackId: 'a' }, 1), 'a');
});

test('distribui de uma a oito fases por toda a margem absoluta de vida', () => {
  assert.deepEqual(createSceneRanges(2, 900), [
    { startHealth: 900, endHealth: 450 },
    { startHealth: 450, endHealth: 0 },
  ]);
  assert.equal(createSceneRanges(99).length, 8);
  assert.equal(validateSceneRanges(createSceneRanges(8)), null);
});

test('inicia a cena com uma fase base e marcadores opcionais desativados', () => {
  const plan = createScenePlan([createInitialBoss('boss-1')]);
  assert.equal(plan.phases.length, 1);
  assert.equal(plan.phases[0].startHealth, 500);
  assert.equal(plan.phases[0].endHealth, 0);
  assert.equal(plan.phases[0].transitionDurationSeconds, 2);
  assert.equal(plan.blackoutActive, false);
  assert.equal(plan.showPhaseMarkers, false);
});

test('rejeita lacunas, sobreposições e margens incompletas', () => {
  assert.match(validateSceneRanges([
    { startHealth: 900, endHealth: 600 },
    { startHealth: 500, endHealth: 0 },
  ]), /compartilhar/);
  assert.match(validateSceneRanges([
    { startHealth: 90, endHealth: 90 },
  ]), /inválida/);
});

test('localiza a fase atual e cruza várias fases somente ao perder vida', () => {
  const phases = createSceneRanges(4);
  assert.equal(scenePhaseAtHealth(phases, 74), 1);
  assert.deepEqual(crossedScenePhaseIndexes(phases, 100, 20, 0), [1, 2, 3]);
  assert.deepEqual(crossedScenePhaseIndexes(phases, 20, 80, 3), []);
});

test('aplica apenas valores preenchidos e preserva zero como valor válido', () => {
  const boss = createInitialBoss('boss-1');
  const changed = applySceneBossPatch(boss, {
    bossName: 'Forma Final',
    currentHealth: 320,
    attack: 24,
    shield: 0,
  });
  assert.equal(changed.bossName, 'Forma Final');
  assert.equal(changed.attack, 24);
  assert.equal(changed.currentHealth, 320);
  assert.equal(changed.shield, 0);
  assert.equal(changed.rangedAttack, boss.rangedAttack);

  const capped = applySceneBossPatch(boss, {
    maxHealth: 300,
    currentHealth: 900,
  });
  assert.equal(capped.maxHealth, 300);
  assert.equal(capped.currentHealth, 300);
});
