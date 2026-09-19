import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { readCharacterSheetEditorFields, applyCharacterSheetEditorFields, migrateCharacterSheetPdf, exportEditableCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';
import { allSkillRules, craftEditorFields } from '../src/shared/skill-definitions.ts';
import { SKILL_EFFECTS_FIELD, emptySkillEffectsPlan } from '../src/shared/skill-mechanics.ts';
import { chooseTrainingBenefits } from '../src/shared/training-benefits.ts';
import { T20_CATALOG } from '../src/shared/rules-catalog.ts';
const blank = () => readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));

test('benefício mantém categoria e proveniência no ciclo de edição, exportação e reimportação',async()=>{
 const source=await createNimbCharacterSheet();const fields=await readCharacterSheetEditorFields(source);const values=Object.fromEntries(fields.map(f=>[f.name,f.value]));
 const plan=JSON.parse(values['BossBar.Pericias.Fontes']);plan.choices['race:humano']=1;values['BossBar.Pericias.Fontes']=JSON.stringify(plan);
 const id=T20_CATALOG.abilities.find(r=>r.name==='Sortudo').id;assert.equal(chooseTrainingBenefits(values,'race:humano',[id]),true);
 const edited=await applyCharacterSheetEditorFields(source,fields.map(f=>({...f,value:values[f.name]})),true);const exported=await exportEditableCharacterSheetPdf(edited.bytes,await blank());
 const reopened=Object.fromEntries((await readCharacterSheetEditorFields(exported)).map(f=>[f.name,f.value]));
 assert.match(reopened['BossBar.Habilidades.Gerais'],/Sortudo/);assert.deepEqual(JSON.parse(reopened['BossBar.Pericias.Fontes']).benefits['race:humano'].ids,[id]);
 const forged=Object.fromEntries(fields.map(f=>[f.name,f.value]));const bad=T20_CATALOG.abilities.find(r=>r.name==='Ataque em Arco');const forgedPlan=JSON.parse(values['BossBar.Pericias.Fontes']);forgedPlan.benefits['race:humano']={ids:[bad.id],inserted:{}};forged['BossBar.Pericias.Fontes']=JSON.stringify(forgedPlan);forged.Lv='1';forged['Mar Trei luta']='Off';
 await assert.rejects(applyCharacterSheetEditorFields(source,fields.map(f=>({...f,value:forged[f.name]}))),/pré-requisitos não atendidos/);
});

test('migração persiste as fontes de perícia e mantém PV/PM personalizados', async()=>{
  const source=await createNimbCharacterSheet({vidaMax:'777',manaMax:'333','BossBar.CanonicalData':JSON.stringify({'BossBar.TextCatalogVersion':'1','BossBar.InventoryLoadVersion':'1'})});
  const migrated=await migrateCharacterSheetPdf(source,await blank());const document=await PDFDocument.load(migrated.bytes);
  const extra=JSON.parse(document.getForm().getTextField('BossBar.CanonicalData').getText());assert.ok(extra[SKILL_EFFECTS_FIELD]);
  const fields=await readCharacterSheetEditorFields(migrated.bytes);const get=name=>fields.find(f=>f.name===name)?.value;
  assert.equal(get('PVs Totais'),'777');assert.equal(get('PMs Totais'),'333');
  const again=await migrateCharacterSheetPdf(migrated.bytes,await blank());assert.deepEqual(again.bytes,migrated.bytes);
});

test('Ofícios adicionais e fontes do mestre sobrevivem à edição, exportação e reimportação',async()=>{
  const source=await createNimbCharacterSheet();const fields=await readCharacterSheetEditorFields(source);
  const rule=allSkillRules.find(r=>r.code==='BossBar.Oficio.3.Total');const plan=emptySkillEffectsPlan();plan.reviewed=true;plan.extra=[{id:'guilda',name:'Guilda',skill:rule.code,amount:3,dice:'',condition:'',active:false,note:'Mestre: filiação aprovada'}];
  const values={[rule.nameField]:'cozinheiro',[rule.trainedField]:'Yes',[SKILL_EFFECTS_FIELD]:JSON.stringify(plan),'Ofício 1':'alquimista',Ofício_2:'armeiro','BossBar.Pericias.Fontes':JSON.stringify({version:2,choices:{},extra:[{skill:rule.code,source:'Mestre',note:'Treinamento de cozinheiro'}]})};
  const updates=[...fields.map(f=>({...f,value:values[f.name]??f.value})),...craftEditorFields(rule,values)];
  const edited=await applyCharacterSheetEditorFields(source,updates,true);const exported=await exportEditableCharacterSheetPdf(edited.bytes,await blank());
  const document=await PDFDocument.load(exported);const name='BossBar.Export.'+rule.code;const visible=document.getForm().getTextField(name);assert.match(visible.getText(),/cozinheiro/);assert.match(visible.getText(),/\+ 3 \(Guilda\)/);assert.ok(visible.acroField.getWidgets().length);
  const reopened=await readCharacterSheetEditorFields(exported);assert.equal(reopened.find(f=>f.name===rule.nameField)?.value,'cozinheiro');assert.equal(reopened.find(f=>f.name===rule.code)?.value,edited.fields.find(f=>f.name===rule.code)?.value);
  assert.equal(JSON.parse(reopened.find(f=>f.name===SKILL_EFFECTS_FIELD).value).extra[0].amount,3);
  assert.equal(document.getPageCount(),3);
  if(process.env.BOSSBAR_SKILL_EXPORT_QA)await writeFile(process.env.BOSSBAR_SKILL_EXPORT_QA,exported);
  visible.setText(visible.getText()+'; detalhe anotado fora do aplicativo');const external=await readCharacterSheetEditorFields(await document.save());
  assert.match(external.find(f=>f.name==='BossBar.Nimb.Anotacoes').value,/detalhe anotado fora do aplicativo/);
});
