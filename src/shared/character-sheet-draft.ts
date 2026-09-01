import type { CharacterSheetEditorField } from './character-sheet';

export const CHARACTER_SHEET_DRAFT_VERSION = 1;
export const CHARACTER_SHEET_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
export const CHARACTER_SHEET_DRAFT_MAX_BYTES = 512 * 1_024;

type StoredCharacterSheetDraft = {
  version: typeof CHARACTER_SHEET_DRAFT_VERSION;
  fileName: string;
  baseFingerprint: string;
  savedAt: number;
  fields: CharacterSheetEditorField[];
  removedFields: CharacterSheetEditorField[];
};

export type RecoveredCharacterSheetDraft = Pick<
  StoredCharacterSheetDraft,
  'savedAt' | 'fields' | 'removedFields'
>;

const boundedString = (value: unknown, maximum: number) =>
  typeof value === 'string' && value.length <= maximum ? value : null;

const normalizeField = (value: unknown): CharacterSheetEditorField | null => {
  if (!value || typeof value !== 'object') return null;
  const field = value as Partial<CharacterSheetEditorField>;
  const name = boundedString(field.name, 180);
  const label = boundedString(field.label, 180);
  const section = boundedString(field.section, 100);
  const group = field.group === undefined
    ? undefined
    : boundedString(field.group, 120);
  const fieldValue = boundedString(field.value, 10_000);
  if (
    !name ||
    label === null ||
    section === null ||
    group === null ||
    fieldValue === null ||
    !['text', 'checkbox', 'choice'].includes(field.kind ?? '')
  ) return null;
  const options = field.options === undefined
    ? undefined
    : Array.isArray(field.options) && field.options.length <= 100
      ? field.options.map((option) => boundedString(option, 180))
      : null;
  if (options?.some((option) => option === null) || options === null) return null;
  const validation = field.validation;
  if (
    validation !== undefined &&
    (
      !validation ||
      !['integer', 'decimal', 'formula', 'text'].includes(validation.kind) ||
      (validation.min !== undefined && !Number.isFinite(validation.min)) ||
      (validation.max !== undefined && !Number.isFinite(validation.max)) ||
      (validation.maxLength !== undefined && (
        !Number.isInteger(validation.maxLength) ||
        validation.maxLength < 0 ||
        validation.maxLength > 10_000
      ))
    )
  ) return null;
  return {
    name,
    label: label ?? '',
    section: section ?? '',
    ...(group === undefined ? {} : { group }),
    kind: field.kind as CharacterSheetEditorField['kind'],
    value: fieldValue,
    ...(options === undefined ? {} : { options: options as string[] }),
    ...(validation === undefined ? {} : { validation: { ...validation } }),
  };
};

const normalizeFieldList = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 600) return null;
  const fields = value.map(normalizeField);
  if (fields.some((field) => field === null)) return null;
  const names = new Set<string>();
  for (const field of fields as CharacterSheetEditorField[]) {
    if (names.has(field.name)) return null;
    names.add(field.name);
  }
  return fields as CharacterSheetEditorField[];
};

export const characterSheetFieldsFingerprint = (
  fields: readonly CharacterSheetEditorField[],
) => {
  const canonical = fields
    .map(({ name, value, kind, section, group }) =>
      `${name}\u001f${value}\u001f${kind}\u001f${section}\u001f${group ?? ''}`)
    .sort()
    .join('\u001e');
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const characterSheetDraftStorageKey = (
  roomCode: string,
  username: string,
) => `bossbar.character-sheet-draft.v1:${encodeURIComponent(
  roomCode.trim().toUpperCase(),
)}:${encodeURIComponent(username.trim().toLocaleLowerCase('pt-BR'))}`;

export const characterSheetDraftByteLength = (value: string) =>
  new TextEncoder().encode(value).byteLength;

export const serializeCharacterSheetDraft = ({
  fileName,
  baseFields,
  fields,
  removedFields,
  savedAt = Date.now(),
}: {
  fileName: string;
  baseFields: readonly CharacterSheetEditorField[];
  fields: readonly CharacterSheetEditorField[];
  removedFields: readonly CharacterSheetEditorField[];
  savedAt?: number;
}) => JSON.stringify({
  version: CHARACTER_SHEET_DRAFT_VERSION,
  fileName,
  baseFingerprint: characterSheetFieldsFingerprint(baseFields),
  savedAt,
  fields: [...fields],
  removedFields: [...removedFields],
} satisfies StoredCharacterSheetDraft);

export const recoverCharacterSheetDraft = ({
  serialized,
  fileName,
  baseFields,
  now = Date.now(),
}: {
  serialized: string | null;
  fileName: string;
  baseFields: readonly CharacterSheetEditorField[];
  now?: number;
}): RecoveredCharacterSheetDraft | null => {
  if (
    !serialized ||
    characterSheetDraftByteLength(serialized) > CHARACTER_SHEET_DRAFT_MAX_BYTES
  ) return null;
  let parsed: Partial<StoredCharacterSheetDraft>;
  try {
    parsed = JSON.parse(serialized) as Partial<StoredCharacterSheetDraft>;
  } catch {
    return null;
  }
  if (
    parsed.version !== CHARACTER_SHEET_DRAFT_VERSION ||
    parsed.fileName !== fileName ||
    parsed.baseFingerprint !== characterSheetFieldsFingerprint(baseFields) ||
    !Number.isFinite(parsed.savedAt) ||
    (parsed.savedAt ?? 0) > now + 60_000 ||
    now - (parsed.savedAt ?? 0) > CHARACTER_SHEET_DRAFT_MAX_AGE_MS
  ) return null;
  const fields = normalizeFieldList(parsed.fields);
  const removedFields = normalizeFieldList(parsed.removedFields);
  if (!fields || !removedFields) return null;
  return { savedAt: parsed.savedAt as number, fields, removedFields };
};
