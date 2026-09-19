import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { homedir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { referenceBook } from '../shared/reference-books.ts';

export type ReferenceBookResolver = (id: string) => Promise<string | null>;
export const resolveLocalReferenceBook: ReferenceBookResolver = async (id) => {
  const book = referenceBook(id); if (!book) return null;
  const directories = [path.join(homedir(), 'Downloads'), path.join(homedir(), 'Desktop', 'Backup', 'Pasta_de_tudo')];
  for (const directory of directories) { const file = path.join(directory, book.file); try { await access(file); return file; } catch { /* Try the next explicitly known location. */ } }
  return null;
};

/** Read-only, allowlisted book access. No manuals are bundled or arbitrary paths accepted. */
export class ReferenceBookService {
  private grants = new Map<string, { expires: number; authorized: () => boolean }>();
  private resolve: ReferenceBookResolver;
  constructor(resolve: ReferenceBookResolver = resolveLocalReferenceBook) { this.resolve = resolve; }
  grant(authorized: () => boolean) {
    for (const [key, value] of this.grants) if (value.expires <= Date.now() || !value.authorized()) this.grants.delete(key);
    while (this.grants.size >= 128) this.grants.delete(this.grants.keys().next().value!);
    const token = randomBytes(32).toString('hex'); this.grants.set(token, { expires: Date.now() + 30 * 60_000, authorized }); return token;
  }
  async available(id: string) { return Boolean(referenceBook(id) && await this.resolve(id)); }
  register(app: FastifyInstance, native = false) {
    app.get<{ Params: { id: string }; Querystring: { access?: string } }>('/reference-books/:id', { config: { rateLimit: false } }, async (request, reply) => {
      const token = native ? request.query.access : request.headers.cookie?.match(/(?:^|;\s*)bossbar_books=([a-f0-9]{64})(?:;|$)/)?.[1];
      const grant = token && this.grants.get(token);
      reply.header('Cache-Control', 'private, no-store').header('Referrer-Policy', 'no-referrer');
      if (!grant || grant.expires <= Date.now() || !grant.authorized()) return reply.code(401).type('text/plain; charset=utf-8').send('A consulta expirou. Abra a referência novamente dentro da sala.');
      const book = referenceBook(request.params.id); const file = book && await this.resolve(book.id);
      if (!file) return reply.code(404).type('text/plain; charset=utf-8').send('Livro indisponível. Peça ao mestre para disponibilizar sua cópia local.');
      try {
        const info = await stat(file); if (!info.isFile()) throw new Error('not a file');
        reply.type('application/pdf').header('Content-Disposition', `inline; filename="${book!.id}.pdf"`).header('Accept-Ranges', 'bytes').header('X-Content-Type-Options', 'nosniff');
        const range = request.headers.range;
        let start = 0; let end = info.size - 1;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();
          start = match[1] ? Number(match[1]) : Math.max(0, info.size - Number(match[2]));
          end = match[1] && match[2] ? Math.min(end, Number(match[2])) : end;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= info.size) return reply.code(416).header('Content-Range', `bytes */${info.size}`).send();
          reply.code(206).header('Content-Range', `bytes ${start}-${end}/${info.size}`);
        }
        reply.header('Content-Length', end - start + 1);
        return reply.send(createReadStream(file, { start, end }));
      } catch { return reply.code(404).send('Não foi possível abrir o livro. Verifique o arquivo local do mestre.'); }
    });
  }
}
