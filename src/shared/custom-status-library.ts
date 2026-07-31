import { isStatusId, type StatusId } from './status.ts';

export const CUSTOM_STATUS_AFFECTED_TARGETS = [
  'none',
  'currentHealth',
  'maxHealth',
  'attack',
  'rangedAttack',
  'skills',
  'meleeDefense',
  'rangedDefense',
  'damageReduction',
  'shield',
] as const;

export type CustomStatusAffectedTarget =
  (typeof CUSTOM_STATUS_AFFECTED_TARGETS)[number];

export const CUSTOM_STATUS_AFFECTED_TARGET_LABELS: Readonly<
  Record<CustomStatusAffectedTarget, string>
> = Object.freeze({
  none: 'Nenhum valor da ficha',
  currentHealth: 'Vida atual',
  maxHealth: 'Vida máxima',
  attack: 'Luta',
  rangedAttack: 'Pontaria',
  skills: 'Perícias',
  meleeDefense: 'Defesa corpo a corpo',
  rangedDefense: 'Defesa contra ataques à distância',
  damageReduction: 'Redução de dano (RD)',
  shield: 'Escudo',
});

export type CustomStatusInflictedStatusId = Exclude<StatusId, 'coringa'>;

export type CustomStatusPresetDraft = Readonly<{
  name: string;
  description: string;
  inflictedStatusId: CustomStatusInflictedStatusId | null;
  affectedTarget: CustomStatusAffectedTarget;
}>;

export type CustomStatusPreset = CustomStatusPresetDraft & Readonly<{
  id: string;
  createdAt: string;
  updatedAt: string;
}>;

export type CustomStatusLibraryMutationResult = Readonly<{
  ok: boolean;
  preset?: CustomStatusPreset;
  error?: string;
}>;

const MAX_PRESETS = 100;
const PRESET_ID_PATTERN = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const affectedTargets = new Set<string>(CUSTOM_STATUS_AFFECTED_TARGETS);

export const isCustomStatusAffectedTarget = (
  value: unknown,
): value is CustomStatusAffectedTarget =>
  typeof value === 'string' && affectedTargets.has(value);

export const isCustomStatusPresetId = (value: unknown): value is string =>
  typeof value === 'string' && PRESET_ID_PATTERN.test(value);

export const isCustomStatusInflictedStatusId = (
  value: unknown,
): value is CustomStatusInflictedStatusId =>
  isStatusId(value) && value !== 'coringa';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

const cleanText = (value: unknown, maximumLength: number) =>
  typeof value === 'string'
    ? value.trim().slice(0, maximumLength)
    : '';

export const normalizeCustomStatusPresetDraft = (
  value: unknown,
): CustomStatusPresetDraft | null => {
  if (!isRecord(value)) return null;
  const name = cleanText(value.name, 60);
  const description = cleanText(value.description, 300);
  const inflictedStatusId = value.inflictedStatusId === null ||
    value.inflictedStatusId === undefined ||
    value.inflictedStatusId === ''
    ? null
    : isCustomStatusInflictedStatusId(value.inflictedStatusId)
      ? value.inflictedStatusId
      : undefined;
  const affectedTarget = isCustomStatusAffectedTarget(value.affectedTarget)
    ? value.affectedTarget
    : null;

  if (
    !name ||
    !description ||
    inflictedStatusId === undefined ||
    affectedTarget === null
  ) return null;

  return {
    name,
    description,
    inflictedStatusId,
    affectedTarget,
  };
};

export const normalizeCustomStatusPreset = (
  value: unknown,
): CustomStatusPreset | null => {
  if (!isRecord(value)) return null;
  const draft = normalizeCustomStatusPresetDraft(value);
  const id = cleanText(value.id, 36);
  const createdAt = cleanText(value.createdAt, 40);
  const updatedAt = cleanText(value.updatedAt, 40);
  if (
    !draft ||
    !isCustomStatusPresetId(id) ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !Number.isFinite(Date.parse(updatedAt))
  ) return null;
  return { id, ...draft, createdAt, updatedAt };
};

export const normalizeCustomStatusLibrary = (
  value: unknown,
): CustomStatusPreset[] => {
  if (!Array.isArray(value)) return [];
  const presets = new Map<string, CustomStatusPreset>();
  for (const candidate of value.slice(0, MAX_PRESETS * 2)) {
    const preset = normalizeCustomStatusPreset(candidate);
    if (preset) presets.set(preset.id, preset);
    if (presets.size >= MAX_PRESETS) break;
  }
  return [...presets.values()].sort((left, right) =>
    left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' }) ||
    left.id.localeCompare(right.id)
  );
};

export const customStatusLibraryHasCapacity = (
  presets: readonly CustomStatusPreset[],
) => presets.length < MAX_PRESETS;
