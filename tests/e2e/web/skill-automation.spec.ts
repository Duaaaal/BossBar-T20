import { test,expect } from '@playwright/test';
import { joinHostedSession,startHostedTestSession } from '../support/hosted-session';
import { createNimbCharacterSheet } from '../../fixtures/character-sheet-nimb';

test('importação nova confere cálculos sem substituir PV e PM personalizados',async({page})=>{
  const session=await startHostedTestSession();
  try{
    await joinHostedSession(page,session.inviteUrl,'Importação conferida');await page.getByRole('button',{name:'Ficha',exact:true}).click();
    const buffer=await createNimbCharacterSheet({Nome:'Guardião',Raca:'Anão',Classe:'Guerreiro 1',nivel:'1',Origem:'',modFor:'4',modDes:'2',modCon:'3',modInt:'0',modSab:'1',modCar:'-1',vidaMax:'777',manaMax:'333',Texto13:'99',Historico:''});
    await page.locator('#web-player-sheet-input').setInputFiles({name:'guardiao.pdf',mimeType:'application/pdf',buffer});
    const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});const input=(name:string)=>editor.locator(`[data-field-name="${name}"] input`);
    await expect(editor).toBeVisible();await expect(page.locator('#web-player-sheet-editor-status')).toContainText(/automaticamente|substituições propostas/);
    await expect(input('PVs Totais')).toHaveValue('777');await expect(input('PMs Totais')).toHaveValue('333');
    await expect(input('CA')).not.toHaveValue('99');expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  }finally{await session.close();}
});

test('nova ficha calcula automaticamente e preserva o rascunho sem enviar aprovação',async({page},info)=>{
  const session=await startHostedTestSession();
  try{
    await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Automação de ficha');
    await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.getByRole('button',{name:'Criar ficha vazia',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});const input=(name:string)=>editor.locator(`[data-field-name="${name}"] input`);
    await input('CLASSE').fill('Guerreiro');await input('RAÇA').fill('Anão');await input('NOME DO PERSONAGEM').fill('Guardião');await input('JOGADOR').click();
    const attrs=editor.locator('.is-attributes');await attrs.getByRole('button',{name:'Força: Max.',exact:true}).click();
    await attrs.getByRole('button',{name:'Destreza: +',exact:true}).click();await attrs.getByRole('button',{name:'Destreza: +',exact:true}).click();await attrs.getByRole('button',{name:'Constituição: +',exact:true}).click();
    // Guerreiro 20 + Constituição 3 + Duro como Pedra 3.
    await expect(input('PVs Totais')).toHaveValue('26');await expect(input('PMs Totais')).toHaveValue('3');
    await expect(page.locator('#web-player-sheet-editor-status')).toContainText('automaticamente');
    await expect(editor.locator('[data-training-field="Mar Trei forti"]')).toHaveClass(/is-trained-skill/);expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await input('Lv').fill('2');
    await expect(input('CLASSE')).toHaveValue('Guerreiro 2');
    await expect(input('PVs Totais')).toHaveValue('35');
    await expect(input('PMs Totais')).toHaveValue('6');
    await page.screenshot({path:info.outputPath('ficha-calculada.png')});
    await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  }finally{await session.close();}
});

test('quatro dados ficam no título; treinamentos fixos, Ofícios e regras opcionais cabem no editor',async({page},info)=>{
  const session=await startHostedTestSession();
  try{
    await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Fontes completas');
    await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.getByRole('button',{name:'Criar ficha vazia',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});const input=(name:string)=>editor.locator(`[data-field-name="${name}"] input`);
    await input('CLASSE').fill('Guerreiro');await input('RAÇA').fill('Hobgoblin');await input('ORIGEM').fill('Boticário');await input('NOME DO PERSONAGEM').click();
    const method=editor.getByRole('combobox',{name:'Método de distribuição',exact:true});await method.selectOption('rolled');
    await page.getByRole('dialog',{name:'Reiniciar atributos?',exact:true}).getByRole('button',{name:'Zerar e redistribuir'}).click();
    await editor.getByRole('button',{name:'Rolar Constituição',exact:true}).click();
    const dice=editor.locator('.attribute-roll-result');await expect(dice).toHaveCount(1);await expect(dice.locator('[data-die]')).toHaveCount(4);await expect(dice.locator('s')).toHaveCount(1);
    const values=await dice.locator('[data-die]').allTextContents();expect(await dice.textContent()).toContain('= '+(values.reduce((sum,v)=>sum+Number(v),0)-Math.min(...values.map(Number))));
    for(const width of [1200,960]){await page.setViewportSize({width,height:900});expect(await dice.evaluate(node=>node.getBoundingClientRect().height<20)).toBe(true);}
    await page.screenshot({path:info.outputPath('quatro-dados.png')});
    await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fontes de treinamento',exact:true});
    for(const name of ['Guerra','Fortitude','Cura'])await expect(dialog.locator('.training-native-skills')).toContainText(name);
    const craft=dialog.getByRole('button',{name:'+ Especialização de Ofício',exact:true});
    for(const name of ['armeiro','cozinheiro']){await craft.click();const add=page.getByRole('dialog',{name:'Adicionar especialização de Ofício',exact:true});await add.getByRole('textbox',{name:'Especialização de Ofício'}).fill(name);await add.getByRole('button',{name:'Adicionar Ofício',exact:true}).click();}
    const effects=dialog.locator('.training-effects');if(await effects.getAttribute('open')===null)await effects.locator(':scope > summary').click();
    await dialog.getByRole('button',{name:'+ Efeito recebido ou regra opcional',exact:true}).click();const add=page.getByRole('dialog',{name:'Registrar fonte de perícia',exact:true});await add.getByRole('searchbox').fill('Domínio: Biblioteca');await add.getByRole('listbox').selectOption({label:'Domínio: Biblioteca'});await add.getByRole('button',{name:'Registrar fonte',exact:true}).click();
    await page.screenshot({path:info.outputPath('fontes-pericias.png')});await page.setViewportSize({width:600,height:780});expect(await dialog.locator('.sheet-popup-body').evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
    await page.screenshot({path:info.outputPath('fontes-estreito.png')});await page.setViewportSize({width:1200,height:900});await dialog.getByRole('button',{name:'Aplicar fontes',exact:true}).click();
    await expect(editor.locator('[data-field-name="BossBar.Oficio.3.Nome"] select')).toHaveValue('cozinheiro');
    await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  }finally{await session.close();}
});

test('escolhas de terreno respeitam a classe e a ativação fica fora do editor',async({page},info)=>{
  const session=await startHostedTestSession();
  try{
    await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Explorador');
    await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.getByRole('button',{name:'Criar ficha vazia',exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});const input=(name:string)=>editor.locator(`[data-field-name="${name}"] input`);
    await input('CLASSE').fill('Caçador');await input('RAÇA').fill('Elfo');await input('Lv').fill('7');await input('NOME DO PERSONAGEM').click();
    await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Fontes de treinamento',exact:true});
    await dialog.getByRole('combobox',{name:'Explorador: Floresta',exact:true}).selectOption('2');
    const card=dialog.locator('.training-effect-card').filter({has:page.getByText('Explorador',{exact:true})});
    await expect(card.getByRole('checkbox',{name:'Ativar',exact:true})).toHaveCount(0);await expect(card).toContainText('Ativação no HUD');
    await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('terrenos-explorador.png')});
    await dialog.getByRole('button',{name:'Aplicar fontes',exact:true}).click();await expect(input('250')).toHaveValue('5');
    await input('Lv').fill('3');await input('NOME DO PERSONAGEM').click();await expect(input('250')).toHaveValue('3');
    await editor.getByRole('button',{name:'Fontes de treinamento',exact:true}).click();await expect(dialog).toContainText('2 / 1 escolhas');
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click();expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  }finally{await session.close();}
});
