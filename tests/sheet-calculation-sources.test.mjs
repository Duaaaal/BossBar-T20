import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { sheetDefenseTotal, sheetDefenseBreakdown } from '../src/shared/character-sheet-calculations.ts';
import { upgradeDefenseSources } from '../src/shared/defense-sources.ts';
import { sheetInventoryLoad } from '../src/shared/character-sheet-inventory.ts';
import { damageReductionBreakdown, resolveDamageReduction } from '../src/shared/damage-reduction.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { applyCharacterSheetEditorFields, readCharacterSheetEditorFields } from '../src/multiplayer/character-sheet-pdf.ts';

const empty = { 'Base CA': '0', Lv: '1', SeleAtribDefe: 'DES', ModAtribDefe: '2', ModCar: '4', ModCon: '3', 'BossBar.Armadura.1.Equipado': 'Off', 'BossBar.Escudo.1.Equipado': 'Off' };
test('Defesa tem base 10, progressões por classe e não duplica atributos', () => {
  assert.equal(sheetDefenseTotal(empty), 12);
  assert.equal(sheetDefenseTotal({ ...empty, Lv: '20', CLASSE: 'Guerreiro 20' }), 12);
  assert.equal(sheetDefenseTotal({ ...empty, Lv: '10', CLASSE: 'Bucaneiro 3 / Guerreiro 7' }), 16);
  assert.equal(sheetDefenseTotal({ ...empty, Lv: '10', CLASSE: 'Bucaneiro 7 / Guerreiro 3' }), 18);
  assert.equal(sheetDefenseTotal({ ...empty, SeleAtribDefe: 'CAR', ModAtribDefe: '4', CLASSE: 'Nobre 7 / Bucaneiro 3', Lv: '10' }), 15);
  assert.equal(sheetDefenseTotal({ ...empty, CLASSE: 'Lutador 7', Lv: '7', 'RAÇA': 'Kappa' }), 18);
  const heavy = { ...empty, Armadura: 'Armadura completa', 'B.Arm1': '10', 'BossBar.Armadura.1.Equipado': 'Yes', 'BossBar.Armadura.1.LimiteAtributo': '0', CLASSE: 'Bucaneiro 7' };
  assert.equal(sheetDefenseTotal(heavy), 20);
  assert.equal(sheetDefenseTotal({ ...heavy, ModInt: '5', SeleAtribDefe: 'INT', ModAtribDefe: '5', 'BossBar.Habilidades.Classe': '- Blindagem: permite Inteligência.' }), 25);
  assert.match(sheetDefenseBreakdown({ ...empty, CLASSE: 'Bucaneiro 3' }).description, /Insolência.*3/);
});
test('fontes passivas respeitam equipamento, suplementos e não ativam magias conhecidas', () => {
  assert.equal(sheetDefenseTotal({ ...empty, 'RAÇA': 'Ceratops' }), 13);
  assert.equal(sheetDefenseTotal({ ...empty, 'RAÇA': 'Yidishan' }), 14);
  assert.equal(sheetDefenseTotal({ ...empty, ORIGEM: 'Escudeiro da Luz' }), 14);
  assert.equal(sheetDefenseTotal({ ...empty, 'BossBar.Habilidades.Raca': '- Herança de Kundali: defesa.' }), 14);
  assert.equal(sheetDefenseTotal({ ...empty, CLASSE: 'Machado de Pedra 3', Lv: '3', 'RAÇA': 'Kappa' }), 18);
  assert.equal(sheetDefenseTotal({ ...empty, 'BossBar.Habilidades.Gerais': '- Teste: tem como pré-requisito\nEsquiva\ne Treinamento.' }), 12);
  assert.equal(sheetDefenseTotal({ ...empty, 'BossBar.Habilidades.Gerais': '- Carapaça: proteção.\n- Dentes Afiados: dentes.\n- Bolsões Insanos: espaço.\n- Esquiva: agilidade.' }), 16);
  assert.equal(sheetDefenseTotal({ ...empty, 'BossBar.Habilidades.Classe': '- Herói do Povo: proteção.\n- Baluarte: gasta PM.\n- En Garde: postura.\n- Teste: Pré-requisito: Esquiva.', 'BossBar.Magia.1.Nome': 'Armadura Arcana' }), 14);
  const previous = { ...empty, 'RAÇA': 'Minotauro', 'Outros B.CA': '3' };
  upgradeDefenseSources(previous); assert.equal(previous['Outros B.CA'], '2'); assert.equal(sheetDefenseTotal(previous), 15);
  upgradeDefenseSources(previous); assert.equal(previous['Outros B.CA'], '2');
});
test('carga bruta menos equipada fecha a carga real e valores desconhecidos permanecem desconhecidos', () => {
  const values = { Item1: 'Espada', PesoItem1: '1', 'BossBar.Item.1.Quantidade': '3', 'Ataque 1': 'Espada', 'BossBar.Ataque.1.Principal': 'Yes', 'BossBar.Tibares': '1000' };
  const load = sheetInventoryLoad(values); assert.equal(load.gross, 4); assert.equal(load.equipped, 1); assert.equal(load.total, 3);
  const unknown = sheetInventoryLoad({ ...values, 'BossBar.Item.1.Quantidade': '1', PesoItem1: '' });
  assert.equal(unknown.total, 1); assert.equal(unknown.gross, null); assert.equal(unknown.equipped, null);
});
test('tooltip de RD usa o mesmo acúmulo que o combate e explica fontes desconsideradas', () => {
  const profile = { version: 1, categories: { physical: { amount: 2, name: 'Couro', bypass: [] }, origins: { amount: 3, name: 'Origem', bypass: [] } }, entries: [
    { id: 'a', target: 'Corte', amount: 5, source: 'spell', name: 'Magia A', bypass: [] },
    { id: 'b', target: 'Corte', amount: 2, source: 'spell', name: 'Magia B', bypass: [] },
    { id: 'c', target: 'Fogo', amount: 10, source: 'item', name: 'Anel', bypass: [] },
  ] };
  const context = { damageType: 'Corte' }; const result = damageReductionBreakdown(profile, context);
  assert.equal(result.total, 7); assert.equal(result.total, resolveDamageReduction(profile, context));
  for (const name of ['Couro', 'Magia A', 'Magia B', 'Anel', 'Origem não informada']) assert.ok(result.description.includes(name));
});
test('PDF conserva bônus naturais e outros manuais sem somá-los novamente na reabertura', async () => {
  const bytes = await createNimbCharacterSheet({ Raca: 'Minotauro', Classe: 'Lutador 7', nivel: '7', Texto13: '19', defesaOutros: '6', modCon: '3' });
  const first = await applyCharacterSheetEditorFields(bytes, await readCharacterSheetEditorFields(bytes), true);
  const second = await applyCharacterSheetEditorFields(first.bytes, await readCharacterSheetEditorFields(first.bytes), true);
  assert.equal(first.validation.summary.defenses.melee, second.validation.summary.defenses.melee);
  assert.equal(first.fields.find(({ name }) => name === 'Outros B.CA').value, second.fields.find(({ name }) => name === 'Outros B.CA').value);
  const form = (await PDFDocument.load(second.bytes)).getForm();
  assert.equal(form.getTextField('defesaOutros').getText(), '6');
  assert.match(second.validation.summary.defenses.calculation, /Couro Rígido/);
});
