/** Only the six books supplied by the table may be opened. Pages are printed page numbers. */
export const REFERENCE_BOOKS = [
  { id: 'core', name: 'Livro Básico - Jogo do Ano', file: 'T20 - Livro Básico - Jogo do Ano.pdf', offset: 6, pages: 407 },
  { id: 'heroes', name: 'Heróis de Arton', file: 'T20 - Heróis de Arton.pdf', offset: 2, pages: 332 },
  { id: 'threats', name: 'Ameaças de Arton', file: 'T20 - Ameaças de Arton.pdf', offset: 2, pages: 436 },
  { id: 'atlas', name: 'Atlas de Arton', file: 'T20 - Atlas de Arton.pdf', offset: 2, pages: 484 },
  { id: 'gods', name: 'Deuses de Arton', file: 'T20 - Deuses de Arton.pdf', offset: 2, pages: 324 },
  { id: 'minor-gods', name: 'Guia de Deuses Menores', file: 'T20 - Guia de Deuses Menores.pdf', offset: 2, pages: 68 },
] as const;
export const referenceBook = (id: string) => REFERENCE_BOOKS.find((book) => book.id === id);
export const citationPattern = () => /(?:Livro Básico(?:\s*[—–-]\s*Jogo do Ano)?|Tormenta20(?:\s*[—–-]\s*Jogo do Ano)?|Heróis de Arton|Ameaças de Arton|Atlas de Arton|Deuses de Arton|Guia de Deuses Menores)(?:,?\s*p(?:p|ág(?:ina)?s?)?\.?\s*\d+(?:\s*[–—-]\s*\d+)?(?:\s*(?:e|,)\s*\d+(?:\s*[–—-]\s*\d+)?)*)?/g;
export const citationBook = (text: string) => {
  const book = /^(Livro Básico|Tormenta20)/.test(text) ? REFERENCE_BOOKS[0] : REFERENCE_BOOKS.find(({ name }) => text.startsWith(name));
  if (!book) return null;
  const printed = Number(text.match(/\bp(?:p|ág(?:ina)?s?)?\.?\s*(\d+)/)?.[1]);
  return { book, page: printed ? Math.max(1, Math.min(book.pages, printed + book.offset)) : 1 };
};
export const referenceLink = (id: string, page: number) => `https://bossbar.invalid/reference-books/${encodeURIComponent(id)}#page=${page}`;
export const parseReferenceLink = (href: string) => {
  try {
    const url = new URL(href); const id = url.pathname.match(/^\/reference-books\/([a-z-]+)$/)?.[1];
    const book = id ? referenceBook(id) : undefined; const page = Number(new URLSearchParams(url.hash.slice(1)).get('page'));
    return url.origin === 'https://bossbar.invalid' && !url.search && book && Number.isInteger(page) && page >= 1 && page <= book.pages ? { book, page } : null;
  } catch { return null; }
};
