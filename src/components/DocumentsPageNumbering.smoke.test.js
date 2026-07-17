// Real-render regression test for per-document pagination (spec: page numbering must restart
// inside each selected document rather than continuing across the whole export, and a document
// that fits on one page must not show numbering). @react-pdf/renderer's `subPageNumber`/
// `subPageTotalPages` (used by DocumentsPdfDocument's footer) are computed per originating <Page>
// JSX element - i.e. per selected document here - which this test proves by rendering a short,
// definitely-one-page document next to a genuinely long one and confirming each produces exactly
// the physical page count its own content requires (1 vs several), not a count that bleeds across
// documents. (A full text-content check of the rendered "Page X of Y" string would need a PDF
// text-extraction library; pdf-parse's pdfjs-dist dependency doesn't run in this sandbox's Jest
// environments, so this test verifies the pagination split itself - the precondition for
// subPageNumber/subPageTotalPages to be correct - rather than OCR-ing the footer text.)
import fs from 'fs';
import path from 'path';
import React from 'react';
import { DEFAULT_DOC_FORMATTING } from './documentsCatalogUtils';

const toDataUri = file => {
  const buf = fs.readFileSync(path.join(__dirname, '../../public/fonts', file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
};

// A genuinely long paragraph body, long enough that @react-pdf/renderer has to spill this single
// document across several physical pages under the default A4 margins/font size.
const buildLongParagraphs = count => Array.from({ length: count }, (_, i) => ({
  type: 'text',
  uk: `${i + 1}. Це достатньо довгий пункт договору номер ${i + 1}, який містить кілька речень тексту, щоб гарантовано зайняти більше одного рядка на сторінці документа.`,
  en: `${i + 1}. This is a sufficiently long agreement clause number ${i + 1}, containing several sentences of text to reliably take up more than one line on the document page.`,
}));

// PDF object markers ("n 0 obj ... /Type /Page ...") are never inside a compressed content stream
// (only the drawing operators are FlateDecode-compressed), so counting them is a reliable,
// dependency-free way to read back the real rendered page count.
const countPdfPages = buffer => (buffer.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;

describe('Documents PDF pagination restarts per document (spec: "нумерацію продовжуй лише в рамках одного документу")', () => {
  it('renders a one-line document as exactly 1 page and a long document as several, independently of each other', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    Font.register({
      family: 'Tinos',
      fonts: [
        { src: toDataUri('Tinos-Regular.ttf'), fontWeight: 400 },
        { src: toDataUri('Tinos-Bold.ttf'), fontWeight: 700 },
      ],
    });
    Font.registerHyphenationCallback(word => [word]);
    const DocumentsPdfDocument = documentsModule.default;

    const shortDoc = {
      id: 'short-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Коротка згода', en: 'Short consent' },
      paragraphs: [
        { type: 'text', uk: 'Один короткий абзац.', en: 'One short paragraph.' },
      ],
    };
    const longDoc = {
      id: 'long-doc',
      allowPageBreaks: true,
      logo: null,
      title: { uk: 'Довгий договір', en: 'Long agreement' },
      paragraphs: buildLongParagraphs(150),
    };

    const renderToBuffer = async documents => {
      const element = React.createElement(DocumentsPdfDocument, {
        documents,
        layout: 'two-column',
        clinicLogos: [],
        formatting: { ...DEFAULT_DOC_FORMATTING, showPageNumbers: true },
      });
      const stream = await pdf(element).toBuffer();
      const chunks = [];
      await new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      return Buffer.concat(chunks);
    };

    // Rendered alone, each document's own physical page count.
    const shortAlonePages = countPdfPages(await renderToBuffer([shortDoc]));
    const longAlonePages = countPdfPages(await renderToBuffer([longDoc]));
    expect(shortAlonePages).toBe(1);
    expect(longAlonePages).toBeGreaterThan(2);

    // Selected together, the combined export's page count is exactly the sum of each document's
    // own count - i.e. the short document did not inherit or affect the long document's
    // pagination (and vice versa), which is the structural precondition for the footer's
    // subPageNumber/subPageTotalPages to restart cleanly at the boundary between them.
    const combinedPages = countPdfPages(await renderToBuffer([shortDoc, longDoc]));
    expect(combinedPages).toBe(shortAlonePages + longAlonePages);
  }, 30000);
});
