import Fastify from 'fastify';
import { shell } from 'electron';
import { ReferenceBookService } from './multiplayer/reference-book-service';
import { parseReferenceLink } from './shared/reference-books';

let listener: Promise<{ app: ReturnType<typeof Fastify>; url: string; books: ReferenceBookService }> | undefined;
export const openLocalReferenceBook = async (href: string) => {
  const reference = parseReferenceLink(href); if (!reference) return;
  listener ??= (async () => {
    const app = Fastify({ logger: false, forceCloseConnections: true }); const books = new ReferenceBookService(); books.register(app, true);
    const url = await app.listen({ host: '127.0.0.1', port: 0 }); return { app, url, books };
  })().catch((error) => { listener = undefined; throw error; });
  const { url, books } = await listener;
  if (!await books.available(reference.book.id)) throw new Error('Livro indisponível. Mantenha sua cópia local na pasta Downloads.');
  await shell.openExternal(`${url}/reference-books/${reference.book.id}?access=${books.grant(() => true)}#page=${reference.page}`);
};
export const closeReferenceBookBrowser = async () => { const active = listener; listener = undefined; if (active) await (await active).app.close(); };
