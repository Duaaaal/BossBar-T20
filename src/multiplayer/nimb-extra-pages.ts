import { inflateSync } from 'node:zlib';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';

/** Nimb appends plain text pages with standard fonts after its three-page form.
 * Read that known representation without executing PDF scripts or fetching fonts.
 * Other representations remain in the PDF and explicitly request manual review. */
export const readNimbExtraPages = (document: PDFDocument) => {
  const pages: string[] = [];
  const unread: number[] = [];
  const decoder = new TextDecoder('windows-1252');
  for (let index = 3; index < document.getPageCount(); index++) {
    try {
      const page = document.getPage(index);
      const fonts = page.node.Resources()?.lookup(PDFName.of('Font'));
      if (!(fonts instanceof PDFDict) || !fonts.entries().every(([, ref]) => {
        const font = document.context.lookup(ref);
        if (!(font instanceof PDFDict)) return false;
        const name = font.lookup(PDFName.of('BaseFont'))?.toString() ?? '';
        const encoding = font.lookup(PDFName.of('Encoding'))?.toString();
        return /^\/(?:Helvetica|Times|Courier)(?:-|$)/.test(name) && (!encoding || encoding === '/WinAnsiEncoding');
      })) throw new Error('Fonte não reconhecida');
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
      const lines: string[] = [];
      for (const ref of streams) {
        const stream = document.context.lookup(ref);
        if (!(stream instanceof PDFRawStream)) throw new Error('Conteúdo não reconhecido');
        const filter = stream.dict.lookup(PDFName.of('Filter'))?.toString();
        if (filter && filter !== '/FlateDecode') throw new Error('Compressão não reconhecida');
        const bytes = filter ? inflateSync(stream.contents, { maxOutputLength: 1_048_576 }) : stream.contents;
        if (bytes.length > 1_048_576) throw new Error('Página muito extensa');
        const content = Buffer.from(bytes).toString('latin1');
        // The Nimb/pdf-lib export writes each line as a hex string followed by Tj.
        if (/\bTJ\b|\bDo\b|\)\s*Tj/.test(content)) throw new Error('Texto em formato diferente');
        for (const match of content.matchAll(/<([0-9a-f\s]+)>\s*Tj\b/gi)) {
          lines.push(decoder.decode(Buffer.from(match[1].replace(/\s/g, ''), 'hex')));
        }
      }
      if (lines.length) pages.push(`Página ${index + 1}\n${lines.join('\n')}`);
      else unread.push(index + 1);
    } catch { unread.push(index + 1); }
  }
  const text = pages.join('\n\n');
  return { text: text.length <= 100_000 ? text : '', unread: text.length <= 100_000 ? unread : [...unread, ...Array.from({ length: Math.max(0, document.getPageCount() - 3) }, (_, index) => index + 4)] };
};
