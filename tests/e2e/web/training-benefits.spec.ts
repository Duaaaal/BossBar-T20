import {test,expect} from '@playwright/test';
import {joinHostedSession,startHostedTestSession} from '../support/hosted-session';

test('Versátil seleciona poder, preserva rascunho e remove somente a concessão automática',async({page},info)=>{
 const session=await startHostedTestSession();
 try{
  await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Benefícios de raça');
  await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.getByRole('button',{name:'Criar ficha vazia',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});
  await editor.locator('[data-field-name="CLASSE"] input').fill('Guerreiro');await editor.locator('[data-field-name="RAÇA"] input').fill('Humano');await editor.locator('[data-field-name="NOME DO PERSONAGEM"] input').click();
  const dialog=page.getByRole('dialog',{name:'Fontes de treinamento',exact:true});
  const openRace=async()=>{await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();for(let i=0;i<10;i++){if(await dialog.locator('[data-source-id="race:humano"]').isVisible())return;await dialog.getByRole('button',{name:'Próxima →',exact:true}).click();}throw new Error('Fonte Humano ausente');};
  await openRace();const card=dialog.locator('[data-source-id="race:humano"]');await card.getByRole('combobox').selectOption('1');
  await dialog.getByRole('checkbox',{name:'Treinar Acrobacia',exact:true}).check();await card.getByRole('button',{name:'Escolher benefício 1',exact:true}).click();
  const powers=page.getByRole('dialog',{name:'Escolher poder ou habilidade',exact:true});await powers.getByRole('searchbox',{name:'Buscar poder'}).fill('Sortudo');
  await expect(powers.getByRole('listbox').locator('option')).toHaveCount(1);await expect(powers).toContainText('Sortudo');
  await page.screenshot({path:info.outputPath('poder-permitido.png')});await page.setViewportSize({width:600,height:780});expect(await powers.locator('.sheet-popup-body').evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('poder-600.png')});
  await powers.getByRole('button',{name:'Escolher este benefício',exact:true}).click();await expect(card.getByRole('button',{name:'Sortudo',exact:true})).toBeVisible();
  await page.setViewportSize({width:1200,height:900});await page.screenshot({path:info.outputPath('versatil-poder.png')});await dialog.getByRole('button',{name:'Aplicar fontes',exact:true}).click();
  const general=editor.locator('[data-field-name="BossBar.Habilidades.Gerais"] textarea');await expect(general).toHaveValue(/Sortudo/);
  await openRace();await card.getByRole('combobox').selectOption('2');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(general).toHaveValue(/Sortudo/);
  await openRace();await card.getByRole('combobox').selectOption('2');await dialog.getByRole('button',{name:'Aplicar fontes',exact:true}).click();await expect(general).not.toHaveValue(/Sortudo/);
  await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
 }finally{await session.close();}
});
