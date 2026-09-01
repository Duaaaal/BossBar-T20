import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_SHEET_DRAFT_MAX_AGE_MS,
  CHARACTER_SHEET_DRAFT_MAX_BYTES,
  characterSheetDraftStorageKey,
  recoverCharacterSheetDraft,
  serializeCharacterSheetDraft,
} from '../src/shared/character-sheet-draft.ts';

const baseFields = [
  {
    name: 'NOME DO PERSONAGEM',
    label: 'Nome',
    section: 'Identidade',
    kind: 'text',
    value: 'Valora',
    validation: { kind: 'text', maxLength: 80 },
  },
  {
    name: 'PVs Atuais',
    label: 'PV atual',
    section: 'Recursos',
    kind: 'text',
    value: '20',
    validation: { kind: 'integer', min: -9999, max: 9999 },
  },
];

test('serializa e recupera um rascunho compatível sem compartilhar referências', () => {
  const savedAt = 1_700_000_000_000;
  const editedFields = baseFields.map((field) => ({ ...field }));
  editedFields[0].value = 'Valora da Aurora';
  const serialized = serializeCharacterSheetDraft({
    fileName: 'valora.pdf',
    baseFields,
    fields: editedFields,
    removedFields: [],
    savedAt,
  });
  const recovered = recoverCharacterSheetDraft({
    serialized,
    fileName: 'valora.pdf',
    baseFields,
    now: savedAt + 1_000,
  });

  assert.equal(recovered?.savedAt, savedAt);
  assert.equal(recovered?.fields[0].value, 'Valora da Aurora');
  assert.notEqual(recovered?.fields, editedFields);
});

test('descarta rascunhos de outro arquivo, outra base, vencidos ou malformados', () => {
  const savedAt = 1_700_000_000_000;
  const serialized = serializeCharacterSheetDraft({
    fileName: 'valora.pdf',
    baseFields,
    fields: baseFields,
    removedFields: [],
    savedAt,
  });
  const changedBase = baseFields.map((field) => ({ ...field }));
  changedBase[1].value = '19';

  assert.equal(recoverCharacterSheetDraft({
    serialized,
    fileName: 'outra.pdf',
    baseFields,
    now: savedAt,
  }), null);
  assert.equal(recoverCharacterSheetDraft({
    serialized,
    fileName: 'valora.pdf',
    baseFields: changedBase,
    now: savedAt,
  }), null);
  assert.equal(recoverCharacterSheetDraft({
    serialized,
    fileName: 'valora.pdf',
    baseFields,
    now: savedAt + CHARACTER_SHEET_DRAFT_MAX_AGE_MS + 1,
  }), null);
  assert.equal(recoverCharacterSheetDraft({
    serialized: '{inválido',
    fileName: 'valora.pdf',
    baseFields,
  }), null);
  assert.equal(recoverCharacterSheetDraft({
    serialized: 'x'.repeat(CHARACTER_SHEET_DRAFT_MAX_BYTES + 1),
    fileName: 'valora.pdf',
    baseFields,
  }), null);
});

test('isola a chave do rascunho por sala e usuário', () => {
  assert.equal(
    characterSheetDraftStorageKey(' sala-1 ', ' Jogador A '),
    'bossbar.character-sheet-draft.v1:SALA-1:jogador%20a',
  );
  assert.notEqual(
    characterSheetDraftStorageKey('SALA-1', 'Jogador A'),
    characterSheetDraftStorageKey('SALA-2', 'Jogador A'),
  );
  assert.notEqual(
    characterSheetDraftStorageKey('SALA-1', 'Jogador A'),
    characterSheetDraftStorageKey('SALA-1', 'Jogador B'),
  );
});
