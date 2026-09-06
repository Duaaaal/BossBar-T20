import { expect, test } from '@playwright/test';
import {
  createPublicBattle,
  joinHostedSession,
  startHostedTestSession,
} from '../support/hosted-session';

test('mantém o visual da espera e do HUD', async ({ page }, testInfo) => {
  test.skip(
    !['chromium', 'firefox'].includes(testInfo.project.name),
    'Baseline visual mantida para Chromium e Firefox no Windows.',
  );
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Jogador Visual');
    await page.addStyleTag({
      content: [
        '*, *::before, *::after { animation: none !important; transition: none !important; }',
        '.encounter-roll-results { visibility: hidden !important; }',
      ].join('\n'),
    });
    await expect(page.getByText('Aguardando todos os jogadores estarem prontos')).toBeVisible();
    await page.locator('#web-player-status').evaluate((status) => {
      status.textContent = 'Conectado à sala TESTE · 1/10';
      (status as HTMLElement).dataset.visible = 'true';
    });
    await expect(page.locator('.waiting-content')).toHaveScreenshot('waiting-content.png', {
      animations: 'allow',
      caret: 'hide',
      scale: 'css',
    });
    await expect(page.locator('.player-stage')).toHaveScreenshot('waiting-screen.png', {
      animations: 'allow',
      caret: 'hide',
      scale: 'css',
    });

    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    await expect(page.locator('.boss-hud')).toHaveClass(/is-active/);
    await expect(page.getByRole('heading', { name: 'Dragão de Teste' })).toBeVisible();
    await expect(page.locator('.player-stage')).toHaveScreenshot('battle-hud.png', {
      animations: 'allow',
      caret: 'hide',
      scale: 'css',
    });
  } finally {
    await session.close();
  }
});

test('mantém a ação grave centralizada e faz crossfade com a descrição no HUD', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Jogador Ação Grave');
    session.server.publishBattleState(createPublicBattle({
      battleStarted: true,
      revision: 2,
      nextAction: 'O céu vai desabar',
      actionSeverity: 'grave',
      actionVersion: 1,
    }));

    const announcement = page.locator('.grave-action-announcement');
    await expect(announcement).toBeVisible();
    await expect(page.locator('.grave-action-red-flash')).toBeVisible();
    const centered = await announcement.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        horizontal: Math.abs(bounds.left + bounds.width / 2 - window.innerWidth / 2),
        vertical: Math.abs(bounds.top + bounds.height / 2 - window.innerHeight / 2),
      };
    });
    expect(centered.horizontal).toBeLessThan(10);
    expect(centered.vertical).toBeLessThan(10);

    const crossfade = await page.evaluate(() => {
      const anchor = document.querySelector<HTMLElement>('.grave-action-anchor')!;
      const hud = document.querySelector<HTMLElement>('.action-warning.is-announcing')!;
      for (const element of [anchor, hud]) {
        const animation = element.getAnimations()[0];
        if (!animation) throw new Error('Animação de crossfade não encontrada.');
        animation.pause();
        animation.currentTime = 1_353;
      }
      const bounds = anchor.getBoundingClientRect();
      return {
        centerOpacity: Number(getComputedStyle(anchor).opacity),
        hudOpacity: Number(getComputedStyle(hud).opacity),
        horizontal: Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2),
        vertical: Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2),
      };
    });
    expect(crossfade.horizontal).toBeLessThan(2);
    expect(crossfade.vertical).toBeLessThan(2);
    expect(crossfade.centerOpacity).toBeCloseTo(0.5, 1);
    expect(crossfade.hudOpacity).toBeCloseTo(0.5, 1);

    await expect(announcement).toBeHidden({ timeout: 3_000 });
    await expect(page.locator('.action-warning .action-description'))
      .toHaveText('O céu vai desabar');
    await expect(page.locator('.action-warning')).toHaveCSS('opacity', '1');
  } finally {
    await session.close();
  }
});
