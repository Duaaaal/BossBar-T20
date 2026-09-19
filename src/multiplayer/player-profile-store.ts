import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  randomInt,
} from 'node:crypto';
import { readFile, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CharacterSheetValidation,
  PlayerCharacterSheetStatus,
  PlayerCharacterPortraitStatus,
  PlayerProfileSummary,
  PlayerCharacterSelection,
} from '../shared/character-sheet.ts';
import { readCharacterSheetEditorFields } from './character-sheet-pdf.ts';
import { reviewableSheetIssues } from './sheet-warning-review.ts';
import { normalizePlayerName } from './session-roster.ts';
import { rollAttribute, type AttributeCode, type AttributeRolls } from '../shared/character-attributes.ts';
import { SHEET_MODEL_VERSION, SHEET_RULES_VERSION } from './character-sheet-model.ts';

type SheetMigration = (bytes: Uint8Array) => Promise<{ bytes: Uint8Array; validation: CharacterSheetValidation; converted: boolean }>;

const STORE_VERSION = 2;
const PASSWORD_KEY_BYTES = 32;

type StoredSheet = {
  fileName: string;
  relativePath: string;
  uploadedAt: number;
  validation: CharacterSheetValidation;
};

type StoredPortrait = {
  fileName: string;
  relativePath: string;
  uploadedAt: number;
  contentType: 'image/png' | 'image/jpeg' | 'image/webp';
};

type StoredCharacter = {
  id: string;
  sheet: StoredSheet | null;
  portrait: StoredPortrait | null;
  dismissedWarnings: Record<string, string>;
  attributeRolls?: AttributeRolls;
};

type StoredPlayerProfile = {
  activeCharacterId: string;
  characters: StoredCharacter[];
  id: string;
  username: string;
  normalizedUsername: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  notes: string;
  sheet: StoredSheet | null;
  portrait?: StoredPortrait | null;
};

type StoredPlayerProfiles = {
  version: typeof STORE_VERSION;
  profiles: StoredPlayerProfile[];
};

export type PublicPlayerProfile = PlayerCharacterSelection & {
  id: string;
  username: string;
  notes: string;
  sheet: PlayerCharacterSheetStatus;
  portrait: PlayerCharacterPortraitStatus;
};

const normalizeUsername = (value: string) =>
  normalizePlayerName(value).normalize('NFKC').toLocaleLowerCase('pt-BR');

const validateUsername = (value: string) => {
  const username = normalizePlayerName(value);
  if (username.length < 1 || username.length > 40) {
    throw new Error('O usuário deve ter entre 1 e 40 caracteres.');
  }
  if (/\p{C}/u.test(username)) {
    throw new Error('O usuário contém caracteres de controle inválidos.');
  }
  return { username, normalizedUsername: normalizeUsername(username) };
};

const validatePassword = (password: string) => {
  if (password.length < 3 || password.length > 128) {
    throw new Error('A senha deve ter entre 3 e 128 caracteres.');
  }
};

const hashPassword = (password: string, salt: Buffer) => new Promise<Buffer>(
  (resolve, reject) => scryptCallback(
    password,
    salt,
    PASSWORD_KEY_BYTES,
    (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    },
  ),
);

const publicSheet = (sheet: StoredSheet | null): PlayerCharacterSheetStatus => ({
  hasSheet: Boolean(sheet),
  fileName: sheet?.fileName ?? null,
  uploadedAt: sheet?.uploadedAt ?? null,
  validation: sheet?.validation ?? null,
});

const publicPortrait = (
  portrait: StoredPortrait | null | undefined,
): PlayerCharacterPortraitStatus => ({
  hasPortrait: Boolean(portrait),
  fileName: portrait?.fileName ?? null,
  uploadedAt: portrait?.uploadedAt ?? null,
  contentType: portrait?.contentType ?? null,
});

const publicProfile = (profile: StoredPlayerProfile): PublicPlayerProfile => ({
  activeCharacterId: profile.activeCharacterId,
  characters: profile.characters.map((character) => ({ id: character.id, sheet: publicSheet(character.sheet), portrait: publicPortrait(character.portrait) })),
  id: profile.id,
  username: profile.username,
  notes: profile.notes,
  sheet: publicSheet(profile.sheet),
  portrait: publicPortrait(profile.portrait),
});

// Legacy callers operate on the active character. Persist only the three slots,
// never a second copy of the active sheet or portrait.
const attachCharacters = (profile: StoredPlayerProfile) => {
  const legacySheet = profile.sheet; const legacyPortrait = profile.portrait;
  if (!Array.isArray(profile.characters) || profile.characters.length !== 3) {
    profile.characters = Array.from({ length: 3 }, (_, index) => ({
      id: randomUUID(), sheet: index === 0 ? legacySheet ?? null : null,
      portrait: index === 0 ? legacyPortrait ?? null : null, dismissedWarnings: {},
    }));
  }
  if (!profile.characters.some(({ id }) => id === profile.activeCharacterId)) profile.activeCharacterId = profile.characters[0].id;
  for (const character of profile.characters) character.dismissedWarnings ??= {};
  for (const key of ['sheet', 'portrait'] as const) Object.defineProperty(profile, key, {
    configurable: true, enumerable: false,
    get: () => profile.characters.find(({ id }) => id === profile.activeCharacterId)![key],
    set: (value: StoredSheet | StoredPortrait | null) => { Object.assign(profile.characters.find(({ id }) => id === profile.activeCharacterId)!, { [key]: value }); },
  });
  return profile;
};

export class PlayerProfileStore {
  private readonly rootDirectory: string;

  private readonly storePath: string;

  private profiles = new Map<string, StoredPlayerProfile>();

  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(rootDirectory: string) {
    this.rootDirectory = rootDirectory;
    this.storePath = path.join(rootDirectory, 'profiles.json');
  }

  static async open(rootDirectory: string, migrateSheet?: SheetMigration) {
    const store = new PlayerProfileStore(rootDirectory);
    await store.load();
    if (migrateSheet) await store.migrateSheets(migrateSheet);
    return store;
  }

  /** Publish a new file only after preserving the original bytes and metadata.
   * A failed migration affects one sheet and never removes its previous file. */
  async migrateSheets(migrateSheet: SheetMigration) {
    let changed = false;
    for (const profile of this.profiles.values()) for (const character of profile.characters) {
      const previous = character.sheet;
      if (!previous || (previous.validation?.template === 'ficha-nimb-v3' && previous.validation.modelVersion === SHEET_MODEL_VERSION && previous.validation.rulesVersion === SHEET_RULES_VERSION)) continue;
      try {
        const sheet = await this.readSheet(profile.id, character.id);
        if (!sheet) continue;
        const migrated = await migrateSheet(sheet.bytes);
        const fingerprint = createHash('sha256').update(sheet.bytes).digest('hex');
        const directory = path.dirname(sheet.filePath);
        const backup = path.join(directory, `sheet-before-model-${SHEET_MODEL_VERSION}-${fingerprint.slice(0, 16)}`);
        for (const [file, contents] of [[`${backup}.pdf`, sheet.bytes], [`${backup}.json`, Buffer.from(JSON.stringify(previous, null, 2))]] as const) {
          await writeFile(file, contents, { flag: 'wx' }).catch(async (error: NodeJS.ErrnoException) => {
            if (error.code !== 'EEXIST') throw error;
            if (file.endsWith('.pdf') && !(await readFile(file)).equals(sheet.bytes)) throw new Error('A cópia anterior não corresponde à ficha.');
          });
        }
        const destination = path.join(directory, `character-sheet-model-${SHEET_MODEL_VERSION}-${fingerprint.slice(0, 16)}.pdf`);
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, migrated.bytes, { flag: 'wx' });
          await rename(temporary, destination);
        } catch (error) {
          await unlink(temporary).catch(() => undefined);
          throw error;
        }
        character.sheet = { ...previous, relativePath: path.relative(this.rootDirectory, destination), validation: migrated.validation };
        profile.updatedAt = Date.now();
        changed = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Houve um erro inesperado durante a migração.';
        previous.validation = { ...previous.validation, issues: [
          ...(previous.validation?.issues ?? []).filter(({ id }) => id !== 'migration:failed'),
          { id: 'migration:failed', severity: 'warning', field: null, autoFixable: false,
            message: `A ficha anterior foi preservada. A atualização automática não foi concluída: ${reason}`,
            reason, location: 'Ajustar ficha', correction: 'Revise a ficha manualmente. Se a correção não resolver, recrie a ficha usando o modelo vazio do Nimb.' },
        ] };
        changed = true;
      }
    }
    if (changed) await this.save();
  }

  accountStatus(usernameInput: string) {
    const { username, normalizedUsername } = validateUsername(usernameInput);
    return {
      exists: this.profiles.has(normalizedUsername),
      username: this.profiles.get(normalizedUsername)?.username ?? username,
    };
  }

  async register(usernameInput: string, password: string) {
    validatePassword(password);
    const { username, normalizedUsername } = validateUsername(usernameInput);
    if (this.profiles.has(normalizedUsername)) {
      throw new Error('Este usuário já existe. Informe a senha para entrar.');
    }
    const salt = randomBytes(16);
    const now = Date.now();
    const profile = attachCharacters({
      activeCharacterId: '', characters: [],
      id: randomUUID(),
      username,
      normalizedUsername,
      passwordSalt: salt.toString('base64'),
      passwordHash: (await hashPassword(password, salt)).toString('base64'),
      createdAt: now,
      updatedAt: now,
      notes: '',
      sheet: null,
      portrait: null,
    });
    this.profiles.set(normalizedUsername, profile);
    await this.save();
    return publicProfile(profile);
  }

  async authenticate(usernameInput: string, password: string) {
    validatePassword(password);
    const { normalizedUsername } = validateUsername(usernameInput);
    const profile = this.profiles.get(normalizedUsername);
    if (!profile) throw new Error('Usuário ou senha incorretos.');
    const actual = await hashPassword(password, Buffer.from(profile.passwordSalt, 'base64'));
    const expected = Buffer.from(profile.passwordHash, 'base64');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new Error('Usuário ou senha incorretos.');
    }
    return publicProfile(profile);
  }

  profileById(id: string) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === id);
    return profile ? publicProfile(profile) : null;
  }

  profileByUsername(usernameInput: string) {
    const profile = this.profiles.get(normalizeUsername(usernameInput));
    return profile ? publicProfile(profile) : null;
  }

  listProfiles(): PlayerProfileSummary[] {
    return [...this.profiles.values()]
      .map((profile) => ({
        id: profile.id,
        username: profile.username,
        updatedAt: profile.updatedAt,
        sheet: {
          hasSheet: Boolean(profile.sheet),
          fileName: profile.sheet?.fileName ?? null,
          uploadedAt: profile.sheet?.uploadedAt ?? null,
        },
        portrait: publicPortrait(profile.portrait),
      }))
      .sort((left, right) => left.username.localeCompare(right.username, 'pt-BR'));
  }

  private storedProfile(profileId: string) {
    const profile = [...this.profiles.values()].find(({ id }) => id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    return profile;
  }

  private character(profileId: string, characterId?: string) {
    const profile = this.storedProfile(profileId);
    const character = profile.characters.find(({ id }) => id === (characterId ?? profile.activeCharacterId));
    if (!character) throw new Error('Esta ficha não pertence ao seu acesso.');
    return character;
  }

  async selectCharacter(profileId: string, characterId: string) {
    this.character(profileId, characterId);
    const profile = this.storedProfile(profileId);
    profile.activeCharacterId = characterId;
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  getAttributeRolls(profileId: string): AttributeRolls | null {
    const state = this.character(profileId).attributeRolls;
    return state ? structuredClone(state) : null;
  }

  async updateAttributeRolls(profileId: string, attribute?: AttributeCode, generation?: string, reset = false) {
    const character = this.character(profileId);
    let state = this.getAttributeRolls(profileId);
    if (reset || !state) state = { generation: randomUUID(), results: {} };
    if (attribute) {
      if (generation !== state.generation) throw new Error('A distribuição foi reiniciada em outra janela. Reabra os atributos antes de rolar.');
      rollAttribute(state, attribute, () => randomInt(1, 7));
    }
    character.attributeRolls = state;
    await this.save();
    return structuredClone(state);
  }

  getDismissedWarnings(profileId: string) {
    return { ...this.character(profileId).dismissedWarnings };
  }

  async setDismissedWarnings(profileId: string, dismissed: Record<string, string>) {
    this.character(profileId).dismissedWarnings = { ...dismissed };
    await this.save();
  }

  async resetPassword(profileId: string, password: string) {
    validatePassword(password);
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    const salt = randomBytes(16);
    profile.passwordSalt = salt.toString('base64');
    profile.passwordHash = (await hashPassword(password, salt)).toString('base64');
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  async deleteProfile(profileId: string) {
    const profile = [...this.profiles.values()].find(
      (candidate) => candidate.id === profileId,
    );
    if (!profile) throw new Error('O jogador não foi encontrado.');
    this.profiles.delete(profile.normalizedUsername);
    await this.save();
    await rm(path.join(this.rootDirectory, profile.id), {
      force: true,
      recursive: true,
    });
  }

  async saveNotes(profileId: string, content: string) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    if (content.length > 100_000) throw new Error('O bloco de notas excede 100.000 caracteres.');
    profile.notes = content;
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  async saveSheet(
    profileId: string,
    fileName: string,
    bytes: Uint8Array,
    validation: CharacterSheetValidation,
  ) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    const character = this.character(profileId);
    const profileDirectory = path.join(this.rootDirectory, profile.id, character.id);
    const destination = path.join(profileDirectory, 'character-sheet.pdf');
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(profileDirectory, { recursive: true });
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, destination);
    character.sheet = {
      fileName: path.basename(fileName).slice(0, 180) || 'ficha-t20.pdf',
      relativePath: path.relative(this.rootDirectory, destination),
      uploadedAt: Date.now(),
      validation,
    };
    const currentIssues = Object.keys(character.dismissedWarnings).length ? reviewableSheetIssues(validation.issues, await readCharacterSheetEditorFields(bytes)) : [];
    character.dismissedWarnings = Object.fromEntries(Object.entries(character.dismissedWarnings).filter(([id, fingerprint]) => currentIssues.some((issue) => issue.id === id && issue.fingerprint === fingerprint)));
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  async readSheet(profileId: string, characterId?: string) {
    if (!this.profileById(profileId)) return null;
    const profile = this.character(profileId, characterId);
    if (!profile?.sheet) return null;
    const filePath = path.resolve(this.rootDirectory, profile.sheet.relativePath);
    const root = `${path.resolve(this.rootDirectory)}${path.sep}`;
    if (!filePath.startsWith(root)) throw new Error('O caminho da ficha é inválido.');
    return {
      bytes: await readFile(filePath),
      filePath,
      fileName: profile.sheet.fileName,
      validation: profile.sheet.validation,
    };
  }

  async removeSheet(profileId: string) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    const sheet = profile.sheet;
    if (sheet) {
      const filePath = path.resolve(this.rootDirectory, sheet.relativePath);
      const root = `${path.resolve(this.rootDirectory)}${path.sep}`;
      if (!filePath.startsWith(root)) throw new Error('O caminho da ficha é inválido.');
      await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    profile.sheet = null;
    this.character(profileId).dismissedWarnings = {};
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  async savePortrait(
    profileId: string,
    fileName: string,
    bytes: Uint8Array,
    contentType: StoredPortrait['contentType'],
  ) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    const extension = contentType === 'image/png'
      ? '.png'
      : contentType === 'image/webp' ? '.webp' : '.jpg';
    const character = this.character(profileId);
    const profileDirectory = path.join(this.rootDirectory, profile.id, character.id);
    const destination = path.join(profileDirectory, `portrait${extension}`);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(profileDirectory, { recursive: true });
    await writeFile(temporary, bytes, { flag: 'wx' });
    const previousPath = profile.portrait
      ? path.resolve(this.rootDirectory, profile.portrait.relativePath)
      : null;
    const backup = previousPath === destination
      ? `${destination}.${randomUUID()}.previous`
      : null;
    try {
      if (backup) {
        await rename(destination, backup).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
      }
      await rename(temporary, destination);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      if (backup) {
        await rename(backup, destination).catch(() => undefined);
      }
      throw error;
    }
    if (backup) await unlink(backup).catch(() => undefined);
    if (previousPath && previousPath !== destination) {
      await unlink(previousPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    character.portrait = {
      fileName: path.basename(fileName).slice(0, 180) || `retrato${extension}`,
      relativePath: path.relative(this.rootDirectory, destination),
      uploadedAt: Date.now(),
      contentType,
    };
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  async readPortrait(profileId: string, characterId?: string) {
    if (!this.profileById(profileId)) return null;
    const profile = this.character(profileId, characterId);
    if (!profile?.portrait) return null;
    const filePath = path.resolve(this.rootDirectory, profile.portrait.relativePath);
    const root = `${path.resolve(this.rootDirectory)}${path.sep}`;
    if (!filePath.startsWith(root)) throw new Error('O caminho do retrato é inválido.');
    return {
      bytes: await readFile(filePath),
      ...profile.portrait,
    };
  }

  async removePortrait(profileId: string) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error('O jogador não foi encontrado.');
    if (profile.portrait) {
      const filePath = path.resolve(this.rootDirectory, profile.portrait.relativePath);
      const root = `${path.resolve(this.rootDirectory)}${path.sep}`;
      if (!filePath.startsWith(root)) throw new Error('O caminho do retrato é inválido.');
      await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    profile.portrait = null;
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  private async load() {
    await mkdir(this.rootDirectory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.storePath, 'utf8')) as StoredPlayerProfiles;
      if (![1, STORE_VERSION].includes(parsed.version) || !Array.isArray(parsed.profiles)) return;
      for (const profile of parsed.profiles) {
        if (
          typeof profile.id === 'string' &&
          typeof profile.username === 'string' &&
          typeof profile.normalizedUsername === 'string' &&
          typeof profile.passwordSalt === 'string' &&
          typeof profile.passwordHash === 'string'
        ) this.profiles.set(profile.normalizedUsername, attachCharacters(profile));
      }
      if (parsed.version !== STORE_VERSION) await this.save();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private save() {
    const data: StoredPlayerProfiles = {
      version: STORE_VERSION,
      profiles: [...this.profiles.values()],
    };
    const serialized = JSON.stringify(data, null, 2);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      const temporary = `${this.storePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, serialized, 'utf8');
      await rename(temporary, this.storePath);
    });
    return this.writeQueue;
  }
}
