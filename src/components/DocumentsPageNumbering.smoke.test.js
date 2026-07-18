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
import {
  DEFAULT_DOC_FORMATTING,
  estimateColumnPageCapacity,
  splitParagraphsIntoPages,
} from './documentsCatalogUtils';

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

// Bugfix regression: the single-language 2-column layout used to render every paragraph into one
// shared row spanning both columns on a single <Page> JSX element. When that content was taller
// than a page, react-pdf's automatic overflow pushed only the *taller* column's remainder onto an
// extra physical page while the shorter column's page looked mostly empty - i.e. "one column takes
// 2 pages". The fix (splitParagraphsIntoPages) pre-chunks paragraphs into page-sized groups and
// renders one explicit <Page> per group, so the real physical page count must land exactly on the
// number of groups computed up front - never more (which would mean react-pdf's own overflow had to
// kick in again) and never fewer.
describe('Documents PDF single-language 2-column layout paginates correctly (bugfix: a column must never spill onto its own extra page)', () => {
  it('renders exactly as many physical pages as the manual page-chunking predicts, for a document long enough to need several', async () => {
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

    const formatting = { ...DEFAULT_DOC_FORMATTING, showPageNumbers: true };
    const longDoc = {
      id: 'long-single-language-doc',
      allowPageBreaks: true,
      logo: null,
      title: { uk: 'Довгий одномовний договір', en: 'Long single-language agreement' },
      paragraphs: buildLongParagraphs(90),
    };

    const element = React.createElement(DocumentsPdfDocument, {
      documents: [longDoc],
      layout: 'two-column-uk',
      clinicLogos: [],
      formatting,
    });
    const stream = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', resolve);
      stream.on('error', reject);
    });
    const renderedPages = countPdfPages(Buffer.concat(chunks));

    // The same geometry DocumentsPdfDocument itself derives from the defaults (A4, default
    // margins/column gap), reproduced here to compute the expected group count independently of
    // the component's internals.
    const CM_TO_PT = 28.3465;
    const A4_WIDTH_PT = 595.28;
    const A4_HEIGHT_PT = 841.89;
    const marginLeft = formatting.marginLeftCm * CM_TO_PT;
    const marginRight = formatting.marginRightCm * CM_TO_PT;
    const marginTop = formatting.marginTopCm * CM_TO_PT;
    const marginBottom = formatting.marginBottomCm * CM_TO_PT;
    const columnGap = formatting.columnGapCm * CM_TO_PT;
    const contentWidth = A4_WIDTH_PT - marginLeft - marginRight;
    const columnContentWidth = (contentWidth - columnGap) / 2;
    const capacity = estimateColumnPageCapacity({
      columnWidthPt: columnContentWidth,
      pageContentHeightPt: A4_HEIGHT_PT - marginTop - marginBottom,
      fontSize: formatting.fontSize,
      lineSpacing: formatting.lineSpacing,
    });
    const expectedGroups = splitParagraphsIntoPages(longDoc.paragraphs, 'uk', capacity).length;

    expect(expectedGroups).toBeGreaterThan(1); // the fixture must actually exercise multi-page pagination
    expect(renderedPages).toBe(expectedGroups);
  }, 30000);
});
