import { expect, test } from '@playwright/test';
import {
  createEditableCharacterSheet,
  joinHostedSession,
  startHostedTestSession,
} from '../support/hosted-session';

test('persiste ficha, HUD privado e notas ricas em abas', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Fluxo persistente executado uma vez no Chromium.');
  const session = await startHostedTestSession();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    await joinHostedSession(firstPage, session.inviteUrl, 'Jogador Ferramentas');

    await firstPage.getByRole('button', { name: 'Bloco de notas' }).click();
    const notesDialog = firstPage.getByRole('dialog', { name: 'Bloco de notas' });
    const notesCard = firstPage.locator('.web-player-notes-card');
    await expect(notesDialog).toBeVisible();
    await expect(firstPage.getByRole('button', { name: 'Lista numerada' })).toHaveText('1)');
    await expect(notesCard).toHaveCSS('resize', 'both');
    await expect(firstPage.getByRole('button', { name: 'Limpar' })).toBeVisible();
    await expect(firstPage.getByRole('button', { name: 'Salvar' })).toBeVisible();
    const clearBounds = await firstPage.getByRole('button', { name: 'Limpar' }).boundingBox();
    const saveBounds = await firstPage.getByRole('button', { name: 'Salvar' }).boundingBox();
    expect(Math.abs((clearBounds?.y ?? 0) - (saveBounds?.y ?? 0))).toBeLessThan(2);
    const initialNotesBounds = await notesCard.boundingBox();
    const dragHandle = firstPage.locator('#web-player-notes-drag-handle');
    const dragBounds = await dragHandle.boundingBox();
    if (!initialNotesBounds || !dragBounds) throw new Error('Bloco de notas sem dimensões.');
    await firstPage.mouse.move(dragBounds.x + 30, dragBounds.y + 15);
    await firstPage.mouse.down();
    await firstPage.mouse.move(dragBounds.x - 30, dragBounds.y + 45, { steps: 4 });
    await firstPage.mouse.up();
    const movedNotesBounds = await notesCard.boundingBox();
    expect(movedNotesBounds?.x).not.toBe(initialNotesBounds.x);
    await notesCard.evaluate((element) => {
      element.style.width = '100px';
      element.style.height = '100px';
    });
    const constrainedNotesBounds = await notesCard.boundingBox();
    expect(constrainedNotesBounds?.width ?? 0).toBeGreaterThanOrEqual(500);
    expect(constrainedNotesBounds?.height ?? 0).toBeGreaterThanOrEqual(410);
    await firstPage.keyboard.press('Escape');
    await expect(notesDialog).toBeVisible();
    await firstPage.mouse.click(8, 360);
    await expect(notesDialog).toBeVisible();
    const notesEditor = firstPage.locator('#web-player-notes-editor');
    await notesEditor.fill('Portal vermelho');
    await notesEditor.press('Control+A');
    await firstPage.getByRole('button', { name: 'Negrito' }).click();
    await expect(notesEditor.locator('b, strong')).toHaveText('Portal vermelho');
    await expect(firstPage.locator('#web-player-notes-preview')).toHaveCount(0);

    await firstPage.getByRole('button', { name: 'Criar nova nota' }).click();
    await expect(firstPage.getByRole('tab', { name: 'Nota 2' })).toHaveAttribute('aria-selected', 'true');
    const activeTabGroup = firstPage
      .locator('.web-player-notes-tab-group')
      .filter({ has: firstPage.getByRole('tab', { name: 'Nota 2' }) });
    await expect(activeTabGroup.getByRole('button', { name: 'Excluir Nota 2' })).toBeVisible();
    await expect(activeTabGroup.getByRole('button', { name: 'Excluir Nota 2' })).toHaveCSS('position', 'static');
    await notesEditor.fill('Ordem da investigação');
    await notesEditor.press('Control+A');
    await firstPage.getByRole('button', { name: 'Itálico' }).click();
    await expect(notesEditor.locator('i, em')).toHaveText('Ordem da investigação');
    await firstPage.getByRole('button', { name: 'Salvar' }).click();
    await expect(firstPage.locator('#web-player-notes-status')).toHaveText('Notas salvas');
    await firstPage.getByRole('button', { name: 'Fechar' }).click();

    await firstPage.getByRole('button', { name: 'Ficha', exact: true }).click();
    await firstPage.locator('#web-player-sheet-input').setInputFiles({
      name: 'ficha-valora.pdf',
      mimeType: 'application/pdf',
      buffer: await createEditableCharacterSheet(),
    });
    await expect(firstPage.locator('#web-player-sheet-status')).toContainText('ficha-valora.pdf');
    await expect(firstPage.locator('#web-player-sheet-selection-remove')).toBeVisible();
    await expect(firstPage.locator('#web-player-sheet-remove')).toBeVisible();
    await expect(firstPage.locator('#web-player-sheet-open')).toBeEnabled();
    await expect.poll(() => session.server.getPresence().players[0]?.hasCharacterSheet).toBe(true);
    await firstPage.locator('#web-player-sheet-close').click();

    const characterHud = firstPage.locator('#web-player-character-hud');
    await expect(characterHud).toBeVisible();
    await expect(firstPage.locator('#web-player-character-name')).toHaveText('Valora');
    await expect(firstPage.locator('#web-player-character-health-value')).toHaveText('21/21');
    await expect(firstPage.locator('#web-player-character-mana-value')).toHaveText('3/3');
    await expect(firstPage.locator('#web-player-character-defense-melee')).toHaveText('CaC 10');
    await expect(firstPage.locator('#web-player-character-defense-ranged')).toHaveText('AaD 10');
    await firstPage.locator('#web-player-character-expand').click();
    await expect(firstPage.locator('#web-player-character-details')).toBeVisible();
    await expect(firstPage.locator('#web-player-character-class-level')).toContainText('Guerreiro');
    await expect(firstPage.locator('#web-player-character-attributes')).toContainText('Modificadores de atributo');
    await expect(firstPage.locator('#web-player-character-attributes')).toContainText('FOR');
    await expect(firstPage.locator('#web-player-character-attributes')).toContainText('+2');
    const strengthRow = firstPage
      .locator('#web-player-character-attributes .web-player-character-detail-row')
      .filter({ hasText: 'FOR' });
    await strengthRow.hover();
    const calculationTooltip = firstPage.locator('#web-player-calculation-tooltip');
    await expect(calculationTooltip).toBeVisible();
    await expect(calculationTooltip).toContainText('modificador oficial');
    const [hudBounds, tooltipBounds] = await Promise.all([
      characterHud.boundingBox(),
      calculationTooltip.boundingBox(),
    ]);
    expect(tooltipBounds?.x ?? 0).toBeLessThan((hudBounds?.x ?? 0) - 100);

    await firstPage.getByRole('button', { name: 'Ficha', exact: true }).click();
    await expect(firstPage.locator('#web-player-sheet-open')).toBeEnabled();
    const sheetRequestPromise = firstContext.waitForEvent('request', {
      predicate: (request) => /\/api\/player\/sheet\/view\?ticket=/.test(request.url()),
    });
    const sheetPopupPromise = firstPage.waitForEvent('popup');
    await firstPage.locator('#web-player-sheet-open').click();
    const [sheetPopup, sheetRequest] = await Promise.all([
      sheetPopupPromise,
      sheetRequestPromise,
    ]);
    const pdfUrl = sheetRequest.url();
    expect(sheetRequest.isNavigationRequest()).toBe(true);
    expect(pdfUrl).not.toMatch(/^(?:about:blank|blob:|chrome-extension:)/);
    const pdfResponse = await firstContext.request.get(pdfUrl);
    expect(pdfResponse.status()).toBe(200);
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');
    await sheetPopup.close();

    const renewedSheetRequestPromise = firstContext.waitForEvent('request', {
      predicate: (request) => /\/api\/player\/sheet\/view\?ticket=/.test(request.url()),
    });
    const renewedSheetPopupPromise = firstPage.waitForEvent('popup');
    await firstPage.locator('#web-player-sheet-open').click();
    const [renewedSheetPopup, renewedSheetRequest] = await Promise.all([
      renewedSheetPopupPromise,
      renewedSheetRequestPromise,
    ]);
    expect(renewedSheetRequest.url()).not.toBe(pdfUrl);
    await renewedSheetPopup.close();
    await firstPage.locator('#web-player-sheet-selection-remove').click();
    await expect(firstPage.locator('#web-player-sheet-selection-remove')).toBeHidden();
    await expect(firstPage.locator('#web-player-sheet-remove')).toBeVisible();
    await expect(firstPage.locator('#web-player-sheet-status')).toContainText('ficha-valora.pdf');

    await firstContext.close();
    const secondPage = await secondContext.newPage();
    await joinHostedSession(secondPage, session.inviteUrl, 'Jogador Ferramentas');
    await secondPage.getByRole('button', { name: 'Bloco de notas' }).click();
    const persistedEditor = secondPage.locator('#web-player-notes-editor');
    await expect(secondPage.getByRole('tab', { name: 'Nota 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(persistedEditor).toContainText('Ordem da investigação');
    await expect(persistedEditor.locator('i, em')).toHaveText('Ordem da investigação');
    await secondPage.getByRole('tab', { name: 'Nota 1' }).click();
    await expect(persistedEditor).toContainText('Portal vermelho');
    await expect(persistedEditor.locator('b, strong')).toHaveText('Portal vermelho');

    await secondPage.getByRole('button', { name: 'Limpar' }).click();
    await expect(secondPage.getByRole('dialog', { name: 'Limpar esta nota?' })).toBeVisible();
    await secondPage.locator('#web-player-notes-clear-cancel').click();
    await expect(persistedEditor).toContainText('Portal vermelho');
    await secondPage.getByRole('button', { name: 'Limpar' }).click();
    await secondPage.locator('#web-player-notes-clear-confirm-button').click();
    await expect(secondPage.locator('#web-player-notes-status')).toHaveText('Nota limpa.');
    await expect(persistedEditor).toBeEmpty();
    await secondPage.getByRole('button', { name: 'Fechar' }).click();

    await expect(secondPage.locator('#web-player-character-hud')).toBeVisible();
    await expect(secondPage.locator('#web-player-character-name')).toHaveText('Valora');
    await secondPage.getByRole('button', { name: 'Ficha', exact: true }).click();
    await expect(secondPage.locator('#web-player-sheet-status')).toContainText('ficha-valora.pdf');
    await secondPage.locator('#web-player-sheet-remove').click();
    await expect(secondPage.getByRole('dialog', { name: 'Remover ficha?' })).toBeVisible();
    await secondPage.locator('#web-player-sheet-remove-cancel').click();
    await expect(secondPage.locator('#web-player-sheet-status')).toContainText('ficha-valora.pdf');
    await secondPage.locator('#web-player-sheet-remove').click();
    await secondPage.locator('#web-player-sheet-remove-confirm-button').click();
    await expect(secondPage.locator('#web-player-sheet-status')).toHaveText('Ficha removida deste usuário.');
    await expect(secondPage.locator('#web-player-sheet-open')).toBeDisabled();
    await expect(secondPage.locator('#web-player-character-hud')).toBeHidden();
    await expect.poll(() => session.server.getPresence().players[0]?.hasCharacterSheet).toBe(false);
  } finally {
    await firstContext.close().catch(() => undefined);
    await secondContext.close().catch(() => undefined);
    await session.close();
  }
});
