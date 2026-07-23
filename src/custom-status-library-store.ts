import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  customStatusLibraryHasCapacity,
  isCustomStatusPresetId,
  normalizeCustomStatusLibrary,
  normalizeCustomStatusPresetDraft,
  type CustomStatusPreset,
} from './shared/custom-status-library.ts';

type StoredCustomStatusLibrary = Readonly<{
  schemaVersion: 1;
  presets: readonly CustomStatusPreset[];
}>;

const isMissingFileError = (error: unknown) =>
  Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'ENOENT',
  );

export class CustomStatusLibraryStore {
  readonly #directory: string;
  readonly #filePath: string;
  #presets: CustomStatusPreset[];
  #operationQueue: Promise<unknown> = Promise.resolve();

  private constructor(directory: string, presets: CustomStatusPreset[]) {
    this.#directory = directory;
    this.#filePath = path.join(directory, 'custom-status-library.json');
    this.#presets = presets;
  }

  static async open(directory: string) {
    const filePath = path.join(directory, 'custom-status-library.json');
    try {
      const contents = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(contents) as { presets?: unknown };
      return new CustomStatusLibraryStore(
        directory,
        normalizeCustomStatusLibrary(parsed?.presets),
      );
    } catch (error) {
      if (!isMissingFileError(error) && !(error instanceof SyntaxError)) throw error;
      return new CustomStatusLibraryStore(directory, []);
    }
  }

  list(): CustomStatusPreset[] {
    return this.#presets.map((preset) => ({ ...preset }));
  }

  async create(value: unknown): Promise<CustomStatusPreset> {
    return this.#enqueue(async () => {
      const draft = normalizeCustomStatusPresetDraft(value);
      if (!draft) throw new Error('Dados do status personalizado inválidos.');
      if (!customStatusLibraryHasCapacity(this.#presets)) {
        throw new Error('A biblioteca atingiu o limite de 100 status personalizados.');
      }
      const now = new Date().toISOString();
      const preset: CustomStatusPreset = {
        id: randomUUID(),
        ...draft,
        createdAt: now,
        updatedAt: now,
      };
      const previous = this.#presets;
      this.#presets = normalizeCustomStatusLibrary([...previous, preset]);
      try {
        await this.#persist();
      } catch (error) {
        this.#presets = previous;
        throw error;
      }
      return { ...preset };
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.#enqueue(async () => {
      if (!isCustomStatusPresetId(id)) return false;
      const previous = this.#presets;
      const next = previous.filter((preset) => preset.id !== id);
      if (next.length === previous.length) return false;
      this.#presets = next;
      try {
        await this.#persist();
      } catch (error) {
        this.#presets = previous;
        throw error;
      }
      return true;
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.#operationQueue.then(operation, operation);
    this.#operationQueue = next.catch(() => undefined);
    return next;
  }

  async #persist() {
    await mkdir(this.#directory, { recursive: true });
    const temporaryPath = `${this.#filePath}.tmp`;
    const contents = JSON.stringify({
      schemaVersion: 1,
      presets: this.#presets,
    } satisfies StoredCustomStatusLibrary, null, 2);
    await writeFile(temporaryPath, contents, 'utf8');
    try {
      await rename(temporaryPath, this.#filePath);
    } catch (error) {
      if (
        !error ||
        typeof error !== 'object' ||
        !('code' in error) ||
        (error.code !== 'EEXIST' && error.code !== 'EPERM')
      ) throw error;
      await rm(this.#filePath, { force: true });
      await rename(temporaryPath, this.#filePath);
    }
  }
}
