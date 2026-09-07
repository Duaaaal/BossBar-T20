import { expect, test } from '@playwright/test';
import {
  createPublicBattle,
  createEditableCharacterSheet,
  damageImpact,
  joinHostedSession,
  startHostedTestSession,
  TEST_MEDIA_IDS,
} from '../support/hosted-session';

test('dez jogadores recebem mídia e o mesmo impacto sem divergência', async ({ browser }, testInfo) => {
  test.skip(
    !['chromium', 'firefox'].includes(testInfo.project.name),
    'Carga executada no Chromium e Firefox.',
  );
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
      // These clients share one IP. Keep the eight-per-minute upload guard
      // intact and include two sheetless HUDs in the ten-player layout.
      if (index < 8) {
        await page.getByRole('button', { name: 'Ficha', exact: true }).click();
        await page.locator('#web-player-sheet-input').setInputFiles({
          name: `ficha-${index + 1}.pdf`, mimeType: 'application/pdf',
          buffer: await createEditableCharacterSheet({ characterName: `Personagem ${index + 1}`, playerName: `Jogador ${index + 1}` }),
        });
        await expect(page.locator('#web-player-sheet-status')).toContainText(`ficha-${index + 1}.pdf`);
        await page.locator('#web-player-sheet-close').click();
      }
    }
    await expect.poll(() => session.server.getPresence().connectedPlayers).toBe(10);

    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    session.server.publishCombatImpact(damageImpact({ id: 10, to: 80 }));
    await Promise.all(pages.map((page) =>
      expect(page.locator('.health-bar-fill')).toHaveAttribute('style', /80%/),
    ));
    await expect(pages[0].locator('.party-player-card')).toHaveCount(9);
    const partyBounds = await pages[0].locator('.party-hud').boundingBox();
    const bossBounds = await pages[0].locator('.boss-hud').boundingBox();
    expect(partyBounds).not.toBeNull();
    expect(bossBounds).not.toBeNull();
    expect(partyBounds!.y + partyBounds!.height).toBeLessThan(bossBounds!.y);
    const portraitsOverlapCards = await pages[0].locator('.party-player-card').evaluateAll((cards) => cards.some((card, index) => {
      const portrait = card.querySelector('.party-player-portrait')!.getBoundingClientRect();
      return cards.some((other, otherIndex) => {
        if (index === otherIndex) return false;
        const bounds = other.getBoundingClientRect();
        return portrait.left < bounds.right && portrait.right > bounds.left && portrait.top < bounds.bottom && portrait.bottom > bounds.top;
      });
    }));
    expect(portraitsOverlapCards).toBe(false);
    const turnBounds = await pages[0].locator('.encounter-turn-tools').boundingBox();
    expect(bossBounds!.x + bossBounds!.width).toBeLessThan(turnBounds!.x);
    await pages[0].screenshot({ path: testInfo.outputPath('ten-player-huds.png'), animations: 'disabled' });

    const extraContext = await browser.newContext();
    contexts.push(extraContext);
    const extraPage = await extraContext.newPage();
    await extraPage.goto(session.inviteUrl);
    await extraPage.getByRole('button', { name: 'Criar acesso' }).click();
    await extraPage.locator('#web-player-create-name').fill('Jogador Extra');
    await extraPage.locator('#web-player-create-password').fill('test-password');
    await extraPage.locator('#web-player-create-password-confirm').fill('test-password');
    await extraPage.locator('#web-player-create-account').getByRole('button', { name: 'Criar acesso' }).click();
    await expect(extraPage.locator('#web-player-status')).toContainText('limite de 10 jogadores');
    expect(session.server.getPresence().connectedPlayers).toBe(10);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await session.close();
  }
});
