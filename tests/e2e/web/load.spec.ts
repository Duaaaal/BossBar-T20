import { expect, test } from '@playwright/test';
import {
  createPublicBattle,
  damageImpact,
  joinHostedSession,
  startHostedTestSession,
  TEST_MEDIA_IDS,
} from '../support/hosted-session';

test('dez jogadores recebem mídia e o mesmo impacto sem divergência', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Carga executada uma vez no Chromium.');
  test.slow();
  const session = await startHostedTestSession({
    preloadMediaIds: [TEST_MEDIA_IDS.background, TEST_MEDIA_IDS.music],
  });
  const contexts = [];
  try {
    const pages = [];
    for (let index = 0; index < 10; index += 1) {
      const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      await joinHostedSession(page, session.inviteUrl, `Jogador ${index + 1}`);
    }
    await expect.poll(() => session.server.getPresence().connectedPlayers).toBe(10);

    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    session.server.publishCombatImpact(damageImpact({ id: 10, to: 80 }));
    await Promise.all(pages.map((page) =>
      expect(page.locator('.health-bar-fill')).toHaveAttribute('style', /80%/),
    ));

    const extraContext = await browser.newContext();
    contexts.push(extraContext);
    const extraPage = await extraContext.newPage();
    await extraPage.goto(session.inviteUrl);
    await extraPage.locator('#web-player-name').fill('Jogador Extra');
    await extraPage.locator('#web-player-password').fill('test-password');
    await extraPage.getByRole('button', { name: 'Entrar' }).click();
    await extraPage.locator('#web-player-password-confirm').fill('test-password');
    await extraPage.getByRole('button', { name: 'Confirmar' }).click();
    await expect(extraPage.locator('#web-player-status')).toContainText('limite de 10 jogadores');
    expect(session.server.getPresence().connectedPlayers).toBe(10);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await session.close();
  }
});
