import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { readFile, mkdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  CharacterSheetValidation,
  PlayerCharacterSheetStatus,
  PlayerProfileSummary,
} from '../shared/character-sheet.ts';
import { normalizePlayerName } from './session-roster.ts';

const STORE_VERSION = 1;
const PASSWORD_KEY_BYTES = 32;

type StoredSheet = {
  fileName: string;
  relativePath: string;
  uploadedAt: number;
  validation: CharacterSheetValidation;
};

type StoredPlayerProfile = {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordSalt: string;
  passwordHash: string;
  createdAt: number;
  updatedAt: number;
  notes: string;
  sheet: StoredSheet | null;
};

type StoredPlayerProfiles = {
  version: typeof STORE_VERSION;
  profiles: StoredPlayerProfile[];
};

export type PublicPlayerProfile = {
  id: string;
  username: string;
  notes: string;
  sheet: PlayerCharacterSheetStatus;
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

const publicProfile = (profile: StoredPlayerProfile): PublicPlayerProfile => ({
  id: profile.id,
  username: profile.username,
  notes: profile.notes,
  sheet: publicSheet(profile.sheet),
});

export class PlayerProfileStore {
  private readonly rootDirectory: string;

  private readonly storePath: string;

  private profiles = new Map<string, StoredPlayerProfile>();

  private writeQueue: Promise<void> = Promise.resolve();

  private constructor(rootDirectory: string) {
    this.rootDirectory = rootDirectory;
    this.storePath = path.join(rootDirectory, 'profiles.json');
  }

  static async open(rootDirectory: string) {
    const store = new PlayerProfileStore(rootDirectory);
    await store.load();
    return store;
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
    const profile: StoredPlayerProfile = {
      id: randomUUID(),
      username,
      normalizedUsername,
      passwordSalt: salt.toString('base64'),
      passwordHash: (await hashPassword(password, salt)).toString('base64'),
      createdAt: now,
      updatedAt: now,
      notes: '',
      sheet: null,
    };
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
      }))
      .sort((left, right) => left.username.localeCompare(right.username, 'pt-BR'));
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
    const profileDirectory = path.join(this.rootDirectory, profile.id);
    const destination = path.join(profileDirectory, 'character-sheet.pdf');
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(profileDirectory, { recursive: true });
    await writeFile(temporary, bytes, { flag: 'wx' });
    await rename(temporary, destination);
    profile.sheet = {
      fileName: path.basename(fileName).slice(0, 180) || 'ficha-t20.pdf',
      relativePath: path.relative(this.rootDirectory, destination),
      uploadedAt: Date.now(),
      validation,
    };
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  async readSheet(profileId: string) {
    const profile = [...this.profiles.values()].find((candidate) => candidate.id === profileId);
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
    profile.updatedAt = Date.now();
    await this.save();
    return publicProfile(profile);
  }

  private async load() {
    await mkdir(this.rootDirectory, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.storePath, 'utf8')) as StoredPlayerProfiles;
      if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.profiles)) return;
      for (const profile of parsed.profiles) {
        if (
          typeof profile.id === 'string' &&
          typeof profile.username === 'string' &&
          typeof profile.normalizedUsername === 'string' &&
          typeof profile.passwordSalt === 'string' &&
          typeof profile.passwordHash === 'string'
        ) this.profiles.set(profile.normalizedUsername, profile);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private save() {
    const data: StoredPlayerProfiles = {
      version: STORE_VERSION,
      profiles: [...this.profiles.values()],
    };
    this.writeQueue = this.writeQueue.then(async () => {
      const temporary = `${this.storePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8');
      await rename(temporary, this.storePath);
    });
    return this.writeQueue;
  }
}
