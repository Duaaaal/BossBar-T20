import { test, expect } from '@playwright/test';
import { createPublicBattle, joinHostedSession, startHostedTestSession, TEST_MEDIA_IDS } from '../support/hosted-session';

test('sucesso natural e dano crítico reduzem sem mutar e restauram junto ao fim real do SFX em dois clientes', async ({ browser }) => {
  const session = await startHostedTestSession();
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) {
      await page.addInitScript(() => {
        const events: Array<{ type: string; at: number; value?: number; duration?: number; parameter?: number }> = [];
        const parameters = new WeakMap<AudioParam, number>();
        let parameterSequence = 0;
        Object.assign(window, { __sfxProbe: events });
        const ramp = AudioParam.prototype.linearRampToValueAtTime;
        AudioParam.prototype.linearRampToValueAtTime = function (value, time) {
          if (!parameters.has(this)) parameters.set(this, ++parameterSequence);
          events.push({ type: 'ramp', at: performance.now(), value, duration: time, parameter: parameters.get(this) });
          return ramp.call(this, value, time);
        };
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (this instanceof HTMLAudioElement && !this.classList.contains('music-player') && !this.dataset.probed) {
            this.dataset.probed = 'true';
            this.addEventListener('playing', () => events.push({ type: 'sfx-start', at: performance.now() }), { once: true });
            this.addEventListener('ended', () => events.push({ type: 'sfx-end', at: performance.now() }), { once: true });
          }
          return play.call(this);
        };
      });
      await joinHostedSession(page, session.inviteUrl, `Música ${index}`);
    }
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    session.server.publishMusic({ tracks: [{ id: 'music', name: 'Música', duration: 1, url: session.mediaUrl(TEST_MEDIA_IDS.music) }], currentTrackId: 'music', isPlaying: true, loop: true, volume: 0.8, muted: false, universalMuted: false, playbackVersion: 1, currentTime: 0, synchronizedAt: Date.now(), revision: 1 });
    for (const page of pages) await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
    for (const [index, kind] of (['natural-success-player', 'critical-damage'] as const).entries()) {
      for (const page of pages) await page.evaluate(() => { (window as typeof window & { __sfxProbe: unknown[] }).__sfxProbe.length = 0; });
      session.server.publishEncounterEffect({ id: 700 + index, kind, url: session.mediaUrl(TEST_MEDIA_IDS.impactSound) });
      for (const page of pages) {
        await expect.poll(() => page.evaluate(() => (window as typeof window & { __sfxProbe: Array<{ type: string }> }).__sfxProbe.some(({ type }) => type === 'sfx-end'))).toBe(true);
        const events = await page.evaluate(() => (window as typeof window & { __sfxProbe: Array<{ type: string; at: number; value?: number; parameter?: number }> }).__sfxProbe);
        const start = events.find(({ type }) => type === 'sfx-start')!;
        const end = events.find(({ type }) => type === 'sfx-end')!;
        const duck = events.find(({ type, value }) => type === 'ramp' && value === 0.35)!;
        const restore = events.find(({ type, value, at, parameter }) => type === 'ramp' && value === 1 && parameter === duck?.parameter && at >= end.at - 10)!;
        expect(duck).toBeTruthy(); expect(restore).toBeTruthy();
        expect(Math.abs(duck.at - start.at)).toBeLessThan(80);
        expect(Math.abs(restore.at - end.at)).toBeLessThan(80);
        // The native decoder fades to zero when the decoded loop takes over.
        // Only the shared ducking gain must never mute music during this SFX.
        expect(events.some(({ type, value, parameter }) => type === 'ramp' && value === 0 && parameter === duck.parameter)).toBe(false);
        await expect(page.locator('audio.music-player')).toHaveJSProperty('paused', false);
      }
    }
    const startedAt = Date.now();
    session.server.publishScene({ phaseMarkers: [], activePhaseIndex: 1, blackoutActive: false, revision: 2,
      phaseEntrance: { phaseId: 'after-blackout', startedAt, visualStartedAt: startedAt + 1000, visualSeconds: 2, audioSeconds: 0, hudFadeInSeconds: 2 } });
    for (const page of pages) {
      await expect(page.locator('html')).toHaveClass(/phase-hud-hidden/);
      await expect(page.locator('.phase-entrance')).toHaveCSS('opacity', '1');
    }
    for (const page of pages) await expect.poll(() => page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--phase-hud-opacity')))).toBe(1);
    for (const page of pages) await expect(page.locator('.phase-entrance')).toHaveCount(0);
  } finally { await Promise.all(contexts.map((context) => context.close())); await session.close(); }
});
