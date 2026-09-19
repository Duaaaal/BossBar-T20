import { T20_CATALOG } from './rules-catalog.ts';

export type ReferenceVariantDraft = { referenceId: string; sourceId: string; revision: string; page: number; description: string };
export type ReferenceVariant = ReferenceVariantDraft & { id: string; status: 'approved' | 'pending' | 'rejected'; proposedBy?: string; createdAt: number; reviewedAt?: number };
export type ReferenceVariantsResult = { ok: boolean; variants?: ReferenceVariant[]; error?: string };
export const isReferenceVariantDraft = (value: unknown): value is ReferenceVariantDraft => {
  if (!value || typeof value !== 'object') return false;
  const draft = value as ReferenceVariantDraft;
  return [...T20_CATALOG.spells, ...T20_CATALOG.abilities].some(({ id }) => id === draft.referenceId) &&
    T20_CATALOG.sources.some(({ id }) => id === draft.sourceId) &&
    typeof draft.revision === 'string' && draft.revision.trim().length > 0 && draft.revision.length <= 80 &&
    Number.isInteger(draft.page) && draft.page >= 1 && draft.page <= 10000 &&
    typeof draft.description === 'string' && draft.description.trim().length > 0 && draft.description.length <= 50000;
};
