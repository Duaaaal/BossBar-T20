import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBoss } from '../src/shared/battle.ts';
import {
  adjacentScenePlaylistTrackId,
  applySceneBossPatch,
  clampSceneOverflowHealth,
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
  assert.equal(plan.phases[0].bosses[0].carryOverflowDamage, true);
});

test('cria uma progressão universal contendo todos os chefões', () => {
  const plan = createScenePlan([
    createInitialBoss('boss-1'),
    { ...createInitialBoss('boss-2'), currentHealth: 320, maxHealth: 400 },
  ]);

  assert.equal(plan.phases.length, 1);
  assert.equal(plan.phases[0].triggerBossId, 'boss-1');
  assert.deepEqual(plan.phases[0].bosses.map((directive) => directive.bossId), [
    'boss-1',
    'boss-2',
  ]);
  assert.deepEqual(plan.activePhaseIds, { 'boss-1': null, 'boss-2': null });
  assert.equal(validateSceneRanges(plan.phases), null);
});

test('permite até oito fases na progressão universal', () => {
  const plan = createScenePlan([
    createInitialBoss('boss-1'),
    createInitialBoss('boss-2'),
  ]);
  const phases = createSceneRanges(8, 500).map((range, index) => ({
      ...plan.phases[0],
      ...range,
      id: `phase-${index + 1}`,
      name: `Fase ${index + 1}`,
    }));

  assert.equal(validateSceneRanges(phases), null);
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

test('publica a descrição e a gravidade configuradas para a fase', () => {
  const boss = createInitialBoss('boss-1');
  const changed = applySceneBossPatch(boss, {
    nextAction: 'O dragão prepara uma explosão.',
    actionSeverity: 'grave',
  });
  assert.equal(changed.nextAction, 'O dragão prepara uma explosão.');
  assert.equal(changed.actionSeverity, 'grave');
  assert.equal(changed.actionPrepared, true);
});

test('limita ou preserva o dano excedente conforme a fase e o chefão', () => {
  const phase = { triggerBossId: 'boss-1', endHealth: 250 };
  assert.equal(clampSceneOverflowHealth({
    phase,
    directive: { carryOverflowDamage: false },
    bossId: 'boss-1',
    bossMaximum: 1000,
    triggerMaximum: 1000,
    previousHealth: 300,
    nextHealth: 180,
  }), 250);
  assert.equal(clampSceneOverflowHealth({
    phase,
    directive: { carryOverflowDamage: false },
    bossId: 'boss-2',
    bossMaximum: 400,
    triggerMaximum: 1000,
    previousHealth: 140,
    nextHealth: 50,
  }), 100);
  assert.equal(clampSceneOverflowHealth({
    phase,
    directive: { carryOverflowDamage: true },
    bossId: 'boss-1',
    bossMaximum: 1000,
    triggerMaximum: 1000,
    previousHealth: 300,
    nextHealth: 180,
  }), 180);
});
