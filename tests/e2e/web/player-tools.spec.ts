import { expect, test } from '@playwright/test';
import {
  createEditableCharacterSheet,
  joinHostedSession,
  startHostedTestSession,
} from '../support/hosted-session';

test('persiste ficha, HUD privado e notas ricas em abas', async ({ browser }, testInfo) => {
  test.skip(
    !['chromium', 'firefox'].includes(testInfo.project.name),
    'Fluxo persistente executado no Chromium e Firefox.',
  );
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

    const playerTools = firstPage.locator('#web-player-tools > button');
    await expect(playerTools.nth(0)).toHaveAccessibleName('Configurações');
    await expect(playerTools.nth(1)).toHaveText('Ficha');
    await expect.poll(() => firstPage.evaluate(async () => ({
      hidden: document.getElementById('web-player-change-name')?.hasAttribute('hidden'),
      battleStarted: (await window.bossAPI.getState()).battleStarted,
    }))).toEqual({ hidden: false, battleStarted: false });
    await firstPage.getByRole('button', { name: 'Trocar usuário' }).click();
    await expect(firstPage.locator('#web-player-change-name-close')).toBeVisible();
    const changeUserCard = firstPage.locator('.web-player-join-card');
    const changeUserClose = firstPage.locator('#web-player-change-name-close');
    const [changeUserCardBounds, changeUserCloseBounds] = await Promise.all([
      changeUserCard.boundingBox(),
      changeUserClose.boundingBox(),
    ]);
    expect(changeUserCloseBounds?.x ?? 0).toBeGreaterThan(changeUserCardBounds?.x ?? 0);
    expect(changeUserCloseBounds?.y ?? 0).toBeGreaterThanOrEqual(changeUserCardBounds?.y ?? 0);
    expect(changeUserCloseBounds?.x ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      (changeUserCardBounds?.x ?? 0) + (changeUserCardBounds?.width ?? 0),
    );
    await firstPage.locator('#web-player-change-name-close').click();
    await expect(firstPage.getByRole('button', { name: 'Trocar usuário' })).toBeVisible();

    await firstPage.getByRole('button', { name: 'Configurações' }).click();
    const settingsDialog = firstPage.getByRole('dialog', { name: 'Configurações pessoais' });
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.getByLabel('Música').fill('37');
    await settingsDialog.getByLabel('Tremor da tela').uncheck();
    await expect.poll(() => firstPage.evaluate(() => {
      const stored = JSON.parse(localStorage.getItem('bossbar.player.presentation-settings.v1') ?? '{}');
      return [stored.musicVolume, stored.visuals?.screenShake];
    })).toEqual([0.37, false]);
    await settingsDialog.getByRole('button', { name: 'Fechar' }).click();

    await firstPage.evaluate(() => {
      document.dispatchEvent(new CustomEvent('bossbar:player-notice', {
        detail: { id: 'queue-1', message: 'Primeiro aviso', tone: 'info', persistent: false },
      }));
      document.dispatchEvent(new CustomEvent('bossbar:player-notice', {
        detail: { id: 'queue-2', message: 'Aviso grave', tone: 'rejected', persistent: false },
      }));
    });
    const queuedNotices = firstPage.locator('.player-resource-notices button');
    await expect(queuedNotices).toHaveText(['Primeiro aviso', 'Aviso grave']);
    const noticeBoxes = await queuedNotices.evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom, background: getComputedStyle(element).backgroundImage };
      }));
    expect(noticeBoxes[0].bottom).toBeLessThan(noticeBoxes[1].top);
    expect(noticeBoxes[0].background).not.toBe(noticeBoxes[1].background);
    await queuedNotices.first().click();
    await queuedNotices.first().click();

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
    await firstPage.locator('#web-player-sheet-open').click();
    const initialSheetEditor = firstPage.getByRole('dialog', { name: 'Ajustar ficha' });
    await expect(initialSheetEditor).toBeVisible();
    await expect(initialSheetEditor.locator('.web-player-sheet-editor-section > h2')).toContainText([
      'Identidade',
      'Atributos e modificadores',
      'Pontos de vida e mana',
      'Perícias',
      'Ataques',
      'Defesa',
    ]);
    await expect(initialSheetEditor.locator('[data-field-name="BossBar.PVs Temporarios"]')).toContainText('PV temporário');
    await expect(initialSheetEditor.locator('[data-field-name="BossBar.PVs Temporarios"] input')).toHaveValue('0');
    const reflexSkillGroup = initialSheetEditor.locator('.web-player-sheet-editor-group').filter({ hasText: 'Reflexos' });
    await expect(reflexSkillGroup.locator('.web-player-sheet-editor-group-heading [type="checkbox"]')).toHaveCount(1);
    await expect(reflexSkillGroup.locator('.web-player-sheet-editor-group-fields [type="checkbox"]')).toHaveCount(0);
    await expect(initialSheetEditor.locator('.web-player-sheet-editor-section.is-skills')).toHaveCount(1);
    await expect(initialSheetEditor.locator('.web-player-sheet-editor-office select')).toHaveCount(2);
    const identityFieldTops = await initialSheetEditor
      .locator('.web-player-sheet-editor-section.is-identity .web-player-sheet-editor-section-body > label')
      .evaluateAll((fields) => fields.map((field) => field.getBoundingClientRect().top));
    expect(Math.max(...identityFieldTops) - Math.min(...identityFieldTops)).toBeLessThan(2);
    const itemRows = initialSheetEditor.locator('.web-player-sheet-editor-group.is-item-row');
    await expect(itemRows).toHaveCount(3);
    await initialSheetEditor.getByRole('button', { name: /Adicionar item/ }).click();
    await expect(itemRows).toHaveCount(4);
    await itemRows.getByRole('button', { name: 'Remover Item 4' }).click();
    await expect(itemRows).toHaveCount(3);
    const firstItemRow = itemRows.filter({ hasText: 'Item 1' });
    await firstItemRow.locator('[data-field-name="BossBar.Item.1.Quantidade"] input').fill('2');
    await firstItemRow.locator('[data-field-name="PesoItem1"] input').fill('1,5');
    await expect(initialSheetEditor.locator('[data-field-name="CargaTotal"] input')).toHaveValue('3');
    await firstItemRow.locator('[data-field-name="BossBar.Item.1.Quantidade"] input').fill('0');
    await firstItemRow.locator('[data-field-name="PesoItem1"] input').fill('');
    await expect(initialSheetEditor.locator('[data-field-name="CargaTotal"] input')).toHaveValue('0');
    const armorRows = initialSheetEditor.locator('.web-player-sheet-editor-group.is-armor-row');
    const shieldRows = initialSheetEditor.locator('.web-player-sheet-editor-group.is-shield-row');
    await expect(armorRows).toHaveCount(1);
    await expect(shieldRows).toHaveCount(1);
    await initialSheetEditor.getByRole('button', { name: '+ Armadura' }).click();
    await expect(armorRows).toHaveCount(2);
    await armorRows.getByRole('button', { name: 'Remover Armadura 2' }).click();
    await expect(armorRows).toHaveCount(1);
    const spellRows = initialSheetEditor.locator('.web-player-sheet-editor-group.is-spell-row');
    await expect(spellRows).toHaveCount(0);
    await initialSheetEditor.getByRole('button', { name: /Adicionar magia/ }).click();
    await expect(spellRows).toHaveCount(1);
    await spellRows.getByRole('button', { name: 'Remover Magia 1' }).click();
    await expect(spellRows).toHaveCount(0);
    await expect(initialSheetEditor.locator('[data-field-name="JOGADOR"]')).toHaveCount(0);
    await initialSheetEditor.locator('[data-field-name="BossBar.PVs Temporarios"] input').fill('7');
    await expect(firstPage.locator('#web-player-sheet-editor-status'))
      .toContainText('Rascunho local');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await expect.poll(() => firstPage.evaluate(async () =>
      (await window.bossAPI.getPlayerHuds()).find(({ isSelf }) => isSelf)
        ?.sheetInteractionState,
    )).toBe('editing');
    expect(await firstPage.locator('[data-player-action]').evaluateAll(
      (buttons) => buttons.map((button) => (button as HTMLButtonElement).disabled),
    )).toEqual([true, true, true]);
    expect(await firstPage.evaluate(() => window.bossAPI.usePlayerAction('free')))
      .toMatchObject({ ok: false, error: expect.stringContaining('Feche a ficha') });
    await firstPage.locator('#web-player-sheet-editor-close').click();
    await expect(initialSheetEditor).toBeHidden();
    await expect.poll(() => session.server.getPendingSheetChangeRequests().length)
      .toBe(1);
    await expect.poll(() => firstPage.evaluate(async () =>
      (await window.bossAPI.getPlayerHuds()).find(({ isSelf }) => isSelf)
        ?.sheetInteractionState,
    )).toBe('pending-approval');
    const temporaryHealthRequest = session.server.getPendingSheetChangeRequests()[0];
    expect(temporaryHealthRequest?.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'BossBar.PVs Temporarios', after: '7' }),
      expect.objectContaining({ field: 'CargaTotal', after: '0' }),
    ]));
    expect(await firstPage.evaluate(() => window.bossAPI.usePlayerAction('free')))
      .toMatchObject({ ok: false, error: expect.stringContaining('Aguarde o mestre') });
    expect(await session.server.decideCharacterSheetChanges(temporaryHealthRequest!.id, true))
      .toEqual({ ok: true });
    await expect.poll(() => firstPage.evaluate(async () =>
      (await window.bossAPI.getPlayerHuds()).find(({ isSelf }) => isSelf)
        ?.sheetInteractionState,
    )).toBe('idle');

    const characterHud = firstPage.locator('#web-player-character-hud');
    await expect(characterHud).toBeVisible();
    await expect(firstPage.locator('#web-player-character-name')).toHaveText('Valora');
    await expect(firstPage.locator('#web-player-character-health-value')).toHaveText('21/21');
    await expect(firstPage.locator('#web-player-character-temporary-health-fill')).toBeVisible();
    expect(await firstPage.locator('#web-player-character-temporary-health-fill').evaluate(
      (element) => Number.parseFloat((element as HTMLElement).style.width),
    )).toBeGreaterThan(30);
    await expect(firstPage.locator('#web-player-character-mana-value')).toHaveText('3/3');
    await expect(firstPage.locator('#web-player-character-defense-melee')).toHaveText('10');
    await expect(firstPage.locator('#web-player-character-defense-ranged')).toHaveText('10');
    await expect(firstPage.locator('.web-player-character-defenses img')).toHaveCount(3);
    await expect(firstPage.locator('.web-player-character-actions').locator('xpath=..')).toHaveClass(/web-player-character-defenses/);
    const selfActionsAlignment = await firstPage.locator('.web-player-character-defenses').evaluate((row) => {
      const actionsBounds = row.querySelector('.web-player-character-actions')?.getBoundingClientRect();
      const actionButtons = [...row.querySelectorAll('.web-player-character-actions button')];
      const firstAction = actionButtons[0]?.getBoundingClientRect();
      const lastAction = actionButtons.at(-1)?.getBoundingClientRect();
      if (!actionsBounds || !firstAction || !lastAction) return Number.POSITIVE_INFINITY;
      const dotsCenter = (firstAction.left + lastAction.right) / 2;
      return Math.abs(dotsCenter - (actionsBounds.left + actionsBounds.width / 2));
    });
    expect(selfActionsAlignment).toBeLessThan(1);
    await expect(firstPage.locator('#web-player-character-melee')).toHaveText('0');
    await expect(firstPage.locator('#web-player-character-ranged')).toHaveText('0');
    await firstPage.locator('#web-player-character-expand').click();
    await expect(firstPage.locator('#web-player-character-details')).toBeVisible();
    await expect(characterHud).toHaveCSS('z-index', '2147483647');
    await expect(firstPage.locator('#web-player-character-class-level')).toContainText('Guerreiro');
    await expect(firstPage.locator('#web-player-character-class-level')).not.toContainText('Defesa:');
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
    await firstPage.locator('#web-player-sheet-open').click();
    const sheetEditor = firstPage.getByRole('dialog', { name: 'Ajustar ficha' });
    await expect(sheetEditor).toBeVisible();
    const originField = sheetEditor.locator('[data-field-name="ORIGEM"] input');
    await originField.fill('Marinheira');
    await expect(firstPage.locator('#web-player-sheet-editor-status'))
      .toContainText('Rascunho local');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await originField.fill('Guarda');
    await expect(firstPage.locator('#web-player-sheet-editor-status'))
      .toContainText('Rascunho local');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await originField.fill('Marinheira');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await firstPage.locator('#web-player-sheet-editor-close').click();
    await expect(sheetEditor).toBeHidden();
    await expect.poll(() => session.server.getPendingSheetChangeRequests().length)
      .toBe(1);
    const pendingRequest = session.server.getPendingSheetChangeRequests()[0];
    expect(pendingRequest?.changes).toContainEqual({
      field: 'ORIGEM',
      before: 'Guarda',
      after: 'Marinheira',
    });
    expect(await session.server.decideCharacterSheetChanges(pendingRequest!.id, true))
      .toEqual({ ok: true });
    await firstPage.getByRole('button', { name: 'Ficha', exact: true }).click();
    await firstPage.locator('#web-player-sheet-open').click();
    await expect(sheetEditor).toBeVisible();
    await expect(originField).toHaveValue('Marinheira');
    expect(sheetTicketRequests).toBe(2);
    await firstPage.locator('#web-player-sheet-editor-close').click();
    await firstPage.getByRole('button', { name: 'Ficha', exact: true }).click();
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

test('recupera localmente o rascunho da ficha após fechar o navegador', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Recuperação local validada no Chromium.');
  const session = await startHostedTestSession();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await joinHostedSession(page, session.inviteUrl, 'Jogador Rascunho');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-input').setInputFiles({
      name: 'ficha-rascunho.pdf',
      mimeType: 'application/pdf',
      buffer: await createEditableCharacterSheet({ playerName: 'Jogador Rascunho' }),
    });
    await expect(page.locator('#web-player-sheet-open')).toBeEnabled();
    await page.locator('#web-player-sheet-open').click();
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha' });
    await expect(editor).toBeVisible();
    await editor.locator('[data-field-name="ORIGEM"] input').fill('Sobrevivente');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await joinHostedSession(page, session.inviteUrl, 'Jogador Rascunho');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-open').click();
    await expect(editor).toBeVisible();
    await expect(editor.locator('[data-field-name="ORIGEM"] input'))
      .toHaveValue('Sobrevivente');
    await expect(page.locator('#web-player-sheet-editor-status'))
      .toContainText('Rascunho local recuperado');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);

    await page.locator('#web-player-sheet-editor-close').click();
    await expect.poll(() => session.server.getPendingSheetChangeRequests().length).toBe(1);
    await expect.poll(() => page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        key.startsWith('bossbar.character-sheet-draft.v1:')),
    )).toBe(false);
  } finally {
    await context.close().catch(() => undefined);
    await session.close();
  }
});
