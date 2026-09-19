import {test,expect} from '@playwright/test';
import {joinHostedSession,startHostedTestSession} from '../support/hosted-session';

test('fontes em etapas, resumo fixo, seleção exclusiva e grade compacta',async({page},info)=>{
 const session=await startHostedTestSession();
 try{
  await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Escolhas por fonte');
  await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.getByRole('button',{name:'Criar ficha vazia',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});
  await editor.locator('[data-field-name="CLASSE"] input').fill('Guerreiro');await editor.locator('[data-field-name="RAÇA"] input').fill('Humano');await editor.locator('[data-field-name="NOME DO PERSONAGEM"] input').click();
  await expect(editor.locator('.is-skills input[type="checkbox"]')).toHaveCount(0);
  await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fontes de treinamento',exact:true});
  await expect(dialog.locator('.training-native-skills')).toContainText('Fortitude');
  await expect(dialog.getByRole('checkbox',{name:'Fortitude (nata)',exact:true})).toBeChecked();
  await expect(dialog.getByRole('checkbox',{name:'Fortitude (nata)',exact:true})).toBeDisabled();
  await dialog.locator('.training-native-skills label').first().hover();await expect(page.getByRole('tooltip')).toContainText('concedida automaticamente');await expect(page.getByRole('tooltip').locator('a')).toHaveAttribute('target','_blank');await dialog.locator('h2').hover();
  const initial=await dialog.boundingBox();
  await dialog.locator('.training-additional > summary').click();
  await dialog.locator('.training-effects > summary').click();
  expect(await dialog.boundingBox()).toEqual(initial);
  const styles=await dialog.locator('.training-additional > summary,.training-effects > summary').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).font));expect(styles[0]).toBe(styles[1]);
  const metricTops=await dialog.locator('.training-metric').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));expect(new Set(metricTops).size).toBe(1);
  await dialog.locator('.training-effects > summary').click();await dialog.locator('.training-additional > summary').click();
  await expect(dialog.locator('.training-source-card:visible')).toHaveCount(1);
  await expect(dialog.locator('.training-skill:visible')).toHaveCount(2);
  await dialog.getByRole('checkbox',{name:'Treinar Luta',exact:true}).check();
  await expect(dialog.getByRole('checkbox',{name:'Treinar Pontaria',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'Próxima →',exact:true}).click();
  await expect(dialog.locator('.training-source-card:visible')).toContainText('Escolhas da classe');
  await expect(dialog.getByRole('checkbox',{name:'Treinar Misticismo',exact:true})).not.toBeVisible();
  await dialog.getByRole('checkbox',{name:'Treinar Iniciativa',exact:true}).check();await dialog.getByRole('checkbox',{name:'Treinar Reflexos',exact:true}).check();
  await page.screenshot({path:info.outputPath('fonte-limitada.png')});
  await dialog.getByRole('button',{name:'← Anterior',exact:true}).click();await expect(dialog.getByRole('checkbox',{name:'Treinar Luta',exact:true})).toBeChecked();
  await dialog.getByRole('button',{name:'Aplicar fontes',exact:true}).click();
  await expect(editor.locator('[data-training-field="Mar Trei luta"]')).toHaveClass(/is-trained-skill/);
  await expect(editor.locator('[data-field-name="193"] input')).toHaveValue('2');
  const skills=editor.locator('.is-skills');await skills.scrollIntoViewIfNeeded();
  const headingFont=await skills.locator('h2').evaluate(n=>getComputedStyle(n).font);const standardFont=await editor.locator('.web-player-sheet-editor-section > h2').first().evaluate(n=>getComputedStyle(n).font);expect(headingFont).toBe(standardFont);
  const cards=skills.locator('.web-player-sheet-editor-group');
  const tops=await cards.evaluateAll(nodes=>nodes.slice(0,4).map(n=>n.getBoundingClientRect().top));expect(tops[0]).toBe(tops[1]);expect(tops[1]).toBe(tops[2]);expect(tops[3]).toBeGreaterThan(tops[0]);
  expect(await skills.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('pericias-tres-colunas.png')});
  await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();await page.setViewportSize({width:600,height:780});
  expect(await dialog.locator('.sheet-popup-body').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('fontes-600.png')});
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
 }finally{await session.close();}
});
