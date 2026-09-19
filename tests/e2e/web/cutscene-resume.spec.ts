import { expect, test, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession, TEST_MEDIA_IDS } from '../support/hosted-session';
import type { CutscenePlayback } from '../../../src/shared/scene';
import { normalizeEncounterCheckpoint } from '../../../src/shared/encounter-checkpoint';

type CutsceneVideoEvent = {
  event: string; wallTime: number; monotonicTime: number; presentationTime: number | null;
  currentTime: number; duration: number | null; seeking: boolean; paused: boolean;
  ended: boolean; readyState: number; networkState: number;
  error: { code: number; message: string } | null;
  playback: { id: string; stage: string; startedAt: number | null } | null;
};
type CutsceneVideoProbeWindow = typeof window & { __cutsceneVideoEvents: CutsceneVideoEvent[] };

test('prepara vídeo em dois clientes e usa a mesma linha do tempo', async ({ browser }, testInfo) => {
  const ready = new Map<string, number | null>();
  const session = await startHostedTestSession({ preloadMediaIds: [], onCutsceneReady: (playerId, _id, duration) => ready.set(playerId, duration) });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  let pages: Page[] = [];
  let synchronizationSamples: unknown[] = [];
  try {
    for (const context of contexts) await context.addInitScript(() => {
      const videoEvents: CutsceneVideoEvent[] = [];
      (window as CutsceneVideoProbeWindow).__cutsceneVideoEvents = videoEvents;
      for (const event of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'play', 'playing', 'pause', 'seeking', 'seeked', 'ended', 'waiting', 'stalled', 'error', 'emptied', 'durationchange', 'timeupdate']) {
        document.addEventListener(event, (notification) => {
          const video = notification.target;
          if (!(video instanceof HTMLVideoElement) || !video.matches('.cutscene-presentation video')) return;
          const record: CutsceneVideoEvent = {
            event, wallTime: Date.now(), monotonicTime: performance.now(),
            presentationTime: window.bossAPI?.getPresentationTime() ?? null,
            currentTime: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : null,
            seeking: video.seeking, paused: video.paused, ended: video.ended,
            readyState: video.readyState, networkState: video.networkState,
            error: video.error ? { code: video.error.code, message: video.error.message } : null,
            playback: null,
          };
          videoEvents.push(record);
          if (videoEvents.length > 2000) videoEvents.shift();
          void window.bossAPI?.getScenePlan().then((plan) => {
            const playback = plan.cutscenePlayback;
            record.playback = playback ? { id: playback.id, stage: playback.stage, startedAt: playback.startedAt } : null;
          }).catch(() => undefined);
        }, true);
      }
      const audio = HTMLMediaElement.prototype.play;
      const played: HTMLMediaElement[] = [];
      Object.assign(window, { __cutsceneAudio: played });
      const createBuffer = AudioContext.prototype.createBufferSource;
      const loops: AudioBufferSourceNode[] = [];
      Object.assign(window, { __decodedLoops: loops });
      AudioContext.prototype.createBufferSource = function () {
        const source = createBuffer.call(this); loops.push(source); return source;
      };
      HTMLMediaElement.prototype.play = function () {
        if (this instanceof HTMLAudioElement && this.dataset.cutsceneVideoAudio !== 'true' && !played.includes(this)) played.push(this);
        return audio.call(this);
      };
      const createSource = AudioContext.prototype.createMediaElementSource;
      const videoGains: GainNode[] = [];
      Object.assign(window, { __videoGains: videoGains });
      AudioContext.prototype.createMediaElementSource = function (element) {
        const source = createSource.call(this, element);
        const connect = source.connect.bind(source);
        source.connect = ((destination: AudioNode) => {
          if (element.dataset.cutsceneVideoAudio === 'true' && destination instanceof GainNode) videoGains.push(destination);
          return connect(destination);
        }) as typeof source.connect;
        return source;
      };
    });
    pages = await Promise.all(contexts.map((context) => context.newPage()));
    await joinHostedSession(pages[0], session.inviteUrl, 'Cena um');
    await joinHostedSession(pages[1], session.inviteUrl, 'Cena dois');
    await pages[1].route('**/session-media/**', async (route) => {
      if (route.request().url().includes(TEST_MEDIA_IDS.video)) await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    const cutscene: CutscenePlayback = { id: 'scene-synchronized', cutsceneId: 'cut-1', targetPhaseIndex: 1,
      stage: 'loading', startedAt: null, offsetSeconds: 0, durationSeconds: 1,
      advanceMode: 'manual', backgroundUrl: session.mediaUrl(TEST_MEDIA_IDS.video), mediaType: 'video',
      music: { tracks: [{ id: 'cut-music', name: 'Trilha da cutscene', url: session.mediaUrl(TEST_MEDIA_IDS.music), duration: 1 }], currentTrackId: 'cut-music', volume: 0.4, muted: false, loop: true, revision: 1 },
      sound: { tracks: [{ id: 'cut-sound', name: 'SFX da cutscene', url: session.mediaUrl(TEST_MEDIA_IDS.music), duration: 1 }], currentTrackId: 'cut-sound', volume: 0.8, muted: false, loop: true, revision: 1 },
      transition: 'fade', transitionDurationSeconds: 0.1 };
    cutscene.nextMusic = { ...cutscene.music!, tracks: cutscene.music!.tracks.map((track) => ({ ...track, id: 'next-music' })), currentTrackId: 'next-music' };
    cutscene.visualFadeInSeconds = 3;
    cutscene.visualFadeOutSeconds = 0.4;
    cutscene.audioFadeInSeconds = 0.1;
    cutscene.audioFadeOutSeconds = 0.6;
    let manifestRefreshes = 0;
    pages[0].on('request', (request) => { if (new URL(request.url()).pathname === '/api/preload') manifestRefreshes += 1; });
    const scene = { phaseMarkers: [], activePhaseIndex: 0, blackoutActive: false, revision: 2, mediaRevision: 1 };
    session.server.publishScene({ ...scene, cutscenePlayback: cutscene });
    for (const page of pages) await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getScenePlan()).cutscenePlayback?.id)).toBe(cutscene.id);
    for (const page of pages) await expect(page.locator('.cutscene-presentation video')).toHaveJSProperty('readyState', 4);
    await expect.poll(() => ready.size).toBe(2);
    await expect.poll(() => manifestRefreshes).toBeGreaterThan(0);
    for (const page of pages) {
      await expect(page.locator('.cutscene-presentation')).toHaveAttribute('data-cutscene-stage', 'loading');
      expect(await page.locator('.cutscene-presentation video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
    }
    const playingCutscene: CutscenePlayback = { ...cutscene, videoVolume: 0.4, videoMuted: false, stage: 'playing', startedAt: Date.now() + 700 };
    session.server.publishScene({ ...scene, revision: 3, cutscenePlayback: playingCutscene });
    for (const page of pages) await expect(page.locator('.cutscene-presentation')).toHaveClass(/is-playing/);
    for (const page of pages) {
      await expect(page.locator('html')).toHaveClass(/cutscene-active/);
      await expect(page.locator('.encounter-turn-tools')).toBeHidden();
    }
    const samples = await Promise.all(pages.map((page) => page.locator('.cutscene-presentation video').evaluate(async (video: HTMLVideoElement) => {
      const sample = {
        wallTime: Date.now(), monotonicTime: performance.now(), presentationTime: window.bossAPI.getPresentationTime(),
        currentTime: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : null,
        seeking: video.seeking, paused: video.paused, ended: video.ended,
        readyState: video.readyState, networkState: video.networkState,
        error: video.error ? { code: video.error.code, message: video.error.message } : null,
      };
      const playback = (await window.bossAPI.getScenePlan()).cutscenePlayback;
      return { ...sample, startedAt: playback?.startedAt ?? null, stage: playback?.stage ?? null };
    })));
    synchronizationSamples = samples;
    const times = samples.map((sample) => sample.currentTime);
    expect(Math.abs(times[0] - times[1])).toBeLessThan(0.35);
    for (const [index, sample] of samples.entries()) {
      expect(sample.startedAt, `Cliente ${index + 1}: início da cutscene`).not.toBeNull();
      expect(sample.duration, `Cliente ${index + 1}: duração do vídeo`).toBeGreaterThan(0);
      const expectedTime = Math.min(sample.duration!, Math.max(0, (sample.presentationTime - sample.startedAt!) / 1000));
      expect(Math.abs(sample.currentTime - expectedTime), `Cliente ${index + 1}: posição conforme o relógio da apresentação`).toBeLessThan(0.35);
    }
    expect(times[0]).toBeGreaterThanOrEqual(0);
    for (const page of pages) await expect.poll(() => page.locator('.cutscene-presentation video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0);
    for (const page of pages) await expect(page.locator('.cutscene-presentation video')).toHaveJSProperty('muted', true);
    for (const page of pages) await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __cutsceneAudio: HTMLMediaElement[] }).__cutsceneAudio.filter((audio) => !audio.paused).length)).toBe(2);
    for (const page of pages) await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __videoGains: GainNode[] }).__videoGains[0]?.gain.value ?? 0)).toBeGreaterThan(0);
    // Sound gain is already active while the independent picture fade continues.
    expect(await pages[0].locator('.cutscene-presentation').evaluate((element) => Number(getComputedStyle(element).opacity))).toBeLessThan(1);
    for (const page of pages) await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __decodedLoops: AudioBufferSourceNode[] }).__decodedLoops.filter((source) => source.loop && source.buffer).length)).toBeGreaterThan(0);
    session.server.publishScene({ ...scene, revision: 4, cutscenePlayback: { ...playingCutscene, videoMuted: true, musicTransport: { position: 0.1, updatedAt: Date.now(), playing: false } } });
    for (const page of pages) {
      await expect.poll(() => page.evaluate(() => (window as typeof window & { __videoGains: GainNode[] }).__videoGains[0]?.gain.value ?? 1)).toBeLessThan(0.001);
      await expect.poll(() => page.evaluate(() => (window as typeof window & { __cutsceneAudio: HTMLMediaElement[] }).__cutsceneAudio.filter((audio) => !audio.paused).length)).toBe(1);
    }
    session.server.publishScene({ ...scene, revision: 5, cutscenePlayback: { ...playingCutscene, stage: 'ending', endingAt: Date.now() + 200 } });
    for (const page of pages) {
      await expect(page.locator('.cutscene-presentation')).toHaveClass(/is-ending/);
      await expect(page.locator('.cutscene-presentation video')).toHaveCSS('opacity', '0');
    }
    for (const page of pages) await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __cutsceneAudio: HTMLMediaElement[] }).__cutsceneAudio.filter((audio) => !audio.paused).length)).toBe(3);
    for (const page of pages) await expect(page.locator('html')).not.toHaveClass(/cutscene-active/);
    // An interruption/reset must release all media instead of retaining a handoff.
    session.server.publishScene({ ...scene, revision: 6, cutscenePlayback: { ...playingCutscene, stage: 'playing' } });
    for (const page of pages) await expect(page.locator('.cutscene-presentation')).toHaveAttribute('data-cutscene-stage', 'playing');
    session.server.publishScene({ ...scene, revision: 7, cutscenePlayback: null });
    for (const page of pages) await expect(page.locator('.cutscene-presentation')).toHaveCount(0);
    for (const page of pages) await expect(page.locator('html')).not.toHaveClass(/cutscene-active/);
    for (const page of pages) await expect.poll(() => page.evaluate(() =>
      (window as typeof window & { __cutsceneAudio: HTMLMediaElement[] }).__cutsceneAudio.filter((audio) => !audio.paused).length)).toBe(0);
  } finally {
    try {
      const clients = await Promise.all(pages.map(async (page, index) => ({
        index, events: await page.evaluate(() => (window as CutsceneVideoProbeWindow).__cutsceneVideoEvents)
          .catch((error: unknown) => ({ captureError: error instanceof Error ? error.message : String(error) })),
      })));
      const diagnosticPath = testInfo.outputPath('cutscene-video-synchronization.json');
      await writeFile(diagnosticPath, JSON.stringify({ samples: synchronizationSamples, clients }, null, 2));
      await testInfo.attach('cutscene-video-synchronization', { path: diagnosticPath, contentType: 'application/json' });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      await session.close();
    }
  }
});

type PhaseHandoffProbeWindow = typeof window & {
  __playedAudio: HTMLAudioElement[];
  __loadedAudio: Array<{ audio: HTMLAudioElement; src: string }>;
  __audioContexts: Map<HTMLMediaElement, AudioContext>;
  __adoptedAudio: HTMLAudioElement | null;
  __prefetchedAudio: HTMLAudioElement | null;
  __returnedAudio: HTMLAudioElement | null;
  __returnLoadsAtPreparation: number;
  __preparedAfterReturn: HTMLAudioElement | null;
  __adoptionInterruptions: string[];
  __prefetchInterruptions: string[];
  __prefetchBoundaryActive: boolean;
  __handoffBoundaryActive: boolean;
  __nativeLoopWraps: number;
  __trackEndedCalls: number;
};

test('a fase adota o áudio com cena e música publicadas juntas e mantém loop e fim de faixa', async ({ page }, testInfo) => {
  const session = await startHostedTestSession();
  try {
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      const load = HTMLMediaElement.prototype.load;
      const played: HTMLAudioElement[] = [];
      const loaded: Array<{ audio: HTMLAudioElement; src: string }> = [];
      const contexts = new Map<HTMLMediaElement, AudioContext>();
      Object.assign(window, { __playedAudio: played, __loadedAudio: loaded,
        __audioContexts: contexts, __returnedAudio: null, __returnLoadsAtPreparation: 0, __preparedAfterReturn: null,
        __adoptedAudio: null, __prefetchedAudio: null, __prefetchInterruptions: [], __prefetchBoundaryActive: false,
        __adoptionInterruptions: [], __handoffBoundaryActive: false,
        __nativeLoopWraps: 0, __trackEndedCalls: 0 });
      HTMLMediaElement.prototype.play = function () {
        if (this instanceof HTMLAudioElement && !played.includes(this)) played.push(this);
        return play.call(this);
      };
      HTMLMediaElement.prototype.load = function () {
        if (this instanceof HTMLAudioElement) loaded.push({ audio: this, src: this.src });
        return load.call(this);
      };
      const createSource = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function (element) {
        const source = createSource.call(this, element);
        contexts.set(element, this);
        return source;
      };
    });
    await joinHostedSession(page, session.inviteUrl, 'Áudio contínuo');
    // The stage can mount before the initial asynchronous media snapshot ends.
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getMusicState()).tracks.length)).toBeGreaterThan(0);
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    const track = { id: 'phase-next', name: 'Próxima faixa', duration: 1, url: session.mediaUrl(TEST_MEDIA_IDS.music) };
    const music = { tracks: [track], currentTrackId: track.id, isPlaying: true, loop: true,
      volume: 0.4, muted: false, universalMuted: false, playbackVersion: 1,
      currentTime: 0, synchronizedAt: Date.now(), revision: 1 };
    session.server.publishMusic({ ...music, externalPlayback: true });
    const cut: CutscenePlayback = { id: 'handoff', cutsceneId: 'cut', targetPhaseIndex: 1,
      stage: 'playing', startedAt: Date.now(), offsetSeconds: 0, durationSeconds: 1,
      advanceMode: 'manual', backgroundUrl: null, mediaType: 'image', music: null, sound: null,
      transition: 'fade', transitionDurationSeconds: 0.1, nextMusic: { ...music, revision: 1 },
      audioFadeOutSeconds: 0.2, nextAudioFadeInSeconds: 0.6 };
    const scene = { phaseMarkers: [], activePhaseIndex: 0, blackoutActive: false, revision: 2 };
    session.server.publishScene({ ...scene, cutscenePlayback: cut });
    await expect(page.locator('.cutscene-presentation')).toHaveClass(/is-playing/);
    const endingAt = Date.now() + 100;
    const phaseEntrance = { phaseId: 'phase-next', startedAt: endingAt,
      visualStartedAt: endingAt, visualSeconds: 0, audioSeconds: cut.nextAudioFadeInSeconds! };
    session.server.publishScene({ ...scene, revision: 3, activePhaseIndex: 1, phaseEntrance,
      cutscenePlayback: { ...cut, stage: 'ending', endingAt } });
    await expect.poll(() => page.evaluate(() => (window as PhaseHandoffProbeWindow)
      .__playedAudio.filter((audio) => !audio.paused).length)).toBe(1);
    // Match the host's fade tail before it removes the cutscene transport.
    await expect.poll(() => Date.now()).toBeGreaterThanOrEqual(endingAt + 200);
    await page.evaluate(() => {
      const probe = window as PhaseHandoffProbeWindow;
      const audio = probe.__playedAudio.find((item) => !item.paused);
      if (!audio) throw new Error('O áudio da próxima fase não começou.');
      probe.__adoptedAudio = audio;
      audio.dataset.adoptionProbe = 'ready';
      const record = (event: string) => {
        if (probe.__handoffBoundaryActive) probe.__adoptionInterruptions.push(event);
      };
      for (const event of ['pause', 'emptied', 'error', 'ended']) {
        audio.addEventListener(event, () => record(event));
      }
      const pause = audio.pause.bind(audio);
      audio.pause = () => { record('programmatic-pause'); pause(); };
      const load = audio.load.bind(audio);
      audio.load = () => { record('programmatic-load'); load(); };
      const removeAttribute = audio.removeAttribute.bind(audio);
      audio.removeAttribute = (name) => {
        if (name === 'src') record('remove-src');
        removeAttribute(name);
      };
      const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
      Object.defineProperty(audio, 'currentTime', {
        get: () => clock.get!.call(audio),
        set: (time) => { record('programmatic-seek'); clock.set!.call(audio, time); },
      });
      const source = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
      Object.defineProperty(audio, 'src', {
        get: () => source.get!.call(audio),
        set: (url) => { record('replace-src'); source.set!.call(audio, url); },
      });
      let previousTime = audio.currentTime;
      audio.addEventListener('timeupdate', () => {
        if (previousTime - audio.currentTime > 0.1) probe.__nativeLoopWraps += 1;
        previousTime = audio.currentTime;
      });
      const trackEnded = window.bossAPI.musicTrackEnded;
      window.bossAPI.musicTrackEnded = () => { probe.__trackEndedCalls += 1; trackEnded(); };
      probe.__handoffBoundaryActive = true;
    });

    // main.finishCutscene publishes both in the same task. Waiting for the
    // cutscene DOM to disappear here would hide React's effect ordering.
    session.server.publishScene({ ...scene, revision: 4, activePhaseIndex: 1,
      phaseEntrance, cutscenePlayback: null });
    const phaseMusic = { ...music, externalPlayback: false, playbackVersion: 2,
      resumeTime: Math.max(0, (Date.now() - endingAt) / 1000), revision: 2 };
    session.server.publishMusic(phaseMusic);

    await expect(page.locator('.cutscene-presentation')).toHaveCount(0);
    await expect(page.locator('audio.music-player')).toHaveAttribute('data-adoption-probe', 'ready');
    expect(await page.locator('audio.music-player').evaluate((audio) =>
      audio === (window as PhaseHandoffProbeWindow).__adoptedAudio)).toBe(true);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('loop', true);
    await expect.poll(() => page.evaluate(() => (window as PhaseHandoffProbeWindow).__nativeLoopWraps)).toBeGreaterThan(0);
    expect(await page.evaluate(() => (window as PhaseHandoffProbeWindow).__adoptionInterruptions)).toEqual([]);
    expect(await page.evaluate(() => (window as PhaseHandoffProbeWindow).__trackEndedCalls)).toBe(0);
    expect(await page.evaluate(() => (window as PhaseHandoffProbeWindow)
      .__playedAudio.filter((audio) => !audio.paused).length)).toBe(1);

    const following = { ...track, id: 'following', name: 'Faixa seguinte',
      url: session.mediaUrl(TEST_MEDIA_IDS.impactSound) };
    // Full playlists model Electron's MusicPlayer input. The normal public
    // projection still exposes only the active track to hosted browsers.
    const playlistMusic = { ...phaseMusic, tracks: [track, following] };
    session.server.publishMusic({ ...playlistMusic, revision: 3 });
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getMusicState()).revision)).toBe(3);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await page.evaluate(async () => {
      const url = (await window.bossAPI.getMusicState()).tracks.find(({ id }) => id === 'following')!.url;
      // The web media validator already released its temporary decoder.
      return (window as PhaseHandoffProbeWindow).__loadedAudio.filter(({ audio, src }) => src === url && audio.src === url).length;
    })).toBe(0);

    // Explicit controls may now pause/seek. Turning loop off must keep the
    // adopted decoder and attach exactly one normal end-of-track callback.
    await page.evaluate(() => { (window as PhaseHandoffProbeWindow).__handoffBoundaryActive = false; });
    session.server.publishMusic({ ...playlistMusic, isPlaying: false, revision: 4 });
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', true);
    session.server.publishMusic({ ...playlistMusic, loop: false, revision: 5 });
    await expect(page.locator('audio.music-player')).toHaveJSProperty('loop', false);
    await expect(page.locator('audio.music-player')).toHaveAttribute('data-adoption-probe', 'ready');
    await expect.poll(() => page.evaluate(async () => {
      const probe = window as PhaseHandoffProbeWindow;
      const url = (await window.bossAPI.getMusicState()).tracks.find(({ id }) => id === 'following')!.url;
      const prepared = probe.__loadedAudio.filter(({ audio, src }) =>
        src === url && audio.readyState >= 3 && audio.paused && audio !== probe.__adoptedAudio);
      return new Set(prepared.map(({ audio }) => audio)).size;
    })).toBe(1);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    await page.evaluate(async () => {
      const probe = window as PhaseHandoffProbeWindow;
      const url = (await window.bossAPI.getMusicState()).tracks.find(({ id }) => id === 'following')!.url;
      const audio = probe.__loadedAudio.find(({ audio, src }) =>
        src === url && audio.readyState >= 3 && audio.paused)!.audio;
      probe.__prefetchedAudio = audio;
      probe.__prefetchBoundaryActive = true;
      const record = (event: string) => {
        if (probe.__prefetchBoundaryActive) probe.__prefetchInterruptions.push(event);
      };
      const load = audio.load.bind(audio);
      audio.load = () => { record('programmatic-load'); load(); };
      const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
      Object.defineProperty(audio, 'currentTime', {
        get: () => clock.get!.call(audio),
        set: (time) => { record('programmatic-seek'); clock.set!.call(audio, time); },
      });
      const source = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
      Object.defineProperty(audio, 'src', {
        get: () => source.get!.call(audio),
        set: (url) => { record('replace-src'); source.set!.call(audio, url); },
      });
    });
    await expect.poll(() => page.evaluate(() => (window as PhaseHandoffProbeWindow).__trackEndedCalls)).toBe(1);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('ended', true);

    // The browser receives track selection from the host. Publish the next
    // host-selected track and verify listeners moved to its replacement node.
    session.server.publishMusic({ ...playlistMusic,
      currentTrackId: 'following', loop: false, resumeTime: 0, playbackVersion: 3, revision: 6 });
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    expect(await page.locator('audio.music-player').evaluate((audio) =>
      audio === (window as PhaseHandoffProbeWindow).__prefetchedAudio)).toBe(true);
    expect(await page.evaluate(() => (window as PhaseHandoffProbeWindow).__prefetchInterruptions)).toEqual([]);
    await page.evaluate(() => { (window as PhaseHandoffProbeWindow).__prefetchBoundaryActive = false; });
    expect(await page.locator('audio.music-player').getAttribute('data-adoption-probe')).toBeNull();
    expect(await page.locator('audio.music-player').evaluate((audio) => {
      const probe = window as PhaseHandoffProbeWindow;
      const context = probe.__audioContexts.get(audio as HTMLAudioElement);
      return { same: Boolean(context && context === probe.__audioContexts.get(probe.__adoptedAudio!)), state: context?.state };
    })).toEqual({ same: true, state: 'running' });

    // Main wraps the playlist, so its last track must prepare the first too.
    await expect.poll(() => page.evaluate(async () => {
      const probe = window as PhaseHandoffProbeWindow;
      const url = (await window.bossAPI.getMusicState()).tracks.find(({ id }) => id === 'phase-next')!.url;
      return new Set(probe.__loadedAudio.filter(({ audio, src }) =>
        src === url && audio.src === url && audio.readyState >= 3 && audio.paused)
        .map(({ audio }) => audio)).size;
    })).toBe(1);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    await page.evaluate(async () => {
      const probe = window as PhaseHandoffProbeWindow;
      const url = (await window.bossAPI.getMusicState()).tracks.find(({ id }) => id === 'phase-next')!.url;
      const audio = probe.__loadedAudio.find(({ audio, src }) =>
        src === url && audio.src === url && audio.readyState >= 3 && audio.paused)!.audio;
      probe.__returnedAudio = audio;
      probe.__returnLoadsAtPreparation = probe.__loadedAudio.filter((entry) => entry.audio === audio).length;
    });
    await expect.poll(() => page.evaluate(() => (window as PhaseHandoffProbeWindow).__trackEndedCalls)).toBe(2);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('ended', true);

    session.server.publishMusic({ ...playlistMusic,
      currentTrackId: track.id, loop: false, resumeTime: 0, playbackVersion: 4, revision: 7 });
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    expect(await page.locator('audio.music-player').evaluate((audio) =>
      audio === (window as PhaseHandoffProbeWindow).__returnedAudio)).toBe(true);
    expect(await page.evaluate(() => {
      const probe = window as PhaseHandoffProbeWindow;
      return probe.__loadedAudio.filter(({ audio }) => audio === probe.__returnedAudio).length - probe.__returnLoadsAtPreparation;
    })).toBe(0);
    expect(await page.locator('audio.music-player').evaluate((audio) => {
      const probe = window as PhaseHandoffProbeWindow;
      const context = probe.__audioContexts.get(audio as HTMLAudioElement);
      return { same: Boolean(context && context === probe.__audioContexts.get(probe.__adoptedAudio!)), state: context?.state };
    })).toEqual({ same: true, state: 'running' });

    await expect.poll(() => page.evaluate(async () => {
      const probe = window as PhaseHandoffProbeWindow;
      const url = (await window.bossAPI.getMusicState()).tracks.find(({ id }) => id === 'following')!.url;
      const prepared = probe.__loadedAudio.find(({ audio, src }) =>
        src === url && audio.src === url && audio.readyState >= 3 && audio.paused);
      probe.__preparedAfterReturn = prepared?.audio ?? null;
      return Boolean(prepared);
    })).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as PhaseHandoffProbeWindow).__trackEndedCalls)).toBe(3);
    await expect(page.locator('audio.music-player')).toHaveJSProperty('ended', true);
    session.server.publishBattleState(createPublicBattle({ battleStarted: false, revision: 2 }));
    session.server.publishMusic({ ...playlistMusic,
      currentTrackId: track.id, loop: false, isPlaying: false, resumeTime: 0, playbackVersion: 4, revision: 8 });
    await expect.poll(() => page.evaluate(() => {
      const audio = (window as PhaseHandoffProbeWindow).__preparedAfterReturn;
      return { src: audio?.getAttribute('src'), paused: audio?.paused };
    })).toEqual({ src: null, paused: true });
  } finally {
    const diagnostics = await page.evaluate(() => {
      const probe = window as PhaseHandoffProbeWindow;
      return { interruptions: probe.__adoptionInterruptions, wraps: probe.__nativeLoopWraps,
        prefetchInterruptions: probe.__prefetchInterruptions,
        samePrefetchedNode: document.querySelector('audio.music-player') === probe.__prefetchedAudio,
        sameReturnedNode: document.querySelector('audio.music-player') === probe.__returnedAudio,
        returnedLoadCount: probe.__loadedAudio.filter(({ audio }) => audio === probe.__returnedAudio).length,
        trackEndedCalls: probe.__trackEndedCalls, sameNode: document.querySelector('audio.music-player') === probe.__adoptedAudio,
        playedAudio: probe.__playedAudio?.map((audio) => ({ adopted: audio === probe.__adoptedAudio,
          paused: audio.paused, ended: audio.ended, loop: audio.loop, currentTime: audio.currentTime })) };
    }).catch(() => null);
    await testInfo.attach('handoff-boundary-probe', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' });
    await session.close();
  }
});

test('restaura PV, condições, recursos, privacidade e ordem sem iniciar outra batalha', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Guardião');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'guardiao.pdf', mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: 'Guardião', playerName: 'Guardião' }) });
    await expect.poll(() => session.server.captureEncounter().players.length).toBe(1);
    await page.locator('#web-player-sheet-close').click();
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    const saved = await session.server.includeCharacterSheets(session.server.captureEncounter());
    expect(saved.players[0].sheetDocument?.base64).toBeTruthy();
    saved.players[0].state.currentHealth = -2;
    saved.players[0].state.currentMana = 1;
    saved.players[0].state.temporaryHealth = 3;
    saved.players[0].state.actionPoints = 4;
    saved.players[0].state.heroPoints = 0;
    saved.players[0].state.statuses = [{ statusId: 'abalado', turnsRemaining: 3, damageFormula: null }];
    saved.players[0].actions.standard = false;
    saved.players[0].privateMode = false;
    saved.turns.round = 3;
    saved.turns.started = true;
    saved.turns.activeParticipantId = `player:${saved.players[0].playerId}`;
    const envelope = normalizeEncounterCheckpoint(JSON.parse(JSON.stringify({
      savedAt: Date.now(), battleStarted: true, hudVisible: true, musicPlaying: false, musicTime: 0, backgroundTime: 0,
      activeBackgroundPath: null, pendingBlackoutPhaseIndex: null, queuedPhaseIndexes: [], resumeMusicAfterBlackout: false, multiplayer: saved,
    })));
    expect(envelope).not.toBeNull();
    session.server.restoreEncounter(envelope!.multiplayer);
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getPlayerHuds())[0].currentHealth)).toBe(-2);
    expect(session.server.getTurnState().round).toBe(3);
    const restored = session.server.captureEncounter().players[0];
    expect(restored.state.currentMana).toBe(1);
    expect(restored.state.actionPoints).toBe(4);
    expect(restored.state.heroPoints).toBe(0);
    expect(restored.state.statuses[0].turnsRemaining).toBe(3);
    expect(restored.actions.standard).toBe(false);
    expect(restored.privateMode).toBe(false);
    expect(JSON.stringify(envelope)).not.toMatch(/passwordHash|passwordSalt|accountToken/);
    await page.reload();
    await page.locator('#web-player-password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
    expect(session.server.getPendingJoinRequests()).toHaveLength(0);
    await expect(page.locator('.player-stage')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getPlayerHuds())[0]?.currentHealth)).toBe(-2);
    expect(session.server.captureEncounter().players[0].state.actionPoints).toBe(4);
    expect(session.server.getTurnState().round).toBe(3);
    const sheet = await session.server.readEncounterSheet(restored.profileId);
    expect(sheet?.bytes.toString('base64')).toBe(saved.players[0].sheetDocument?.base64);
  } finally { await session.close(); }
});
