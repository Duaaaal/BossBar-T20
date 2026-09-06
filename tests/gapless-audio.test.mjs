import assert from 'node:assert/strict';
import test from 'node:test';
import { installGaplessLoop, mediaPlaybackTime, seekMediaPlayback } from '../src/gapless-audio-loop.ts';

test('o loop usa o relógio de áudio sem reiniciar por jitter do decoder e mantém seek explícito', async () => {
  const node = () => ({ connect(target) { return target; }, disconnect() {}, gain: {
    value: 1, cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {},
  } });
  const audio = Object.assign(new EventTarget(), { loop: true, paused: false, ended: false, duration: 10,
    currentTime: 0, readyState: 4, src: 'data:application/octet-stream;base64,AQID' });
  let starts = 0;
  const context = { currentTime: 0, sampleRate: 48000, createGain: node,
    decodeAudioData: async () => ({ duration: 10, length: 480000, numberOfChannels: 1 }),
    createBufferSource: () => ({ ...node(), start() { starts++; }, stop() {} }),
  };
  const dispose = installGaplessLoop(audio, context, node(), node());
  try {
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(starts, 1);
    context.currentTime = 2;
    audio.currentTime = 1.3;
    await new Promise((resolve) => setTimeout(resolve, 220));
    assert.equal(starts, 1, 'clock drift must not stop and recreate the audible buffer');
    assert.equal(mediaPlaybackTime(audio), 2);
    seekMediaPlayback(audio, 7);
    assert.equal(starts, 2);
    assert.equal(mediaPlaybackTime(audio), 7);
    audio.paused = true; audio.dispatchEvent(new Event('pause'));
    assert.equal(mediaPlaybackTime(audio), 7);
  } finally { dispose(); }
});
