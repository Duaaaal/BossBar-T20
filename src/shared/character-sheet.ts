export const MAX_CHARACTER_SHEET_BYTES = 25 * 1024 * 1024;
export const BLANK_CHARACTER_SHEET_ASSET_PATH = 'ficha-t20-v2-editavel.pdf';

export type CharacterSheetIssueSeverity = 'error' | 'warning';

export type CharacterSheetIssue = {
  id: string;
  severity: CharacterSheetIssueSeverity;
  field: string | null;
  message: string;
  expected?: string;
  actual?: string;
  autoFixable: boolean;
};

export type CharacterSheetSummary = {
  characterName: string;
  playerName: string;
  race: string;
  origin: string;
  characterClass: string;
  level: number | null;
  currentHealth: number | null;
  maxHealth: number | null;
  currentMana: number | null;
  maxMana: number | null;
  defense: number | null;
  attributes: Record<'for' | 'des' | 'con' | 'int' | 'sab' | 'car', number | null>;
  defenses: {
    melee: number | null;
    ranged: number | null;
    calculation: string;
  };
  skills: Array<{
    id: string;
    name: string;
    total: number | null;
    trained: boolean;
    attribute: string;
    attributeValue: number;
    halfLevel: number;
    trainingBonus: number;
    otherBonus: number;
    armorPenalty: number;
    sizeModifier: number;
    calculation: string;
  }>;
  attacks: Array<{
    name: string;
    attackBonus: string;
    damage: string;
    critical: string;
    damageType: string;
    range: string;
  }>;
  movement: string;
  size: string;
  currentLoad: number | null;
  maxLoad: number | null;
};

export type CharacterSheetValidation = {
  supported: boolean;
  template: 'ficha-t20-editavel-v2' | 'unknown';
  summary: CharacterSheetSummary;
  issues: CharacterSheetIssue[];
  fieldCount: number;
  checkedAt: number;
};

export type PlayerCharacterSheetStatus = {
  hasSheet: boolean;
  fileName: string | null;
  uploadedAt: number | null;
  validation: CharacterSheetValidation | null;
};

export type PlayerAccountStatus = {
  exists: boolean;
  username: string;
};

export type PlayerAuthenticationRequest = {
  username: string;
  password: string;
  createAccount: boolean;
  clientId: string;
};

export type PlayerAuthenticationResult = {
  ok: boolean;
  username?: string;
  sessionToken?: string;
  sheet?: PlayerCharacterSheetStatus;
  notes?: string;
  error?: string;
};

export type CharacterSheetUploadResult = {
  ok: boolean;
  sheet?: PlayerCharacterSheetStatus;
  corrected?: boolean;
  error?: string;
};

export type HostedPlayerPasswordResetResult = {
  ok: boolean;
  error?: string;
};

export type PlayerProfileDeleteResult = {
  ok: boolean;
  error?: string;
};

export type PlayerProfileSummary = {
  id: string;
  username: string;
  updatedAt: number;
  sheet: Pick<PlayerCharacterSheetStatus, 'hasSheet' | 'fileName' | 'uploadedAt'>;
};

export type NotesSaveResult = {
  ok: boolean;
  content?: string;
  error?: string;
};
