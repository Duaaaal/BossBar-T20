import { keepCustomizedSheetValues } from '../support/sheet-review';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createNimbCharacterSheet } from '../../fixtures/character-sheet-nimb';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('Nimb: revisão por campo, texto longo, correção do rascunho e edição em tela estreita', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Nimb revisão');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    const longText = 'Poder importado com detalhes e acentuação.\n'.repeat(400);
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'nimb.pdf', mimeType: 'application/pdf', buffer: await createNimbCharacterSheet({ nivel: '', vidaAtual: '', manaAtual: '', Texto13: '14', defesaOutros: '', Historico: longText, Atualização: longText, tota23: '2', modificadorMagia: '0', Resistencia: '10' }, true) });
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha' });
    await expect(editor).toBeVisible();
    await expect(editor.locator('[data-field-name="PVs Atuais"] input')).toHaveValue('62');
    await expect(editor.locator('[data-field-name="PMs Atuais"] input')).toHaveValue('44');
    await editor.locator('[data-field-name="Lv"] input').fill('10');
    await expect(editor.locator('.is-attributes [data-field-name^="Mod"] input')).toHaveCount(6);
    await expect(editor.locator('.attribute-allocation-status')).toContainText('Totais preservados');
    await page.screenshot({ path: test.info().outputPath('nimb-desktop.png') });
    await expect(editor.locator('[data-field-name="BossBar.Habilidades.Revisar"] textarea')).toHaveValue(`- ${longText.trim()}`);
    const load = editor.locator('[data-field-name="CargaTotal"] [data-load-part="total"]');
    await expect(load).toHaveValue('1.5');
    await editor.locator('#web-player-sheet-editor-search').fill('Carga');
    await expect(load).toHaveValue('1.5');
    await editor.locator('#web-player-sheet-editor-search').fill('');
    await editor.locator('#web-player-sheet-editor-review summary').click();
    await editor.locator('#web-player-sheet-editor-review li').filter({ hasText: 'A Defesa importada inclui' }).getByRole('button', { name: 'Ir ao campo' }).click();
    await expect(editor.locator('[data-field-name="BossBar.DefesaJustificativa"] textarea')).toBeFocused();
    await editor.locator('[data-field-name="BossBar.DefesaJustificativa"] textarea').fill('Bônus de referência da personagem');
    await editor.locator('#web-player-sheet-editor-review summary').click();
    await editor.locator('[data-field-name="PVs Atuais"] input').fill('62');
    await editor.locator('[data-field-name="PMs Atuais"] input').fill('44');
    await editor.getByRole('button', { name: 'Validar e corrigir cálculos', exact: true }).click();
    await keepCustomizedSheetValues(page);
    await expect(editor.locator('[data-field-name="TesteResist"] input')).toHaveValue('19');
    await expect(editor.locator('[data-field-name="240"] input')).toHaveValue('7');
    await expect(editor.locator('[data-field-name="CA"] input')).toHaveValue('14');
    await expect(editor.locator('.has-import-error')).toHaveCount(0);
    expect(session.server.getPlayerHuds()[0]?.summary).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    const width = await editor.locator('#web-player-sheet-editor-fields').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
    expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
    const bounds = await editor.locator('.web-player-sheet-editor-card').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
    await editor.locator('#web-player-sheet-editor-fields').evaluate((element) => { element.scrollTop = 0; });
    await page.screenshot({ path: test.info().outputPath('nimb-mobile.png') });
    await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect.poll(() => session.server.getPlayerHuds()[0]?.characterName).toBe('Exemplo Nimb');
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-open').click();
    await expect(editor.locator('[data-field-name="BossBar.Habilidades.Revisar"] textarea')).toHaveValue(`- ${longText.trim()}`);
    await expect(editor.locator('[data-field-name="BossBar.Nimb.MagiasAdicionais"] textarea')).toHaveValue(new RegExp('Poder importado com detalhes'));
    await expect(load).toHaveValue('1.5');
  } finally { await session.close(); }
});

// Local acceptance against the user's originals. PDFs stay outside the repo;
// CI exercises the independent native-field fixture above.
const examplesDirectory = process.env.BOSSBAR_NIMB_EXAMPLES_DIRECTORY;

test('ajustes Nimb: totais, campos pareados, moeda com aprovação e custo por círculo', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Nimb ajustes');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'nimb.pdf', mimeType: 'application/pdf', buffer: await createNimbCharacterSheet({ nivel: '', vidaAtual: '1', ataque1: 'Espada', tAtak1: '9', dano1: '1d8+1', item1: 'Corda (1 espaços)\nRecordação', item2: '' }) });
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha' });
    const field = (name: string) => editor.locator(`[data-field-name="${name}"]`);
    await expect(editor).toBeVisible();
    await expect(field('PVs Atuais').locator('input')).toHaveValue('62');
    await field('Lv').locator('input').fill('10');
    await expect(field('BossBar.Nimb.Equipamento')).toHaveCount(0);
    await expect(field('BossBar.Nimb.Equipamento2')).toHaveCount(0);
    await expect(field('BossBar.CdJustificativa')).toHaveCount(0);
    await expect(field('BossBar.CargaRevisada')).toHaveCount(0);
    await expect(field('Item2').locator('input')).toHaveValue('Recordação');
    await expect(field('PesoItem2').locator('input')).toHaveValue('');
    await field('PesoItem2').locator('input').fill('0');
    await expect(field('BossBar.LimiteAtributoDefesa')).toHaveCount(0);
    await expect(field('arm pesa')).toHaveCount(0);
    await expect(field('BossBar.Armadura.1.LimiteAtributo').locator('input')).toHaveValue('');
    await field('Armadura').locator('input').fill('Armadura completa de mitral');
    await expect(field('BossBar.Armadura.1.LimiteAtributo').locator('input')).toHaveValue('2');
    await field('Armadura').locator('input').fill('Armadura leve');
    await field('BossBar.Escudo.1.Equipado').locator('input').check();
    await field('BossBar.Armadura.1.OutrosDefesa').locator('input').fill('3');
    await field('BossBar.Escudo.1.OutrosDefesa').locator('input').fill('1');
    await field('BossBar.Armadura.1.OutrosPenalidade').locator('input').fill('1');
    await field('BossBar.Escudo.1.OutrosPenalidade').locator('input').fill('-2');
    await expect(field('BossBar.PenalidadeArmadura').locator('input')).toHaveCount(0);
    await expect(field('BossBar.PenalidadeArmadura').locator('output')).toHaveText('−3');
    await field('BossBar.PenalidadeArmadura').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('nimb-armor-desktop.png') });
    await expect(field('BossBar.Ataque.1.DanoAlternativo')).toHaveCount(0);
    await expect(field('BossBar.Ataque.1.Base').locator('input')).toHaveAttribute('readonly', '');
    await expect(field('BossBar.Ataque.1.Base').locator('input')).toHaveValue('+6');
    await expect(field('BossBar.Ataque.1.Ajuste').locator('input')).toHaveValue('3');
    await field('BossBar.Ataque.1.DuasArmas').locator('input').check();
    await field('BossBar.Ataque.1.Segunda.Nome').locator('input').fill('Adaga');
    await field('BossBar.Ataque.1.Segunda.Dano').locator('input').fill('1d6+1');
    await field('BossBar.Ataque.1.Principal').locator('input').uncheck();
    await field('BossBar.Ataque.1.Informacoes').locator('textarea').fill('Ataque secundário com duas armas, equipamento revisado antes de usar.');
    const armor = editor.locator('.is-armor-row').first();
    const shield = editor.locator('.is-shield-row').first();
    for (const selector of ['header', '[data-field-name="Armadura"], [data-field-name="Escudo"]', '.sheet-equipment-stats']) {
      const firstBounds = await armor.locator(selector).boundingBox();
      const secondBounds = await shield.locator(selector).boundingBox();
      expect(Math.abs(firstBounds!.y - secondBounds!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(firstBounds!.height - secondBounds!.height)).toBeLessThanOrEqual(1);
    }
    for (const equipment of [armor, shield]) {
      const tops = await equipment.locator('.sheet-equipment-stats > label').evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().y));
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    }
    const weapons = editor.locator('.is-attack-row').first().locator('.sheet-weapon-row');
    await expect(weapons).toHaveCount(2);
    for (const row of await weapons.all()) {
      await expect(row.locator(':scope > label, :scope > .sheet-attack-test')).toHaveCount(8);
      const bounds = await row.locator(':scope > label, :scope > .sheet-attack-test').evaluateAll((fields) => fields.map((field) => ({ x: field.getBoundingClientRect().x, y: field.getBoundingClientRect().y, height: field.getBoundingClientRect().height })));
      expect(Math.max(...bounds.map(({ y }) => y)) - Math.min(...bounds.map(({ y }) => y))).toBeLessThanOrEqual(1);
      expect(Math.max(...bounds.map(({ height }) => height)) - Math.min(...bounds.map(({ height }) => height))).toBeLessThanOrEqual(1);
      await expect(row.locator(':scope > label > span').first()).toHaveText('Arma');
      await expect(row.locator('.sheet-attack-test-caption')).toHaveText(['Teste de ataque', 'Crítico']);
      await expect(row.getByRole('group', { name: 'Crítico', exact: true }).getByRole('textbox')).toHaveCount(2);
      const captions = await row.locator(':scope > label > span:first-child, :scope > .sheet-attack-test > .sheet-attack-test-caption').allTextContents();
      expect(captions).toEqual(['Arma', 'Perícia', 'Teste de ataque', 'Dano', 'Origem', 'Crítico', 'Tipo', 'Alcance']);
    }
    const columns = await weapons.evaluateAll((rows) => rows.map((row) => Array.from(row.children, (field) => field.getBoundingClientRect().x)));
    expect(columns[0]).toEqual(columns[1]);
    await field('BossBar.Ataque.1.Origem').locator('select').selectOption('divine');
    await field('BossBar.Ataque.1.Segunda.Origem').locator('select').selectOption('mundane');
    await weapons.first().getByRole('group', { name: 'Crítico', exact: true }).getByLabel('Margem de crítico', { exact: true }).fill('18');
    await weapons.last().getByRole('group', { name: 'Crítico', exact: true }).getByLabel('Multiplicador de crítico', { exact: true }).fill('3');
    await field('BossBar.Ataque.1.Ajuste').locator('input').fill('+1d6 + 3 + 2d2');
    await expect(field('BossBar.Ataque.1.Base').locator('input')).toHaveValue('+6');
    await field('BossBar.Ataque.1.DuasArmas').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('nimb-attacks-desktop.png') });
    await editor.getByRole('button', { name: '+ Adicionar magia' }).click();
    await field('BossBar.Magia.1.Nome').locator('input').fill('Magia de referência');
    await field('BossBar.Magia.1.Circulo').locator('select').selectOption('3');
    await expect(field('BossBar.Magia.1.Custo').locator('input')).toHaveValue('6');
    await expect(field('BossBar.Magia.1.Custo').locator('input')).toHaveAttribute('readonly', '');
    await field('BossBar.Nimb.MagiasAdicionais').locator('textarea').fill('Ajuste de custo autorizado como referência de teste.');
    await expect(editor.locator('.sheet-field-pair').filter({ has: page.locator('[data-field-name="BossBar.CdOutros"]') }).locator('[data-field-name="TesteResist"]')).toHaveCount(1);
    await expect(editor.locator('.sheet-field-pair').filter({ has: page.locator('[data-field-name="Desloc"]') }).locator('[data-field-name="BossBar.ManobrasTamanho"]')).toHaveCount(1);
    await expect(editor.locator('.is-spell-circle').filter({ has: page.locator('[data-field-name="BossBar.Magia.1.Circulo"]') }).locator('[data-field-name="BossBar.Magia.1.Custo"]')).toHaveCount(1);
    await field('BossBar.Magia.1.Custo').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('nimb-magic-desktop.png') });
    await editor.locator('.sheet-currencies [data-field-name="BossBar.MoedaPersonalizada.Nome"] input').fill('Cristais');
    await field('BossBar.MoedaPersonalizada.Quantidade').locator('input').fill('7');
    await field('BossBar.MoedaPersonalizada.Nome').scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('nimb-items-desktop.png') });
    await editor.getByRole('button', { name: 'Validar e corrigir cálculos', exact: true }).click();
    await keepCustomizedSheetValues(page);
    await expect(field('CA').locator('input')).toHaveValue('17');
    await expect(field('BossBar.Magia.1.Custo').locator('input')).toHaveValue('6');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const [name, imageName] of [['BossBar.PenalidadeArmadura', 'armor'], ['BossBar.Ataque.1.Segunda.Nome', 'attacks'], ['BossBar.MoedaPersonalizada.Nome', 'items'], ['BossBar.Magia.1.Custo', 'magic']]) {
      await field(name).scrollIntoViewIfNeeded();
      const width = await editor.locator('#web-player-sheet-editor-fields').evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth }));
      expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
      await page.screenshot({ path: test.info().outputPath(`nimb-${imageName}-mobile.png`) });
    }
    await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
    await expect(editor).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 720 });
    const reopen = async () => {
      await page.getByRole('button', { name: 'Ficha', exact: true }).click();
      await page.locator('#web-player-sheet-open').click();
      await expect(editor).toBeVisible();
    };
    await reopen();
    await expect(field('BossBar.Ataque.1.Origem').locator('select')).toHaveValue('divine');
    await expect(field('BossBar.Ataque.1.Segunda.Origem').locator('select')).toHaveValue('mundane');
    await expect(field('BossBar.Ataque.1.MargemCritico').locator('input')).toHaveValue('18');
    await expect(field('BossBar.Ataque.1.Segunda.MultiplicadorCritico').locator('input')).toHaveValue('3');
    await expect(field('BossBar.Ataque.1.Ajuste').locator('input')).toHaveValue('+1d6 + 3 + 2d2');
    await field('BossBar.MoedaPersonalizada.Nome').locator('input').fill('Fragmentos');
    await field('BossBar.MoedaPersonalizada.Quantidade').locator('input').fill('42');
    await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
    await expect(editor).toBeHidden();
    await expect.poll(() => session.server.getPendingSheetChangeRequests().length).toBe(1);
    let request = session.server.getPendingSheetChangeRequests()[0];
    expect(request.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'BossBar.MoedaPersonalizada.Nome', before: 'Cristais', after: 'Fragmentos' }),
      expect.objectContaining({ field: 'BossBar.MoedaPersonalizada.Quantidade', before: '7', after: '42' }),
    ]));
    expect(await session.server.decideCharacterSheetChanges(request.id, false)).toEqual({ ok: true });
    await reopen();
    await expect(field('BossBar.MoedaPersonalizada.Nome').locator('input')).toHaveValue('Cristais');
    await expect(field('BossBar.MoedaPersonalizada.Quantidade').locator('input')).toHaveValue('7');
    await field('BossBar.MoedaPersonalizada.Nome').locator('input').fill('Fragmentos');
    await field('BossBar.MoedaPersonalizada.Quantidade').locator('input').fill('42');
    await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
    await expect.poll(() => session.server.getPendingSheetChangeRequests().length).toBe(1);
    request = session.server.getPendingSheetChangeRequests()[0];
    expect(await session.server.decideCharacterSheetChanges(request.id, true)).toEqual({ ok: true });
    await reopen();
    await expect(field('BossBar.MoedaPersonalizada.Nome').locator('input')).toHaveValue('Fragmentos');
    await expect(field('BossBar.MoedaPersonalizada.Quantidade').locator('input')).toHaveValue('42');
  } finally { await session.close(); }
});
test('quatro PDFs reais de Nimb completam importação, correção e reabertura sem perda de texto', async ({ page }) => {
  test.skip(!examplesDirectory, 'Defina BOSSBAR_NIMB_EXAMPLES_DIRECTORY para validar os PDFs locais.');
  test.setTimeout(120_000);
  const session = await startHostedTestSession();
  const approveChanges = async () => {
    for (const request of session.server.getPendingSheetChangeRequests()) expect(await session.server.decideCharacterSheetChanges(request.id, true)).toEqual({ ok: true });
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  };
  try {
    await joinHostedSession(page, session.inviteUrl, 'Nimb exemplos locais');
    for (const name of ['Furacão Imortal', 'Hudson', 'Thok', 'Pythagoras']) {
      await page.getByRole('button', { name: 'Ficha', exact: true }).click();
      if (!await page.locator('#web-player-sheet-upload').isVisible()) {
        await page.getByRole('button', { name: 'Remover ficha vinculada', exact: true }).click();
        await page.locator('#web-player-sheet-remove-confirm-button').click();
        await expect(page.locator('#web-player-sheet-upload')).toBeVisible();
      }
      await page.locator('#web-player-sheet-input').setInputFiles({ name: `Ficha de ${name}.pdf`, mimeType: 'application/pdf', buffer: await readFile(path.join(examplesDirectory!, `Ficha de ${name}.pdf`)) });
      const editor = page.getByRole('dialog', { name: 'Ajustar ficha' });
      await expect.poll(async () => await editor.isVisible() || session.server.getPlayerHuds()[0]?.characterName === name).toBeTruthy();
      if (!await editor.isVisible()) await page.locator('#web-player-sheet-open').click();
      await expect(editor).toBeVisible();
      const abilities = await editor.locator('[data-field-name^="BossBar.Habilidades."] textarea').evaluateAll((fields) => fields.map((field) => (field as HTMLTextAreaElement).value));
      if (name === 'Pythagoras') {
        await expect(editor.locator('[data-field-name="BossBar.Nimb.PaginasAdicionais"] textarea')).toHaveValue(/Frio: 5/);
        await expect(editor.locator('[data-field-name="BossBar.Nimb.PaginasAdicionais"] textarea')).toHaveAttribute('readonly', '');
      }
      const spellsField = editor.locator('[data-field-name="BossBar.Magia.1.Efeito"] textarea');
      const spells = await spellsField.count() ? await spellsField.inputValue() : null;
      const importedLoad = await editor.locator('[data-field-name="CargaTotal"] [data-load-part="total"]').inputValue();
      await expect(editor.locator('[data-field-name="PVs Atuais"] input')).toHaveValue(await editor.locator('[data-field-name="PVs Totais"] input').inputValue());
      await expect(editor.locator('[data-field-name="PMs Atuais"] input')).toHaveValue(await editor.locator('[data-field-name="PMs Totais"] input').inputValue());
      await editor.getByRole('button', { name: 'Validar e corrigir cálculos', exact: true }).click();
    await keepCustomizedSheetValues(page);
      await expect(editor.locator('.has-import-error')).toHaveCount(0);
      await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
      await expect(editor).toBeHidden();
      await approveChanges();
      await expect.poll(() => session.server.getPlayerHuds()[0]?.characterName).toBe(name);
      await page.getByRole('button', { name: 'Ficha', exact: true }).click();
      await page.locator('#web-player-sheet-open').click();
      await expect(editor).toBeVisible();
      await expect(editor.locator('[data-field-name^="BossBar.Habilidades."] textarea')).toHaveCount(4);
      expect(await editor.locator('[data-field-name^="BossBar.Habilidades."] textarea').evaluateAll((fields) => fields.map((field) => (field as HTMLTextAreaElement).value))).toEqual(abilities);
      if (spells !== null) await expect(spellsField).toHaveValue(spells);
      await expect(editor.locator('[data-field-name="CargaTotal"] [data-load-part="total"]')).toHaveValue(importedLoad);
      await editor.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
      await expect(editor).toBeHidden();
      await approveChanges();
    }
  } finally { await session.close(); }
});
