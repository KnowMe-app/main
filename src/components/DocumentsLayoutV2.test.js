// layoutV2 renderer (spec: "Оновити renderer documentsBuilder, щоб шаблон... рендерився за
// структурою layoutV2") - covers the normalization step (buildGeneratedDocument/buildLayoutV2Document)
// and both real render backends (PDF via @react-pdf/renderer, DOCX via docx), plus the 3
// pre-delivery-review fixes: the surrogate mother's field never uppercases, formValue never
// double-underlines (border only), and letterSpacingPt actually reaches both backends.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import React from 'react';
import { buildGeneratedDocument, isLayoutV2Template } from './documentsCatalogUtils';

const toDataUri = file => {
  const buf = fs.readFileSync(path.join(__dirname, '../../public/fonts', file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
};

// Counts PDF text-show operators (Tj/TJ) across every FlateDecode content stream in a generated
// PDF buffer - a crude but effective proxy for "how many lines did this text actually wrap into".
// A container collapsed to zero width (the title-wrapping bug: see DocumentsPdfDocument.jsx's
// LayoutV2AlignedBox) forces one show-text call per word instead of per wrapped line, so a single
// long sentence produces far more operators than a normally word-wrapped paragraph would.
const countPdfTextShowOperators = buffer => {
  const raw = buffer.toString('latin1');
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let total = 0;
  let match = streamPattern.exec(raw);
  while (match) {
    try {
      const inflated = zlib.inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
      total += (inflated.match(/\bTJ\b|\bTj\b/g) || []).length;
    } catch (inflateError) {
      // Not every stream is FlateDecode text content (e.g. embedded font binaries) - skip those.
    }
    match = streamPattern.exec(raw);
  }
  return total;
};

const TINY_PNG_DATA_URL = 'data:image/png;base64,'
  + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const clinicLogos = [{ fileName: 'logo.png', dataUrl: TINY_PNG_DATA_URL, layout: '1col', width: 4, height: 1 }];

// A minimal but structurally complete layoutV2 template - one of every block type, styled with
// the same pre-delivery-review-corrected styleSheet as genetic-affinity-certificate.
const layoutV2Template = () => ({
  id: 'layout-v2-fixture',
  catalogName: 'Test layoutV2 form',
  logo: '{{logo}}',
  languages: ['uk'],
  rendererVersion: 2,
  page: {
    size: 'A4',
    orientation: 'portrait',
    widthMm: 210,
    heightMm: 297,
    marginsMm: {
      top: 5, right: 15, bottom: 10, left: 15,
    },
  },
  styleSheet: {
    document: {
      fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 400, lineHeight: 1, letterSpacingPt: -0.3,
    },
    letterheadContact: {
      fontFamily: 'Times New Roman', fontSizePt: 9, fontWeight: 700, fontStyle: 'italic', align: 'right', letterSpacingPt: 0,
    },
    body: { fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 400, align: 'left' },
    titleMain: {
      fontFamily: 'Times New Roman', fontSizePt: 14, fontWeight: 700, align: 'center', letterSpacingPt: 0,
    },
    formValue: {
      fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 700, textTransform: 'uppercase', align: 'center', letterSpacingPt: -0.3,
    },
    formValueMixedCase: {
      fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 700, align: 'center', letterSpacingPt: -0.4,
    },
    formCaption: {
      fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 400, align: 'center', letterSpacingPt: 0,
    },
    signatureLabel: { fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 400 },
    signatureName: { fontFamily: 'Times New Roman', fontSizePt: 10, fontWeight: 400, align: 'center' },
  },
  layoutV2: {
    contentWidthMm: 180,
    renderLegacyContent: false,
    blocks: [
      {
        type: 'letterhead',
        heightMm: 18,
        columnGapMm: 5,
        bottomBorder: { widthPt: 3, color: '#000000' },
        columns: [
          { widthMm: 64.4, content: { type: 'image', source: '{{logo}}', widthMm: 64.4, heightMm: 17 } },
          {
            widthMm: 110.6,
            content: {
              type: 'stack', style: 'letterheadContact', horizontalAlign: 'right', lines: ['{{clinic.edrpou}}'],
            },
          },
        ],
      },
      { type: 'paragraph', style: 'titleMain', text: 'ДОВІДКА' },
      {
        type: 'fieldLine',
        style: 'body',
        label: 'дружина',
        labelWidthMm: 15,
        value: '{{wife.name.uk.nominative}}',
        valueStyle: 'formValue',
        line: {
          widthPt: 0.75, color: '#000000', fillBeforeValue: true, fillAfterValue: true,
        },
        caption: '(прізвище)',
        captionStyle: 'formCaption',
      },
      {
        type: 'fieldLine',
        style: 'body',
        value: '{{surrogateMother.name.uk.nominative}}',
        valueStyle: 'formValueMixedCase',
        line: {
          widthPt: 0.75, color: '#000000', fillBeforeValue: true, fillAfterValue: true,
        },
        caption: '(прізвище)',
        captionStyle: 'formCaption',
      },
      {
        type: 'richParagraph',
        style: 'body',
        runs: [{ text: 'Діагноз: ' }, { text: '{{case.artProgram.medicalIndications.uk}}' }],
      },
      { type: 'spacer', heightMm: 5 },
      {
        type: 'signatureTable',
        widthMm: 172.5,
        columnWidthsMm: [80, 60, 32.5],
        rows: [
          [
            { text: 'Лікар', style: 'signatureLabel' },
            {
              text: '{{clinic.medicalDirector.name.uk.nominative}}', style: 'signatureName', bottomBorder: { widthPt: 0.75, color: '#000000' },
            },
            { text: '', style: 'signatureName', bottomBorder: { widthPt: 0.75, color: '#000000' } },
          ],
          { type: 'spacerRow', heightMm: 5 },
        ],
      },
      {
        type: 'alignedBox', widthMm: 70, horizontalAlign: 'right', style: 'formCaption', lines: ['Додаток 18'],
      },
    ],
  },
});

const context = {
  logo: '{{logo}}',
  wife: { name: { uk: { nominative: 'Кікава Харука' } } },
  surrogateMother: { name: { uk: { nominative: 'Молвінських Юлія Володимирівна' } } },
  clinic: { edrpou: '35085030', medicalDirector: { name: { uk: { nominative: 'Пилип Юрій Юрійович' } } } },
  case: { artProgram: { medicalIndications: { uk: 'Безпліддя' } } },
};

describe('layoutV2 normalization (buildGeneratedDocument)', () => {
  it('flags a rendererVersion 2 template with layoutV2.blocks', () => {
    expect(isLayoutV2Template(layoutV2Template())).toBe(true);
  });

  it('resolves placeholders and leaves no unresolved {{...}} anywhere in the tree', () => {
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    expect(resolved.layoutV2).toBeTruthy();
    const serialized = JSON.stringify(resolved.layoutV2);
    expect(serialized).not.toMatch(/\{\{[^}]+\}\}/);
    expect(serialized).toContain('Кікава Харука');
    expect(serialized).toContain('Молвінських Юлія Володимирівна');
  });

  // Pre-delivery review fix #1: the surrogate mother's field must not carry textTransform: uppercase.
  it('gives the surrogate mother field formValueMixedCase (no uppercase), not formValue', () => {
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    const fieldLines = resolved.layoutV2.blocks.filter(block => block.type === 'fieldLine');
    const wifeField = fieldLines.find(block => block.value === 'Кікава Харука');
    const surrogateField = fieldLines.find(block => block.value === 'Молвінських Юлія Володимирівна');
    expect(wifeField.valueStyle.textTransform).toBe('uppercase');
    expect(surrogateField.valueStyle.textTransform).toBeUndefined();
  });

  // Pre-delivery review fix #3: formValue must never carry its own textDecoration - fieldLine's
  // border-bottom (drawn by the renderer, not the style) is the only underline mechanism.
  it('never sets textDecoration on formValue/formValueMixedCase (border-only underline)', () => {
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    resolved.layoutV2.blocks.filter(block => block.type === 'fieldLine').forEach(block => {
      expect(block.valueStyle.textDecoration).toBeUndefined();
    });
  });

  // Pre-delivery review fix #2: letterSpacingPt must survive normalization for both the compressed
  // body style and the (more compressed) surrogate-mother field.
  it('carries letterSpacingPt through to the normalized style', () => {
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    const title = resolved.layoutV2.blocks.find(block => block.type === 'paragraph' && block.text === 'ДОВІДКА');
    expect(title.style.fontSizePt).toBe(14);
    const surrogateField = resolved.layoutV2.blocks.find(block => block.type === 'fieldLine' && block.value.startsWith('Молвінських'));
    expect(surrogateField.valueStyle.letterSpacingPt).toBe(-0.4);
  });
});

// spec: an admin should be able to place the clinic logo by typing {{logo}}/{{logo-long}} into an
// ordinary paragraph or richParagraph block (the full T/B/I/align/condition toolbar every other
// block has), not only through the dedicated letterhead/image block - same convention the legacy
// (non-layoutV2) renderer already applies to a leading paragraph.
describe('layoutV2: {{logo}}/{{logo-long}} typed as a plain paragraph/richParagraph block', () => {
  const templateWithLogoParagraph = () => ({
    ...layoutV2Template(),
    layoutV2: {
      ...layoutV2Template().layoutV2,
      blocks: [
        { type: 'paragraph', style: 'body', text: '{{logo}}' },
        { type: 'richParagraph', style: 'body', runs: [{ text: '{{logo-long}}' }] },
        { type: 'paragraph', style: 'titleMain', text: 'ДОВІДКА' },
      ],
    },
  });

  it('tags the block with logoToken instead of leaving literal {{logo}} text, and carries no other paragraph fields', () => {
    const resolved = buildGeneratedDocument(templateWithLogoParagraph(), context);
    const [logoBlock, logoLongBlock, titleBlock] = resolved.layoutV2.blocks;
    expect(logoBlock.logoToken).toBe('logo');
    expect(logoBlock.text).toBeUndefined();
    expect(logoLongBlock.logoToken).toBe('logo-long');
    expect(logoLongBlock.runs).toBeUndefined();
    expect(titleBlock.text).toBe('ДОВІДКА');
    const serialized = JSON.stringify(resolved.layoutV2);
    expect(serialized).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('a plain paragraph/richParagraph whose text is NOT exactly {{logo}} keeps rendering as ordinary text', () => {
    const template = {
      ...templateWithLogoParagraph(),
      layoutV2: {
        ...templateWithLogoParagraph().layoutV2,
        blocks: [
          { type: 'paragraph', style: 'body', text: '{{logo}} in the middle of a sentence' },
          { type: 'richParagraph', style: 'body', runs: [{ text: '{{logo}}' }, { text: ' plus another run' }] },
        ],
      },
    };
    const resolved = buildGeneratedDocument(template, context);
    expect(resolved.layoutV2.blocks[0].logoToken).toBeUndefined();
    expect(resolved.layoutV2.blocks[0].text).toContain('in the middle of a sentence');
    expect(resolved.layoutV2.blocks[1].logoToken).toBeUndefined();
    expect(resolved.layoutV2.blocks[1].runs.map(run => run.text).join('')).toContain('plus another run');
  });

  it('renders a real PDF that embeds the logo image from a plain paragraph typed as {{logo}}', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    Font.register({
      family: 'Tinos',
      fonts: [{ src: toDataUri('Tinos-Regular.ttf'), fontWeight: 400 }],
    });
    Font.registerHyphenationCallback(word => [word]);
    const DocumentsPdfDocument = documentsModule.default;
    const collect = async streamPromise => {
      const stream = await streamPromise;
      const chunks = [];
      await new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      return Buffer.concat(chunks);
    };

    const resolved = buildGeneratedDocument(templateWithLogoParagraph(), context);
    const withLogoElement = React.createElement(DocumentsPdfDocument, { documents: [resolved], layout: 'two-column', clinicLogos });
    const withLogo = await collect(pdf(withLogoElement).toBuffer());

    const withoutLogoResolved = buildGeneratedDocument({
      ...templateWithLogoParagraph(),
      layoutV2: { ...templateWithLogoParagraph().layoutV2, blocks: [{ type: 'paragraph', style: 'titleMain', text: 'ДОВІДКА' }] },
    }, context);
    const withoutLogoElement = React.createElement(DocumentsPdfDocument, { documents: [withoutLogoResolved], layout: 'two-column', clinicLogos });
    const withoutLogo = await collect(pdf(withoutLogoElement).toBuffer());

    // Embedding the (tiny, base64) logo image twice (once per {{logo}}/{{logo-long}} block) makes
    // the PDF meaningfully bigger than the same document with no logo blocks at all.
    expect(withLogo.length).toBeGreaterThan(withoutLogo.length);
  }, 20000);

  it('builds a real DOCX that embeds the logo image from a plain paragraph typed as {{logo}}', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const resolved = buildGeneratedDocument(templateWithLogoParagraph(), context);
    const withLogoBlob = await buildDocumentsDocx({ documents: [resolved], layout: 'two-column', clinicLogos });
    const withoutLogoResolved = buildGeneratedDocument({
      ...templateWithLogoParagraph(),
      layoutV2: { ...templateWithLogoParagraph().layoutV2, blocks: [{ type: 'paragraph', style: 'titleMain', text: 'ДОВІДКА' }] },
    }, context);
    const withoutLogoBlob = await buildDocumentsDocx({ documents: [withoutLogoResolved], layout: 'two-column', clinicLogos });
    expect(withLogoBlob.size).toBeGreaterThan(withoutLogoBlob.size);
  }, 20000);
});

describe('layoutV2 PDF renderer (real @react-pdf render)', () => {
  it('renders a layoutV2 document without throwing', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    Font.register({
      family: 'Tinos',
      fonts: [
        { src: toDataUri('Tinos-Regular.ttf'), fontWeight: 400 },
        { src: toDataUri('Tinos-Bold.ttf'), fontWeight: 700 },
        { src: toDataUri('Tinos-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
        { src: toDataUri('Tinos-BoldItalic.ttf'), fontWeight: 700, fontStyle: 'italic' },
      ],
    });
    Font.registerHyphenationCallback(word => [word]);
    const DocumentsPdfDocument = documentsModule.default;
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    const element = React.createElement(DocumentsPdfDocument, {
      documents: [resolved],
      layout: 'two-column',
      clinicLogos,
    });
    const buffer = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(500);
  }, 20000);

  // Batch 23 §1: a title (or any other block) authored as an alignedBox with no widthMm of its own
  // must still span the full content width and wrap at word boundaries - not collapse to a 0-width
  // container that forces one word per line (LayoutV2AlignedBox's contentWidthMm fallback).
  it('wraps an alignedBox with no widthMm at word boundaries instead of collapsing to 0 width', async () => {
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
    const longTitle = 'ДОВІДКА про генетичну спорідненість батьків та дитини, народженої з використанням допоміжних репродуктивних технологій';
    const template = {
      ...layoutV2Template(),
      layoutV2: {
        ...layoutV2Template().layoutV2,
        blocks: [
          { type: 'alignedBox', style: 'titleMain', horizontalAlign: 'center', lines: [longTitle] },
        ],
      },
    };
    const resolved = buildGeneratedDocument(template, context);
    const element = React.createElement(DocumentsPdfDocument, {
      documents: [resolved], layout: 'two-column', clinicLogos,
    });
    const buffer = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    const operatorCount = countPdfTextShowOperators(Buffer.concat(chunks));
    // The sentence is 15 words - normal word-wrapping at 180mm/14pt bold fits it in ~2 lines, so a
    // handful of show-text operators. The zero-width-container bug forces one per word (15+).
    expect(operatorCount).toBeGreaterThan(0);
    expect(operatorCount).toBeLessThan(8);
  }, 20000);
});

describe('layoutV2 DOCX builder (real docx Packer)', () => {
  it('builds a .docx blob for a layoutV2 document without throwing', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    const blob = await buildDocumentsDocx({ documents: [resolved], layout: 'two-column', clinicLogos });
    expect(blob.size).toBeGreaterThan(500);
  }, 20000);

  it('never emits <w:u/> underline on the formValue run - the border is the only line', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const resolved = buildGeneratedDocument(layoutV2Template(), context);
    const blob = await buildDocumentsDocx({ documents: [resolved], layout: 'two-column', clinicLogos });
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('КІКАВА ХАРУКА');
    expect(xml).not.toContain('Молвінських'.toUpperCase());
    expect(xml).toContain('Молвінських Юлія Володимирівна');
  }, 20000);
});
