import { _electron as electron, test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { REFERENCE_BOOKS } from '../../../src/shared/reference-books';
import { ReferenceVariantStore } from '../../../src/reference-variant-store';
import { T20_CATALOG } from '../../../src/shared/rules-catalog';

test('mestre consulta poderes e magias fora da ficha sem executar efeitos', async ({ browserName }, info) => {
  void browserName;
  const profile = info.outputPath('catalog-profile'); await mkdir(profile, { recursive: true });
  // Test only the local PDF transport; never depend on the maintainer's books.
  const downloads = path.join(profile, 'Downloads');
  await mkdir(downloads, { recursive: true });
  const fixtureBook = await PDFDocument.create(); fixtureBook.addPage();
  const fixtureBytes = await fixtureBook.save();
  await writeFile(path.join(downloads, REFERENCE_BOOKS[0].file), fixtureBytes);
  const variants = await ReferenceVariantStore.open(path.join(profile, 'user-data'));
  const reference = T20_CATALOG.spells.find(({ name }) => name === 'Conjurar Mortos-Vivos')!;
  await variants.create({ referenceId: reference.id, sourceId: reference.sourceId, page: reference.page, revision: 'Proposta do jogador', description: 'Texto proposto para aprovação do mestre.' }, 'player-variant-test');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: process.cwd(), args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu'], env: { ...env, USERPROFILE: profile, BOSSBAR_E2E: '1', BOSSBAR_E2E_PROFILE: profile } });
  try {
    await (await app.firstWindow()).getByRole('button', { name: 'Novo encontro' }).click();
    await expect.poll(async () => Promise.all(app.windows().map((page) => page.title()))).toContain('Controle do Mestre - BossBar T20');
    const master = (await Promise.all(app.windows().map(async (page) => ({ page, title: await page.title() })))).find(({ title }) => title === 'Controle do Mestre - BossBar T20')!.page;
    const before = await master.evaluate(async () => (await window.bossAPI.getState()).bosses);
    await master.getByRole('button', { name: 'Poderes e magias', exact: true }).click();
    const catalog = master.getByRole('dialog', { name: 'Poderes e magias', exact: true });
    await expect(catalog).toBeVisible();
    await catalog.getByRole('searchbox').fill('Código de Héroi');
    await expect(catalog.locator('.rules-catalog-detail h3')).toHaveText('Código do Herói');
    await expect(catalog.locator('.rules-catalog-detail')).toContainText('Paladino');
    await catalog.getByRole('searchbox').fill('Armadura Elemental');
    await expect(catalog.locator('.rules-catalog-detail')).toContainText('Heróis de Arton, p. 252');
    await master.screenshot({ path: info.outputPath('catalogo-mestre.png') });
    await catalog.getByRole('searchbox').fill('Conjurar Mortos-Vivos');
    await expect(catalog.locator('.rules-catalog-citation')).toContainText('Livro Básico');
    await app.evaluate(({ shell }) => {
      (globalThis as unknown as { openedReference: string }).openedReference = '';
      shell.openExternal = async (url) => { (globalThis as unknown as { openedReference: string }).openedReference = url; };
    });
    await catalog.locator('.rules-catalog-citation a').click();
    await expect.poll(() => app.evaluate(() => Boolean((globalThis as unknown as { openedReference: string }).openedReference))).toBe(true);
    const opened = await app.evaluate(async () => {
      const url = new URL((globalThis as unknown as { openedReference: string }).openedReference);
      const result = await fetch(url, { headers: { Range: 'bytes=0-4' } });
      return { local: url.hostname === '127.0.0.1', page: Number(new URLSearchParams(url.hash.slice(1)).get('page')), status: result.status, range: result.headers.get('content-range'), signature: await result.text() };
    });
    expect(opened).toEqual({ local: true, page: reference.pdfPage, status: 206, range: `bytes 0-4/${fixtureBytes.length}`, signature: '%PDF-' });
    const supplement = catalog.locator('details').filter({ has: master.getByText('Complemento opcional — Ameaças de Arton, p. 405', { exact: true }) });
    await expect(supplement.locator('summary')).toHaveText('Complemento opcional — Ameaças de Arton, p. 405');
    await expect(supplement.locator('.rules-catalog-description')).toBeHidden();
    await supplement.locator('summary').click();
    await expect(supplement.locator('.rules-catalog-description')).toBeVisible();
    await expect(supplement).toContainText('soterrados');
    await catalog.getByText(/Proposta do jogador · Proposta pendente/).click();
    await catalog.getByRole('button', { name: 'Aprovar variante', exact: true }).click();
    await expect(catalog.locator('.rules-catalog-variants')).toContainText('Proposta do jogador · Aprovada');
    await expect(catalog.getByRole('button', { name: '0 proposta(s) pendente(s)', exact: true })).toBeDisabled();
    await catalog.getByText('Cadastrar variante', { exact: true }).click();
    const variantForm = catalog.locator('.rules-catalog-variant-form');
    await variantForm.getByLabel('Revisão', { exact: true }).fill('Revisão da mesa 1');
    await variantForm.getByLabel('Descrição', { exact: true }).fill('Descrição registrada e preservada como variante.');
    await variantForm.getByRole('button', { name: 'Salvar variante', exact: true }).click();
    await expect(catalog.locator('.rules-catalog-variants')).toContainText('Revisão da mesa 1 · Aprovada');
    expect((await master.evaluate(() => window.bossAPI.getReferenceVariants())).variants).toHaveLength(2);
    await master.screenshot({ path: info.outputPath('complemento-opcional-mestre.png') });
    await master.keyboard.press('Escape');
    await expect(catalog).toHaveCount(0);
    expect(await master.evaluate(async () => (await window.bossAPI.getState()).bosses)).toEqual(before);
  } finally { await app.close(); }
});
