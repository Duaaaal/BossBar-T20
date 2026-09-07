import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession } from '../support/hosted-session';

async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(2, 2);
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: 'disabled' });
}

async function contained(page: Page, selector: string, allowPortraitOverlap = false) {
  await expect(page.locator(selector).first()).toBeVisible();
  const boxes = await page.locator(selector).evaluateAll((elements) => elements.filter((element) => element.getClientRects().length).map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, overflow: element.scrollWidth - element.clientWidth };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.viewportWidth + 1);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight + 1);
    if (!allowPortraitOverlap) expect(box.overflow).toBeLessThanOrEqual(1);
  }
}

test('auditoria visual: HUDs, ficha, perícias, combate, notas e preferências em duas resoluções', async ({ browser }, info) => {
  const session = await startHostedTestSession();
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const errors: string[] = [];
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) {
      page.on('pageerror', (error) => errors.push(error.message));
      await joinHostedSession(page, session.inviteUrl, `Visual ${index}`);
      await page.getByRole('button', { name: 'Ficha', exact: true }).click();
      await page.locator('#web-player-sheet-input').setInputFiles({ name: `personagem-${index}.pdf`, mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: index ? 'Companheiro da Aurora' : 'Guardião da Aurora', playerName: `Visual ${index}` }) });
      await expect(page.locator('#web-player-sheet-status')).toContainText(`personagem-${index}.pdf`);
      await page.locator('#web-player-sheet-close').click();
    }
    const page = pages[0];
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    const saved = session.server.captureEncounter();
    saved.turns.started = true;
    saved.turns.round = 1;
    saved.turns.activeParticipantId = `player:${saved.players[0].playerId}`;
    for (const actor of saved.turns.participants) { actor.initiativeRolled = true; actor.eligibleRound = 1; }
    session.server.restoreEncounter(saved);

    for (const viewport of [{ width: 1280, height: 720 }, { width: 960, height: 640 }]) {
      await page.setViewportSize(viewport);
      await expect(page.locator('.web-player-character-hud')).toBeVisible();
      await contained(page, '.web-player-character-hud', true);
      await contained(page, '.web-player-character-defenses');
      await capture(page, info, `hud-${viewport.width}`);
      await page.getByRole('button', { name: 'Combate', exact: true }).click();
      await contained(page, '.player-combat-modal');
      await capture(page, info, `combat-${viewport.width}`);
      await page.getByRole('dialog', { name: 'Realizar ataque' }).getByRole('button', { name: 'Fechar', exact: true }).click();
      await page.getByRole('button', { name: 'Teste de perícia', exact: true }).click();
      await contained(page, '.player-combat-modal');
      await capture(page, info, `skills-${viewport.width}`);
      await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).click();
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await capture(page, info, 'sheet-upload');
    await page.locator('#web-player-sheet-open').click();
    await contained(page, '.web-player-sheet-editor-card');
    await capture(page, info, 'sheet-editor');
    await page.locator('#web-player-sheet-editor-close').click();
    await expect(page.locator('.web-player-sheet-editor-card')).toBeHidden();
    await page.getByRole('button', { name: 'Configurações', exact: true }).click();
    await contained(page, '.player-client-settings');
    await capture(page, info, 'preferences');
    await page.getByRole('dialog', { name: 'Configurações pessoais' }).getByRole('button', { name: 'Fechar', exact: true }).click();
    await page.getByRole('button', { name: 'Bloco de notas', exact: true }).click();
    // The resize hit areas intentionally extend three pixels past the card.
    await contained(page, '.web-player-notes-card', true);
    await contained(page, '.web-player-notes-toolbar');
    await capture(page, info, 'notes');
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map((context) => context.close())); await session.close(); }
});
