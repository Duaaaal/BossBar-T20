import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySceneBossPatch,
  createScenePlan,
  createSceneRanges,
  crossedScenePhaseIndexes,
  scenePhaseAtHealth,
  validateSceneRanges,
} from '../src/shared/scene.ts';
import { createInitialBoss } from '../src/shared/battle.ts';

test('distribui de uma a oito fases por toda a margem de vida', () => {
  assert.deepEqual(createSceneRanges(2), [
    { startPercent: 100, endPercent: 50 },
    { startPercent: 50, endPercent: 0 },
  ]);
  assert.equal(createSceneRanges(99).length, 8);
  assert.equal(validateSceneRanges(createSceneRanges(8)), null);
});

test('inicia a cena com uma fase base e marcadores opcionais desativados', () => {
  const plan = createScenePlan([createInitialBoss('boss-1')]);
  assert.equal(plan.phases.length, 1);
  assert.equal(plan.phases[0].startPercent, 100);
  assert.equal(plan.phases[0].endPercent, 0);
  assert.equal(plan.showPhaseMarkers, false);
});

test('rejeita lacunas, sobreposições e margens incompletas', () => {
  assert.match(validateSceneRanges([
    { startPercent: 100, endPercent: 60 },
    { startPercent: 50, endPercent: 0 },
  ]), /compartilhar/);
  assert.match(validateSceneRanges([
    { startPercent: 90, endPercent: 0 },
  ]), /100%/);
});

test('localiza a fase atual e cruza várias fases somente ao perder vida', () => {
  const phases = createSceneRanges(4);
  assert.equal(scenePhaseAtHealth(phases, 74, 100), 1);
  assert.deepEqual(crossedScenePhaseIndexes(phases, 100, 20, 100, 0), [1, 2, 3]);
  assert.deepEqual(crossedScenePhaseIndexes(phases, 20, 80, 100, 3), []);
});

test('aplica apenas valores preenchidos e preserva zero como valor válido', () => {
  const boss = createInitialBoss('boss-1');
  const changed = applySceneBossPatch(boss, {
    bossName: 'Forma Final',
    attack: 24,
    shield: 0,
  });
  assert.equal(changed.bossName, 'Forma Final');
  assert.equal(changed.attack, 24);
  assert.equal(changed.shield, 0);
  assert.equal(changed.rangedAttack, boss.rangedAttack);
});
