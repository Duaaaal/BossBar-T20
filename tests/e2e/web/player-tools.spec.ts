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
    let sheetTicketRequests = 0;
    firstPage.on('request', (request) => {
      if (/\/api\/player\/sheet\/view-ticket$/.test(new URL(request.url()).pathname)) {
        sheetTicketRequests += 1;
      }
    });
    await joinHostedSession(firstPage, session.inviteUrl, 'Jogador Ferramentas');

    await firstPage.getByRole('button', { name: 'Bloco de notas' }).click();
    const notesDialog = firstPage.getByRole('dialog', { name: 'Bloco de notas' });
    const notesCard = firstPage.locator('.web-player-notes-card');
    await expect(notesDialog).toBeVisible();
    await expect(firstPage.getByRole('button', { name: 'Lista numerada' })).toHaveText('1)');
    await expect(firstPage.locator('[data-notes-resize]')).toHaveCount(8);
    await expect(firstPage.getByLabel('Título da nota')).toHaveValue('Nota 1');
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
    expect(constrainedNotesBounds?.width ?? 0).toBeGreaterThanOrEqual(440);
    expect(constrainedNotesBounds?.height ?? 0).toBeGreaterThanOrEqual(380);
    expect(await notesCard.evaluate((card) => {
      const cardBounds = card.getBoundingClientRect();
      return [
        '.web-player-notes-tabs',
        '.web-player-notes-toolbar',
        '.web-player-notes-editor',
        '.web-player-notes-actions',
      ].every((selector) => {
        const element = card.querySelector<HTMLElement>(selector);
        if (!element) return false;
        const bounds = element.getBoundingClientRect();
        return bounds.left >= cardBounds.left &&
          bounds.right <= cardBounds.right &&
          bounds.top >= cardBounds.top &&
          bounds.bottom <= cardBounds.bottom;
      });
    })).toBe(true);
    const eastHandle = firstPage.locator('[data-notes-resize="e"]');
    const eastBounds = await eastHandle.boundingBox();
    if (!eastBounds || !constrainedNotesBounds) throw new Error('Alça lateral sem dimensões.');
    await firstPage.mouse.move(eastBounds.x + eastBounds.width / 2, eastBounds.y + 40);
    await firstPage.mouse.down();
    await firstPage.mouse.move(eastBounds.x + 45, eastBounds.y + 40, { steps: 3 });
    await firstPage.mouse.up();
    const widenedNotesBounds = await notesCard.boundingBox();
    expect(widenedNotesBounds?.width ?? 0).toBeGreaterThan(constrainedNotesBounds.width);
    const northHandle = firstPage.locator('[data-notes-resize="n"]');
    const northBounds = await northHandle.boundingBox();
    if (!northBounds || !widenedNotesBounds) throw new Error('Alça superior sem dimensões.');
    await firstPage.mouse.move(northBounds.x + 40, northBounds.y + northBounds.height / 2);
    await firstPage.mouse.down();
    await firstPage.mouse.move(northBounds.x + 40, northBounds.y - 35, { steps: 3 });
    await firstPage.mouse.up();
    const heightenedNotesBounds = await notesCard.boundingBox();
    expect(heightenedNotesBounds?.height ?? 0).toBeGreaterThan(widenedNotesBounds.height);
    expect(heightenedNotesBounds?.y ?? 0).toBeLessThan(widenedNotesBounds.y);
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
    await firstPage.getByLabel('Título da nota').fill('Portais');
    await expect(firstPage.getByRole('tab', { name: 'Portais' })).toBeVisible();

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
      buffer: await createEditableCharacterSheet({ autoFixIssue: true }),
    });
    await expect(firstPage.locator('#web-player-sheet-status')).toContainText('ficha-valora.pdf');
    await expect(firstPage.locator('#web-player-sheet-selection-remove')).toBeVisible();
    await expect(firstPage.locator('#web-player-sheet-remove')).toBeVisible();
    await expect(firstPage.locator('#web-player-sheet-open')).toBeEnabled();
    await expect(firstPage.locator('#web-player-sheet-fix')).toBeVisible();
    await firstPage.locator('#web-player-sheet-fix').click();
    await expect(firstPage.locator('#web-player-sheet-status')).toContainText(
      'Os campos objetivamente corrigíveis foram atualizados.',
    );
    await expect.poll(() => session.server.getPresence().players[0]?.hasCharacterSheet).toBe(true);
    await expect.poll(() => sheetTicketRequests).toBe(2);
    await firstPage.locator('#web-player-sheet-close').click();

    const characterHud = firstPage.locator('#web-player-character-hud');
    await expect(characterHud).toBeVisible();
    await expect(firstPage.locator('#web-player-character-name')).toHaveText('Valora');
    await expect(firstPage.locator('#web-player-character-health-value')).toHaveText('21/21');
    await expect(firstPage.locator('#web-player-character-mana-value')).toHaveText('3/3');
    await expect(firstPage.locator('#web-player-character-defense-melee')).toHaveText('10');
    await expect(firstPage.locator('#web-player-character-defense-ranged')).toHaveText('10');
    await expect(firstPage.locator('.web-player-character-defenses img')).toHaveCount(2);
    await expect(firstPage.locator('.web-player-character-defenses')).toContainText('Defesa:');
    await firstPage.locator('#web-player-character-expand').click();
    await expect(firstPage.locator('#web-player-character-details')).toBeVisible();
    await expect(characterHud).toHaveCSS('z-index', '2147483647');
    await expect(firstPage.locator('#web-player-character-class-level')).toContainText('Guerreiro');
    await expect(firstPage.locator('#web-player-character-class-level')).not.toHaveAttribute('data-calculation');
    await expect(firstPage.locator('#web-player-character-attributes')).toContainText('Modificadores de atributo');
    await expect(firstPage.locator('#web-player-character-attributes')).toContainText('FOR');
    await expect(firstPage.locator('#web-player-character-attributes')).toContainText('+2');
    const strengthRow = firstPage
      .locator('#web-player-character-attributes .web-player-character-detail-row')
      .filter({ hasText: 'FOR' });
    await strengthRow.hover();
    const calculationTooltip = firstPage.locator('#web-player-calculation-tooltip');
    await expect(strengthRow).not.toHaveAttribute('data-calculation');
    await expect(calculationTooltip).toBeHidden();
    const trainedSkill = firstPage
      .locator('#web-player-character-skills .web-player-character-detail-row')
      .filter({ hasText: 'Reflexos' });
    await expect(trainedSkill).toHaveClass(/is-trained/);
    await expect(trainedSkill).not.toContainText('• T');
    await trainedSkill.hover();
    await expect(calculationTooltip).toContainText('(atributo)');
    await expect(calculationTooltip).toContainText('(treino)');
    const sizeRow = firstPage
      .locator('#web-player-character-movement .web-player-character-detail-row')
      .filter({ hasText: 'Tamanho' });
    await sizeRow.hover();
    await expect(sizeRow).toHaveAttribute('data-calculation', /Tamanho da ficha/);
    await expect(calculationTooltip).toContainText('Tamanho da ficha: Médio');
    const movementRow = firstPage
      .locator('#web-player-character-movement .web-player-character-detail-row')
      .filter({ hasText: 'Deslocamento' });
    await movementRow.hover();
    await expect(calculationTooltip).toContainText('Deslocamento da ficha: 9m');
    const loadRow = firstPage
      .locator('#web-player-character-movement .web-player-character-detail-row')
      .filter({ hasText: 'Carga' });
    await loadRow.hover();
    await expect(calculationTooltip).toContainText('10 + 2 × FOR 2 = 14');
    await firstPage.locator('.web-player-character-bar.is-health').hover();
    await expect(calculationTooltip).toContainText('PV da ficha: 21/21');
    await firstPage.locator('.web-player-character-bar.is-mana').hover();
    await expect(calculationTooltip).toContainText('PM da ficha: 3/3');
    await firstPage.locator('#web-player-character-defense-melee').hover();
    await expect(calculationTooltip).toContainText('Defesa CaC:');
    const attackRow = firstPage
      .locator('#web-player-character-attacks .web-player-character-detail-row')
      .filter({ hasText: 'Espada longa' });
    await attackRow.hover();
    await expect(calculationTooltip).toContainText('Teste +5');
    await expect(calculationTooltip).toContainText('dano 1d8+2');

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
    expect(renewedSheetRequest.url()).toBe(pdfUrl);
    expect(sheetTicketRequests).toBe(2);
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
    await secondPage.getByRole('tab', { name: 'Portais' }).click();
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
