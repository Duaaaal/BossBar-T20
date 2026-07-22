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
  test.skip(testInfo.project.name !== 'chromium', 'Cenários de rede e carga rodam uma vez no Chromium.');
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
