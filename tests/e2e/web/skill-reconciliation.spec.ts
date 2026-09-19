import {test,expect} from '@playwright/test';
import {joinHostedSession,startHostedTestSession} from '../support/hosted-session';
import {createNimbCharacterSheet} from '../../fixtures/character-sheet-nimb';

test('diferença importada vira uma fonte, sem duplicar o bônus e sem salvar ao cancelar',async({page},info)=>{
 const session=await startHostedTestSession();try{
 await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Conferência automática');await page.getByRole('button',{name:'Ficha',exact:true}).click();
 const buffer=await createNimbCharacterSheet({Raca:'Elfo',total20:'12',outros20:'5','Habilidades de classe e poderes':'- Sortudo: sorte pessoal.'});
 await page.locator('#web-player-sheet-input').setInputFiles({name:'elfo.pdf',mimeType:'application/pdf',buffer});const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});await expect(editor).toBeVisible();
 const other=editor.locator('[data-field-name="204"] input');await expect(other).toHaveValue('3');
 await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fontes de treinamento',exact:true});
 await expect(dialog.getByText('Conferir bônus já incluídos na ficha')).toHaveCount(0);await expect(dialog.locator('.training-metric').last()).toHaveText('1poderes adicionais');
 const row=dialog.locator('.training-discrepancy[data-skill="200"]');await expect(row).toContainText('12 na ficha · 9 pelas fontes · diferença +3');
 await row.getByRole('button',{name:'Registrar fonte',exact:true}).click();const source=page.getByRole('dialog',{name:'Fonte da diferença — Misticismo',exact:true});
 await source.getByRole('textbox',{name:'Nome da fonte da diferença'}).fill('Bênção do mestre');await source.getByRole('textbox',{name:'Justificativa da diferença'}).fill('Concessão da campanha');await source.getByRole('button',{name:'Registrar fonte',exact:true}).click();await expect(row).toHaveCount(0);
 await page.screenshot({path:info.outputPath('reconciliacao-fontes.png')});await dialog.getByRole('button',{name:'Aplicar fontes',exact:true}).click();await expect(other).toHaveValue('0');await expect(editor.locator('[data-field-name="200"] input')).toHaveValue('12');
 await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();await expect(row).toHaveCount(0);await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
 }finally{await session.close();}
});

test('tamanho segue a raça e permite escolha explícita de duende',async({page})=>{
 const session=await startHostedTestSession();try{
 await joinHostedSession(page,session.inviteUrl,'Tamanho racial');await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.getByRole('button',{name:'Criar ficha vazia',exact:true}).click();
 const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});const race=editor.locator('[data-field-name="RAÇA"] input');const size=editor.locator('[data-field-name="SeleTamanho"] select');
 await expect(size).toHaveValue('');await race.fill('Goblin');await editor.locator('[data-field-name="NOME DO PERSONAGEM"] input').click();await expect(size).toHaveValue('Pequeno');await expect(editor.locator('[data-field-name="ModFurtTam"] input')).toHaveValue('2');
 await race.fill('Duende');await editor.locator('[data-field-name="NOME DO PERSONAGEM"] input').click();await expect(size).toHaveValue('');await size.selectOption('Grande');await expect(editor.locator('[data-field-name="BossBar.ManobrasTamanho"] input')).toHaveValue('2');
 await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
 }finally{await session.close();}
});
