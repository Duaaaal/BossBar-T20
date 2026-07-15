import type { BossState } from './battle';
import type { ActiveBossStatus } from './status';

export type BossLibraryBossDraft = {
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
  turnCount: number;
  activeStatuses: ActiveBossStatus[];
};

export type BossLibraryDraft = {
  activeBossId: string;
  bosses: BossLibraryBossDraft[];
};

export type BossLibraryBossSummary = {
  bossName: string;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  rangedAttack: number;
  defense: number;
  shield: number;
  skills: number;
  damageReduction: number;
};

export type BossLibraryEntrySummary = {
  id: string;
  isAutosave: boolean;
  bosses: BossLibraryBossSummary[];
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
  bossCount: number;
};
