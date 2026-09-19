import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { ReferenceBookService } from '../src/multiplayer/reference-book-service.ts';
import { citationBook, parseReferenceLink, referenceLink } from '../src/shared/reference-books.ts';
test('referências convertem página impressa e bloqueiam links e identificadores arbitrários', () => {
  assert.equal(citationBook('Livro Básico, p. 17').page, 23);
  assert.equal(citationBook('Heróis de Arton, p. 34').page, 36);
  assert.equal(citationBook('Guia de Deuses Menores').page, 1);
  assert.equal(parseReferenceLink(referenceLink('core', 23)).page, 23);
  for (const link of ['file:///secret.pdf', referenceLink('../secret', 2), referenceLink('core', 999), 'https://bossbar.invalid.attacker.test/reference-books/core#page=1']) assert.equal(parseReferenceLink(link), null);
});
test('livros exigem autorização vigente e permitem leitura parcial sem expor outros arquivos', async () => {
  const app = Fastify(); let authorized = true;
  // Use native filesystem paths including spaces/accents.
  const { fileURLToPath } = await import('node:url');
  const books = new ReferenceBookService(async (id) => id === 'core' ? fileURLToPath(new URL('../assets/ficha-t20-nimb.pdf', import.meta.url)) : null);
  books.register(app); const cookie = `bossbar_books=${books.grant(() => authorized)}`;
  try {
    assert.equal((await app.inject('/reference-books/core')).statusCode, 401);
    assert.equal((await app.inject('/reference-books/core?access=invalid')).statusCode, 401);
    const response = await app.inject({ url: '/reference-books/core', headers: { cookie, range: 'bytes=0-4' } });
    assert.equal(response.statusCode, 206); assert.equal(response.body, '%PDF-'); assert.equal(response.headers['content-type'], 'application/pdf');
    assert.equal((await app.inject({ url: '/reference-books/secret', headers: { cookie } })).statusCode, 404);
    assert.equal((await app.inject({ url: '/reference-books/core', headers: { cookie, range: 'bytes=4-1' } })).statusCode, 416);
    authorized = false; assert.equal((await app.inject({ url: '/reference-books/core', headers: { cookie } })).statusCode, 401);
    assert.equal(await books.available('secret'), false);
  } finally { await app.close(); }
});
