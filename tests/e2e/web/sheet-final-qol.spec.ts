import { test, expect } from '@playwright/test';
import path from 'node:path';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('ficha vazia: compra por botões, recursos automáticos, cabeçalhos e carga compactos', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    await joinHostedSession(page, session.inviteUrl, 'Ficha nova QoL');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.getByRole('button', { name: 'Criar ficha vazia', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha', exact: true }); await expect(editor).toBeVisible();
    const field = (name: string) => editor.locator(`[data-field-name="${name}"] input`);
    await expect(editor.locator('.is-item-row')).toHaveCount(2);
    await field('NOME DO PERSONAGEM').fill('Anão Ladino'); await field('RAÇA').fill('Anão'); await field('ORIGEM').fill('Soldado');
    await field('CLASSE').fill('Arcanista'); await field('NOME DO PERSONAGEM').click();
    await expect(field('PMs Totais')).toHaveValue('6');
    await field('CLASSE').fill('Ladino'); await field('NOME DO PERSONAGEM').click();
    await expect(field('PVs Totais')).toHaveValue('17'); await expect(field('PVs Atuais')).toHaveValue('17'); await expect(field('PMs Totais')).toHaveValue('4');
    const attrs = editor.locator('.is-attributes');
    await expect(attrs.getByRole('textbox', { name: 'Força: Base', exact: true })).not.toBeEditable();
    for (const [name, times] of [['Força', 3], ['Destreza', 3], ['Constituição', 2]] as const) for (let i = 0; i < times; i++) await attrs.getByRole('button', { name: name + ': +', exact: true }).click();
    await expect(attrs.locator('.attribute-allocation-status')).toHaveText('Todos os 10 pontos foram alocados.');
    await expect(attrs.getByRole('button', { name: 'Carisma: +', exact: true })).toHaveAttribute('data-at-limit', 'true');
    await expect(field('PVs Totais')).toHaveValue('19'); await expect(field('PVs Atuais')).toHaveValue('19');
    await attrs.getByRole('button', { name: 'Força: Min.', exact: true }).click();
    await attrs.getByRole('button', { name: 'Força: Max.', exact: true }).click();
    await expect(attrs.getByRole('textbox', { name: 'Força: Base', exact: true })).toHaveValue('3');
    const layout = await attrs.evaluate((section) => {
      const h = section.querySelector('h2')!; const add = section.querySelector('.attribute-add-point')!;
      const select = section.querySelector('select')!; const help = section.querySelector('.attribute-allocation-help')!;
      const center = (node: Element) => { const b = node.getBoundingClientRect(); return b.top + b.height / 2; };
      return { heading: [center(h), center(add)], toolbar: [center(select), center(help)], selectWidth: select.getBoundingClientRect().width,
        titleFont: getComputedStyle(h).font, identityFont: getComputedStyle(document.querySelector('.web-player-sheet-editor-section h2')!).font,
        cardOverflow: [...section.querySelectorAll('.attribute-card-heading')].some((node) => node.scrollWidth > node.clientWidth + 1),
        meterColors: [...section.querySelectorAll('.attribute-points-meter i')].map((node) => getComputedStyle(node).backgroundColor) };
    });
    expect(Math.max(...layout.heading, ...layout.toolbar) - Math.min(...layout.heading, ...layout.toolbar)).toBeLessThan(3);
    expect(layout.selectWidth).toBeLessThan(250); expect(layout.titleFont).toBe(layout.identityFont); expect(layout.cardOverflow).toBe(false); expect(new Set(layout.meterColors).size).toBe(10);
    await attrs.getByRole('textbox', { name: 'Constituição: Total', exact: true }).hover();
    const tooltip = page.locator('.calculation-tooltip:visible'); await expect(tooltip).not.toContainText('PDF'); await expect(tooltip.locator('.rule-value').first()).toBeVisible();
    await expect(tooltip).toContainText('(base)'); await expect(tooltip).toContainText('(fontes)');
    await expect(attrs.locator('.attribute-source-panel a').first()).toHaveAttribute('target', '_blank');
    await page.mouse.move(5, 5); await page.screenshot({ path: info.outputPath('atributos-recursos.png') });
    await field('PVs Atuais').fill('7'); await field('Lv').fill('2'); await field('NOME DO PERSONAGEM').click();
    await expect(field('PVs Totais')).toHaveValue('27'); await expect(field('PVs Atuais')).toHaveValue('7'); await expect(field('PMs Totais')).toHaveValue('8');
    const items = editor.locator('.is-items'); await items.scrollIntoViewIfNeeded();
    const heights = await items.locator('.sheet-load-composite, .sheet-load-values > label').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(7);
    await page.screenshot({ path: info.outputPath('carga-compacta.png') });
    await editor.getByRole('button', { name: 'Validar e corrigir cálculos' }).click();
    await expect(field('PVs Totais')).toHaveValue('27'); await expect(field('PMs Totais')).toHaveValue('8');
    await editor.getByRole('button', { name: 'Multiclasse', exact: true }).click();
    const multi = page.getByRole('dialog', { name: 'Multiclasse', exact: true });
    await multi.getByRole('button', { name: '+ Adicionar classe', exact: true }).click();
    await multi.getByRole('combobox', { name: 'Classe 2', exact: true }).fill('Bardo');
    await multi.getByRole('combobox', { name: 'Classe 2', exact: true }).press('Escape');
    await multi.getByRole('button', { name: 'Usar estas classes', exact: true }).click();
    await expect(field('PVs Totais')).toHaveValue('35'); await expect(field('PVs Atuais')).toHaveValue('7'); await expect(field('PMs Totais')).toHaveValue('12');
    await page.setViewportSize({ width: 390, height: 844 }); await attrs.scrollIntoViewIfNeeded();
    const narrow = await attrs.evaluate((section) => ({ overflow: section.scrollWidth - section.clientWidth,
      right: section.getBoundingClientRect().right,
      cards: [...section.querySelectorAll('.attribute-card-heading')].map((node) => node.scrollWidth - node.clientWidth),
      headerHeight: section.querySelector('.sheet-attributes-heading')!.getBoundingClientRect().height }));
    expect(narrow.right).toBeLessThan(390); expect(narrow.overflow).toBeLessThan(2); expect(Math.max(...narrow.cards)).toBeLessThan(2); expect(narrow.headerHeight).toBeLessThan(40);
    await page.screenshot({ path: info.outputPath('atributos-tela-estreita.png') });
  } finally { await session.close(); }
});

test('citação abre nova aba na página indicada e o acesso ao livro exige autenticação', async ({ page }) => {
  const session = await startHostedTestSession({ resolveReferenceBook: async (id) => id === 'core' ? path.resolve('assets/ficha-t20-nimb.pdf') : null });
  try {
    const origin = new URL(session.inviteUrl).origin;
    expect((await page.request.get(origin + '/reference-books/core')).status()).toBe(401);
    expect((await page.request.post(origin + '/api/player/reference-books/authorize', { data: { id: 'core', page: 23 } })).status()).toBe(401);
    await joinHostedSession(page, session.inviteUrl, 'Consulta aos livros');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click(); await page.getByRole('button', { name: 'Criar ficha vazia', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha', exact: true });
    await editor.locator('[data-field-name="CA"] input').hover();
    const link = page.locator('.calculation-tooltip:visible').getByRole('link', { name: 'Livro Básico, p. 106', exact: true });
    const opened = page.waitForEvent('popup'); const served = page.waitForResponse((response) => response.url().includes('/api/player/reference-books/authorize'));
    await link.click(); const tab = await opened; const authorization = await (await served).json();
    expect(authorization).toEqual({ ok: true, url: '/reference-books/core#page=112' });
    // Chrome's headless shell downloads documents; full Chromium/Edge uses its built-in reader.
    const response = await page.request.get(origin + '/reference-books/core', { headers: { Range: 'bytes=0-4' } });
    expect(response.status()).toBe(206); expect(await response.text()).toBe('%PDF-');
    await expect.poll(async () => {
      try { return await tab.evaluate(() => window.opener === null); }
      catch (error) {
        if (error instanceof Error && error.message.includes('Execution context was destroyed')) return false;
        throw error;
      }
    }).toBe(true);
    await expect(editor).toBeVisible(); await tab.close();
  } finally { await session.close(); }
});
