import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { inspectCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';
import { PlayerProfileStore } from '../src/multiplayer/player-profile-store.ts';

const createEditableSheet = async () => {
  const document = await PDFDocument.create();
  document.addPage([600, 800]);
  const form = document.getForm();
  const values = {
    'NOME DO PERSONAGEM': 'Valora',
    JOGADOR: 'Alice',
    'RAÇA': 'Humana',
    ORIGEM: 'Guarda',
    CLASSE: 'Guerreiro',
    Lv: '1',
    For: '14', ModFor: '0',
    Des: '10', ModDes: '0',
    Con: '12', ModCon: '1',
    Int: '10', ModInt: '0',
    Sab: '10', ModSab: '0',
    Car: '10', ModCar: '0',
    'PVs Totais': '21', 'PVs Atuais': '25',
    'PMs Totais': '3', 'PMs Atuais': '3',
    CA: '9', 'Base CA': '10', 'B.Arm': '0', 'B.Esc': '0',
    'Outros B.CA': '0', ModAtribDefe: '0',
    TesteResist: '10', ModAtribMagia: '0',
    'Descrição': '', Pa: '0', Pe: '0', ModFurtTam: '0',
  };
  for (const [name, value] of Object.entries(values)) {
    form.createTextField(name).setText(value);
  }
  form.createCheckBox('arm pesa').check();
  return document.save({ updateFieldAppearances: false });
};

test('lê a ficha editável usando somente modificadores como atributos oficiais', async () => {
  const bytes = await createEditableSheet();
  const inspected = await inspectCharacterSheetPdf(bytes);
  assert.equal(inspected.validation.supported, true);
  assert.equal(inspected.validation.summary.characterName, 'Valora');
  assert.equal(inspected.validation.summary.attributes.for, 0);
  assert.equal(inspected.validation.issues.some(({ id }) => id === 'formula:ModFor'), false);
  assert.equal(inspected.validation.issues.some(({ id }) => id === 'range:current-health'), true);

  const fixed = await inspectCharacterSheetPdf(bytes, true);
  assert.ok(fixed.bytes);
  const corrected = await PDFDocument.load(fixed.bytes);
  assert.equal(corrected.getForm().getTextField('ModFor').getText(), '0');
  assert.equal(corrected.getForm().getTextField('PVs Atuais').getText(), '21');
  assert.equal(corrected.getForm().getTextField('CA').getText(), '10');
});

test('rejeita PDFs sem os campos editáveis esperados', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const inspected = await inspectCharacterSheetPdf(await document.save());
  assert.equal(inspected.validation.supported, false);
  assert.equal(inspected.validation.issues[0].id, 'unsupported-template');
});

test('persiste perfis com senha derivada, notas e ficha por usuário', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bossbar-player-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await PlayerProfileStore.open(directory);
  const registered = await store.register('Alice', 'senha-flexivel');
  assert.equal(registered.username, 'Alice');
  assert.equal(store.accountStatus(' alice ').exists, true);
  await assert.rejects(() => store.authenticate('Alice', 'senha-incorreta'));
  assert.equal((await store.authenticate('ALICE', 'senha-flexivel')).id, registered.id);

  const notes = await store.saveNotes(registered.id, '# Pistas\n\n- Portal vermelho');
  assert.match(notes.notes, /Portal vermelho/);
  const bytes = await createEditableSheet();
  const inspected = await inspectCharacterSheetPdf(bytes);
  const withSheet = await store.saveSheet(
    registered.id,
    'ficha-da-alice.pdf',
    bytes,
    inspected.validation,
  );
  assert.equal(withSheet.sheet.hasSheet, true);
  assert.equal((await store.readSheet(registered.id)).fileName, 'ficha-da-alice.pdf');
  assert.deepEqual(store.listProfiles().map((profile) => ({
    id: profile.id,
    username: profile.username,
    hasSheet: profile.sheet.hasSheet,
  })), [{ id: registered.id, username: 'Alice', hasSheet: true }]);

  const withoutSheet = await store.removeSheet(registered.id);
  assert.equal(withoutSheet.sheet.hasSheet, false);
  assert.equal(await store.readSheet(registered.id), null);

  await store.resetPassword(registered.id, 'nova-senha');
  await assert.rejects(() => store.authenticate('Alice', 'senha-flexivel'));
  assert.equal((await store.authenticate('Alice', 'nova-senha')).id, registered.id);

  await store.deleteProfile(registered.id);
  assert.equal(store.accountStatus('Alice').exists, false);
  assert.deepEqual(store.listProfiles(), []);
  await assert.rejects(() => store.authenticate('Alice', 'nova-senha'));
  const reopened = await PlayerProfileStore.open(directory);
  assert.deepEqual(reopened.listProfiles(), []);
});
