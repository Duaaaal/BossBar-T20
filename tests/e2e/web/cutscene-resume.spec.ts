import { expect, test } from '@playwright/test';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession, TEST_MEDIA_IDS } from '../support/hosted-session';
import type { CutscenePlayback } from '../../../src/shared/scene';
import { normalizeEncounterCheckpoint } from '../../../src/shared/encounter-checkpoint';

test('prepara vídeo em dois clientes e usa a mesma linha do tempo', async ({ browser }) => {
  const ready = new Map<string, number | null>();
  const session = await startHostedTestSession({ preloadMediaIds: [], onCutsceneReady: (playerId, _id, duration) => ready.set(playerId, duration) });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    for (const context of contexts) await context.addInitScript(() => {
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
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
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
    const times = await Promise.all(pages.map((page) => page.locator('.cutscene-presentation video').evaluate((video: HTMLVideoElement) => video.currentTime)));
    expect(Math.abs(times[0] - times[1])).toBeLessThan(0.35);
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
  } finally { await Promise.all(contexts.map((context) => context.close())); await session.close(); }
});

test('a fase adota o mesmo áudio da cutscene sem reabrir nem procurar outra posição', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      const played: HTMLAudioElement[] = [];
      Object.assign(window, { __playedAudio: played });
      HTMLMediaElement.prototype.play = function () {
        if (this instanceof HTMLAudioElement && !played.includes(this)) played.push(this);
        return play.call(this);
      };
    });
    await joinHostedSession(page, session.inviteUrl, 'Áudio contínuo');
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    const track = { id: 'phase-next', name: 'Próxima faixa', duration: 1, url: session.mediaUrl(TEST_MEDIA_IDS.music) };
    const music = { tracks: [track], currentTrackId: track.id, isPlaying: true, loop: true, volume: 0.4, muted: false, universalMuted: false, playbackVersion: 1, currentTime: 0, synchronizedAt: Date.now(), revision: 1 };
    session.server.publishMusic({ ...music, externalPlayback: true });
    const cut: CutscenePlayback = { id: 'handoff', cutsceneId: 'cut', targetPhaseIndex: 1, stage: 'playing', startedAt: Date.now(), offsetSeconds: 0, durationSeconds: 1, advanceMode: 'manual', backgroundUrl: null, mediaType: 'image', music: null, sound: null, transition: 'fade', transitionDurationSeconds: 0.1, nextMusic: { ...music, revision: 1 }, audioFadeOutSeconds: 1 };
    const scene = { phaseMarkers: [], activePhaseIndex: 0, blackoutActive: false, revision: 2 };
    session.server.publishScene({ ...scene, cutscenePlayback: cut });
    await expect(page.locator('.cutscene-presentation')).toHaveClass(/is-playing/);
    session.server.publishScene({ ...scene, revision: 3, cutscenePlayback: { ...cut, stage: 'ending', endingAt: Date.now() + 100 } });
    await expect.poll(() => page.evaluate(() => (window as typeof window & { __playedAudio: HTMLAudioElement[] }).__playedAudio.filter((audio) => !audio.paused).length)).toBe(1);
    await page.evaluate(() => {
      const audio = (window as typeof window & { __playedAudio: HTMLAudioElement[] }).__playedAudio.find((item) => !item.paused)!;
      audio.dataset.adoptionProbe = 'ready';
      const forbidden: string[] = [];
      for (const event of ['pause', 'emptied']) audio.addEventListener(event, () => forbidden.push(event));
      const clock = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
      Object.defineProperty(audio, 'currentTime', { get: () => clock.get!.call(audio), set: (time) => { forbidden.push('programmatic-seek'); clock.set!.call(audio, time); } });
      Object.assign(window, { __adoptedAudio: audio, __adoptionInterruptions: forbidden });
    });
    session.server.publishScene({ ...scene, revision: 4, activePhaseIndex: 1, cutscenePlayback: null });
    await expect(page.locator('.cutscene-presentation')).toHaveCount(0);
    session.server.publishMusic({ ...music, externalPlayback: false, resumeTime: 0.15, revision: 2 });
    await expect(page.locator('audio.music-player')).toHaveAttribute('data-adoption-probe', 'ready');
    expect(await page.evaluate(() => (window as typeof window & { __adoptionInterruptions: string[] }).__adoptionInterruptions)).toEqual([]);
    expect(await page.locator('audio.music-player').evaluate((audio: HTMLAudioElement) => audio.paused)).toBe(false);
    session.server.publishMusic({ ...music, isPlaying: false, externalPlayback: false, revision: 3 });
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', true);
    session.server.publishMusic({ ...music, tracks: [{ ...track, id: 'following' }], currentTrackId: 'following', externalPlayback: false, playbackVersion: 2, revision: 4 });
    await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    expect(await page.locator('audio.music-player').getAttribute('data-adoption-probe')).toBeNull();
  } finally { await session.close(); }
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
