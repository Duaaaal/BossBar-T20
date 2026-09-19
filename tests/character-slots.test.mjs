import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { PlayerProfileStore } from '../src/multiplayer/player-profile-store.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { inspectCharacterSheetPdf, readCharacterSheetEditorFields, applyCharacterSheetEditorFields, exportEditableCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';
import { reviewableSheetIssues, visibleSheetIssues } from '../src/multiplayer/sheet-warning-review.ts';

test('três fichas isolam PDF, retrato e avisos; migração preserva o acesso legado', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bossbar-slots-'));
  try {
    let store = await PlayerProfileStore.open(directory);
    const profile = await store.register('Três fichas', 'senha');
    assert.equal(profile.characters.length, 3);
    const [first, second, third] = profile.characters;
    const bytes = await createNimbCharacterSheet(); const validation = (await inspectCharacterSheetPdf(bytes)).validation;
    await store.saveSheet(profile.id, 'primeira.pdf', bytes, validation);
    await store.savePortrait(profile.id, 'primeira.png', new Uint8Array([1, 2, 3]), 'image/png');
    await store.setDismissedWarnings(profile.id, { example: 'ack' });
    await store.selectCharacter(profile.id, second.id);
    assert.equal(await store.readSheet(profile.id), null);
    assert.equal(await store.readPortrait(profile.id), null);
    assert.deepEqual(store.getDismissedWarnings(profile.id), {});
    await store.saveSheet(profile.id, 'segunda.pdf', bytes, validation);
    await store.selectCharacter(profile.id, third.id);
    await store.saveSheet(profile.id, 'terceira.pdf', bytes, validation);
    await assert.rejects(store.selectCharacter(profile.id, 'other-character'), /não pertence/);
    await store.selectCharacter(profile.id, first.id);
    assert.equal((await store.readSheet(profile.id)).fileName, 'primeira.pdf');
    assert.equal((await store.readPortrait(profile.id)).fileName, 'primeira.png');
    store = await PlayerProfileStore.open(directory);
    assert.equal((await store.authenticate('Três fichas', 'senha')).characters.filter(({ sheet }) => sheet.hasSheet).length, 3);
    await store.removeSheet(profile.id);
    assert.equal((await store.readSheet(profile.id, second.id)).fileName, 'segunda.pdf');
    // A real version-1 metadata shape upgrades to slot 1 without replacing files.
    const disk = JSON.parse(await readFile(path.join(directory, 'profiles.json'), 'utf8'));
    const legacy = disk.profiles[0]; legacy.sheet = legacy.characters[1].sheet; legacy.portrait = legacy.characters[0].portrait;
    delete legacy.characters; delete legacy.activeCharacterId; disk.version = 1;
    await writeFile(path.join(directory, 'profiles.json'), JSON.stringify(disk));
    store = await PlayerProfileStore.open(directory);
    const upgraded = await store.authenticate('Três fichas', 'senha');
    assert.equal(upgraded.characters.length, 3); assert.equal(upgraded.sheet.fileName, 'segunda.pdf');
    assert.equal(upgraded.portrait.fileName, 'primeira.png');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('avisos informativos reaparecem após edição e erros/migração não podem ser limpos', () => {
  const description = { id: 'catalog:ability-text:race:0', severity: 'warning', field: 'race', message: 'Texto difere', comparison: { sheetExcerpt: 'a', referenceExcerpt: 'b', referenceId: 'x' } };
  const warnings = [description, { id: 'migration:attribute', severity: 'warning', field: 'race' }, { ...description, id: 'error', severity: 'error' }];
  const original = reviewableSheetIssues(warnings, [{ name: 'race', value: 'A' }]);
  const dismissed = Object.fromEntries(original.map(({ id, fingerprint }) => [id, fingerprint]));
  assert.equal(visibleSheetIssues(original, dismissed).length, 2);
  const changed = reviewableSheetIssues(warnings, [{ name: 'race', value: 'B' }]);
  assert.equal(visibleSheetIssues(changed, dismissed).length, 3);
});

test('PDF exportado conserva AcroForm Nimb, continua textos longos e aceita edição/reimportação', async () => {
  const blank = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const longText = 'Descrição longa preservada integralmente para consulta e impressão.\n'.repeat(170);
  const source = await createNimbCharacterSheet({ Nome: 'Teste Exportável', Historico: longText, Atualização: 'Luz: luz mágica para iluminar a área.', Magias: 'Anotação de magia personalizada.' });
  const result = await exportEditableCharacterSheetPdf(source, blank);
  const document = await PDFDocument.load(result); const form = document.getForm();
  assert.ok(document.getPageCount() > 3); assert.equal(form.getTextField('Nome').getText(), 'Teste Exportável');
  assert.ok(form.getFields().some((field) => field.getName().startsWith('BossBar.Export.Part') && field.acroField.getWidgets().length));
  assert.ok(form.getTextField('Nome').acroField.getWidgets()[0].getAppearances().normal);
  const before = await readCharacterSheetEditorFields(source); const after = await readCharacterSheetEditorFields(result);
  const get = (fields, name) => fields.find((field) => field.name === name)?.value;
  assert.equal(get(after, 'BossBar.Habilidades.Revisar'), get(before, 'BossBar.Habilidades.Revisar'));
  const notes = form.getTextField('BossBar.Nimb.MagiasAdicionais');
  const visibleWidgets = document.getPages().flatMap((page) => (page.node.Annots()?.asArray() ?? []).map((ref) => document.context.lookup(ref)));
  assert.ok(notes.acroField.getWidgets().some((widget) => visibleWidgets.includes(widget.dict)));
  notes.setText('Anotação alterada no PDF.');
  form.getTextField('Nome').setText('Nome alterado no PDF');
  const edited = await readCharacterSheetEditorFields(await document.save());
  assert.equal(get(edited, 'NOME DO PERSONAGEM'), 'Nome alterado no PDF');
  assert.equal(get(edited, 'BossBar.Nimb.MagiasAdicionais'), 'Anotação alterada no PDF.');
  const continuation = form.getTextField('BossBar.Export.Part1');
  continuation.setText(`${continuation.getText()} Texto alterado na continuação.`);
  const revised = await readCharacterSheetEditorFields(await document.save());
  assert.match(get(revised, 'BossBar.Habilidades.Revisar'), /Texto alterado na continuação/);
  assert.equal((await inspectCharacterSheetPdf(result)).validation.issues.some(({ id }) => id === 'review:extra-pages'), false);
  if (process.env.BOSSBAR_PDF_QA_OUTPUT) await writeFile(process.env.BOSSBAR_PDF_QA_OUTPUT, result);
});

test('magias editadas no corpo do PDF mantêm círculo, área, resistência e descrição ao reimportar', async () => {
  const blank = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const source = await createNimbCharacterSheet({ Atualização: '- Luz (1º, Evoc, Padrão, Curto, Cena, 1 PM): efeito personalizado.\n- Curar Ferimentos (1º, Evoc, Padrão, Toque, Instantânea, 1 PM): cura personalizada.' });
  const document = await PDFDocument.load(await exportEditableCharacterSheetPdf(source, blank));
  const body = document.getForm().getTextField('Atualização');
  assert.match(body.getText(), /Nome: Luz/);
  body.setText(body.getText().replace('efeito personalizado.', 'efeito alterado no PDF.'));
  const fields = await readCharacterSheetEditorFields(await document.save());
  const get = (name) => fields.find((field) => field.name === name)?.value;
  assert.equal(get('BossBar.Magia.1.Nome'), 'Luz');
  assert.equal(get('BossBar.Magia.1.Circulo'), '1');
  assert.equal(get('BossBar.Magia.1.Custo'), '1');
  assert.equal(get('BossBar.Magia.1.Efeito'), 'efeito alterado no PDF.');
  assert.equal(get('BossBar.Magia.2.Nome'), 'Curar Ferimentos');
  assert.ok(get('BossBar.Magia.1.Area'));
  assert.ok(get('BossBar.Magia.1.Resistencia'));
});

test('RD é texto no modelo Nimb, preserva os cálculos e pede revisão se o texto for editado', async () => {
  const blank = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const source = await createNimbCharacterSheet({ 'BossBar.CanonicalData': JSON.stringify({ 'BossBar.RD': JSON.stringify({ version: 1, categories: { universal: { amount: 5, immune: false, name: 'Proteção', bypass: [] } }, entries: [{ id: 'fire', target: 'Fogo', amount: 0, source: 'spell', name: 'Aura', bypass: [], immune: true }] }) }) });
  const document = await PDFDocument.load(await exportEditableCharacterSheetPdf(source, blank));
  const form = document.getForm(); const details = form.getTextField('BossBar.Export.Detalhes');
  assert.equal(document.getPageCount(), 3);
  assert.match(details.getText(), /Geral 5/); assert.match(details.getText(), /imune \(dano 1\)/);
  assert.equal(form.getFieldMaybe('BossBar.Export.RD0.amount'), undefined);
  const before = (await inspectCharacterSheetPdf(await document.save())).validation;
  assert.equal(before.summary.damageReduction.categories.universal.amount, 5);
  assert.equal(before.summary.damageReduction.entries[0].immune, true);
  details.setText(details.getText().replace('Geral 5', 'Geral 8'));
  const after = (await inspectCharacterSheetPdf(await document.save())).validation;
  assert.ok(after.issues.some(({ id }) => id === 'review:export-text'));
  const fields = await readCharacterSheetEditorFields(await document.save());
  assert.match(fields.find(({ name }) => name === 'BossBar.Nimb.Anotacoes').value, /Geral 8/);
});

test('texto de anexos cabe no modelo original sem páginas redundantes em exportações repetidas', async () => {
  const blank = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const source = await PDFDocument.load(await createNimbCharacterSheet());
  source.addPage([320, 400]).drawText('Anexo original preservado');
  const first = await exportEditableCharacterSheetPdf(await source.save(), blank);
  const second = await exportEditableCharacterSheetPdf(first, blank);
  const firstDocument = await PDFDocument.load(first); const secondDocument = await PDFDocument.load(second);
  assert.equal(secondDocument.getPageCount(), firstDocument.getPageCount());
  assert.equal(secondDocument.getPageCount(), 3);
  assert.match(secondDocument.getForm().getTextField('BossBar.Nimb.PaginasAdicionais').getText(), /Anexo original preservado/);
  const manifest = JSON.parse(secondDocument.getForm().getTextField('BossBar.Export.Manifest').getText());
  assert.deepEqual(manifest.referencePages, []);
});

test('rolagens persistem por personagem e só reiniciam mediante limpeza de todos os atributos', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bossbar-attribute-rolls-'));
  try {
    let store = await PlayerProfileStore.open(directory); const profile = await store.register('Rolagens', 'senha');
    const initial = await store.updateAttributeRolls(profile.id);
    const rolled = await store.updateAttributeRolls(profile.id, 'For', initial.generation);
    assert.deepEqual(await store.updateAttributeRolls(profile.id, 'For', initial.generation), rolled);
    store = await PlayerProfileStore.open(directory); assert.deepEqual(store.getAttributeRolls(profile.id), rolled);
    await store.selectCharacter(profile.id, profile.characters[1].id); assert.equal(store.getAttributeRolls(profile.id), null);
    await store.selectCharacter(profile.id, profile.activeCharacterId);
    const cleared = await store.updateAttributeRolls(profile.id, undefined, undefined, true);
    assert.deepEqual(cleared.results, {}); assert.notEqual(cleared.generation, rolled.generation);
    await assert.rejects(store.updateAttributeRolls(profile.id, 'Des', rolled.generation), /reiniciada/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('anexo com imagem que não cabe nos campos de texto é preservado uma única vez', async () => {
  const blank = await readFile(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url));
  const source = await PDFDocument.load(await createNimbCharacterSheet());
  const portrait = await source.embedPng(await readFile(new URL('./fixtures/media/test-background.png', import.meta.url)));
  source.addPage([320, 400]).drawImage(portrait, { x: 10, y: 10, width: 200, height: 150 });
  const first = await exportEditableCharacterSheetPdf(await source.save(), blank);
  const second = await PDFDocument.load(await exportEditableCharacterSheetPdf(first, blank));
  assert.equal(second.getPageCount(), 4);
  assert.deepEqual(second.getPage(3).getSize(), { width: 320, height: 400 });
  assert.deepEqual(JSON.parse(second.getForm().getTextField('BossBar.Export.Manifest').getText()).referencePages, [3]);
});
