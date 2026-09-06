import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import {
  applyCharacterSheetEditorFields,
  inspectCharacterSheetPdf,
  readCharacterSheetEditorFields,
} from '../src/multiplayer/character-sheet-pdf.ts';
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
    'Ataque 1': 'Espada longa', 'Bônus Atq 1': '1d20 + 5',
    'Dano 1': '1d8 + 2', 'Crítico 1': '19/x3',
    'Tipo 1': 'Corte', 'Alcance 1': 'Corpo a corpo',
    CA: '9', 'Base CA': '10', 'B.Arm': '0', 'B.Esc': '0',
    'Outros B.CA': '0', ModAtribDefe: '0',
    TesteResist: '10', ModAtribMagia: '0',
    Magias: '',
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
  assert.equal(inspected.validation.summary.temporaryHealth, 0);
  assert.equal(inspected.validation.issues.some(({ id }) => id === 'formula:ModFor'), false);
  assert.equal(inspected.validation.issues.some(({ id }) => id === 'range:current-health'), true);

  const fixed = await inspectCharacterSheetPdf(bytes, true);
  assert.ok(fixed.bytes);
  const corrected = await PDFDocument.load(fixed.bytes);
  assert.equal(corrected.getForm().getTextField('ModFor').getText(), '0');
  assert.equal(corrected.getForm().getTextField('PVs Atuais').getText(), '21');
  assert.equal(corrected.getForm().getTextField('CA').getText(), '10');
});

test('ataques começam com duas linhas, preservam slots antigos e permitem linhas adicionais', async () => {
  const document = await PDFDocument.load(await createEditableSheet());
  document.getForm().createTextField('Ataque 5').setText('Arco legado');
  const bytes = await document.save({ updateFieldAppearances: false });
  const fields = await readCharacterSheetEditorFields(bytes);
  assert.deepEqual(
    [...new Set(fields.filter(({ section }) => section === 'Ataques').map(({ group }) => group))],
    ['Ataque 1', 'Ataque 2', 'Ataque 5'],
  );
  const extraAttack = fields.filter(({ group }) => group === 'Ataque 2').map((field) => ({
    ...field,
    group: 'Ataque 6',
    name: field.name.replace(/2(?=\.|$)/g, '6'),
    value: {
      Nome: 'Lança adicional',
      'Teste de ataque': '1d20 + 3',
      Dano: '1d8 + 2',
      'Margem de crítico': '19',
      'Multiplicador de crítico': '3',
      Tipo: 'Perfuração',
      Alcance: '1,5m',
    }[field.label],
  }));
  const edited = await applyCharacterSheetEditorFields(bytes, extraAttack);
  assert.equal(edited.validation.summary.attacks.at(-1)?.name, 'Lança adicional');
  assert.equal(edited.validation.summary.attacks.at(-1)?.critical, '19/x3');
  const reopened = await readCharacterSheetEditorFields(edited.bytes);
  assert.equal(reopened.find(({ name }) => name === 'Dano 6')?.value, '1d8 + 2');
  assert.equal(reopened.find(({ name }) => name === 'Ataque 5')?.value, 'Arco legado');
  const removed = await applyCharacterSheetEditorFields(edited.bytes,
    extraAttack.map((field) => ({ ...field, value: '' })),
  );
  assert.equal(removed.validation.summary.attacks.some(({ name }) => name === 'Lança adicional'), false);
  assert.equal((await readCharacterSheetEditorFields(removed.bytes))
    .some(({ group }) => group === 'Ataque 6'), false);
});

test('rejeita PDFs sem os campos editáveis esperados', async () => {
  const document = await PDFDocument.create();
  document.addPage();
  const inspected = await inspectCharacterSheetPdf(await document.save());
  assert.equal(inspected.validation.supported, false);
  assert.equal(inspected.validation.issues[0].id, 'unsupported-template');
});

test('edita campos da ficha e preserva um PDF válido para aprovação do mestre', async () => {
  const bytes = await createEditableSheet();
  const fields = await readCharacterSheetEditorFields(bytes);
  const origin = fields.find(({ name }) => name === 'ORIGEM');
  assert.equal(origin?.value, 'Guarda');
  assert.equal(origin?.label, 'Origem');
  assert.equal(origin?.section, 'Identidade');
  assert.equal(fields.some(({ name }) => name === 'JOGADOR'), false);
  assert.equal(
    fields.find(({ name }) => name === 'BossBar.PVs Temporarios')?.label,
    'PV temporário',
  );
  assert.equal(
    fields.find(({ name }) => name === 'BossBar.PVs Temporarios')?.value,
    '0',
  );
  assert.equal(fields.find(({ name }) => name === 'Exp')?.value, '0');
  assert.equal(fields.find(({ name }) => name === '014')?.value, '0');
  assert.equal(fields.some(({ name }) => name.startsWith('BossBar.Magia.')), false);
  assert.deepEqual(
    [...new Set(fields.filter(({ section }) => section === 'Ataques').map(({ group }) => group))],
    ['Ataque 1', 'Ataque 2'],
  );
  assert.deepEqual(
    [...new Set(fields.filter(({ group }) => /^Item \d+$/.test(group ?? '')).map(({ group }) => group))],
    ['Item 1', 'Item 2', 'Item 3'],
  );
  assert.deepEqual(
    [...new Set(fields.filter(({ group }) => /^Armadura \d+$/.test(group ?? '')).map(({ group }) => group))],
    ['Armadura 1'],
  );
  assert.deepEqual(
    [...new Set(fields.filter(({ group }) => /^Escudo \d+$/.test(group ?? '')).map(({ group }) => group))],
    ['Escudo 1'],
  );
  assert.equal(fields.find(({ name }) => name === 'CargaTotal')?.section, 'Itens');
  assert.equal(fields.find(({ name }) => name === 'CargaTotal')?.validation?.kind, 'decimal');
  assert.equal(
    fields.find(({ name }) => name === 'BossBar.Ataque.1.MargemCritico')?.value,
    '19',
  );
  assert.equal(
    fields.find(({ name }) => name === 'BossBar.Ataque.1.MultiplicadorCritico')?.value,
    '3',
  );
  assert.equal(
    fields.find(({ name }) => name === 'BossBar.Ataque.2.MultiplicadorCritico')?.value,
    '2',
  );

  const updates = [...fields.map((field) => (
    field.name === 'ORIGEM'
      ? { ...field, value: 'Marinheira' }
      : field.name === 'BossBar.PVs Temporarios'
        ? { ...field, value: '7' }
        : field.name === 'BossBar.Ataque.1.MargemCritico'
          ? { ...field, value: '18' }
          : field.name === 'BossBar.Magia.1.Nome'
            ? { ...field, value: 'Bola de Fogo' }
            : field.name === 'BossBar.Magia.1.Efeito'
              ? { ...field, value: 'Explosão flamejante' }
        : field
  )), {
    name: 'BossBar.Magia.1.Nome',
    label: 'Nome',
    section: 'Magias',
    group: 'Magia 1',
    kind: 'text',
    value: 'Bola de Fogo',
    validation: { kind: 'text', maxLength: 160 },
  }, {
    name: 'BossBar.Magia.1.Efeito',
    label: 'Efeito',
    section: 'Magias',
    group: 'Magia 1',
    kind: 'text',
    value: 'Explosão flamejante',
    validation: { kind: 'text', maxLength: 1_000 },
  }, {
    name: 'Item4',
    label: 'Item',
    section: 'Itens',
    group: 'Item 4',
    kind: 'text',
    value: 'Kit de aventureiro',
  }, {
    name: 'BossBar.Item.4.Quantidade',
    label: 'Quantidade',
    section: 'Itens',
    group: 'Item 4',
    kind: 'text',
    value: '2',
    validation: { kind: 'integer', min: 0, max: 9_999 },
  }, {
    name: 'PesoItem4',
    label: 'Peso',
    section: 'Itens',
    group: 'Item 4',
    kind: 'text',
    value: '1,5',
    validation: { kind: 'decimal', min: 0, max: 1_000_000 },
  }, {
    name: 'BossBar.Armadura.2.Nome',
    label: 'Nome',
    section: 'Armadura e escudo',
    group: 'Armadura 2',
    kind: 'text',
    value: 'Couraça reserva',
  }, {
    name: 'BossBar.Armadura.2.Defesa',
    label: 'Defesa',
    section: 'Armadura e escudo',
    group: 'Armadura 2',
    kind: 'text',
    value: '5',
    validation: { kind: 'integer', min: 0, max: 999 },
  }];
  const edited = await applyCharacterSheetEditorFields(bytes, updates);
  assert.equal(edited.validation.supported, true);
  assert.equal(edited.fields.find(({ name }) => name === 'ORIGEM')?.value, 'Marinheira');

  const document = await PDFDocument.load(edited.bytes);
  assert.equal(document.getForm().getTextField('ORIGEM').getText(), 'Marinheira');
  assert.equal(document.getForm().getTextField('BossBar.PVs Temporarios').getText(), '7');
  assert.equal(document.getForm().getTextField('Crítico 1').getText(), '18/x3');
  assert.equal(
    document.getForm().getTextField('BossBar.Magia.1.Nome').getText(),
    'Bola de Fogo',
  );
  assert.equal(document.getForm().getTextField('Item4').getText(), 'Kit de aventureiro');
  assert.equal(document.getForm().getTextField('PesoItem4').getText(), '1,5');
  assert.equal(document.getForm().getTextField('BossBar.Armadura.2.Nome').getText(), 'Couraça reserva');
  assert.match(document.getForm().getTextField('Magias').getText(), /Bola de Fogo/);
  assert.equal(edited.fields.some(({ group }) => group === 'Item 4'), true);
  assert.equal(edited.fields.some(({ group }) => group === 'Armadura 2'), true);
  await assert.rejects(
    applyCharacterSheetEditorFields(bytes, [...updates, {
      name: 'CAMPO NÃO PERMITIDO',
      label: 'Campo injetado',
      section: 'Inválido',
      kind: 'text',
      value: 'não deve persistir',
    }]),
    /não é reconhecido/,
  );
  await assert.rejects(
    applyCharacterSheetEditorFields(bytes, updates.map((field) => (
      field.name === 'BossBar.PVs Temporarios'
        ? { ...field, value: '-1' }
        : field
    ))),
    /mínimo 0/,
  );
  await assert.rejects(
    applyCharacterSheetEditorFields(bytes, updates.map((field) => (
      field.name === 'PesoItem4'
        ? { ...field, value: 'pesado' }
        : field
    ))),
    /número válido/,
  );
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
  const portraitBytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0,
  ]);
  const withPortrait = await store.savePortrait(
    registered.id,
    'valora.png',
    portraitBytes,
    'image/png',
  );
  assert.equal(withPortrait.portrait.hasPortrait, true);
  assert.equal(withPortrait.portrait.fileName, 'valora.png');
  assert.deepEqual((await store.readPortrait(registered.id)).bytes, Buffer.from(portraitBytes));
  const replacementPortraitBytes = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4,
  ]);
  const replacedPortrait = await store.savePortrait(
    registered.id,
    'valora-atualizada.png',
    replacementPortraitBytes,
    'image/png',
  );
  assert.equal(replacedPortrait.portrait.fileName, 'valora-atualizada.png');
  assert.deepEqual(
    (await store.readPortrait(registered.id)).bytes,
    Buffer.from(replacementPortraitBytes),
  );
  assert.deepEqual(store.listProfiles().map((profile) => ({
    id: profile.id,
    username: profile.username,
    hasSheet: profile.sheet.hasSheet,
  })), [{ id: registered.id, username: 'Alice', hasSheet: true }]);

  const withoutSheet = await store.removeSheet(registered.id);
  assert.equal(withoutSheet.sheet.hasSheet, false);
  assert.equal(await store.readSheet(registered.id), null);
  const withoutPortrait = await store.removePortrait(registered.id);
  assert.equal(withoutPortrait.portrait.hasPortrait, false);
  assert.equal(await store.readPortrait(registered.id), null);

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
