import { keepCustomizedSheetValues } from '../support/sheet-review';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createNimbCharacterSheet } from '../../fixtures/character-sheet-nimb';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('avisos mantêm janela e rodapé estáveis; comparação e carga acompanham equipamento', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    await joinHostedSession(page, session.inviteUrl, 'Revisão visual');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    const examples = JSON.parse(await readFile(path.resolve('tests/fixtures/nimb-text-examples.json'), 'utf8'));
    const pythagoras = examples.find(({ name }: { name: string }) => name === 'Pythagoras');
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'pythagoras-revisao.pdf', mimeType: 'application/pdf', buffer: await createNimbCharacterSheet({
      ...pythagoras.fields, nivel: '', armadura1: 'Brunea', armadura2: 'Escudo Leve', ataque1: 'Lança',
      item1: 'Brunea (5 espaços)\nEscudo Leve (1 espaços)\nLança (1 espaços)\nCorda (1 espaços)', cargaAtual: '8',
    }) });
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha', exact: true });
    await expect(editor).toBeVisible();
    const field = (name: string) => editor.locator(`[data-field-name="${name}"]`);
    const review = editor.locator('#web-player-sheet-editor-review');
    if (await review.getAttribute('open') === null) await review.locator(':scope > summary').click();
    const olhar = review.locator('li').filter({ hasText: '“Olhar Atordoante”' });
    await olhar.locator('.sheet-reference-comparison summary').click();
    await expect(olhar.locator('blockquote').first()).toContainText('imune a esta habilidade por um dia');
    await expect(olhar.locator('blockquote').last()).toContainText('apenas uma vez por cena');
    await olhar.getByRole('button', { name: 'Consultar texto completo do livro' }).click();
    await expect(page.getByRole('dialog', { name: 'Poderes e magias', exact: true }).locator('.rules-catalog-citation')).toHaveText('Livro Básico - Jogo do Ano, p. 29');
    await page.keyboard.press('Escape');
    await olhar.getByRole('button', { name: 'Ir ao campo', exact: true }).click();
    await expect(field('BossBar.Habilidades.Raca').locator('textarea')).toBeInViewport();
    const bounds = async () => editor.evaluate((element) => {
      const card = element.querySelector<HTMLElement>('.web-player-sheet-editor-card')!;
      const fields = element.querySelector<HTMLElement>('#web-player-sheet-editor-fields')!;
      const footer = element.querySelector<HTMLElement>('.sheet-editor-footer')!;
      const heading = element.querySelector<HTMLElement>('#sheet-editor-title')!;
      return { cardTop: card.getBoundingClientRect().top, cardBottom: card.getBoundingClientRect().bottom, cardScroll: card.scrollTop,
        headingTop: heading.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom,
        fieldsHeight: fields.clientHeight, viewport: window.innerHeight };
    });
    await expect.poll(async () => (await bounds()).cardScroll).toBe(0);
    let layout = await bounds();
    expect(layout.cardTop).toBeGreaterThanOrEqual(0); expect(layout.headingTop).toBeGreaterThan(layout.cardTop);
    expect(layout.cardBottom).toBeLessThanOrEqual(layout.viewport);
    expect(layout.cardBottom - layout.footerBottom).toBeLessThan(20); expect(layout.fieldsHeight).toBeGreaterThan(150);
    const defenseHeights = await editor.locator('.sheet-defense-row > label, .sheet-defense-row > .sheet-field-pair').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(Math.max(...defenseHeights)).toBeLessThan(90);
    await page.screenshot({ path: info.outputPath('editor-avisos-desktop.png') });
    await field('Lv').locator('input').fill('5');
    await expect(field('SeleTamanho').locator('small')).toHaveCount(0);
    await expect(field('SeleTamanho').locator('select')).not.toHaveAttribute('title');
    await expect(field('CargaTotal').locator('[data-load-part="total"]')).toHaveValue('1');
    await field('BossBar.Armadura.1.Equipado').locator('input').uncheck();
    await expect(field('CargaTotal').locator('[data-load-part="total"]')).toHaveValue('6');
    await field('BossBar.Armadura.1.Equipado').locator('input').check();
    await field('BossBar.Item.3.Quantidade').locator('input').fill('2');
    await expect(field('CargaTotal').locator('[data-load-part="total"]')).toHaveValue('2');
    await expect(editor.locator('.sheet-item-equipped[data-item-index="3"]')).toContainText('(Equipado)');
    await page.setViewportSize({ width: 390, height: 844 });
    await editor.getByRole('button', { name: 'Validar e corrigir cálculos', exact: true }).click();
    await keepCustomizedSheetValues(page);
    await expect(editor.getByRole('button', { name: 'Validar e corrigir cálculos', exact: true })).toBeEnabled();
    await expect(field('CargaTotal').locator('[data-load-part="total"]')).toHaveValue('2');
    await field('CargaTotal').locator('[data-load-part="total"]').focus();
    layout = await bounds();
    expect(layout.cardScroll).toBe(0); expect(layout.headingTop).toBeGreaterThanOrEqual(0);
    expect(layout.cardBottom).toBeLessThanOrEqual(layout.viewport);
    expect(layout.cardBottom - layout.footerBottom).toBeLessThan(20); expect(layout.fieldsHeight).toBeGreaterThan(80);
    await page.screenshot({ path: info.outputPath('editor-avisos-mobile.png') });
    await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect.poll(() => session.server.getPlayerHuds()[0]?.summary?.currentLoad).toBe(2);
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-open').click();
    await expect(editor).toBeVisible();
    await expect(field('CargaTotal').locator('[data-load-part="total"]')).toHaveValue('2');
  } finally { await session.close(); }
});
