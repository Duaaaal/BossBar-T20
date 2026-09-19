import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { initializeSkillEffects, calculateCharacterSkills, recalculateCharacterSkills, skillImportIssues, reconcileImportedSkillSources } from '../src/shared/character-skills.ts';
import { SKILL_EFFECTS_FIELD, parseSkillEffects } from '../src/shared/skill-mechanics.ts';
import { characterSize, raceSize, synchronizeCharacterSize } from '../src/shared/character-size.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { readCharacterSheetEditorFields, applyCharacterSheetEditorFields, exportEditableCharacterSheetPdf, createBlankCharacterSheetPdf, inspectCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';
const base=()=>({Lv:'3',CLASSE:'Guerreiro 3','RAÇA':'Elfo',ModInt:'2',ModFor:'3',ModDes:'2',ModCon:'1',ModSab:'0',ModCar:'-1','200':'7','204':'2','Mar Trei misti':'Yes'});
const valuesOf=async(bytes)=>Object.fromEntries((await readCharacterSheetEditorFields(bytes)).map(f=>[f.name,f.value]));

test('nível ausente não vira bônus residual ao completar uma importação',()=>{
 const v={...base(),Lv:''};initializeSkillEffects(v);
 assert.equal(parseSkillEffects(v[SKILL_EFFECTS_FIELD]).reconciliation,undefined);
 assert.equal(v['204'],'2');assert.equal(v['200'],'7');
 v.Lv='3';recalculateCharacterSkills(v);
 assert.equal(v['204'],'0');assert.equal(v['200'],'7');
 assert.deepEqual(skillImportIssues(v),[]);
});

test('total importado separa atributo, metade do nível, treino e fonte racial sem confirmação manual',()=>{
 const v=base();initializeSkillEffects(v);assert.equal(v['204'],'0');assert.equal(calculateCharacterSkills(v).get('200').total,7);assert.deepEqual(skillImportIssues(v),[]);
 assert.equal(parseSkillEffects(v[SKILL_EFFECTS_FIELD]).reconciliation.totals['200'].total,7);
 initializeSkillEffects(v);assert.equal(v['204'],'0');v.ModInt='3';recalculateCharacterSkills(v);assert.equal(v['200'],'8');assert.deepEqual(skillImportIssues(v),[]);
});
test('diferenças positivas e negativas são preservadas e apontam para a perícia afetada',()=>{
 for(const [total,difference]of[[10,3],[5,-2]]){const v={...base(),'200':String(total)};initializeSkillEffects(v);assert.equal(v['204'],String(difference));assert.equal(calculateCharacterSkills(v).get('200').total,total);
 const issue=skillImportIssues(v).find(i=>i.field==='204');assert.ok(issue);assert.equal(issue.dismissible,false);assert.match(issue.message,/fontes identificadas 7/);
 const plan=parseSkillEffects(v[SKILL_EFFECTS_FIELD]);plan.extra.push({id:'origem',name:'Concessão do mestre',skill:'200',amount:difference,dice:'',condition:'',active:false,note:'Campanha'});v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);v['204']='0';
 assert.equal(calculateCharacterSkills(v).get('200').total,total);assert.deepEqual(skillImportIssues(v),[]);
 }
});
test('totais ausentes e valores inválidos não autorizam deduções silenciosas',()=>{
 const v=base();delete v['200'];v['204']='4';initializeSkillEffects(v);assert.equal(v['204'],'4');assert.ok(skillImportIssues(v).length);const bad={...base(),'200':'inválido','204':'inválido'};initializeSkillEffects(bad);assert.equal(bad['204'],'inválido');
});
test('Deformidade reconhece escolhas inequívocas; candidatos excedentes continuam para revisão',()=>{
 const v={...base(),'RAÇA':'Lefou','020':'2','024':'2','160':'5','164':'2'};delete v['200'];initializeSkillEffects(v);
 assert.deepEqual(parseSkillEffects(v[SKILL_EFFECTS_FIELD]).choices['core:race:lefou:deformidade:0'],['020','160']);assert.equal(v['024'],'0');assert.equal(v['164'],'0');
 const ambiguous={...base(),'RAÇA':'Lefou','020':'2','024':'2','160':'5','164':'2','050':'5','054':'2'};delete ambiguous['200'];initializeSkillEffects(ambiguous);assert.equal(parseSkillEffects(ambiguous[SKILL_EFFECTS_FIELD]).choices['core:race:lefou:deformidade:0'],undefined);assert.equal(ambiguous['024'],'2');
 const vacant={...base(),'Ofício 1':'Qualquer','230':'-1','234':'0'};initializeSkillEffects(vacant);assert.equal(vacant['234'],'0');assert.ok(!skillImportIssues(vacant).some(i=>i.id==='skill-import:230'));
});
test('identificar uma fonte pendente reconcilia a diferença, mas aumentos de nível não são absorvidos',()=>{
 const v={...base(),'200':'10'};initializeSkillEffects(v);const before={...v};const plan=parseSkillEffects(v[SKILL_EFFECTS_FIELD]);plan.extra.push({id:'origem',name:'Fonte identificada',skill:'200',amount:3,dice:'',condition:'',active:false,note:'Mestre'});v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);reconcileImportedSkillSources(v,before);assert.equal(v['204'],'0');assert.equal(calculateCharacterSkills(v).get('200').total,10);
 const leveled={...base(),'200':'10'};initializeSkillEffects(leveled);const initial={...leveled};leveled.Lv='5';reconcileImportedSkillSources(leveled,initial);assert.equal(leveled['204'],'3');assert.equal(calculateCharacterSkills(leveled).get('200').total,11);
});
test('códigos Nimb e padrões raciais respeitam tamanhos fixos, escolhas e importações válidas',()=>{
 assert.equal(characterSize('3').name,'Médio');assert.equal(characterSize('1').name,'Minúsculo');assert.equal(characterSize('6').name,'Colossal');
 for(const [race,size]of[['Goblin','Pequeno'],['Sílfide','Minúsculo'],['Galokk','Grande'],['Bugbear','Médio'],['Kobolds','Médio']])assert.equal(raceSize(race).name,size);
 const v={'RAÇA':'Goblin',SeleTamanho:'3'};synchronizeCharacterSize(v,true);assert.equal(v.SeleTamanho,'Pequeno');assert.equal(v.ModFurtTam,'2');assert.equal(v['BossBar.ManobrasTamanho'],'-2');
 for(const race of ['Duende','Golem']){v['RAÇA']=race;synchronizeCharacterSize(v,true);assert.equal(v.SeleTamanho,'');v.SeleTamanho='Grande';synchronizeCharacterSize(v);assert.equal(v.SeleTamanho,'Grande');}
});
test('edição e PDF exportado preservam o bônus racial e o total em reimportações repetidas',async()=>{
 const source=await createNimbCharacterSheet({Raca:'Elfo',total20:'9',outros20:'2'});const fields=await readCharacterSheetEditorFields(source);const get=n=>fields.find(f=>f.name===n)?.value;
 assert.equal(get('200'),'9');assert.equal(get('204'),'0');
 const edited=await applyCharacterSheetEditorFields(source,fields,true);const template=await readFile(new URL('../assets/ficha-t20-nimb.pdf',import.meta.url));
 const exported=await exportEditableCharacterSheetPdf(edited.bytes,template);const doc=await PDFDocument.load(exported);assert.equal(doc.getForm().getTextField('outros20').getText(),'2');
 const reopened=await valuesOf(exported);assert.equal(reopened['200'],'9');assert.equal(reopened['204'],'0');assert.equal(calculateCharacterSkills(reopened).get('200').total,9);
 const again=await exportEditableCharacterSheetPdf(exported,template);assert.equal((await valuesOf(again))['204'],'0');
});
test('ficha nova pede tamanho variável e o servidor mantém a escolha ao salvar',async()=>{
 const template=await readFile(new URL('../assets/ficha-t20-nimb.pdf',import.meta.url));const blank=await createBlankCharacterSheetPdf(template);const fields=await readCharacterSheetEditorFields(blank.bytes);assert.equal(fields.find(f=>f.name==='SeleTamanho').value,'');
 const updates=fields.map(f=>({...f,value:f.name==='RAÇA'?'Duende':f.value}));const edited=await applyCharacterSheetEditorFields(blank.bytes,updates);assert.equal(edited.fields.find(f=>f.name==='SeleTamanho').value,'');assert.ok(edited.validation.issues.some(i=>i.id==='required:size'));
 const selected=await applyCharacterSheetEditorFields(edited.bytes,edited.fields.map(f=>({...f,value:f.name==='SeleTamanho'?'Pequeno':f.value})));assert.equal(selected.fields.find(f=>f.name==='SeleTamanho').value,'Pequeno');assert.ok(!selected.validation.issues.some(i=>i.id==='required:size'));
 const imported=await inspectCharacterSheetPdf(await createNimbCharacterSheet({Raca:'Duende',modTamanho:'Grande'}));assert.ok(!imported.validation.issues.some(i=>i.id==='required:size'));
});
