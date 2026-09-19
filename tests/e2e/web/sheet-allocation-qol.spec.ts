import { test, expect } from '@playwright/test';
import { joinHostedSession, startHostedTestSession } from '../support/hosted-session';
import { createNimbCharacterSheet } from '../../fixtures/character-sheet-nimb';
import { applyCharacterSheetEditorFields, readCharacterSheetEditorFields } from '../../../src/multiplayer/character-sheet-pdf';

test('trocas rápidas usam uma resposta por seleção e continuam funcionando acima do antigo limite', async ({ page }, info) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Troca fluida');
    await page.getByRole('button', { name:'Ficha', exact:true }).click();
    const original = await createNimbCharacterSheet({ Nome:'Sem latência', Raca:'Medusa', Historico:'' });
    const fixed = await applyCharacterSheetEditorFields(original, await readCharacterSheetEditorFields(original), true);
    await page.locator('#web-player-sheet-input').setInputFiles({ name:'troca.pdf', mimeType:'application/pdf', buffer:Buffer.from(fixed.bytes) });
    const tabs = page.locator('#web-player-character-slots [role=tab]'); await expect(tabs.nth(0)).toContainText('Sem latência');
    let profiles = 0; let selects = 0; let headers: Record<string,string> = {};
    page.on('request', (request) => { if (request.url().endsWith('/api/player/profile')) profiles++; if (request.url().endsWith('/characters/select')) { selects++; headers=request.headers(); } });
    const ids = await tabs.evaluateAll((nodes)=>nodes.map((node)=>(node as HTMLElement).dataset.characterId!));
    for (let i=1;i<=9;i++) { await tabs.nth(i%3).click(); await expect(tabs.nth(i%3)).toHaveAttribute('aria-selected','true'); }
    expect(selects).toBe(9); expect(profiles).toBe(0);
    const results = await page.evaluate(async ({ headers, ids }) => {
      const values: { status:number; elapsed:number }[]=[];
      for(let i=0;i<90;i++) { const start=performance.now(); const response=await fetch('/api/player/characters/select',{method:'POST',headers,body:JSON.stringify({characterId:ids[(i+1)%3]})}); await response.json(); values.push({status:response.status,elapsed:performance.now()-start}); }
      return values;
    },{headers,ids});
    expect(results.every(({status})=>status===200)).toBe(true);
    const times=results.map(({elapsed})=>elapsed).sort((a,b)=>a-b);
    await info.attach('tempo-das-trocas.json',{body:JSON.stringify({count:times.length, median:times[45],p95:times[85],maximum:times[89]}),contentType:'application/json'});
    // Detect the previous half-second PDF parsing regression, allowing CI load.
    expect(times[45]).toBeLessThan(400);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected','true');
    await page.route('**/api/player/characters/select', async (route) => { await new Promise((resolve)=>setTimeout(resolve,100)); await route.continue(); });
    const previousSelects = selects;
    await tabs.evaluateAll((nodes)=>{(nodes[1] as HTMLElement).click();(nodes[2] as HTMLElement).click();(nodes[0] as HTMLElement).click();});
    await expect.poll(() => selects).toBe(previousSelects + 2);
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected','true');
    await expect(page.locator('#web-player-sheet-status')).not.toContainText('too many requests');
  } finally { await session.close(); }
});

test('atributos importados, descarte, rolagem bloqueada e multiclasse mantêm os dados salvos', async ({ page }, info) => {
  const session=await startHostedTestSession();
  try {
    await joinHostedSession(page,session.inviteUrl,'Distribuição clara');
    await page.getByRole('button',{name:'Ficha',exact:true}).click();
    const original=await createNimbCharacterSheet({Nome:'Pythagoras teste',Raca:'Medusa',modFor:'1',modDes:'5',modCon:'1',modInt:'-1',modSab:'3',modCar:'3',Historico:''});
    const fixed=await applyCharacterSheetEditorFields(original,await readCharacterSheetEditorFields(original),true);
    await page.locator('#web-player-sheet-input').setInputFiles({name:'atributos.pdf',mimeType:'application/pdf',buffer:Buffer.from(fixed.bytes)});
    await expect(page.locator('#web-player-sheet-open')).toBeEnabled(); await page.locator('#web-player-sheet-open').click();
    const editor=page.getByRole('dialog',{name:'Ajustar ficha',exact:true});
    const attr=(name:string)=>editor.getByRole('textbox',{name,exact:true});
    await expect(attr('Destreza: Base')).toHaveValue('3'); await expect(attr('Carisma: Base')).toHaveValue('2');
    await expect(attr('Destreza: Total')).toHaveValue('5'); await expect(attr('Destreza: Total')).toHaveAttribute('readonly','');
    await expect(editor.getByRole('combobox',{name:'Método de distribuição'})).toHaveValue('unreviewed');
    await editor.locator('[data-field-name="PVs Totais"] input').fill('-5');
    await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click(); await expect(editor).toBeHidden();
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await page.getByRole('button',{name:'Ficha',exact:true}).click(); await page.locator('#web-player-sheet-open').click();
    await expect(editor.locator('[data-field-name="PVs Totais"] input')).not.toHaveValue('-5');
    await editor.getByRole('combobox',{name:'Método de distribuição'}).selectOption('rolled');
    const reset=page.getByRole('dialog',{name:'Reiniciar atributos?',exact:true}); await expect(reset).toContainText('já possui atributos válidos');
    await reset.getByRole('button',{name:'Cancelar',exact:true}).click(); await expect(attr('Destreza: Total')).toHaveValue('5');
    await editor.getByRole('combobox',{name:'Método de distribuição'}).selectOption('rolled'); await reset.getByRole('button',{name:'Zerar e redistribuir'}).click();
    for (const name of ['Força','Destreza','Constituição','Inteligência','Sabedoria','Carisma']) { await editor.getByRole('button',{name:'Rolar '+name,exact:true}).click(); await expect(editor.getByRole('button',{name:'Rolar '+name,exact:true})).toHaveText('⚄Rolar'); }
    await expect(editor.getByRole('button',{name:'Rolar Força',exact:true})).toBeDisabled();
    const bases=await editor.locator('.attribute-allocation-card label:first-of-type input').evaluateAll((inputs)=>inputs.map((input)=>Number((input as HTMLInputElement).value)));
    expect(bases.reduce((a,b)=>a+b,0)).toBeGreaterThanOrEqual(6);
    await editor.getByRole('button',{name:'Multiclasse',exact:true}).click();
    const multi=page.getByRole('dialog',{name:'Multiclasse',exact:true});
    await multi.getByRole('spinbutton',{name:'Nível da classe 1'}).fill('3');
    await multi.getByRole('button',{name:'+ Adicionar classe'}).click();
    await multi.getByRole('combobox',{name:'Classe 2',exact:true}).fill('paladino');
    await multi.getByRole('option',{name:/Paladino/}).click();
    await multi.getByRole('button',{name:'Usar estas classes'}).click();
    await expect(editor.locator('[data-field-name="CLASSE"] input')).toHaveValue('Dru. 3 / Pal. 1');
    await expect(editor.locator('[data-field-name="Lv"] input')).toHaveValue('4');
    await editor.getByRole('button',{name:'+ Adicionar ponto',exact:true}).click();
    const increase=page.getByRole('dialog',{name:'Registrar aumento de atributo',exact:true});
    await increase.getByRole('combobox',{name:'Fonte do aumento'}).selectOption('custom:mestre');
    await increase.getByRole('spinbutton',{name:'Pontos do aumento'}).fill('2');
    await increase.getByRole('textbox',{name:'Detalhes da fonte'}).fill('Recompensa de aventura');
    await increase.getByRole('button',{name:'Adicionar ao rascunho'}).click();
    await expect(editor.locator('.attribute-increase-record')).toContainText('Mestre');
    await editor.locator('.character-attributes-editor').scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('atributos.png')});
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await editor.getByRole('button',{name:'Fechar sem salvar',exact:true}).click(); await expect(editor).toBeHidden();
    await page.getByRole('button',{name:'Ficha',exact:true}).click(); await page.locator('#web-player-sheet-open').click();
    await expect(attr('Destreza: Total')).toHaveValue('5'); await expect(editor.locator('[data-field-name="CLASSE"] input')).toHaveValue('Druida 10');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
    await editor.getByRole('button',{name:'+ Adicionar ponto',exact:true}).click();
    await increase.getByRole('combobox',{name:'Fonte do aumento'}).selectOption('custom:mestre');
    await increase.getByRole('spinbutton',{name:'Pontos do aumento'}).fill('2');
    await increase.getByRole('textbox',{name:'Detalhes da fonte'}).fill('Aumento permanente aprovado em teste');
    await increase.getByRole('button',{name:'Adicionar ao rascunho'}).click();
    await expect(attr('Força: Total')).toHaveValue('3');
    await editor.getByRole('button',{name:'Validar e corrigir cálculos'}).click();
    await page.getByRole('dialog', { name: 'Revisar valores esperados' }).getByRole('button', { name: 'Manter valores atuais' }).click();
    await expect(editor.getByRole('button',{name:'Validar e corrigir cálculos'})).toBeEnabled();
    const localManaWarning=editor.locator('[data-field-name="PMs Totais"] .sheet-field-error');
    await expect(localManaWarning).not.toContainText('Revise Pontos de vida');
    await editor.getByRole('button',{name:'Salvar e fechar',exact:true}).click();
    await expect(editor).toBeHidden();
    await expect.poll(()=>session.server.getPendingSheetChangeRequests().length).toBe(1);
    const proposal=session.server.getPendingSheetChangeRequests()[0];
    expect(proposal.changes.find(({field})=>field==='ModFor')?.after).toBe('3');
    expect(await session.server.decideCharacterSheetChanges(proposal.id,true)).toEqual({ok:true});
    await page.getByRole('button',{name:'Ficha',exact:true}).click(); await page.locator('#web-player-sheet-open').click();
    await expect(attr('Força: Total')).toHaveValue('3');
    const document=await session.server.getCharacterSheetEditor(proposal.profileId);
    const forged=document.document!.fields;
    const allocation=forged.find(({name})=>name==='BossBar.Atributos.Distribuicao')!;
    const plan=JSON.parse(allocation.value); plan.method='rolled'; plan.base={For:'4',Des:'4',Con:'4',Int:'4',Sab:'4',Car:'4'}; allocation.value=JSON.stringify(plan);
    const rejected=await session.server.proposeCharacterSheetChanges(proposal.profileId,'test',forged);
    expect(rejected.ok).toBe(false); expect(rejected.error).toContain('resultados registrados pelo servidor');
    expect(session.server.getPendingSheetChangeRequests()).toHaveLength(0);
  } finally { await session.close(); }
});
