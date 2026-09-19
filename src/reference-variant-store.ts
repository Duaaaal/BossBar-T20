import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isReferenceVariantDraft, type ReferenceVariant } from './shared/reference-variants.ts';

/** Revision records are immutable. Player proposals never replace the base book. */
export class ReferenceVariantStore {
  private entries: ReferenceVariant[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  private readonly directory: string;
  private constructor(directory: string) { this.directory = directory; }
  static async open(directory: string) {
    const store = new ReferenceVariantStore(directory);
    try {
      const data = JSON.parse(await readFile(path.join(directory, 'reference-variants.json'), 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.variants) || data.variants.length > 2000 || data.variants.some((v: ReferenceVariant) => !isReferenceVariantDraft(v) || typeof v.id !== 'string' || !['approved', 'pending', 'rejected'].includes(v.status))) throw new Error('O arquivo de variantes é inválido; o original foi preservado.');
      store.entries = data.variants;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return store;
  }
  list(profileId?: string) { return structuredClone(this.entries.filter((entry) => !profileId || entry.status === 'approved' || entry.proposedBy === profileId)); }
  private mutate(change: (entries: ReferenceVariant[]) => ReferenceVariant[]) {
    const operation = this.queue.then(async () => {
      const next = change(this.list());
      if (next.length > 2000) throw new Error('A biblioteca atingiu o limite de 2000 variantes.');
      await mkdir(this.directory, { recursive: true });
      const target = path.join(this.directory, 'reference-variants.json');
      const temporary = `${target}.${randomUUID()}.tmp`;
      try { await writeFile(temporary, JSON.stringify({ version: 1, variants: next }), { flag: 'wx' }); await rename(temporary, target); }
      finally { await unlink(temporary).catch(() => undefined); }
      this.entries = next;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  create(value: unknown, proposedBy?: string) {
    if (!isReferenceVariantDraft(value)) return Promise.reject(new Error('Informe referência, livro, revisão, página e descrição válidos.'));
    return this.mutate((entries) => {
      if (proposedBy && entries.filter((v) => v.proposedBy === proposedBy && v.status === 'pending').length >= 20) throw new Error('Aguarde a revisão das suas propostas pendentes (limite de 20).');
      const revision = value.revision.trim();
      if (entries.some((v) => v.referenceId === value.referenceId && v.sourceId === value.sourceId && v.revision.toLocaleLowerCase() === revision.toLocaleLowerCase() && v.status === 'approved' && (!proposedBy || v.description === value.description.trim()))) throw new Error('Esta referência já tem uma variante aprovada para esse livro e revisão. Informe uma nova revisão.');
      return [...entries, { referenceId: value.referenceId, sourceId: value.sourceId, revision, page: value.page, description: value.description.trim(), id: randomUUID(), status: proposedBy ? 'pending' : 'approved', ...(proposedBy ? { proposedBy } : {}), createdAt: Date.now() }];
    });
  }
  review(id: string, approve: boolean) {
    return this.mutate((entries) => {
      const candidate = entries.find((entry) => entry.id === id && entry.status === 'pending');
      if (!candidate) throw new Error('Esta proposta não está mais pendente.');
      if (approve && entries.some((v) => v.status === 'approved' && v.referenceId === candidate.referenceId && v.sourceId === candidate.sourceId && v.revision.toLocaleLowerCase() === candidate.revision.toLocaleLowerCase())) throw new Error('Já existe uma variante aprovada para esse livro e revisão. Cadastre a descrição com outra revisão.');
      return entries.map((entry) => entry.id === id ? { ...entry, status: approve ? 'approved' : 'rejected', reviewedAt: Date.now() } : entry);
    });
  }
}
