import { test, expect } from '@playwright/test';
// Package exports are resolved by Node; eslint's legacy resolver misses them.
// eslint-disable-next-line import/no-unresolved
import { parseFile } from 'music-metadata';
import { writeFile } from 'node:fs/promises';
import { createPublicBattle, joinHostedSession, startHostedTestSession } from '../support/hosted-session';

type LoopProbe = { starts: Array<{ time: number; offset: number; duration: number }>; stops: number[]; samples: Array<{ time: number; rms: number }>; native: Array<{ event: string; at: number; position: number }> };
test('faixa real atravessa a primeira volta sem reiniciar o trecho audível', async ({ page }, info) => {
  const filePath = process.env.BOSSBAR_REAL_LOOP_MEDIA;
  test.skip(!filePath, 'Defina BOSSBAR_REAL_LOOP_MEDIA para validar a mídia real da mesa.');
  const duration = (await parseFile(filePath!)).format.duration!;
  test.setTimeout((duration + 65) * 1000);
  const mediaId = 'real-loop-music-0001';
  const session = await startHostedTestSession({ preloadMediaIds: [], extraMedia: new Map([[mediaId, { filePath: filePath!, contentType: 'audio/mpeg' }]]) });
  try {
    await page.addInitScript(() => {
      const probe: LoopProbe = { starts: [], stops: [], samples: [], native: [] }; Object.assign(window, { __realLoopProbe: probe });
      const create = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function () {
        const source = create.call(this); const start = source.start.bind(source); const stop = source.stop.bind(source);
        source.start = (when = 0, offset = 0, duration) => {
          if (source.loop && source.buffer && source.buffer.duration > 30) {
            probe.starts.push({ time: this.currentTime, offset, duration: source.buffer.duration });
            const analyser = this.createAnalyser(); analyser.fftSize = 2048; const mute = this.createGain(); mute.gain.value = 0;
            source.connect(analyser).connect(mute).connect(this.destination); const data = new Float32Array(2048);
            const timer = setInterval(() => { analyser.getFloatTimeDomainData(data); probe.samples.push({ time: this.currentTime, rms: Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length) }); }, 200);
            source.addEventListener('ended', () => clearInterval(timer));
          }
          if (duration === undefined) start(when, offset); else start(when, offset, duration);
        };
        source.stop = (when) => { if (source.loop && source.buffer && source.buffer.duration > 30) probe.stops.push(this.currentTime); stop(when); };
        return source;
      };
      for (const event of ['seeking', 'seeked', 'stalled', 'waiting', 'pause', 'playing', 'ended']) document.addEventListener(event, (notification) => {
        const audio = notification.target; if (audio instanceof HTMLAudioElement && audio.classList.contains('music-player')) probe.native.push({ event, at: performance.now(), position: audio.currentTime });
      }, true);
    });
    await joinHostedSession(page, session.inviteUrl, 'Loop real');
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getMusicState()).tracks.length)).toBeGreaterThan(0);
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    session.server.publishMusic({ tracks: [{ id: mediaId, name: 'Faixa real', url: session.mediaUrl(mediaId), duration }], currentTrackId: mediaId, loop: true, isPlaying: true, volume: 0.8, muted: false, universalMuted: false, playbackVersion: 1, currentTime: 0, synchronizedAt: Date.now(), revision: 2 });
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __realLoopProbe: LoopProbe }).__realLoopProbe.starts.length)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => { const p = (window as typeof window & { __realLoopProbe: LoopProbe }).__realLoopProbe; return (p.samples.at(-1)?.time ?? 0) - p.starts[0].time; }), { timeout: (duration + 20) * 1000, intervals: [2000] }).toBeGreaterThan(duration + 12);
    const probe = await page.evaluate(() => (window as typeof window & { __realLoopProbe: LoopProbe }).__realLoopProbe);
    await writeFile(info.outputPath('real-loop-probe.json'), JSON.stringify(probe));
    expect(probe.starts).toHaveLength(1); expect(probe.stops).toHaveLength(0);
    const tail = probe.samples.filter(({ time }) => time - probe.starts[0].time > duration + 2);
    expect(tail.filter(({ rms }) => rms > 0.0001).length).toBeGreaterThan(tail.length * 0.9);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
  } finally {
    await writeFile(info.outputPath('real-loop-final.json'), JSON.stringify(await page.evaluate(() => ({ probe: (window as typeof window & { __realLoopProbe: LoopProbe }).__realLoopProbe, audios: [...document.querySelectorAll('audio')].map((audio) => ({ src: audio.src, duration: audio.duration, time: audio.currentTime, paused: audio.paused, loop: audio.loop, ready: audio.readyState, error: audio.error?.message })) }))));
    await session.close();
  }
});
