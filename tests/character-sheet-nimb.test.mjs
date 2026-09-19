import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { applyCharacterSheetEditorFields, initializeNewCharacterSheetPdf, inspectCharacterSheetPdf, migrateCharacterSheetPdf, readCharacterSheetEditorFields } from '../src/multiplayer/character-sheet-pdf.ts';
import { migrateEncounterCharacterSheets } from '../src/multiplayer/character-sheet-migration.ts';
import { PlayerProfileStore } from '../src/multiplayer/player-profile-store.ts';
import { attackTestFormulaExpression, parseAttackTestFormula, rollAttackTestExtraDice } from '../src/shared/player-combat.ts';

const blank = () => readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
const fieldValue = (fields, name) => fields.find((field) => field.name === name)?.value;
const change = (fields, values) => fields.map((field) => ({ ...field, value: values[field.name] ?? field.value }));
const legacySheet = async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const form = document.getForm();
  for (const [name, value] of Object.entries({
    'NOME DO PERSONAGEM': 'Legado', JOGADOR: 'Jogador', 'RAÇA': 'Humano', ORIGEM: 'Guarda', CLASSE: 'Guerreiro', Lv: '3',
    For: '14', ModFor: '2', ModDes: '1', ModCon: '1', ModInt: '0', ModSab: '0', ModCar: '0',
    'PVs Totais': '31', 'PVs Atuais': '', 'PMs Totais': '9', 'PMs Atuais': '4',
    CA: '11', 'Base CA': '10', 'B.Arm': '0', 'B.Esc': '0', 'Outros B.CA': '0', ModAtribDefe: '1',
    '010': '8', '011': '1', '013': '0', '014': '0', ModAtribAcro: '7',
    Item1: 'Corda antiga', PesoItem1: '1,5', CargaTotal: '42', CargaMax: '14',
    Proficiências: 'Armas marciais', Magias: 'Texto integral da ficha antiga', CampoPersonalizado: 'Dado que não deve desaparecer',
  })) form.createTextField(name).setText(value);
  form.createCheckBox('arm pesa').check();
  return Buffer.from(await document.save({ updateFieldAppearances: false }));
};

test('só a importação nova preenche PV e PM atuais pelos máximos', async () => {
  const source = await createNimbCharacterSheet({ vidaAtual: '3', manaAtual: '' });
  const imported = await initializeNewCharacterSheetPdf(source);
  assert.equal(imported.validation.summary.currentHealth, 62);
  assert.equal(imported.validation.summary.currentMana, 44);
  const edited = await applyCharacterSheetEditorFields(imported.bytes, change(await readCharacterSheetEditorFields(imported.bytes), { 'PVs Atuais': '7', 'PMs Atuais': '2' }), true);
  assert.equal(edited.validation.summary.currentHealth, 7);
  assert.equal((await inspectCharacterSheetPdf(edited.bytes, true)).validation.summary.currentMana, 2);
  assert.equal((await migrateCharacterSheetPdf(edited.bytes, await blank())).validation.summary.currentHealth, 7);
  const missing = await initializeNewCharacterSheetPdf(await createNimbCharacterSheet({ vidaMax: '', vidaAtual: '', manaMax: '', manaAtual: '' }));
  assert.equal(missing.validation.summary.currentHealth, null);
  assert.equal(missing.validation.summary.currentMana, null);
});

test('migração mantém bônus de equipamento de fichas antigas que tinham apenas totais de Defesa', async () => {
  const document = await PDFDocument.load(await legacySheet());
  document.getForm().getTextField('B.Arm').setText('6');
  document.getForm().getTextField('B.Esc').setText('2');
  const migrated = await migrateCharacterSheetPdf(await document.save({ updateFieldAppearances: false }), await blank());
  const fields = await readCharacterSheetEditorFields(migrated.bytes);
  assert.equal(fieldValue(fields, 'B.Arm1'), '6');
  assert.equal(fieldValue(fields, 'B.Esc2'), '2');
  assert.equal(fieldValue(fields, 'BossBar.Armadura.1.Equipado'), 'Yes');
  const edited = await applyCharacterSheetEditorFields(migrated.bytes, fields, true);
  assert.equal(fieldValue(edited.fields, 'B.Arm'), '6');
  assert.equal(fieldValue(edited.fields, 'B.Esc'), '2');
});

test('equipamento selecionado altera totais sem sobrescrever a primeira linha e preserva limite manual', async () => {
  const source = await createNimbCharacterSheet();
  const fields = await readCharacterSheetEditorFields(source);
  const additions = Object.entries({
    'BossBar.Armadura.2.Nome': 'Armadura completa de mitral', 'BossBar.Armadura.2.Defesa': '10',
    'BossBar.Armadura.2.Penalidade': '3', 'BossBar.Armadura.2.OutrosDefesa': '1', 'BossBar.Armadura.2.OutrosPenalidade': '1',
    'BossBar.Armadura.2.Equipado': 'Yes', 'BossBar.Armadura.2.Informacoes': 'Forjada sob medida',
  }).map(([name, value]) => ({ name, value, label: name, section: 'Armadura e escudo', kind: 'text' }));
  const selected = await applyCharacterSheetEditorFields(source, [...change(fields, { 'BossBar.Armadura.1.Equipado': 'Off' }), ...additions], true);
  assert.equal(fieldValue(selected.fields, 'B.Arm'), '11');
  assert.equal(fieldValue(selected.fields, 'B.Arm1'), '2');
  assert.equal(fieldValue(selected.fields, 'Armadura'), 'Armadura leve');
  assert.equal(fieldValue(selected.fields, 'BossBar.Armadura.2.LimiteAtributo'), '2');
  assert.equal(fieldValue(selected.fields, 'BossBar.PenalidadeArmadura'), '2');
  const reverted = await applyCharacterSheetEditorFields(selected.bytes, change(selected.fields, { 'BossBar.Armadura.1.Equipado': 'Yes', 'BossBar.Armadura.2.Equipado': 'Off' }), true);
  assert.equal(fieldValue(reverted.fields, 'B.Arm'), '2');
  assert.equal(fieldValue(reverted.fields, 'BossBar.Armadura.2.Defesa'), '10');
  const override = await applyCharacterSheetEditorFields(selected.bytes, change(selected.fields, { 'BossBar.Armadura.2.LimiteAtributo': '', 'BossBar.Armadura.2.LimiteManual': 'Yes' }), true);
  assert.equal(fieldValue(override.fields, 'BossBar.Armadura.2.LimiteAtributo'), '');
  const invalid = await applyCharacterSheetEditorFields(selected.bytes, change(selected.fields, { 'BossBar.Armadura.1.Equipado': 'Yes' }));
  assert.ok(invalid.validation.issues.some(({ id }) => id === 'invalid:equipped:Armadura'));
});

test('ataque principal, duas armas e ajuste de perícia sobrevivem à edição e validam as mãos', async () => {
  const source = await createNimbCharacterSheet({ ataque1: 'Espada', tAtak1: '+9', dano1: '1d8+1', armadura2: 'Escudo leve', defesa2: '1' });
  const edited = await applyCharacterSheetEditorFields(source, change(await readCharacterSheetEditorFields(source), {
    'BossBar.Ataque.1.DuasArmas': 'Yes', 'BossBar.Ataque.1.Segunda.Nome': 'Adaga', 'BossBar.Ataque.1.Segunda.Dano': '1d4+1',
    'BossBar.Ataque.1.Segunda.Pericia': 'Pontaria', 'BossBar.Ataque.1.Segunda.Ajuste': '-2+1d4',
    'BossBar.Ataque.1.Segunda.MargemCritico': '19', 'BossBar.Ataque.1.Segunda.MultiplicadorCritico': '3',
  }));
  assert.ok(edited.validation.issues.some(({ id }) => id === 'invalid:hands'));
  const valid = await applyCharacterSheetEditorFields(edited.bytes, change(edited.fields, { 'BossBar.Escudo.1.Equipado': 'Off' }), true);
  const attack = valid.validation.summary.attacks[0];
  assert.equal(attack.primary, true);
  assert.equal(attack.secondaryWeapon.skill, 'Pontaria');
  assert.equal(attack.secondaryWeapon.critical, '19/x3');
  assert.equal(attack.secondaryWeapon.attackBonus, '1d20 -2+1d4');
  const disabled = await applyCharacterSheetEditorFields(valid.bytes, change(valid.fields, { 'BossBar.Ataque.1.Principal': 'Off', 'BossBar.Ataque.1.DuasArmas': 'Off' }));
  assert.equal(disabled.validation.summary.attacks.some(({ primary }) => primary), false);
  assert.equal(fieldValue(disabled.fields, 'BossBar.Ataque.1.Segunda.Nome'), 'Adaga');
});

test('o modelo vazio é o PDF Nimb fornecido, com 236 campos e todos os widgets', async () => {
  const bytes = await blank();
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'eca410aaeaf5153fefefb2ca9dbc7e2c23f14c7a7783f951d6d05078975a2d4a');
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getPageCount(), 3);
  assert.equal(document.getForm().getFields().length, 236);
  assert.equal(document.getPages().reduce((sum, page) => sum + (page.node.Annots()?.size() ?? 0), 0), 259);
  const result = await inspectCharacterSheetPdf(bytes, true);
  assert.equal(result.validation.template, 'ficha-nimb-v3');
  assert.equal(result.validation.summary.currentHealth, null);
  assert.equal(result.validation.summary.currentMana, null);
  const fields = await readCharacterSheetEditorFields(bytes);
  assert.equal(fields.filter(({ section, name }) => section === 'Atributos' && name.startsWith('Mod')).length, 6);
  assert.ok(fields.some(({ name }) => name === 'BossBar.Atributos.Distribuicao'));
  assert.ok(!fields.some(({ name }) => ['For', 'Des', 'Con', 'Int', 'Sab', 'Car'].includes(name)));
});

test('ordem Nimb, Ofício 2 tota23, armadura e restrição de treinamento são independentes', async () => {
  const source = await createNimbCharacterSheet({ Texto8:'Alquimista',Texto9:'Armeiro',total21: '31', total22: '32', tota23: '33', total24: '34', total25: '35' });
  const { validation } = await inspectCharacterSheetPdf(source);
  const skills = new Map(validation.summary.skills.map((skill) => [skill.id, skill]));
  for (const [code, value] of [['220', 31], ['230', 32], ['240', 33], ['250', 34], ['210', 35]]) assert.equal(skills.get(code).total, value);
  assert.equal(skills.get('010').total, 4);
  assert.equal(skills.get('010').otherBonus, 0);
  assert.equal(skills.get('010').armorPenalty, 2);
  assert.equal(skills.get('170').trainedOnly, true);
  const corrected = await inspectCharacterSheetPdf(source, true);
  assert.equal(corrected.validation.summary.skills.find(({ id }) => id === '240').total, 33);
  assert.ok(corrected.validation.issues.some(({ id }) => id === 'skill-import:240'));
  assert.equal(corrected.validation.summary.skills.find(({ id }) => id === '240').trained, false);
  assert.ok(!corrected.validation.issues.some(({ severity }) => severity === 'error'));
});

test('o total de ataque Nimb mantém bônus da arma e não soma a perícia duas vezes', async () => {
  const source = await createNimbCharacterSheet({ ataque1: 'Arma ajustada', tAtak1: '+9', dano1: '1d6+1' });
  const attack = (await inspectCharacterSheetPdf(source)).validation.summary.attacks[0];
  assert.equal(attack.attackBonusIncludesSkill, false);
  assert.equal(attack.skill, 'Luta');
  const formula = parseAttackTestFormula(attack.attackBonus, attack.attackBonusIncludesSkill);
  assert.equal(attackTestFormulaExpression(formula, 6), '1d20 + 3 + 6');
  assert.equal(rollAttackTestExtraDice(formula, () => 1).total + 6, 9);
  assert.equal(attackTestFormulaExpression(parseAttackTestFormula('-2', true), 0), '1d20 - 2 + 0');
  const fields = await readCharacterSheetEditorFields(source);
  const edited = await applyCharacterSheetEditorFields(source, change(fields, { 'BossBar.Ataque.1.Base': '999' }));
  assert.equal(edited.validation.summary.attacks[0].attackBonusIncludesSkill, false);
  assert.equal(fieldValue(edited.fields, 'BossBar.Ataque.1.Base'), '6');
});

test('edição Nimb conserva textos longos, ataques duplos e a quarta página', async () => {
  const text = 'Habilidade detalhada de referência, com acentuação.\n'.repeat(500);
  const source = await createNimbCharacterSheet({ Historico: text, Atualização: text, ataque1: 'Bordão', dano1: '1d6+1/1d6+1', tipo1: 'Impac.', critico1: 'x2', alcance1: '-' }, true);
  const fields = await readCharacterSheetEditorFields(source);
  assert.equal(fieldValue(fields, 'BossBar.Habilidades.Revisar'), `- ${text.trim()}`);
  assert.ok(fieldValue(fields, 'BossBar.Nimb.MagiasAdicionais').includes(text.trim()));
  assert.equal(fieldValue(fields, 'BossBar.Ataque.1.Segunda.Dano'), '1d6+1');
  assert.match(fieldValue(fields, 'BossBar.Nimb.PaginasAdicionais'), /Pagina de referencia 4/);
  const edited = await applyCharacterSheetEditorFields(source, change(fields, { 'NOME DO PERSONAGEM': 'Editado', ModSab: '5' }), true);
  assert.equal(edited.validation.summary.characterName, 'Editado');
  assert.equal((await PDFDocument.load(edited.bytes)).getPageCount(), 4);
  const reopened = await readCharacterSheetEditorFields(edited.bytes);
  assert.equal(fieldValue(reopened, 'BossBar.Habilidades.Revisar'), `- ${text.trim()}`);
  assert.ok(fieldValue(reopened, 'BossBar.Nimb.MagiasAdicionais').includes(text.trim()));
  assert.equal(fieldValue(reopened, 'BossBar.Nimb.PaginasAdicionais'), fieldValue(fields, 'BossBar.Nimb.PaginasAdicionais'));
  // Attribute totals are calculated from the allocation; a direct write to the
  // read-only total cannot silently replace the imported score.
  assert.equal(fieldValue(reopened, 'ModSab'), '4');
  assert.equal(fieldValue(reopened, 'TesteResist'), '19');
  assert.equal(fieldValue(reopened, 'CargaTotal'), '1,5');
  const fixedAgain = await inspectCharacterSheetPdf(edited.bytes, true);
  assert.ok(!fixedAgain.validation.issues.some(({ autoFixable }) => autoFixable));
});

test('validação não inventa PV/PM, nível nem atributo para corrigir totais dependentes', async () => {
  const source = await createNimbCharacterSheet({ nivel: 'desconhecido', modFor: '', modDef: 'modFor', Texto13: '25', Resistencia: '37', vidaAtual: '', manaAtual: '', total3: '41' });
  const result = await inspectCharacterSheetPdf(source, true);
  const fields = await readCharacterSheetEditorFields(result.bytes);
  assert.equal(fieldValue(fields, 'Lv'), 'desconhecido');
  assert.equal(fieldValue(fields, '030'), '41');
  assert.equal(fieldValue(fields, 'CA'), '25');
  assert.equal(fieldValue(fields, 'TesteResist'), '37');
  assert.equal(result.validation.summary.currentHealth, null);
  assert.equal(result.validation.summary.currentMana, null);
  for (const issue of result.validation.issues) {
    assert.ok(issue.reason);
    assert.ok(issue.location);
    assert.ok(issue.correction);
  }
});

test('inventário editado sincroniza o PDF, conserva linhas sem carga e pode ser salvo após prévia', async () => {
  const source = await createNimbCharacterSheet({ item1: 'Corda (1 espaços)\nRecordação sem espaços', item2: '' });
  const fields = await readCharacterSheetEditorFields(source);
  assert.equal(fieldValue(fields, 'Item2'), 'Recordação sem espaços');
  assert.equal(fieldValue(fields, 'PesoItem2'), '');
  const preview = await applyCharacterSheetEditorFields(source, change(fields, { Item1: 'Corda reforçada', 'BossBar.Item.1.Quantidade': '2' }), true);
  assert.match(fieldValue(preview.fields, 'BossBar.Nimb.Equipamento'), /2 × Corda reforçada \(2 espaços\)/);
  assert.match(fieldValue(preview.fields, 'BossBar.Nimb.Equipamento'), /Recordação sem espaços/);
  const saved = await applyCharacterSheetEditorFields(source, preview.fields);
  assert.equal(fieldValue(saved.fields, 'Item1'), 'Corda reforçada');
  assert.equal(fieldValue(saved.fields, 'BossBar.Item.1.Quantidade'), '2');
  const changedText = await applyCharacterSheetEditorFields(saved.bytes, change(saved.fields, { 'BossBar.Nimb.Equipamento': 'Poção (0,5 espaços)' }));
  assert.equal(fieldValue(changedText.fields, 'Item1'), 'Poção');
  assert.equal(fieldValue(changedText.fields, 'PesoItem1'), '0.5');
});

test('ajustes de equipamento preservam Defesa e penalidade calculada sem aceitar total forjado', async () => {
  const source = await createNimbCharacterSheet({ defesa1: '4', defesa2: '1', Texto13: '16', penalidade1: '3', penalidade2: '1', penalidadeDeArmadura: '4', outros1: '-4', outros11: '-4', outros18: '-4' });
  const fields = await readCharacterSheetEditorFields(source);
  const result = await applyCharacterSheetEditorFields(source, change(fields, {
    'BossBar.Armadura.1.OutrosDefesa': '2', 'BossBar.Escudo.1.OutrosDefesa': '-1',
    'BossBar.Armadura.1.OutrosPenalidade': '1', 'BossBar.Escudo.1.OutrosPenalidade': '-2',
    'BossBar.PenalidadeArmadura': '88',
  }), true);
  assert.equal(fieldValue(result.fields, 'B.Arm1'), '4');
  assert.equal(fieldValue(result.fields, 'B.Arm'), '6');
  assert.equal(fieldValue(result.fields, 'B.Esc2'), '1');
  assert.equal(fieldValue(result.fields, 'B.Esc'), '0');
  assert.equal(fieldValue(result.fields, 'BossBar.PenalidadeArmadura'), '5');
  assert.equal(result.validation.summary.defense, 17);
  assert.equal(result.validation.summary.skills.find(({ id }) => id === '010').armorPenalty, 5);
  const reopened = await applyCharacterSheetEditorFields(result.bytes, result.fields, true);
  for (const name of ['B.Arm1', 'B.Arm', 'B.Esc2', 'B.Esc', 'BossBar.PenalidadeArmadura']) assert.equal(fieldValue(reopened.fields, name), fieldValue(result.fields, name));
  const penalty = await applyCharacterSheetEditorFields(source, change(fields, { 'BossBar.Armadura.1.OutrosDefesa': '-7' }), true);
  assert.equal(fieldValue(penalty.fields, 'B.Arm'), '-3');
  assert.equal(penalty.validation.summary.defense, 9);
  assert.ok(!penalty.validation.issues.some(({ severity }) => severity === 'error'));
});

test('anotações de magia recebem a antiga origem da CD e preservam ajustes fora do custo-base', async () => {
  const source = await createNimbCharacterSheet({ Magias: 'Referência inicial.', Atualização: '- Magia de referência (3º, Evoc, Padrão, Curto, Cena, 6PM): Texto de magia', 'BossBar.CanonicalData': JSON.stringify({ 'BossBar.CdJustificativa': 'Poder escolhido na criação.' }) });
  const fields = await readCharacterSheetEditorFields(source);
  assert.ok(!fields.some(({ name }) => name === 'BossBar.CdJustificativa'));
  assert.equal(fieldValue(fields, 'BossBar.Nimb.MagiasAdicionais'), 'Referência inicial.\n\nOrigem dos outros bônus de CD:\nPoder escolhido na criação.');
  for (const [circle, cost] of [['1', '1'], ['2', '3'], ['3', '6'], ['4', '10'], ['5', '15']]) {
    const edited = await applyCharacterSheetEditorFields(source, change(fields, { 'BossBar.Magia.1.Nome': 'Magia de referência', 'BossBar.Magia.1.Circulo': circle }));
    assert.equal(fieldValue(edited.fields, 'BossBar.Magia.1.Custo'), cost);
  }
  const normal = await applyCharacterSheetEditorFields(source, change(fields, { 'BossBar.Magia.1.Nome': 'Magia de referência', 'BossBar.Magia.1.Circulo': '3' }));
  const adjusted = await applyCharacterSheetEditorFields(normal.bytes, change(normal.fields, { 'BossBar.Magia.1.Custo': '2' }), true);
  assert.equal(fieldValue(adjusted.fields, 'BossBar.Magia.1.Custo'), '6');
  assert.ok(!adjusted.validation.issues.some(({ id }) => id === 'review:spell-cost:1'));
  assert.ok(fieldValue(adjusted.fields, 'BossBar.Nimb.MagiasAdicionais').startsWith(fieldValue(fields, 'BossBar.Nimb.MagiasAdicionais')));
  assert.match(fieldValue(adjusted.fields, 'BossBar.Nimb.MagiasAdicionais'), /custo anteriormente informado 2 PM/);
});

test('moeda personalizada preserva nome e quantidade e rejeita quantidade sem nome', async () => {
  const source = await createNimbCharacterSheet();
  const fields = await readCharacterSheetEditorFields(source);
  const invalid = await applyCharacterSheetEditorFields(source, change(fields, { 'BossBar.MoedaPersonalizada.Quantidade': '7' }));
  assert.ok(invalid.validation.issues.some(({ id }) => id === 'required:custom-currency-name'));
  const saved = await applyCharacterSheetEditorFields(source, change(fields, { 'BossBar.MoedaPersonalizada.Nome': 'Cristais', 'BossBar.MoedaPersonalizada.Quantidade': '7' }));
  assert.equal(fieldValue(saved.fields, 'BossBar.MoedaPersonalizada.Nome'), 'Cristais');
  assert.equal(fieldValue(saved.fields, 'BossBar.MoedaPersonalizada.Quantidade'), '7');
  assert.equal(fieldValue(saved.fields, 'BossBar.Tibares'), fieldValue(fields, 'BossBar.Tibares'));
});

test('migração preserva escala JdA, valores ambíguos, campos adicionais e falta de informação', async () => {
  const original = await legacySheet();
  const migrated = await migrateCharacterSheetPdf(original, await blank());
  assert.equal(migrated.validation.template, 'ficha-nimb-v3');
  assert.equal(migrated.validation.summary.attributes.for, 2);
  assert.equal(migrated.validation.summary.currentHealth, null);
  assert.equal(migrated.validation.summary.currentLoad, 42);
  const fields = await readCharacterSheetEditorFields(migrated.bytes);
  assert.equal(fieldValue(fields, 'ModAtribAcro'), '7');
  assert.equal(fieldValue(fields, 'SeleAtribAcro'), 'Revisar');
  assert.equal(fieldValue(fields, 'PesoItem1'), '1,5');
  assert.match(fieldValue(fields, 'BossBar.Nimb.MagiasAdicionais'), /Texto integral da ficha antiga/);
  assert.ok(migrated.validation.issues.some(({ id }) => id === 'migration:load-units'));
  const document = await PDFDocument.load(migrated.bytes);
  assert.equal(JSON.parse(document.getForm().getTextField('BossBar.CanonicalData').getText()).CampoPersonalizado, 'Dado que não deve desaparecer');
  const revised = await applyCharacterSheetEditorFields(migrated.bytes, change(fields, { SeleAtribAcro: 'DES', 'BossBar.CargaRevisada': 'Yes' }), true);
  assert.equal(fieldValue(revised.fields, 'ModAtribAcro'), '1');
  assert.ok(!revised.validation.issues.some(({ id }) => id === 'migration:attribute:010' || id === 'migration:load-units'));
});

test('perfis guardam PDF e metadados anteriores, migram uma vez e isolam falhas', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bossbar-nimb-migration-'));
  try {
    const store = await PlayerProfileStore.open(root);
    const first = await store.register('Migração', 'senha-segura-123');
    const second = await store.register('Falha', 'senha-segura-123');
    const original = await legacySheet();
    const { validation } = await inspectCharacterSheetPdf(original);
    await store.saveSheet(first.id, 'original.pdf', original, validation);
    await store.saveSheet(second.id, 'corrompida.pdf', Buffer.from('PDF corrompido'), validation);
    const template = await blank();
    await store.migrateSheets((bytes) => migrateCharacterSheetPdf(bytes, template));
    const current = await store.readSheet(first.id);
    assert.equal(current.validation.template, 'ficha-nimb-v3');
    const files = await readdir(path.dirname(current.filePath));
    const backup = files.find((name) => /^sheet-before-model-3-.*\.pdf$/.test(name));
    assert.ok(backup);
    assert.deepEqual(await readFile(path.join(path.dirname(current.filePath), backup)), original);
    assert.ok(files.includes(backup.replace('.pdf', '.json')));
    const failed = await store.readSheet(second.id);
    assert.equal(failed.bytes.toString(), 'PDF corrompido');
    assert.ok(failed.validation.issues.some(({ id }) => id === 'migration:failed'));
    let calls = 0;
    await PlayerProfileStore.open(root, async (bytes) => { calls++; return migrateCharacterSheetPdf(bytes, template); });
    assert.equal(calls, 1, 'apenas a ficha que falhou deve ser tentada novamente');
    assert.equal((await readdir(path.dirname(current.filePath))).filter((name) => name.endsWith('.pdf')).length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('migração de encontro usa a ficha histórica e conserva o estado de combate e o original', async () => {
  const original = await legacySheet();
  const { validation } = await inspectCharacterSheetPdf(original);
  const checkpoint = { turns: { round: 8 }, players: [{ profileId: 'historico', state: { currentHealth: 7, currentMana: 2 }, validation, sheetDocument: { fileName: 'encontro.pdf', base64: original.toString('base64') } }] };
  const result = await migrateEncounterCharacterSheets(checkpoint, await blank());
  assert.deepEqual(result.players[0].state, checkpoint.players[0].state);
  assert.equal(result.players[0].validation.template, 'ficha-nimb-v3');
  assert.equal(result.players[0].sheetDocument.beforeModel3.base64, checkpoint.players[0].sheetDocument.base64);
  assert.equal(checkpoint.players[0].validation.template, 'ficha-t20-editavel-v2');
  const again = await migrateEncounterCharacterSheets(result, await blank());
  assert.deepEqual(again, result);
});
