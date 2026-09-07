import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeBossAttack, type BossAttack } from './shared/boss-attacks.ts';

/** A separate persistent catalog. Arsenals receive copies, never live references. */
export class AttackLibraryStore {
  private entries: BossAttack[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly directory: string;
  private constructor(directory: string) { this.directory = directory; }
  static async open(directory: string) {
    const store = new AttackLibraryStore(directory);
    try {
      const parsed = JSON.parse(await readFile(path.join(directory, 'attack-library.json'), 'utf8'));
      if (!Array.isArray(parsed.attacks)) throw new Error('Biblioteca de ataques inválida.');
      store.entries = parsed.attacks.slice(0, 500).flatMap((entry: unknown) => {
        const normalized = normalizeBossAttack(entry, randomUUID());
        return normalized ? [normalized] : [];
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return store;
  }
  list() { return structuredClone(this.entries); }
  mutate(value: unknown, remove = false) {
    const operation = this.queue.then(async () => {
      const attack = normalizeBossAttack(value, randomUUID());
      if (!attack) throw new Error('Informe um ataque válido.');
      const next = this.entries.filter((entry) => entry.id !== attack.id);
      if (!remove) next.push(attack);
      if (next.length > 500) throw new Error('Limite de 500 ataques na biblioteca.');
      await mkdir(this.directory, { recursive: true });
      const target = path.join(this.directory, 'attack-library.json');
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, attacks: next }), { flag: 'wx' });
        await rename(temporary, target);
      } finally { await unlink(temporary).catch(() => undefined); }
      this.entries = next;
      return this.list();
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
