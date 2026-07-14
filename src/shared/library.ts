import type { BossState } from './battle';

export type BossLibraryDraft = {
  bossId: string;
  bossName: string;
  amount: string;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  rangedAttack: number;
  defense: number;
  shield: number;
  skills: number;
  damageReduction: number;
  description: string;
  actionSeverity: 'normal' | 'grave';
};

export type BossLibraryEntrySummary = {
  id: string;
  isAutosave: boolean;
  bossName: string;
  amount: string;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  rangedAttack: number;
  defense: number;
  shield: number;
  skills: number;
  damageReduction: number;
  updatedAt: string;
};

export type BossLibrarySaveMode = 'prompt' | 'new' | 'overwrite';

export type BossLibrarySaveResult = {
  ok: boolean;
  entryId?: string;
  requiresOverwrite?: boolean;
  existingName?: string;
  error?: string;
};

export type BossLibraryDeleteResult = {
  ok: boolean;
  error?: string;
};

export type MissingLibraryFile = {
  key: string;
  kind: 'background' | 'music' | 'soundboard';
  label: string;
};

export type BossLibraryLoadResult = {
  ok: boolean;
  missingFiles?: MissingLibraryFile[];
  error?: string;
};

export type BossLibraryReplaceResult = {
  ok: boolean;
  canceled?: boolean;
  error?: string;
};

export type BossLibraryLoaded = {
  boss: BossState;
  amount: string;
};
