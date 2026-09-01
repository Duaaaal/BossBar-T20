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
