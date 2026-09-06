import test from 'node:test';
import assert from 'node:assert/strict';
import { SfxMusicDucking } from '../src/sfx-music-ducking.ts';

test('o SFX reduz proporcionalmente sem mutar e restaura ao terminar, sem espera fixa', () => {
  const duck = new SfxMusicDucking();
  const events = [];
  const stop = duck.subscribe((gain, seconds) => events.push([gain, seconds]));
  duck.start(1);
  assert.equal(duck.gain, 0.35);
  for (const volume of [0.01, 0.2, 0.5, 1, 2]) {
    assert.ok(volume * duck.gain > 0);
    assert.ok(volume * duck.gain < volume);
  }
  duck.end(1);
  assert.deepEqual(events, [[1, 0], [0.35, 0.12], [1, 0.25]]);
  stop();
});

test('efeitos sobrepostos não restauram a música antes do último terminar', () => {
  const duck = new SfxMusicDucking();
  duck.start(1); duck.start(2); duck.start(2);
  duck.end(1); assert.equal(duck.gain, 0.35);
  duck.end(99); assert.equal(duck.gain, 0.35);
  duck.end(2); assert.equal(duck.gain, 1);
});
