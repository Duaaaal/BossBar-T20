import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { SheetAutoValidation, sheetReadyForAutomaticValidation } from '../src/shared/sheet-auto-validation.ts';
import { emptyAttributePlan, ATTRIBUTE_PLAN_FIELD, ATTRIBUTES, inferAttributePlan, applyAttributePlan } from '../src/shared/character-attributes.ts';

test('validação automática agrupa edições e ignora resposta obsoleta ou ficha fechada', async()=>{
  const requests=[],applied=[];let finish;
  const queue=new SheetAutoValidation({delay:5,interval:5,error:e=>{throw e;},validate:async(value)=>{requests.push(value);if(value===2)await new Promise(resolve=>{finish=resolve;});return()=>applied.push(value);}});
  queue.schedule(1,'1');queue.schedule(2,'2');await wait(20);assert.deepEqual(requests,[2]);
  queue.schedule(3,'3');finish();await wait(20);assert.deepEqual(applied,[3]);assert.deepEqual(requests,[2,3]);
  queue.schedule(3,'3');await wait(15);assert.equal(requests.length,2);
  queue.schedule(4,'4');queue.cancel();await wait(15);assert.equal(requests.length,2);
});

test('validação automática só inicia com identidade e distribuição completas',()=>{
  const plan=emptyAttributePlan('points');
  for(const [code]of ATTRIBUTES)plan.base[code]='0';
  const v={Lv:'1',CLASSE:'Guerreiro 1','RAÇA':'Humano',...Object.fromEntries(ATTRIBUTES.map(([code])=>['Mod'+code,'0'])),[ATTRIBUTE_PLAN_FIELD]:JSON.stringify(plan)};
  assert.equal(sheetReadyForAutomaticValidation(v),false);
  assert.equal(sheetReadyForAutomaticValidation({...v,CLASSE:''}),false);
  assert.equal(sheetReadyForAutomaticValidation({...v,ModFor:''}),false);
  const ready={...v,'RAÇA':'Anão'};plan.base.For='4';plan.base.Des='2';plan.base.Con='1';
  ready[ATTRIBUTE_PLAN_FIELD]=JSON.stringify(inferAttributePlan(ready,plan));applyAttributePlan(ready);
  assert.equal(sheetReadyForAutomaticValidation(ready),true);
  const imported={...ready};imported[ATTRIBUTE_PLAN_FIELD]=JSON.stringify(inferAttributePlan(imported,emptyAttributePlan('unreviewed')));applyAttributePlan(imported);
  assert.equal(sheetReadyForAutomaticValidation(imported),true);
});

test('correção manual e fechamento aguardam a prévia em andamento sem aplicar sua resposta',async()=>{
  let complete;const actions=[];let started;
  const beginning=new Promise(resolve=>{started=resolve;});
  const queue=new SheetAutoValidation({delay:0,interval:0,error:error=>{throw error;},validate:async()=>{started();await new Promise(resolve=>{complete=resolve;});return()=>actions.push('prévia antiga');}});
  queue.schedule({},'rascunho');await beginning;
  const manual=queue.cancelAndWait().then(()=>actions.push('correção manual'));await wait(5);assert.deepEqual(actions,[]);
  complete();await manual;assert.deepEqual(actions,['correção manual']);
});
