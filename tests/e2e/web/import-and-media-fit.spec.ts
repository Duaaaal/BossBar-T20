import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession, TEST_MEDIA_IDS } from '../support/hosted-session';

test('importação inválida fica isolada, exige correção final e preserva a ficha anterior ao descartar', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Importador');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    const original = await createEditableCharacterSheet({ characterName: 'Original', playerName: 'Importador' });
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'original.pdf', mimeType: 'application/pdf', buffer: original });
    await expect.poll(() => session.server.getPlayerHuds()[0]?.characterName).toBe('Original');
    const invalid = await PDFDocument.load(original);
    invalid.getForm().getTextField('NOME DO PERSONAGEM').setText('Corrigido');
    invalid.getForm().getTextField('Tipo 1').setText('Errado');
    invalid.getForm().getTextField('CA').setText('99');
    const invalidBytes = Buffer.from(await invalid.save({ updateFieldAppearances: false }));
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'invalida.pdf', mimeType: 'application/pdf', buffer: invalidBytes });
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha' });
    await expect(editor).toBeVisible();
    await expect(editor.locator('[data-field-name="Tipo 1"] select')).toHaveAttribute('aria-invalid', 'true');
    expect(session.server.getPlayerHuds()[0]?.characterName).toBe('Original');
    await page.locator('#web-player-sheet-import-discard').click();
    await expect(editor).toBeHidden();
    expect(session.server.getPlayerHuds()[0]?.characterName).toBe('Original');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'corrigir.pdf', mimeType: 'application/pdf', buffer: invalidBytes });
    await expect(editor).toBeVisible();
    await editor.locator('[data-field-name="Tipo 1"] select').selectOption('Corte');
    await editor.locator('[data-field-name="CA"] input').fill('11');
    await page.locator('#web-player-sheet-editor-close').click();
    await expect(editor.locator('[data-field-name="CA"] input')).toHaveAttribute('aria-invalid', 'true');
    expect(session.server.getPlayerHuds()[0]?.characterName).toBe('Original');
    await editor.locator('[data-field-name="CA"] input').fill('10');
    await page.locator('#web-player-sheet-editor-close').click();
    await expect(editor).toBeHidden();
    await expect.poll(() => session.server.getPlayerHuds()[0]?.characterName).toBe('Corrigido');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'calculo.pdf', mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: 'Automático', playerName: 'Importador', autoFixIssue: true }) });
    await expect(editor).toBeVisible();
    await page.getByRole('button', { name: 'Corrigir cálculos automaticamente', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect.poll(() => session.server.getPlayerHuds()[0]?.characterName).toBe('Automático');
  } finally { await session.close(); }
});

test('enquadramento de vídeo se propaga a dois navegadores com proporções diferentes', async ({ browser }) => {
  const session = await startHostedTestSession();
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1400, height: 700 } }),
    browser.newContext({ viewport: { width: 900, height: 800 } }),
  ]);
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) await joinHostedSession(page, session.inviteUrl, `Enquadramento ${index}`);
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    for (const mediaFit of ['contain', 'cover', 'fill'] as const) {
      session.server.publishBackground({ url: session.mediaUrl(TEST_MEDIA_IDS.video), name: null, mediaType: 'video', mediaFit });
      for (const page of pages) {
        await expect(page.locator('.battle-background-video')).toHaveCSS('object-fit', mediaFit);
        const box = await page.locator('.battle-background-video').boundingBox();
        expect(box?.width).toBe(page.viewportSize()?.width);
        expect(box?.height).toBe(page.viewportSize()?.height);
      }
    }
  } finally { await Promise.all(contexts.map((context) => context.close())); await session.close(); }
});
