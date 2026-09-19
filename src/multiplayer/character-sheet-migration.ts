import type { MultiplayerEncounterCheckpoint } from '../shared/encounter-checkpoint.ts';
import { migrateCharacterSheetPdf } from './character-sheet-pdf.ts';
import { SHEET_MODEL_VERSION, SHEET_RULES_VERSION } from './character-sheet-model.ts';

/** Saved encounters own their sheets. Never replace one with the player's
 * current profile sheet, which may describe a different character or level. */
export const migrateEncounterCharacterSheets = async (
  checkpoint: MultiplayerEncounterCheckpoint, blankNimb: Uint8Array,
) => {
  const migrated = structuredClone(checkpoint);
  for (const player of [...migrated.players, ...(migrated.inactiveCharacters ?? []).map(([, character]) => character)]) {
    const original = player.sheetDocument;
    if (!original || (player.validation?.template === 'ficha-nimb-v3' &&
      player.validation.modelVersion === SHEET_MODEL_VERSION && player.validation.rulesVersion === SHEET_RULES_VERSION)) continue;
    try {
      const result = await migrateCharacterSheetPdf(Buffer.from(original.base64, 'base64'), blankNimb);
      player.sheetDocument = {
        fileName: original.fileName, base64: Buffer.from(result.bytes).toString('base64'),
        beforeModel3: original.beforeModel3 ?? { fileName: original.fileName, base64: original.base64 },
      };
      player.validation = result.validation;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Houve um erro inesperado durante a migração.';
      player.sheetDocument = { ...original, migrationError: reason };
      if (player.validation) player.validation.issues = [
        ...player.validation.issues.filter(({ id }) => id !== 'migration:encounter'),
        { id: 'migration:encounter', field: null, severity: 'warning', autoFixable: false,
          message: `A ficha deste encontro foi preservada. Não foi possível atualizá-la: ${reason}`,
          reason, location: 'Ajustar ficha', correction: 'Revise os dados. Se o erro persistir, recrie a ficha usando o modelo vazio de Nimb.' },
      ];
    }
  }
  return migrated;
};
