import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ATTRIBUTES, ATTRIBUTE_PLAN_FIELD, emptyAttributePlan, attributeAllocationStatus, attributePlanIssues, applyAttributePlan, attributeTier } from '../src/shared/character-attributes.ts';
import { CHARACTER_OPTIONS, searchCharacterOptions } from '../src/shared/character-options.ts';
import { createBlankCharacterSheetPdf, applyCharacterSheetEditorFields, readCharacterSheetEditorFields } from '../src/multiplayer/character-sheet-pdf.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { PDFDocument } from 'pdf-lib';
import { inferAttributePlan, deduceImportedAttributeBase, attributePlanTotals, rollAttribute, rolledAttributeValue, parseAttributePlan } from '../src/shared/character-attributes.ts';
import { ATTRIBUTE_SOURCES } from '../src/shared/attribute-sources.ts';
import { parseCharacterClasses, characterClassErrors, characterClassIssues } from '../src/shared/character-classes.ts';

test('deduz bônus raciais e de origem sem modificar os totais; confirma somente escolhas ambíguas', () => {
  const values = { 'RAÇA': 'Medusa', ORIGEM: 'Cria da Favela', Lv: '5', ModFor: '1', ModDes: '5', ModCon: '1', ModInt: '-1', ModSab: '3', ModCar: '3' };
  let plan = inferAttributePlan(values);
  assert.equal(plan.base.Des, '3'); assert.equal(plan.base.Car, '2'); assert.equal(plan.base.Con, '0');
  assert.equal(plan.inferred.choices.length, 0);
  assert.deepEqual(attributePlanTotals(plan), Object.fromEntries(ATTRIBUTES.map(([code]) => ['Mod' + code, Number(values['Mod' + code])])));
  plan = inferAttributePlan({ ...values, 'RAÇA': 'Lefou', ORIGEM: 'Soldado' });
  assert.equal(plan.inferred.choices[0].count, 3); assert.ok(!plan.inferred.choices[0].allowed.includes('Car'));
  plan.inferred.choices[0].selected = ['For','Des','Sab']; deduceImportedAttributeBase(plan);
  assert.equal(plan.base.For, '0'); assert.equal(plan.base.Des, '4'); assert.equal(plan.base.Car, '4');
  assert.equal(attributePlanTotals(plan).ModCar, 3);
  plan.inferred.choices[0].selected = ['For','For','Sab'];
  assert.ok(attributePlanIssues({ ...values, [ATTRIBUTE_PLAN_FIELD]: JSON.stringify(plan) }).some(({ id, severity }) => id.includes('choice:') && severity === 'error'));
});

test('rolagens descartam o menor d6, bloqueiam repetições e aplicam a exceção da soma mínima', () => {
  assert.equal(rolledAttributeValue([1,6,6,6]), 4); assert.equal(rolledAttributeValue([1,1,1,1]), -2);
  const state = { generation: 'test', results: {} }; let calls = 0;
  const dice = () => ++calls <= 24 ? 1 : 6;
  for (const [code] of ATTRIBUTES) rollAttribute(state, code, dice);
  assert.ok(ATTRIBUTES.reduce((sum, [code]) => sum + state.results[code].value, 0) >= 6);
  assert.ok(Object.values(state.results).some(({ attempts }) => attempts.length > 1));
  const prior = JSON.stringify(state); rollAttribute(state, 'For', () => { throw new Error('Não pode rolar novamente'); }); assert.equal(JSON.stringify(state), prior);
});

test('rolagens malformadas não entram no editor e pré-requisitos não concedem bônus', () => {
  const plan = emptyAttributePlan('rolled'); plan.rolls = { generation:'test', results:{ For:{dice:[7,6,6,6],value:4,attempts:[]} } };
  assert.equal(parseAttributePlan(JSON.stringify(plan)), null);
  const inferred = inferAttributePlan({ 'RAÇA':'Medusa', 'BossBar.Habilidades.Classe':'- Poder personalizado: pré-requisito Saúde Perfeita e Rainha Amazona.' });
  assert.equal(inferred.inferred.fixed.Con, undefined); assert.equal(inferred.inferred.fixed.Car, 1);
  const vassal = inferAttributePlan({ 'RAÇA':'Medusa', CLASSE:'Vassalo 20', 'BossBar.Habilidades.Classe':'- Caminho do Governante: escolhido.' });
  assert.equal(vassal.inferred.fixed.Int,1); assert.equal(vassal.inferred.fixed.Car,2);
  assert.equal(vassal.inferred.choices.find(({id})=>id==='class:vassal:17').count,3);
  const missing = inferAttributePlan({ 'RAÇA':'Medusa', ModFor:'' });
  assert.equal(missing.importedTotals.For, null); assert.equal(missing.base.For, '');
  assert.equal(attributePlanTotals(missing), null);
});

test('fontes permanentes e temporárias separam criação e acúmulo, com catálogo dos seis livros', () => {
  assert.equal(new Set(ATTRIBUTE_SOURCES.filter(({ sourceId }) => sourceId !== 'custom').map(({ sourceId }) => sourceId)).size, 6);
  const source = (name) => ATTRIBUTE_SOURCES.find((s) => s.name === name).id;
  const plan = emptyAttributePlan('manual'); for (const [code] of ATTRIBUTES) plan.base[code] = '1';
  plan.increases = [
    { id:'a', attribute:'For', amount:1, sourceId:source('Desejo'), level:1, duration:'permanent' },
    { id:'b', attribute:'For', amount:2, sourceId:source('Físico Divino'), level:1, duration:'temporary' },
    { id:'c', attribute:'For', amount:4, sourceId:source('Potência Divina'), level:1, duration:'temporary' },
    { id:'d', attribute:'For', amount:2, sourceId:source('Cinto da Força do Gigante'), level:1, duration:'temporary' },
  ];
  assert.equal(attributePlanTotals(plan).ModFor, 8); assert.equal(plan.base.For, '1');
  assert.ok(!attributePlanIssues({ Lv:'1', [ATTRIBUTE_PLAN_FIELD]:JSON.stringify(plan), ...Object.fromEntries(Object.entries(attributePlanTotals(plan)).map(([k,v])=>[k,String(v)])) }).some(({ id })=>id.startsWith('attributes:tier:')));
});

test('multiclasse soma níveis e impede duplicatas entre uma classe e sua variante', () => {
  const classes = parseCharacterClasses('Arcanista 3 / Paladino 1', 4);
  assert.deepEqual(classes, [{ name:'Arcanista',level:3 },{ name:'Paladino',level:1 }]); assert.deepEqual(characterClassErrors(classes),[]);
  assert.ok(characterClassErrors(parseCharacterClasses('Arcanista 3 / Necromante 1')).length);
  assert.ok(characterClassIssues({ CLASSE:'Arcanista 3 / Paladino 1',Lv:'5' }).length);
  assert.ok(characterClassErrors(parseCharacterClasses('Guerreiro 20 / Bardo 1')).length);
});

test('compra usa custos não lineares, ajustes não gastam pontos nem limitam o total a 4', () => {
  const plan = emptyAttributePlan('points'); Object.assign(plan.base, { For: '4', Des: '3', Con: '-1' }); plan.adjustments.For = '2';
  const values = applyAttributePlan({ Lv: '1', [ATTRIBUTE_PLAN_FIELD]: JSON.stringify(plan) });
  assert.equal(values.ModFor, '6'); assert.equal(attributeAllocationStatus(plan), 'Todos os 10 pontos foram alocados.');
  assert.equal(attributePlanIssues(values).some(({ severity }) => severity === 'error'), false);
  assert.equal(attributePlanIssues(values).filter(({ id }) => id.startsWith('attributes:limit:')).length, 0);
  plan.base.Con = '0'; values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(plan); applyAttributePlan(values);
  assert.ok(attributePlanIssues(values).some(({ id, severity }) => id === 'attributes:budget' && severity === 'error'));
  plan.base.For = '5'; values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(plan);
  assert.ok(attributePlanIssues(values).some(({ id }) => id === 'attributes:range:For'));
});

test('patamares validam aquisições registradas; nível por si só não aumenta atributos', () => {
  const plan = emptyAttributePlan('points'); plan.base.For = '3'; plan.base.Des = '3'; plan.base.Con = '2';
  const values = { Lv: '20', [ATTRIBUTE_PLAN_FIELD]: JSON.stringify(plan) }; applyAttributePlan(values); assert.equal(values.ModFor, '3');
  assert.deepEqual([4, 5, 10, 11, 16, 17].map(attributeTier), [0, 1, 1, 2, 2, 3]);
  plan.increases = [2, 5, 11, 17].map((level) => ({ id: String(level), level, attribute: 'For' }));
  values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(plan); applyAttributePlan(values); assert.equal(values.ModFor, '7');
  assert.equal(attributePlanIssues(values).filter(({ severity }) => severity === 'error').length, 0);
  plan.increases[3].level = 12; values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(plan);
  assert.ok(attributePlanIssues(values).some(({ id }) => id.startsWith('attributes:tier:')));
  values.Lv = '10'; assert.ok(attributePlanIssues(values).some(({ id }) => id.startsWith('attributes:level:')));
});

test('importação desconhecida preserva total e distribuição explícita prevalece sobre total forjado', async () => {
  const original = await createNimbCharacterSheet({ modFor: '8' });
  let fields = await readCharacterSheetEditorFields(original);
  assert.equal(fields.find(({ name }) => name === 'ModFor').value, '8');
  let applied = await applyCharacterSheetEditorFields(original, fields, true);
  assert.equal(applied.validation.summary.attributes.for, 8);
  assert.ok(applied.validation.issues.some(({ id }) => id === 'attributes:choice:race:choices'));
  const plan = emptyAttributePlan('points'); plan.base.For = '3'; plan.base.Des = '3'; plan.base.Con = '2'; plan.adjustments.For = '2';
  fields.find(({ name }) => name === ATTRIBUTE_PLAN_FIELD).value = JSON.stringify(plan);
  fields.find(({ name }) => name === 'ModFor').value = '99';
  applied = await applyCharacterSheetEditorFields(original, fields, true);
  assert.equal(applied.validation.summary.attributes.for, 5);
  assert.equal(applied.validation.issues.some(({ id }) => id === 'attributes:choice:race:choices'), false);
  const external = await PDFDocument.load(applied.bytes); external.getForm().getTextField('modFor').setText('7');
  const externalFields = await readCharacterSheetEditorFields(await external.save());
  assert.equal(externalFields.find(({ name }) => name === 'ModFor').value, '7');
  assert.equal(JSON.parse(externalFields.find(({ name }) => name === ATTRIBUTE_PLAN_FIELD).value).method, 'unreviewed');
  const blank = await createBlankCharacterSheetPdf(await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url)));
  fields = await readCharacterSheetEditorFields(blank.bytes);
  assert.equal(JSON.parse(fields.find(({ name }) => name === ATTRIBUTE_PLAN_FIELD).value).method, 'points');
  assert.ok(ATTRIBUTES.every(([key]) => fields.find(({ name }) => name === `Mod${key}`).value === '0'));
});

test('listas pesquisáveis incluem opções dos seis livros e distinguem opções homônimas', () => {
  assert.equal(new Set(CHARACTER_OPTIONS.map(({ id }) => id)).size, CHARACTER_OPTIONS.length);
  assert.equal(new Set(CHARACTER_OPTIONS.map(({ sourceId }) => sourceId)).size, 6);
  for (const [kind, name] of [['race', 'Moreau — Coelho'], ['race', 'Golem — Espelhos'], ['class', 'Frade'], ['class', 'Treinador'], ['origin', 'Refugiado'], ['deity', 'Mauziell'], ['deity', 'Tibar']]) assert.ok(searchCharacterOptions(kind, name).some((entry) => entry.name === name), name);
  assert.equal(searchCharacterOptions('race', 'golem').filter(({ name }) => name === 'Golem').length, 2);
  assert.ok(searchCharacterOptions('origin', 'Atlas de Arton').length > 60);
});
