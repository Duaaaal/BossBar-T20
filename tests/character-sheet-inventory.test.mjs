import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { sheetInventoryLoad, upgradeInventoryLoad } from '../src/shared/character-sheet-inventory.ts';
import { referenceTextMatches } from '../src/shared/reference-comparison.ts';
import { sheetContentIssues, upgradeSheetContent } from '../src/shared/character-sheet-content.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { initializeNewCharacterSheetPdf, readCharacterSheetEditorFields, applyCharacterSheetEditorFields, migrateCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';

const values = {
  Item1: 'Brunea', PesoItem1: '5', 'BossBar.Item.1.Quantidade': '1', Armadura: 'Brunea', 'BossBar.Armadura.1.Equipado': 'Yes',
  Item2: 'Escudo leve', PesoItem2: '1', 'BossBar.Item.2.Quantidade': '1', Escudo: 'Escudo Leve', 'BossBar.Escudo.1.Equipado': 'Yes',
  Item3: 'Espada', PesoItem3: '1', 'BossBar.Item.3.Quantidade': '3', 'Ataque 1': 'Espada', 'BossBar.Ataque.1.Principal': 'Yes',
  Item4: 'Poção', PesoItem4: '0,5', 'BossBar.Item.4.Quantidade': '2', 'BossBar.Tibares': '1000',
};
test('carga exclui unidades selecionadas, conserva reservas e considera moedas', () => {
  const load = sheetInventoryLoad(values);
  assert.equal(load.total, 4);
  assert.deepEqual(load.items.map(({ exempt }) => exempt), [1, 1, 1, 0]);
  assert.equal(sheetInventoryLoad({ ...values, 'BossBar.Armadura.1.Equipado': 'Off' }).total, 9);
  assert.equal(sheetInventoryLoad({ ...values, 'BossBar.Ataque.1.Principal': 'Off' }).total, 5);
  assert.equal(sheetInventoryLoad({ ...values, 'BossBar.Escudo.1.Equipado': 'Off', 'BossBar.Ataque.1.DuasArmas': 'Yes', 'BossBar.Ataque.1.Segunda.Nome': 'Espada' }).total, 4);
  assert.equal(sheetInventoryLoad({ ...values, 'Ataque 2': 'Poção', 'BossBar.Ataque.2.Principal': 'Off' }).total, 4);
  assert.equal(sheetInventoryLoad({ ...values, 'Ataque 1': 'Espada (cruel)' }).total, 5);
});
test('carga preserva total anterior quando faltam espaços ou a cópia equipada é ambígua', () => {
  const unknown = { ...values, 'BossBar.Source': 'nimb', CargaTotal: '42', PesoItem4: '' };
  upgradeInventoryLoad(unknown); assert.equal(unknown.CargaTotal, '42');
  assert.match(sheetInventoryLoad(unknown).reasons.join(' '), /Poção/);
  const duplicate = { ...values, Item5: 'Espada', PesoItem5: '2', 'BossBar.Item.5.Quantidade': '1' };
  assert.equal(sheetInventoryLoad(duplicate).total, null);
  assert.match(sheetInventoryLoad(duplicate).reasons.join(' '), /nomes distintos/);
  const natural = { Item1: 'Mordida', PesoItem1: '', 'Ataque 1': 'Mordida', 'BossBar.Ataque.1.Principal': 'Yes' };
  assert.equal(sheetInventoryLoad(natural).total, 0);
  assert.equal(sheetInventoryLoad({ ...natural, 'BossBar.Ataque.1.Principal': 'Off' }).total, null);
});
test('importação, troca de equipamento e migração persistem carga sem apagar o inventário ou recursos gastos', async () => {
  const source = await createNimbCharacterSheet({ armadura1: 'Brunea', armadura2: 'Escudo Leve', ataque1: 'Espada', item1: 'Brunea (5 espaços)\nEscudo Leve (1 espaços)\nEspada (1 espaços)\nCorda (1 espaços)', cargaAtual: '8', vidaAtual: '7', manaAtual: '2' });
  const fresh = await initializeNewCharacterSheetPdf(source);
  assert.equal(fresh.validation.summary.currentLoad, 1);
  const fields = await readCharacterSheetEditorFields(fresh.bytes);
  const changed = await applyCharacterSheetEditorFields(fresh.bytes, fields.map((field) => ({ ...field, value: field.name === 'BossBar.Armadura.1.Equipado' ? 'Off' : field.value })));
  assert.equal(changed.validation.summary.currentLoad, 6);
  assert.equal(changed.fields.find(({ name }) => name === 'Item1').value, 'Brunea');
  const template = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const migrated = await migrateCharacterSheetPdf(source, template);
  assert.equal(migrated.validation.summary.currentLoad, 1);
  assert.equal(migrated.validation.summary.currentHealth, 7); assert.equal(migrated.validation.summary.currentMana, 2);
  const pdf = await PDFDocument.load(migrated.bytes);
  const extra = JSON.parse(pdf.getForm().getTextField('BossBar.CanonicalData').getText());
  assert.equal(extra['BossBar.Original.CargaTotal'], '8');
  assert.equal(extra['BossBar.InventoryLoadVersion'], '1');
  const again = await migrateCharacterSheetPdf(migrated.bytes, template);
  assert.deepEqual(again.bytes, migrated.bytes);
});
test('comparação ignora apresentação equivalente, mas distingue sinal, recurso e condição', () => {
  assert.ok(referenceTextMatches('Você recebe +5 em Reflexos. Por uma rodada.', 'Voce recebe 5 em Reflexos; por 1 rodada.'));
  assert.ok(!referenceTextMatches('Recebe +5 em Reflexos.', 'Recebe -5 em Reflexos.'));
  assert.ok(!referenceTextMatches('A arma causa dano de veneno.', 'A arma causa perda de vida.'));
  assert.ok(referenceTextMatches('Você recebe +1. (JÁ INCLUSO)', 'Você recebe +1. Pré-requisito: For 1.'));
});
test('aviso mostra trechos específicos de Olhar Atordoante sem substituir o texto Nimb', async () => {
  const examples = JSON.parse(await readFile(new URL('./fixtures/nimb-text-examples.json', import.meta.url), 'utf8'));
  const raw = examples.find(({ name }) => name === 'Pythagoras').fields;
  const values = { 'BossBar.Nimb.Habilidades': raw.Historico, 'RAÇA': raw.Raca, CLASSE: raw.Classe };
  upgradeSheetContent(values);
  const warning = sheetContentIssues(values).find(({ comparison }) => comparison?.referenceId === 'core:ability:olhar-atordoante:medusa');
  assert.ok(warning); assert.equal(warning.autoFixable, false);
  assert.match(warning.comparison.sheetExcerpt, /imune.*um dia/);
  assert.match(warning.comparison.referenceExcerpt, /apenas uma vez por cena/);
  assert.match(warning.source, /p\. 29/);
  assert.match(values['BossBar.Habilidades.Raca'], /imune a esta habilidade por um dia/);
});
