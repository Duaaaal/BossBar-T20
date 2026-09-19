import { test, expect } from '@playwright/test';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('treinamento calcula imediatamente, limita escolhas e simplifica os tooltips', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    await joinHostedSession(page, session.inviteUrl, 'Perícias e fontes');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.getByRole('button', { name: 'Criar ficha vazia', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha', exact: true });
    const input = (name: string) => editor.locator(`[data-field-name="${name}"] input`);
    await input('CLASSE').fill('Guerreiro'); await input('NOME DO PERSONAGEM').click();
    await expect(editor.locator('.sheet-attributes-heading .attribute-allocation-status')).toHaveCount(0);
    const attr = editor.getByRole('textbox', { name: 'Força: Base', exact: true }); await attr.hover();
    const tooltip = page.locator('.calculation-tooltip:visible');
    await expect(tooltip).toHaveText('Força = 0 (base) + 0 (fontes) + 0 (permanentes) + 0 (temporários) = 0');
    await page.mouse.move(5, 5);
    await editor.getByRole('button', { name: 'Fontes de treinamento', exact: true }).click();
    await page.getByRole('dialog', { name: 'Fontes de treinamento', exact: true }).getByRole('checkbox', { name: 'Treinar Luta', exact: true }).check();
    await page.getByRole('dialog', { name: 'Fontes de treinamento', exact: true }).getByRole('button', { name: 'Aplicar fontes', exact: true }).click(); await expect(input('193')).toHaveValue('2'); await expect(input('190')).toHaveValue('2');
    await expect(input('BossBar.Ataque.1.Base')).toHaveValue('+2');
    await input('Lv').fill('7'); await input('NOME DO PERSONAGEM').click();
    await expect(input('193')).toHaveValue('4'); await expect(input('190')).toHaveValue('7');
    for (const key of ['191', '193', '190', 'ModAtribLuta']) await expect(input(key)).toHaveAttribute('readonly', '');
    for (const key of ['191', '193', 'ModAtribLuta', 'ModFurtTam', 'BossBar.ManobrasTamanho']) {
      await input(key).hover(); await expect(tooltip).toHaveCount(0); await expect(input(key)).not.toHaveAttribute('title');
    }
    await input('BossBar.Ataque.1.Base').hover();
    await expect(tooltip).toHaveText('Teste = 0 (FOR) + 3 (metade do nível 7) + 4 (treino) + 0 (outros) = 7');
    await page.mouse.move(5, 5);
    await editor.getByRole('button', { name: 'Fontes de treinamento', exact: true }).click();
    const sources = page.getByRole('dialog', { name: 'Fontes de treinamento', exact: true });
    await sources.getByRole('checkbox', { name: 'Treinar Iniciativa', exact: true }).check();
    await sources.getByRole('checkbox', { name: 'Treinar Reflexos', exact: true }).check();
    await sources.locator('.training-additional > summary').click();
    await sources.getByRole('button', { name: '+ Fonte adicional', exact: true }).click();
    await sources.getByRole('combobox', { name: 'Perícia adicional' }).selectOption('200');
    await sources.getByRole('textbox', { name: 'Fonte do treinamento' }).fill('Mestre');
    await sources.getByRole('textbox', { name: 'Justificativa do treinamento' }).fill('Estudo arcano durante a campanha');
    await page.screenshot({ path: info.outputPath('fontes-treinamento.png') });
    await sources.getByRole('button', { name: 'Aplicar fontes' }).click();
    await expect(editor.locator('[data-training-field="Mar Trei luta"]')).toHaveClass(/is-trained-skill/); await expect(input('193')).toHaveValue('4');
    await expect(editor.locator('[data-training-field="Mar Trei misti"]')).toHaveClass(/is-trained-skill/); await expect(input('203')).toHaveValue('4');
    await expect(editor.locator('.skill-training-summary')).toHaveText('5 / 5 treinadas');
    await page.screenshot({ path: info.outputPath('pericias-fontes.png') });
    await input('PVs Totais').hover(); await expect(tooltip).toHaveText('PV = 20 (Guerreiro: inicial) + 0 (CON) + 6 × [5 (Guerreiro: por nível) + 0 (CON)] = 50');
    await page.mouse.move(5, 5);
    await input('PMs Totais').hover(); await expect(tooltip).toContainText('PM = 7 (níveis de Guerreiro) × 3 (PM por nível) = 21');
    await page.mouse.move(5, 5);
    const magic = editor.getByRole('group', { name: 'Atributo-chave', exact: true });
    await expect(magic.locator('select')).toHaveCount(1); await expect(magic.locator('input')).toHaveAttribute('readonly', '');
    await magic.locator('select').selectOption('FOR'); await expect(magic.locator('input')).toHaveValue('0');
    await magic.locator('input').hover(); await expect(tooltip).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('atributo-chave-magias.png') });
    const bounds = await magic.locator('input, select').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top)); expect(Math.abs(bounds[0] - bounds[1])).toBeLessThan(3);
    await editor.locator('[data-load-part="gross"]').hover(); await expect(tooltip).toContainText('Carga real = 0 (bruta) − 0 (equipada) = 0 espaços'); await expect(tooltip).not.toContainText('selecionados');
    await page.mouse.move(5, 5); await input('CargaMax').hover(); await expect(tooltip).toContainText('10 (base) + 0 (FOR) = 10 espaços');
    await page.mouse.move(5, 5); await input('Levantar').hover(); await expect(tooltip).toContainText('(carga máxima) × 2 = 20 espaços');
    await page.mouse.move(5, 5); await editor.getByRole('button', { name: 'Fechar sem salvar' }).click();
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  } finally { await session.close(); }
});

test('fontes acompanham raça e origem, preservam cancelamento e aplicam escolhas com recálculo', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await page.setViewportSize({ width: 1200, height: 900 });
    await joinHostedSession(page, session.inviteUrl, 'Treinamento organizado');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.getByRole('button', { name: 'Criar ficha vazia', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Ajustar ficha', exact: true });
    const input = (name: string) => editor.locator(`[data-field-name="${name}"] input`);
    for (const [name, value] of [['CLASSE', 'Guerreiro'], ['RAÇA', 'Humano'], ['ORIGEM', 'Acólito']]) {
      await input(name).fill(value); await input('NOME DO PERSONAGEM').click();
    }
    const open = () => editor.getByRole('button', { name: 'Fontes de treinamento', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Fontes de treinamento', exact: true });
    const race = () => dialog.getByRole('combobox', { name: 'Perícias de Humano — Versátil', exact: true });
    const origin = () => dialog.getByRole('combobox', { name: 'Perícias de Origem: Acólito', exact: true });
    const train = (name: string) => dialog.getByRole('checkbox', { name: `Treinar ${name}`, exact: true });
    const go = async (id:string) => {
      while (await dialog.getByRole('button',{name:'← Anterior',exact:true}).isEnabled()) await dialog.getByRole('button',{name:'← Anterior',exact:true}).click();
      for(let i=0;i<10;i++){if(await dialog.locator(`[data-source-id="${id}"]`).isVisible())return;await dialog.getByRole('button',{name:'Próxima →',exact:true}).click();}
      throw new Error('Fonte ausente: '+id);
    };
    const choose = async () => {
      await go('class:mandatory:0');await train('Luta').check();
      await go('origin:acolito');await origin().selectOption('2');await train('Cura').check();await train('Vontade').check();
      await go('class:choices');await train('Iniciativa').check();await train('Reflexos').check();
      await go('race:humano');await race().selectOption('2');await train('Misticismo').check();await train('Furtividade').check();
    };
    await open();await choose();await expect(dialog.locator('.training-metric.warning')).toHaveCount(0);
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    await expect(editor.locator('[data-training-field="Mar Trei luta"]')).not.toHaveClass(/is-trained-skill/);
    await open();await go('race:humano');await expect(race()).toHaveValue('');await choose();
    await dialog.locator('.training-additional > summary').click();
    await dialog.getByRole('button',{name:'+ Fonte adicional',exact:true}).click();
    await dialog.getByRole('combobox',{name:'Perícia adicional'}).selectOption('280');
    await dialog.getByRole('textbox',{name:'Fonte do treinamento'}).fill('Mestre');
    await dialog.getByRole('button',{name:'Aplicar fontes'}).click();
    await expect(dialog.locator('.skill-training-feedback')).toContainText('Preencha a fonte e a justificativa');
    await dialog.getByRole('textbox',{name:'Justificativa do treinamento'}).fill('Estudo religioso');
    await expect(dialog.locator('.training-metric').nth(2)).toHaveText('1fontes adicionais');
    await expect(dialog.locator('.training-native-skills')).not.toContainText('Religião');
    await dialog.getByRole('button',{name:'Remover fonte de treinamento'}).click();
    await expect(dialog.locator('.training-context')).toContainText('Religião');
    await dialog.getByRole('searchbox',{name:'Buscar perícia'}).fill('mist');await expect(dialog.locator('.training-skill:visible')).toHaveCount(1);
    await dialog.getByRole('searchbox',{name:'Buscar perícia'}).fill('');await dialog.getByRole('button',{name:'Selecionadas',exact:true}).click();
    await expect(dialog.locator('.training-skill:visible')).toHaveCount(7);
    await page.screenshot({path:info.outputPath('treinamento-organizado.png')});
    await dialog.getByRole('button',{name:'Aplicar fontes'}).click();await expect(input('193')).toHaveValue('2');
    await expect(input('BossBar.Ataque.1.Base')).toHaveValue('+2');
    await open();await go('race:humano');await expect(race()).toHaveValue('2');await go('origin:acolito');await expect(origin()).toHaveValue('2');
    await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(editor).toBeVisible();
    await input('RAÇA').fill('Medusa');await input('NOME DO PERSONAGEM').click();
    await open();await expect(race()).toHaveCount(0);await expect(dialog.locator('.training-metric.warning')).toHaveCount(0);
    await dialog.getByRole('button',{name:'Aplicar fontes'}).click();await expect(input('203')).toHaveValue('0');
    await editor.getByRole('button', { name: 'Fechar sem salvar', exact: true }).click();
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  } finally { await session.close(); }
});
