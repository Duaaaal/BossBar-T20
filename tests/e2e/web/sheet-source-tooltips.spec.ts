import { test, expect } from '@playwright/test';
import { createNimbCharacterSheet } from '../../fixtures/character-sheet-nimb';
import { applyCharacterSheetEditorFields, readCharacterSheetEditorFields } from '../../../src/multiplayer/character-sheet-pdf';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('fontes, carga, cabeçalhos e correções propostas funcionam no rascunho', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    await joinHostedSession(page, session.inviteUrl, 'Fontes dos cálculos');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    const pdf = await createNimbCharacterSheet({ Raca: 'Medusa', Classe: 'Bucaneiro 3', nivel: '3', modCar: '4', vidaMax: '27', vidaAtual: '27', manaMax: '99', manaAtual: '99', Texto13: '17', defesaOutros: '4', ataque1: 'Espada', item1: 'Armadura leve (2 espaços)\nEspada (1 espaços)\nCorda (1 espaços)' });
    const spellFields = await readCharacterSheetEditorFields(pdf);
    // Existing spell metadata may be customized, and must need confirmation too.
    const add = (suffix: string, value: string) => spellFields.push({ name: `BossBar.Magia.1.${suffix}`, label: suffix, section: 'Magias', group: 'Magia 1', kind: 'text', value });
    add('Nome', 'Bola de Fogo'); add('Circulo', '2'); add('Escola', 'Abjuração'); add('Execucao', 'Padrão');
    const fixed = await applyCharacterSheetEditorFields(pdf, spellFields, true);
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'fontes.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixed.bytes) });
    await expect(page.locator('#web-player-sheet-open')).toBeEnabled();
    await page.locator('#web-player-sheet-open').click();
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha', exact: true });
    await expect(editor.locator('.sheet-attributes-heading')).not.toContainText('Atributos alocados');
    await expect(editor.locator('.attribute-source-panel summary')).toHaveText('Fontes:');
    await expect(editor.getByRole('button', { name: '+ Adicionar ponto', exact: true })).toBeVisible();
    const defense = editor.locator('[data-field-name="CA"] input');
    await expect(defense).toHaveValue('17'); await defense.hover();
    const tooltip = page.locator('.calculation-tooltip:visible');
    await expect(tooltip).toContainText('Base natural: 10'); await expect(tooltip).toContainText('Insolência: 3'); await expect(tooltip).toContainText('Esquiva Sagaz: 1');
    await expect(tooltip.locator('cite').first()).toContainText('Livro Básico');
    await page.mouse.move(5, 5);
    await editor.getByRole('textbox', { name: 'Destreza: Total', exact: true }).hover();
    await expect(tooltip).toContainText('2 (fontes)');
    await page.mouse.move(5, 5);
    const items = editor.locator('.is-items'); await items.scrollIntoViewIfNeeded();
    await expect(items.locator('[data-load-part="gross"]')).toHaveValue('4');
    await expect(items.locator('[data-load-part="equipped"]')).toHaveValue('3');
    await expect(items.locator('[data-load-part="total"]')).toHaveValue('1');
    await expect(items.locator('.is-item-row h3').first()).toHaveText('Item 1 (Equipado)');
    await expect(items.locator('.is-item-row').first().getByRole('textbox', { name: 'Carga Total do Item 1' })).toHaveValue('2');
    await items.locator('[data-field-name="BossBar.Item.1.Quantidade"] input').fill('3');
    await expect(items.locator('[data-item-total="1"]')).toHaveValue('6');
    await expect(items.locator('[data-load-part="gross"]')).toHaveValue('8');
    await expect(items.locator('[data-load-part="total"]')).toHaveValue('5');
    const layout = await items.locator('.sheet-currencies, .sheet-load-values').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
    expect(Math.abs(layout[0] - layout[1])).toBeLessThan(8);
    await page.screenshot({ path: info.outputPath('itens-e-carga.png') });
    await editor.getByRole('button', { name: 'Validar e corrigir cálculos' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Revisar valores esperados' });
    await expect(confirmation).toContainText('99 → 9');
    await expect(confirmation).toContainText('Abjuração → Evocação');
    await confirmation.getByRole('button', { name: 'Manter valores atuais' }).click();
    await expect(editor.locator('[data-field-name="PMs Totais"] input')).toHaveValue('99');
    await editor.getByRole('button', { name: 'Validar e corrigir cálculos' }).click();
    await confirmation.getByRole('button', { name: 'Aplicar valores selecionados' }).click();
    await expect(editor.locator('[data-field-name="PMs Totais"] input')).toHaveValue('9');
    await expect(editor.locator('[data-field-name="PMs Atuais"] input')).toHaveValue('9');
    await expect(editor.locator('[data-field-name="BossBar.Magia.1.Escola"] input')).toHaveValue('Evocação');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await editor.getByRole('button', { name: 'Fechar sem salvar' }).click();
  } finally { await session.close(); }
});

test('RD mantém imunidade no topo esquerdo e explica o total por fonte', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Tooltip RD');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    const raw = await createNimbCharacterSheet({ Raca: 'Medusa' });
    const fixed = await applyCharacterSheetEditorFields(raw, await readCharacterSheetEditorFields(raw), true);
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'rd.pdf', mimeType: 'application/pdf', buffer: Buffer.from(fixed.bytes) });
    await expect(page.locator('#web-player-sheet-open')).toBeEnabled(); await page.locator('#web-player-sheet-open').click();
    await page.getByRole('button', { name: 'Redução de dano', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Redução de dano', exact: true });
    const physical = dialog.locator('.rd-category').filter({ has: page.getByRole('table', { name: 'RD: Físico', exact: true }) });
    await physical.getByRole('spinbutton', { name: 'RD: Físico', exact: true }).fill('3');
    await physical.getByRole('textbox', { name: 'Nome da fonte', exact: true }).fill('Armadura natural');
    const immune = physical.getByRole('checkbox', { name: 'Imunidade: Físico', exact: true });
    const box = await immune.boundingBox(); const amount = await physical.getByRole('spinbutton').boundingBox();
    expect(box!.x).toBeLessThan(amount!.x); expect(box!.y).toBeLessThan(amount!.y);
    await dialog.locator('.rd-total-chip').filter({ hasText: /^Corte / }).hover();
    await expect(page.locator('.calculation-tooltip:visible')).toContainText('Armadura natural: 3');
    await expect(page.locator('.calculation-tooltip:visible')).toContainText('RD = 3');
    await page.screenshot({ path: info.outputPath('rd-fontes.png') });
    await page.mouse.move(5, 5); await immune.check();
    await expect(dialog.locator('.rd-total-chip').filter({ hasText: /^Corte / })).toContainText('Imune: 1');
    await dialog.getByRole('button', { name: 'Aplicar RD', exact: true }).click();
    await expect(dialog).toBeHidden();
  } finally { await session.close(); }
});
