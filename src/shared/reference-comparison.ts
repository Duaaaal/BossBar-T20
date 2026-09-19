/** Compare text, not rules: punctuation, accents and a few equivalent notations
 * are ignored. Signed numbers and materially different wording remain distinct. */
const tokens = (text: string) => {
  const clean = text.replace(/\s+Pré-requisitos?:[\s\S]*$/i, '').replace(/\(JÁ INCLUSO\)/gi, (match) => ' '.repeat(match.length)).replace(/(?<=veja )o(?= texto)/gi, ' ');
  return [...clean.matchAll(/[+-]?\d+(?:[.,]\d+)?(?:d\d+)?|[\p{L}\p{N}]+/gu)].map((match, index, all) => {
    let key = match[0].normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/^\+/, '').replace(',', '.');
    if (['um', 'uma'].includes(key) && /^(rodada|dia|minuto|hora)s?$/i.test(all[index + 1]?.[0] ?? '')) key = '1';
    return { key, start: match.index!, end: match.index! + match[0].length };
  });
};
export const referenceTextMatches = (left: string, right: string) => tokens(left).map(({ key }) => key).join(' ') === tokens(right).map(({ key }) => key).join(' ');
export const referenceDifference = (sheet: string, reference: string) => {
  const left = tokens(sheet); const right = tokens(reference);
  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix].key === right[prefix].key) prefix++;
  const excerpt = (text: string, words: ReturnType<typeof tokens>) => {
    const start = words[Math.max(0, prefix - 6)]?.start ?? text.length;
    const end = words[Math.min(words.length - 1, prefix + 24)]?.end ?? text.length;
    return `${start ? '… ' : ''}${text.slice(start, end).trim()}${end < text.length ? ' …' : ''}` || '(sem trecho correspondente)';
  };
  return { sheetExcerpt: excerpt(sheet, left), referenceExcerpt: excerpt(reference, right) };
};
