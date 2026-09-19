import {test,expect} from '@playwright/test';
import {joinHostedSession,startHostedTestSession,createPublicBattle} from '../support/hosted-session';
import {createNimbCharacterSheet} from '../../fixtures/character-sheet-nimb';
import {applyCharacterSheetEditorFields,readCharacterSheetEditorFields} from '../../../src/multiplayer/character-sheet-pdf';
import {SKILL_EFFECTS_FIELD,emptySkillEffectsPlan} from '../../../src/shared/skill-mechanics';

test('efeito aprovado é ativado pelo HUD, altera o teste e expira por duração',async({page},info)=>{
 const session=await startHostedTestSession({randomInteger:(min,max)=>Math.min(max-1,Math.max(min,10))});
 try{
  await page.setViewportSize({width:1200,height:900});await joinHostedSession(page,session.inviteUrl,'Efeitos de combate');
  const source=await createNimbCharacterSheet();const plan=emptySkillEffectsPlan();plan.reviewed=true;plan.extra=[{id:'bencao',name:'Bênção do mestre',skill:'190',amount:5,dice:'',condition:'Enquanto abençoado',note:'Autorizado pelo mestre',active:false}];
  const prepared=await applyCharacterSheetEditorFields(source,(await readCharacterSheetEditorFields(source)).map(field=>({...field,value:field.name===SKILL_EFFECTS_FIELD?JSON.stringify(plan):field.value})),true);
  await page.getByRole('button',{name:'Ficha',exact:true}).click();await page.locator('#web-player-sheet-input').setInputFiles({name:'efeitos.pdf',mimeType:'application/pdf',buffer:Buffer.from(prepared.bytes)});
  await expect(page.locator('#web-player-character-slots [role=tab][aria-selected=true]')).toContainText('Exemplo Nimb');await page.locator('#web-player-sheet-close').click();
  session.server.publishBattleState(createPublicBattle({battleStarted:true}));const saved=session.server.captureEncounter();saved.turns.started=true;saved.turns.round=1;saved.turns.activeParticipantId='player:'+saved.players[0].playerId;for(const actor of saved.turns.participants){actor.initiativeRolled=true;actor.eligibleRound=1;}session.server.restoreEncounter(saved);
  const hud=page.getByRole('button',{name:'Efeitos e bônus',exact:true});await hud.click();const dialog=page.getByRole('dialog',{name:'Efeitos e bônus',exact:true});await dialog.getByRole('searchbox').fill('Bênção do mestre');
  await dialog.getByRole('textbox',{name:'Situação de Bênção do mestre',exact:true}).fill('Bênção recebida nesta rodada');await dialog.getByRole('combobox',{name:'Duração de Bênção do mestre',exact:true}).selectOption('rounds');await dialog.getByRole('button',{name:'Ativar efeito',exact:true}).click();
  await expect.poll(()=>session.server.getPlayerHuds()[0].skillEffects?.length).toBe(1);await expect(dialog).toContainText('1 rodada(s) restantes');await page.screenshot({path:info.outputPath('efeitos-hud.png')});
  await page.setViewportSize({width:600,height:780});expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('efeitos-hud-600.png')});await page.setViewportSize({width:1200,height:900});
  await dialog.getByRole('button',{name:'Fechar efeitos e bônus'}).click();await expect(hud.locator('sup')).toHaveText('1');
  const baseline=session.server.getPlayerHuds()[0].summary!.skills.find(s=>s.id==='190')!.total;if(baseline===null)throw new Error('Perícia aprovada sem total');
  const result=await page.evaluate(()=>window.bossAPI.requestPlayerCombatAction({kind:'skill',skillId:'190',resource:null,actionId:'hud-effect-e2e-roll'}));expect(result.ok).toBe(true);
  await expect.poll(()=>session.server.getTurnState().rollResults.find(r=>r.actionId==='hud-effect-e2e-roll')?.total).toBe(10+baseline+5);
  const owner='player:'+session.server.getPlayerHuds()[0].id;for(let i=0;i<10;i++){session.server.advanceTurnAsHost();if(session.server.getTurnState().activeParticipantId===owner)break;}
  await expect.poll(()=>session.server.getPlayerHuds()[0].skillEffects?.length).toBe(0);await expect(hud.locator('sup')).toHaveCount(0);
  await hud.click();await expect(dialog.getByRole('button',{name:'Ativar efeito',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Fechar efeitos e bônus'}).click();
 }finally{await session.close();}
});
