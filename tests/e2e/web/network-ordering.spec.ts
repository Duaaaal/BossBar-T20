import { expect, test } from '@playwright/test';
import {
  backgroundState,
  createPublicBattle,
  damageImpact,
  joinHostedSession,
  startHostedTestSession,
  TEST_MEDIA_IDS,
} from '../support/hosted-session';

test.beforeEach(({ browserName }, testInfo) => {
  void browserName;
  test.skip(
    !['chromium', 'firefox'].includes(testInfo.project.name),
    'Cenários de rede rodam no Chromium e Firefox.',
  );
});

test('mantém eventos ordenados mesmo quando a primeira mídia chega depois', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await page.addInitScript(() => {
      const urlsByType: Record<string, string[]> = {};
      const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (object) => {
        const localUrl = originalCreateObjectUrl(object);
        if (object instanceof Blob) {
          (urlsByType[object.type] ??= []).push(localUrl);
        }
        return localUrl;
      };
      Object.assign(window, { __bossBlobUrlsByType: urlsByType });
    });
    await page.route(`**/session-media/${TEST_MEDIA_IDS.slowBackground}*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });
    await joinHostedSession(page, session.inviteUrl, 'Jogador Ordenação');
    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    await expect(page.locator('.boss-hud')).toHaveClass(/is-active/);

    await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.player-stage');
      const history: string[] = [];
      Object.assign(window, { __bossBackgroundHistory: history });
      if (!stage) return;
      new MutationObserver(() => {
        history.push(stage.style.getPropertyValue('--battle-background'));
      }).observe(stage, { attributes: true, attributeFilter: ['style'] });
    });

    const slowUrl = session.mediaUrl(TEST_MEDIA_IDS.slowBackground);
    const fastUrl = session.mediaUrl(TEST_MEDIA_IDS.fastBackground);
    session.server.publishBackground(backgroundState(slowUrl));
    session.server.publishBackground(backgroundState(fastUrl));

    await expect.poll(() => page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.player-stage');
      const urls = (
        window as typeof window & { __bossBlobUrlsByType?: Record<string, string[]> }
      ).__bossBlobUrlsByType?.['image/gif'] ?? [];
      const latestGifUrl = urls.at(-1) ?? '';
      return Boolean(latestGifUrl) &&
        (stage?.style.getPropertyValue('--battle-background') ?? '').includes(latestGifUrl);
    })).toBe(true);
  } finally {
    await session.close();
  }
});

test('recupera o snapshot depois de perder e restaurar a rede', async ({ page, context }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Jogador Reconexão');
    await context.setOffline(true);
    await expect(page.locator('#web-player-status')).toHaveAttribute('data-state', 'disconnected');
    await context.setOffline(false);
    await expect(page.locator('.player-stage')).toBeVisible();
    await expect(page.getByText('Aguardando todos os jogadores estarem prontos')).toBeVisible();
    await expect.poll(() => session.server.getPresence().connectedPlayers).toBe(1);
  } finally {
    await context.setOffline(false);
    await session.close();
  }
});

test('libera som e alteração da barra como um único impacto após o preload', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await page.addInitScript(() => {
      const events: Array<{ kind: string; at: number }> = [];
      Object.assign(window, { __bossSyncEvents: events });
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function patchedPlay() {
        events.push({ kind: 'audio-play', at: performance.now() });
        queueMicrotask(() => this.dispatchEvent(new Event('playing')));
        return Promise.resolve();
      };
      Object.assign(window, { __bossOriginalPlay: originalPlay });
    });
    await page.route(`**/session-media/${TEST_MEDIA_IDS.impactSound}*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await route.continue();
    });
    await joinHostedSession(page, session.inviteUrl, 'Jogador Sincronização');
    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    await expect(page.locator('.health-bar-fill')).toHaveAttribute('style', /100%/);
    await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('.health-bar-fill');
      const events = (
        window as typeof window & { __bossSyncEvents?: Array<{ kind: string; at: number }> }
      ).__bossSyncEvents;
      if (!bar || !events) return;
      new MutationObserver(() => {
        if (bar.style.width === '75%') {
          events.push({ kind: 'health-75', at: performance.now() });
        }
      }).observe(bar, { attributes: true, attributeFilter: ['style'] });
    });

    session.server.publishCombatImpact(damageImpact({
      soundUrl: session.mediaUrl(TEST_MEDIA_IDS.impactSound),
    }));
    await page.waitForTimeout(200);
    await expect(page.locator('.health-bar-fill')).toHaveAttribute('style', /100%/);
    await expect(page.locator('.health-bar-fill')).toHaveAttribute('style', /75%/);

    const events = await page.evaluate(() => (
      window as typeof window & { __bossSyncEvents?: Array<{ kind: string; at: number }> }
    ).__bossSyncEvents ?? []);
    const audioAt = events.find(({ kind }) => kind === 'audio-play')?.at;
    const healthAt = events.find(({ kind }) => kind === 'health-75')?.at;
    expect(audioAt).toBeDefined();
    expect(healthAt).toBeDefined();
    expect(Math.abs((audioAt ?? 0) - (healthAt ?? 0))).toBeLessThan(120);
  } finally {
    await session.close();
  }
});

test('separa a ameaça crítica do impacto e sincroniza áudio e efeito final', async ({ page }) => {
  const session = await startHostedTestSession({
    preloadMediaIds: [
      TEST_MEDIA_IDS.background,
      TEST_MEDIA_IDS.music,
      TEST_MEDIA_IDS.impactSound,
    ],
  });
  try {
    await page.addInitScript(() => {
      const events: Array<{ kind: string; at: number }> = [];
      Object.assign(window, { __bossCriticalCueEvents: events });
      HTMLMediaElement.prototype.play = function patchedPlay() {
        events.push({ kind: 'critical-audio', at: performance.now() });
        queueMicrotask(() => this.dispatchEvent(new Event('playing')));
        return Promise.resolve();
      };
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function patchedAnimate(keyframes, options) {
        if (this instanceof HTMLElement && this.classList.contains('player-stage')) {
          events.push({ kind: 'critical-visual', at: performance.now() });
        }
        return originalAnimate.call(this, keyframes, options);
      };
    });
    await joinHostedSession(page, session.inviteUrl, 'Jogador Crítico');
    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    await expect(page.locator('.player-stage')).toBeVisible();
    await page.evaluate(() => {
      const target = window as typeof window & {
        __bossCriticalCueEvents?: Array<{ kind: string; at: number }>;
        __bossCriticalPhases?: Array<{ phase: string; at: number }>;
      };
      if (target.__bossCriticalCueEvents) target.__bossCriticalCueEvents.length = 0;
      target.__bossCriticalPhases = [];
      window.bossAPI.subscribeMusicDuck((event) => {
        target.__bossCriticalPhases?.push({
          phase: event.phase,
          at: performance.now(),
        });
      });
    });

    session.server.publishMusicDuck({
      id: 41,
      phase: 'duck',
      duration: 1_000,
      targetVolume: 0.2,
      soundEffect: {
        id: 41,
        kind: 'natural-success-enemy',
        url: session.mediaUrl(TEST_MEDIA_IDS.impactSound),
      },
      targetPlayerIds: [],
    });

    await expect.poll(() => page.evaluate(() => (
      window as typeof window & {
        __bossCriticalCueEvents?: Array<{ kind: string; at: number }>;
      }
    ).__bossCriticalCueEvents?.filter(({ kind }) => kind === 'critical-visual').length ?? 0)).toBe(1);
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & {
        __bossCriticalCueEvents?: Array<{ kind: string; at: number }>;
      }
    ).__bossCriticalCueEvents?.filter(({ kind }) => kind === 'critical-audio').length ?? 0)).toBe(1);
    const threatEvents = await page.evaluate(() => (
      window as typeof window & {
        __bossCriticalCueEvents?: Array<{ kind: string; at: number }>;
      }
    ).__bossCriticalCueEvents ?? []);
    const threatAudioAt = threatEvents.find(({ kind }) => kind === 'critical-audio')?.at;
    const threatVisualAt = threatEvents.find(({ kind }) => kind === 'critical-visual')?.at;
    expect(threatAudioAt).toBeDefined();
    expect(threatVisualAt).toBeDefined();
    expect(Math.abs((threatAudioAt ?? 0) - (threatVisualAt ?? 0))).toBeLessThan(120);

    session.server.publishMusicDuck({
      id: 41,
      phase: 'impact',
      duration: 1_100,
      soundEffect: {
        id: 42,
        kind: 'critical-damage',
        url: session.mediaUrl(TEST_MEDIA_IDS.impactSound),
      },
      targetPlayerIds: [],
    });
    session.server.publishMusicDuck({
      id: 41,
      phase: 'restore',
      duration: 500,
      soundEffect: null,
      targetPlayerIds: [],
    });

    await expect.poll(() => page.evaluate(() => (
      window as typeof window & {
        __bossCriticalCueEvents?: Array<{ kind: string; at: number }>;
      }
    ).__bossCriticalCueEvents?.length ?? 0)).toBeGreaterThanOrEqual(4);
    const events = await page.evaluate(() => (
      window as typeof window & {
        __bossCriticalCueEvents?: Array<{ kind: string; at: number }>;
      }
    ).__bossCriticalCueEvents ?? []);
    const audioAt = events.filter(({ kind }) => kind === 'critical-audio').at(-1)?.at;
    const visualAt = events.filter(({ kind }) => kind === 'critical-visual').at(-1)?.at;
    expect(audioAt).toBeDefined();
    expect(visualAt).toBeDefined();
    expect(Math.abs((audioAt ?? 0) - (visualAt ?? 0))).toBeLessThan(120);
    await expect.poll(() => page.evaluate(() => (
      window as typeof window & {
        __bossCriticalPhases?: Array<{ phase: string; at: number }>;
      }
    ).__bossCriticalPhases?.length ?? 0)).toBe(3);
    const phases = await page.evaluate(() => (
      window as typeof window & {
        __bossCriticalPhases?: Array<{ phase: string; at: number }>;
      }
    ).__bossCriticalPhases ?? []);
    const threatAt = phases.find(({ phase }) => phase === 'duck')?.at ?? 0;
    const impactAt = phases.find(({ phase }) => phase === 'impact')?.at ?? 0;
    const restoreAt = phases.find(({ phase }) => phase === 'restore')?.at ?? 0;
    expect(impactAt - threatAt).toBeGreaterThanOrEqual(2_950);
    expect(restoreAt - impactAt).toBeGreaterThanOrEqual(1_050);
  } finally {
    await session.close();
  }
});
