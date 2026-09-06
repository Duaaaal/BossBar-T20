import assert from 'node:assert/strict';
import test from 'node:test';
import { retainPhaseAudio, takePhaseAudioHandoff, finishPhaseAudioHandoff } from '../src/phase-audio-handoff.ts';
import { phaseHudOpacity } from '../src/shared/scene.ts';

test('o HUD aguarda dois segundos e entra gradualmente pelos três seguintes no relógio comum', () => {
  const entrance = { startedAt: 1000, hudDelaySeconds: 2, hudFadeInSeconds: 3 };
  assert.equal(phaseHudOpacity(entrance, 2999), 0);
  assert.equal(phaseHudOpacity(entrance, 3000), 0);
  assert.equal(phaseHudOpacity(entrance, 4500), 0.5);
  assert.equal(phaseHudOpacity(entrance, 6000), 1);
  assert.equal(phaseHudOpacity(entrance, 9000), 1);
  assert.equal(phaseHudOpacity(null, 1), 1);
});

test('transfere o mesmo decoder sem fechar ou duplicar seu áudio', () => {
  let releases = 0;
  const owner = { audio: {}, context: {}, gain: {}, source: {}, release: () => releases++ };
  retainPhaseAudio('next', owner);
  assert.equal(takePhaseAudioHandoff('other'), null);
  const taken = takePhaseAudioHandoff('next');
  assert.equal(taken.audio, owner.audio);
  assert.equal(taken.context, owner.context);
  assert.equal(releases, 0);
  finishPhaseAudioHandoff();
  assert.equal(releases, 0, 'transfer relinquishes ownership');
  taken.release();
  assert.equal(releases, 1);
  retainPhaseAudio('aborted', owner);
  finishPhaseAudioHandoff(); finishPhaseAudioHandoff();
  assert.equal(releases, 2, 'interruption releases exactly once');
});

test('o HUD começa o intervalo e o fade somente depois dos cinco segundos de blackout', () => {
  const entrance = { startedAt: 1000, visualStartedAt: 6000, hudDelaySeconds: 0, hudFadeInSeconds: 2 };
  assert.equal(phaseHudOpacity(entrance, 5999), 0);
  assert.equal(phaseHudOpacity(entrance, 6000), 0);
  assert.equal(phaseHudOpacity(entrance, 7000), 0.5);
  assert.equal(phaseHudOpacity(entrance, 8000), 1);
  assert.equal(phaseHudOpacity({ ...entrance, hudDelaySeconds: 2 }, 8000), 0);
  assert.equal(phaseHudOpacity({ ...entrance, hudDelaySeconds: 2 }, 9000), 0.5);
});
