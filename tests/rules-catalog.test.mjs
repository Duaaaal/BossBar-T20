import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { T20_CATALOG, findAbility, findSpell, spellFieldDefaults, catalogKey } from '../src/shared/rules-catalog.ts';
import { ABILITY_FIELDS, abilityEntry, parseNimbSpell, sheetAbilities, sheetSpells, splitTextEntries, upgradeSheetContent, sheetContentIssues } from '../src/shared/character-sheet-content.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { initializeNewCharacterSheetPdf, applyCharacterSheetEditorFields, readCharacterSheetEditorFields, inspectCharacterSheetPdf, migrateCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';

const examples = JSON.parse(await readFile(new URL('./fixtures/nimb-text-examples.json', import.meta.url), 'utf8'));
const value = (fields, name) => fields.find((field) => field.name === name)?.value;

test('catálogo: fontes, identidades, páginas e metadados completos das 256 magias', () => {
  assert.equal(T20_CATALOG.spells.length, 256);
  assert.deepEqual(Object.fromEntries(['core', 'heroes', 'gods', 'threats'].map((id) => [id, T20_CATALOG.spells.filter(({ sourceId }) => id === sourceId).length])), { core: 198, heroes: 22, gods: 29, threats: 7 });
  const ids = new Set();
  for (const ref of [...T20_CATALOG.spells, ...T20_CATALOG.abilities]) {
    assert.ok(!ids.has(ref.id), ref.id); ids.add(ref.id);
    const source = T20_CATALOG.sources.find(({ id }) => id === ref.sourceId);
    assert.match(source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(ref.page > 0 && ref.pdfPage <= source.pages && ref.pdfPage > ref.page);
    assert.equal(ref.implementation, 'text-only');
    assert.ok(ref.description.length > 10, ref.name);
  }
  for (const spell of T20_CATALOG.spells) {
    assert.equal(spell.cost, [0, 1, 3, 6, 10, 15][spell.circle]);
    for (const [field, text] of Object.entries(spellFieldDefaults(spell))) assert.ok(text.trim(), `${spell.name}.${field}`);
    assert.ok(!/Magias Divinas$/.test(spell.description));
  }
  assert.equal(findSpell('Orientação').execution, 'Padrão');
  assert.equal(findSpell('Orientação').duration, '1 rodada');
  assert.equal(findSpell('Momento de Tormenta').sourceId, 'threats');
  assert.match(findSpell('Momento de Tormenta').description, /^Uma nuvem rubra/);
  assert.equal(findSpell('Missão Divina').resistance, 'Vontade anula (veja texto)');
});

test('catálogo: separa quadros e continua descrições entre colunas e páginas', () => {
  const find = (name, characterClass) => findAbility(name, { characterClass }).reference;
  assert.match(find('Poder Mágico', 'Arcanista').description, /os PM que recebe por este poder/);
  assert.doesNotMatch(find('Poder Mágico', 'Arcanista').description, /Familiares Arcanos/);
  assert.match(find('Golpe Divino', 'Paladino').description, /golpe destruidor/);
  assert.match(find('Canalizar Energia Positiva/Negativa', 'Clérigo').description, /Trevas tem o efeito inverso/);
  assert.doesNotMatch(find('Campeão', 'Guerreiro').description, /Efeitos do Golpe Pessoal/);
  assert.match(find('Golpe Pessoal', 'Guerreiro').description, /Efeitos do Golpe Pessoal/);
  assert.ok(T20_CATALOG.abilities.every(({ name }) => !name.endsWith(' Famosos')));
  assert.equal(findAbility('Presente de Wynlla', {}).category, 'general');
  assert.equal(findAbility('Código de Héroi', { characterClass: 'Paladino' }).reference.name, 'Código do Herói');
  assert.equal(findAbility('Código de Herói', { characterClass: 'Paladino' }).reference.name, 'Código do Herói');
});

test('complemento de Ameaças é consultável sem substituir a importação do Básico', () => {
  const spell = findSpell('Conjurar Mortos-Vivos');
  const supplements = T20_CATALOG.supplements.filter(({ spellId }) => spellId === spell.id);
  assert.equal(spell.sourceId, 'core');
  assert.equal(supplements.length, 1);
  assert.equal(supplements[0].sourceId, 'threats');
  assert.equal(supplements[0].page, 405);
  assert.match(supplements[0].description, /soterrados/);
  assert.match(supplements[0].description, /zumbis peçonha/);
  assert.doesNotMatch(spell.description, /soterrados|guerreiros perpétuos|zumbis peçonha/);
  const values = { Magias: 'Conjurar Mortos-Vivos' };
  upgradeSheetContent(values);
  assert.equal(values['BossBar.Magia.1.Efeito'], spell.description);
});

test('habilidades só com nome recebem descrição; clientes antigos não perdem edições silenciosamente', async () => {
  const source = await createNimbCharacterSheet({ Raca: 'Humano', Classe: 'Paladino', Historico: '- Código do Herói\n- Autoconfiança: Descrição personalizada.' });
  const imported = await initializeNewCharacterSheetPdf(source);
  const abilities = imported.validation.summary.abilities;
  assert.equal(abilities.find(({ name }) => name === 'Código do Herói').description, findAbility('Código do Herói', { characterClass: 'Paladino' }).reference.description);
  assert.equal(abilities.find(({ name }) => name === 'Autoconfiança').description, 'Descrição personalizada.');
  await assert.rejects(() => applyCharacterSheetEditorFields(imported.bytes, [{ name: 'BossBar.Nimb.Habilidades', value: '- Texto alterado no cliente antigo' }]), /Reabra o editor atualizado/);
  assert.deepEqual((await inspectCharacterSheetPdf(imported.bytes)).validation.summary.abilities, abilities);
});

for (const [index, example] of examples.entries()) test(`Nimb real: ${example.name}, todas as habilidades e magias estruturadas e preservadas`, async () => {
  const source = await createNimbCharacterSheet(example.fields);
  const imported = await initializeNewCharacterSheetPdf(source);
  const before = imported.validation.summary;
  const expectedPowers = [6, 17, 26, 12][index]; const expectedSpells = [0, 11, 23, 5][index];
  assert.equal(before.abilities.length, expectedPowers);
  assert.equal(before.spells.length, expectedSpells);
  assert.ok(before.abilities.every((ability) => ability.category !== 'review' && ability.referenceId), example.name);
  assert.ok(before.spells.every((spell) => spell.referenceId && spell.school && spell.execution && spell.range && spell.area && spell.duration && spell.resistance));
  assert.ok(!imported.validation.issues.some(({ id }) => id === 'catalog:spell-unparsed'));
  for (const text of splitTextEntries(example.fields.Historico)) {
    const original = abilityEntry(text); const ability = before.abilities.find(({ name }) => name === original.name);
    assert.equal(ability.description, original.description);
  }
  for (const text of splitTextEntries(example.fields.Atualização)) {
    const parsed = parseNimbSpell(text); assert.ok(parsed, text.slice(0, 120));
    const spell = before.spells.find(({ name }) => name === parsed.Nome);
    assert.equal(spell.description, parsed.Efeito); assert.equal(spell.duration, parsed.Duracao);
  }
  const fields = await readCharacterSheetEditorFields(imported.bytes);
  for (const old of ['BossBar.Nimb.Habilidades', 'HabRaçasOrigem', 'HabClassePoderes']) assert.equal(value(fields, old), undefined);
  for (const [, field] of ABILITY_FIELDS.slice(0, 4)) assert.notEqual(value(fields, field), undefined);
  const saved = await applyCharacterSheetEditorFields(imported.bytes, fields, true);
  const reopened = (await inspectCharacterSheetPdf(saved.bytes)).validation.summary;
  assert.deepEqual(reopened.abilities, before.abilities); assert.deepEqual(reopened.spells, before.spells);
  const again = await applyCharacterSheetEditorFields(saved.bytes, saved.fields, true);
  assert.deepEqual(again.validation.summary.abilities, reopened.abilities);
  const notes = value(again.fields, 'BossBar.Nimb.MagiasAdicionais');
  if (example.name === 'Thok') { assert.match(notes, /Bênção: custo anteriormente informado 0 PM/); assert.equal(notes.match(/custo anteriormente informado/g).length, 1); }
  if (example.name === 'Hudson') {
    assert.equal(before.abilities.find(({ name }) => name === 'Vendedor de Carcaças').acquiredFrom, 'Origem: Mateiro');
    assert.ok(imported.validation.issues.some(({ id, autoFixable, source }) => id === 'catalog:spell:7:Execucao' && !autoFixable && source.includes('p. 200')));
  }
  if (example.name === 'Furacão Imortal') assert.equal(before.abilities.find(({ name }) => name === 'Presente de Wynlla').acquiredFrom, undefined);
});

test('importação preserva ambiguidades, desconhecidos, notas e valores personalizados', () => {
  const values = { 'RAÇA': 'Dahllan', CLASSE: 'Druida', 'BossBar.Nimb.Habilidades': '- Empatia Selvagem: Texto da mesa.\n- Poder inventado: Tudo aqui permanece.', Magias: '- Magia inventada (2º, Evoc, Padrão, Curto, Cena, 8PM): Efeito da mesa.\nTexto restante', 'BossBar.Nimb.MagiasAdicionais': 'CD especial.' };
  upgradeSheetContent(values);
  assert.equal(sheetAbilities(values).length, 2);
  assert.ok(sheetAbilities(values).every(({ category }) => category === 'review'));
  assert.match(values['BossBar.Nimb.MagiasAdicionais'], /custo anteriormente informado 8 PM/);
  assert.equal(sheetSpells(values)[0].cost, 3);
  assert.match(sheetSpells(values)[0].description, /Texto restante/);
  const snapshot = JSON.stringify(values); upgradeSheetContent(values); assert.equal(JSON.stringify(values), snapshot);
  assert.ok(sheetContentIssues(values).some(({ id }) => id === 'catalog:spell-unknown:1'));
});

test('nomes ausentes de metadados são completados sem apagar campos explícitos; custo é autoritativo', async () => {
  const source = await createNimbCharacterSheet({ Atualização: 'Orientação' });
  const fields = await readCharacterSheetEditorFields(source);
  assert.equal(value(fields, 'BossBar.Magia.1.Circulo'), '1');
  assert.match(value(fields, 'BossBar.Magia.1.Efeito'), /rolar dois dados e ficar com o melhor resultado/);
  const changes = fields.map((field) => ({ ...field, value: field.name === 'BossBar.Magia.1.Custo' ? '999' : field.name === 'BossBar.Magia.1.Execucao' ? 'Ação especial da mesa' : field.value }));
  const updated = await applyCharacterSheetEditorFields(source, changes);
  assert.equal(value(updated.fields, 'BossBar.Magia.1.Custo'), '1');
  assert.equal(value(updated.fields, 'BossBar.Magia.1.Execucao'), 'Ação especial da mesa');
  assert.match(value(updated.fields, 'BossBar.Nimb.MagiasAdicionais'), /999 PM/);
  assert.ok(updated.validation.issues.some(({ field, autoFixable }) => field === 'BossBar.Magia.1.Execucao' && !autoFixable));
  const deleted = await applyCharacterSheetEditorFields(updated.bytes, updated.fields.map((field) => ({ ...field, value: field.name.startsWith('BossBar.Magia.1.') ? '' : field.value })));
  assert.equal(deleted.validation.summary.spells.length, 0);
});

test('migração do modelo anterior mantém conteúdo original e recursos gastos', async () => {
  const original = await createNimbCharacterSheet({ ...examples[1].fields, vidaAtual: '7', manaAtual: '2', 'BossBar.CanonicalData': JSON.stringify({ 'BossBar.Magia.1.Efeito': examples[1].fields.Atualização }) });
  const template = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const migrated = await migrateCharacterSheetPdf(original, template);
  assert.equal(migrated.validation.summary.currentHealth, 7); assert.equal(migrated.validation.summary.currentMana, 2);
  assert.equal(migrated.validation.summary.spells.length, 11);
  const pdf = await PDFDocument.load(migrated.bytes);
  const canonical = JSON.parse(pdf.getForm().getTextField('BossBar.CanonicalData').getText());
  assert.equal(canonical['BossBar.Original.BossBar.Nimb.Habilidades'], examples[1].fields.Historico);
  assert.equal(canonical['BossBar.Original.Magias'], examples[1].fields.Atualização);
  assert.equal(catalogKey(migrated.validation.summary.abilities.find(({ name }) => name === 'Carapaça').category), 'general');
});
