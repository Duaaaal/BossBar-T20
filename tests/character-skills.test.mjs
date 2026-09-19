import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { skillRules, recalculateCharacterSkills } from '../src/shared/character-skills.ts';
import { skillTraining, SKILL_TRAINING_FIELD } from '../src/shared/skill-training.ts';
import { emptyAttributePlan, ATTRIBUTE_PLAN_FIELD } from '../src/shared/character-attributes.ts';
import { createBlankCharacterSheetPdf, applyCharacterSheetEditorFields, readCharacterSheetEditorFields } from '../src/multiplayer/character-sheet-pdf.ts';
import { CHARACTER_OPTIONS } from '../src/shared/character-options.ts';

const values = { Lv: '1', CLASSE: 'Guerreiro 1', ModInt: '0', ModFor: '3', ModDes: '2', SeleAtribLuta: 'FOR', SeleAtribFurt: 'DES', ModFurtTam: '5', 'BossBar.Armadura.1.Equipado': 'Off', 'BossBar.Escudo.1.Equipado': 'Off' };
const trained = (...names) => Object.fromEntries(skillRules.filter(({ name }) => names.includes(name)).map(({ trainedField }) => [trainedField, 'Yes']));

test('perícias recalculam treinamento por patamar, atributo, outros e tamanho sem alterar escolhas', () => {
  for (const [level, bonus] of [[1, 2], [6, 2], [7, 4], [14, 4], [15, 6], [20, 6]]) {
    const sheet = { ...values, ...trained('Luta', 'Furtividade'), Lv: String(level), '194': '2' };
    recalculateCharacterSkills(sheet);
    assert.equal(sheet['193'], String(bonus)); assert.equal(sheet['190'], String(Math.floor(level / 2) + 3 + bonus + 2));
    assert.equal(sheet['110'], String(Math.floor(level / 2) + 2 + bonus + 5));
    sheet['Mar Trei luta'] = 'Off'; sheet.SeleAtribLuta = 'DES'; recalculateCharacterSkills(sheet);
    assert.equal(sheet['193'], '0'); assert.equal(sheet['190'], String(Math.floor(level / 2) + 2 + 2));
  }
  assert.equal(skillRules.find(({ name }) => name === 'Atuação').trainedOnly, true);
});

test('treinamento respeita listas, classe inicial, Inteligência permanente e benefícios distintos', () => {
  const selections = trained('Luta', 'Fortitude', 'Iniciativa', 'Reflexos');
  assert.equal(skillTraining({ ...values, ...selections }).unmatched.length, 0);
  assert.equal(skillTraining({ ...values, ...selections, ...trained('Misticismo') }).unmatched.length, 1);
  assert.equal(skillTraining({ ...values, ...selections, ...trained('Misticismo'), ModInt: '1' }).unmatched.length, 0);
  const plan = emptyAttributePlan('manual'); plan.base.Int = '0';
  plan.increases = [{ id: 'temp', level: 1, attribute: 'Int', amount: 1, sourceId: 'custom:mestre', duration: 'temporary', active: true, note: 'Efeito temporário' }];
  assert.equal(skillTraining({ ...values, ...selections, ...trained('Misticismo'), ModInt: '1', [ATTRIBUTE_PLAN_FIELD]: JSON.stringify(plan) }).unmatched.length, 1);
  assert.equal(skillTraining({ ...values, CLASSE: 'Guerreiro 1 / Ladino 1', Lv: '2' }).maximum, 4);
  assert.equal(skillTraining({ ...values, ModInt: '-3' }).maximum, 4);
  const origin = { ...values, ORIGEM: 'Acólito', ...selections, ...trained('Cura', 'Vontade') };
  assert.equal(skillTraining(origin).unmatched.length, 0);
  assert.ok(skillTraining(origin).issues.some(({ id }) => id.startsWith('training:source:')));
  const state = { version: 1, choices: { 'origin:acolito': 1 }, extra: [] };
  assert.equal(skillTraining({ ...origin, [SKILL_TRAINING_FIELD]: JSON.stringify(state) }).unmatched.length, 1);
  state.extra = [{ skill: '300', source: 'Mestre', note: 'Treinamento concedido na campanha' }];
  assert.equal(skillTraining({ ...origin, [SKILL_TRAINING_FIELD]: JSON.stringify(state) }).unmatched.length, 0);
  const confirmed = skillTraining({ ...origin, [SKILL_TRAINING_FIELD]: JSON.stringify(state) });
  assert.equal(confirmed.sources.find(({ id }) => id === 'origin:acolito').confirmed, true);
  assert.equal(skillTraining(origin).sources.find(({ id }) => id === 'origin:acolito').confirmed, false);
  assert.equal(new Set(confirmed.assignments.map(({ code }) => code)).size, confirmed.selected.length);
  for (const source of confirmed.sources) assert.ok(confirmed.assignments.filter(({ sourceId }) => sourceId === source.id).length <= source.count);
});

test('classes têm listas válidas, variantes próprias e Ofício respeita especialização', () => {
  for (const entry of CHARACTER_OPTIONS.filter(({ kind }) => kind === 'class')) {
    const state = skillTraining({ ...values, CLASSE: entry.name + ' 1' });
    assert.ok(state.classRule, entry.name); assert.equal(state.classRule.mandatory.length, 2, entry.name);
    for (const name of state.classRule.allowed) assert.ok(skillRules.some((skill) => skill.name === name || name === 'Ofício' && skill.name.startsWith('Ofício')), `${entry.name}: ${name}`);
  }
  assert.equal(skillTraining({ ...values, CLASSE: 'Burguês 1' }).maximum, 8);
  assert.equal(skillTraining({ ...values, CLASSE: 'Ermitão 1' }).maximum, 4);
  const alchemist = skillTraining({ ...values, CLASSE: 'Alquimista 1', 'Ofício 1': 'Alquimista', ...trained('Ofício 1', 'Vontade') });
  assert.ok(!alchemist.issues.some(({ id }) => id.startsWith('training:mandatory:')));
});

test('servidor recalcula campos forjados, conserva treinamento Nimb e exige fonte para nova escolha excedente', async () => {
  const blank = await createBlankCharacterSheetPdf(await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url)));
  const fields = await readCharacterSheetEditorFields(blank.bytes);
  const update = { ...values, ...trained('Luta', 'Fortitude', 'Iniciativa', 'Reflexos'), '193': '99', '190': '99' };
  const first = await applyCharacterSheetEditorFields(blank.bytes, fields.map((field) => ({ ...field, value: update[field.name] ?? field.value })));
  const reread = await readCharacterSheetEditorFields(first.bytes);
  assert.equal(reread.find(({ name }) => name === 'Mar Trei luta').value, 'Yes');
  assert.equal(reread.find(({ name }) => name === '193').value, '2');
  assert.notEqual(reread.find(({ name }) => name === '190').value, '99');
  await assert.rejects(() => applyCharacterSheetEditorFields(first.bytes, reread.map((field) => ({ ...field, value: field.name === 'Mar Trei misti' ? 'Yes' : field.value }))), /fontes registradas/);
});
