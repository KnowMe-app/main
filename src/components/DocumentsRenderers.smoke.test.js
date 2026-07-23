// End-to-end smoke test for the Documents PDF/DOCX renderers: builds two generated documents (one
// with a {{logo}} paragraph and a short heading, one with neither) and actually renders them
// through @react-pdf/renderer and docx, so a broken prop name or an invalid docx option (e.g.
// keepLines/cantSplit) fails here instead of only showing up as a blank/broken export later.
import fs from 'fs';
import path from 'path';
import os from 'os';
import React from 'react';
import { buildGeneratedDocument, resolveCaseContext, normalizeDocumentsCatalog } from './documentsCatalogUtils';

const toDataUri = file => {
  const buf = fs.readFileSync(path.join(__dirname, '../../public/fonts', file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
};

// A tiny 1x1 PNG, used as a stand-in clinic logo image.
const TINY_PNG_DATA_URL = 'data:image/png;base64,'
  + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const sampleCatalog = () => normalizeDocumentsCatalog(
  {
    couples: {
      'couple-1': {
        id: 'couple-1',
        partners: [
          { id: 'p1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' }, birthDate: '1990-01-01' },
          { id: 'p2', role: 'husband', name: { uk: { nominative: 'Тестовий Петро' }, en: 'Testovyi Petro' }, birthDate: '1989-03-03' },
        ],
        marriage: { certificateNumber: 'C-04', certificateDate: '2015-11-22' },
        address: { uk: 'Тестове', en: 'Test City' },
      },
    },
    clinics: {
      'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка «Тест»', en: 'Clinic "Test"' }, legalName: { uk: 'ТОВ Тест', en: 'Test LLC' } },
    },
    cases: {
      'case-1': { id: 'case-1', coupleId: 'couple-1', clinicId: 'clinic-1' },
    },
  },
  {
    'with-logo': {
      id: 'with-logo',
      title: { uk: 'Згода', en: 'Consent' },
      allowPageBreaks: true,
      paragraphs: [
        { uk: '{{logo}}', en: '{{logo}}' },
        { uk: '1. Предмет Договору', en: '1. Subject of the Agreement' },
        { uk: 'Я, {{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.', en: 'I, {{wife.name.en}}, born {{wife.birthDate}}' },
        { uk: '____________________ (підпис)', en: '____________________ (signature)' },
      ],
    },
    'without-logo': {
      id: 'without-logo',
      title: { uk: 'Договір', en: 'Agreement' },
      allowPageBreaks: true,
      paragraphs: Array.from({ length: 30 }, (_, i) => ({
        uk: `${i + 1}. Пункт номер ${i + 1}.`,
        en: `${i + 1}. Clause number ${i + 1}.`,
      })),
    },
  },
);

const clinicLogos = [
  { fileName: 'square.png', dataUrl: TINY_PNG_DATA_URL, layout: '1col', width: 1, height: 1 },
  { fileName: 'wide.png', dataUrl: TINY_PNG_DATA_URL, layout: '2col', width: 1, height: 1 },
];

const buildDocuments = () => {
  const catalog = sampleCatalog();
  const context = resolveCaseContext(catalog, 'case-1');
  return catalog.documents.map(template => buildGeneratedDocument(template, context));
};

describe('Documents PDF renderer (real @react-pdf render)', () => {
  it('renders a document with a {{logo}} block, a heading and a document without any logo, without throwing', async () => {
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
    const documents = buildDocuments();
    expect(documents).toHaveLength(2);

    const element = React.createElement(DocumentsPdfDocument, {
      documents,
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
    const out = Buffer.concat(chunks);
    expect(out.length).toBeGreaterThan(1000);
    fs.writeFileSync(path.join(os.tmpdir(), 'documents-pdf-smoke.pdf'), out);
  }, 20000);

  it('renders a document with a per-paragraph indentCm override without throwing', async () => {
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

    const doc = {
      id: 'indented-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Тест', en: 'Test' },
      paragraphs: [
        { type: 'text', uk: 'Абзац з відступом.', en: 'Indented.', indentCm: 1.5 },
        { type: 'text', uk: 'Абзац без відступу.', en: 'Not indented.' },
      ],
    };
    const element = React.createElement(DocumentsPdfDocument, {
      documents: [doc],
      layout: 'one-column-uk',
      clinicLogos: [],
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
});

describe('Documents DOCX builder (real docx Packer)', () => {
  it('builds a .docx blob for the same documents without throwing', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const documents = buildDocuments();
    const blob = await buildDocumentsDocx({
      documents,
      layout: 'two-column',
      clinicLogos,
    });
    expect(blob.size).toBeGreaterThan(500);
  }, 20000);

  it('renders a selection-formatted bold/italic run as real DOCX bold/italic, not a whole-paragraph flag', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = {
      id: 'formatted-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Тест', en: 'Test' },
      paragraphs: [
        { type: 'text', uk: 'Звичайний **жирний** та *курсивний* текст.', en: 'Plain **bold** and *italic* text.' },
      ],
    };
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'one-column-uk' });
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');
    // The raw markup characters must never leak into the exported text...
    expect(xml).not.toContain('**');
    expect(xml).not.toContain('жирним*');
    // ...and the bolded/italicized fragments must carry real <w:b/>/<w:i/> runs, not a paragraph-wide flag.
    expect(xml).toMatch(/<w:b\/>[\s\S]*?<w:t[^>]*>жирний<\/w:t>/);
    expect(xml).toMatch(/<w:i\/>[\s\S]*?<w:t[^>]*>курсивний<\/w:t>/);
  }, 20000);

  // spec: "відступи теж повтори" - the reference notarial statement indents only its opening
  // declaration, not the paragraphs after it, so the override has to apply per paragraph, not
  // reset the whole document's firstLineIndentCm.
  it('renders a per-paragraph indentCm override as that paragraph\'s own firstLine indent, leaving the rest at the document default', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = {
      id: 'indented-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Тест', en: 'Test' },
      paragraphs: [
        { type: 'text', uk: 'Абзац з відступом.', en: 'Indented.', indentCm: 1 },
        { type: 'text', uk: 'Абзац без відступу.', en: 'Not indented.' },
      ],
    };
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'one-column-uk' });
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');
    // 1cm * CM_TO_TWIP(567) = 567 twips, and only the overridden paragraph carries it.
    const indentCount = (xml.match(/w:firstLine="567"/g) || []).length;
    expect(indentCount).toBe(1);
  }, 20000);

  // batch 2026-07-23 B §3: empty lines separate the notarial blocks and must survive into the
  // Word output - an in-paragraph blank line ("\n\n") as two real <w:br/> line breaks, an empty
  // paragraph as its own full-height paragraph, never silently dropped by a TextRun that
  // doesn't understand "\n".
  it('preserves an in-paragraph blank line as real <w:br/> breaks in the Word output', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = {
      id: 'blank-lines-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Тест', en: 'Test' },
      paragraphs: [
        { type: 'text', uk: 'Перший рядок.\n\nПісля порожнього рядка.', en: 'First line.\n\nAfter the blank line.' },
        { type: 'text', uk: '', en: '' },
        { type: 'text', uk: 'Останній абзац.', en: 'Last paragraph.' },
      ],
    };
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'one-column-uk' });
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');
    // "\n\n" = two explicit line breaks = one full blank line at the current line height.
    const breakCount = (xml.match(/<w:br\/>/g) || []).length;
    expect(breakCount).toBe(2);
    // The text on both sides of the blank line is still there, un-merged.
    expect(xml).toContain('Перший рядок.');
    expect(xml).toContain('Після порожнього рядка.');
  }, 20000);

  // batch 2026-07-23 B §1.1/§1.6: a per-paragraph fontSize override (stored under the paragraph's
  // one `style` key, resolved flat by buildGeneratedDocument) must reach the Word output as that
  // paragraph's own run size, leaving every other paragraph at the document default.
  it('renders a per-paragraph fontSize override as that paragraph\'s own run size', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = {
      id: 'font-size-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Тест', en: 'Test' },
      paragraphs: [
        { type: 'text', uk: 'Дрібний абзац.', en: 'Small paragraph.', fontSize: 10 },
        { type: 'text', uk: 'Звичайний абзац.', en: 'Normal paragraph.' },
      ],
    };
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'one-column-uk' });
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');
    // 10 pt = 20 half-points, only on the overridden paragraph's run.
    expect(xml).toMatch(/<w:sz w:val="20"\/>[\s\S]*?<w:t[^>]*>Дрібний абзац.<\/w:t>/);
    expect(xml).toMatch(/<w:t[^>]*>Звичайний абзац.<\/w:t>/);
  }, 20000);
});

// batch 2026-07-23 B §1.6/§3: the PDF renderer must accept the same per-paragraph style
// resolution (fontSize/align/indent) and blank-line content the Word builder does.
describe('Documents PDF renderer - per-paragraph styles + blank lines', () => {
  it('renders fontSize/align overrides and in-paragraph blank lines without throwing', async () => {
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

    const doc = {
      id: 'styled-doc',
      allowPageBreaks: false,
      logo: null,
      title: { uk: 'Тест', en: 'Test' },
      beforeTitle: [{ uk: 'ЗА МІСЦЕМ ВИМОГИ', en: 'TO WHOM IT MAY CONCERN', bold: true, align: 'right', fontSize: 11 }],
      paragraphs: [
        { type: 'text', uk: 'Дрібний і по центру.', en: 'Small and centered.', fontSize: 9, align: 'center' },
        { type: 'text', uk: 'Перший рядок.\n\nПісля порожнього рядка.', en: 'First.\n\nAfter blank.' },
        { type: 'text', uk: '', en: '' },
        { type: 'text', uk: 'Останній абзац.', en: 'Last paragraph.' },
      ],
    };
    const element = React.createElement(DocumentsPdfDocument, {
      documents: [doc],
      layout: 'two-column',
      clinicLogos: [],
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
});

describe('Documents PDF renderer - single-language 2-column layout + divider + inline formatting (batch 13 §1/§3/§4)', () => {
  it('renders two-column-uk with a divider and distinct bold/italic font resources, without throwing', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    const { DEFAULT_DOC_FORMATTING } = await import('./documentsCatalogUtils');
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

    const doc = {
      id: 'formatted-doc',
      allowPageBreaks: true,
      logo: null,
      title: { uk: 'Тестовий договір', en: 'Test agreement' },
      paragraphs: Array.from({ length: 6 }, (_, i) => ({
        type: 'text',
        uk: `Пункт ${i + 1} з **жирним** та *курсивним* текстом всередині одного речення.`,
        en: `Clause ${i + 1} with **bold** and *italic* text.`,
      })),
    };

    const element = React.createElement(DocumentsPdfDocument, {
      documents: [doc],
      layout: 'two-column-uk',
      formatting: { ...DEFAULT_DOC_FORMATTING, columnDivider: true },
      clinicLogos: [],
    });
    const buffer = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    const out = Buffer.concat(chunks);
    expect(out.length).toBeGreaterThan(1000);
    // Regression guard for the @react-pdf/layout font-substitution bug (patches/@react-pdf+layout+*.patch):
    // an inline bold/italic fragment sharing the same glyph coverage as the surrounding regular text
    // must still embed its own distinct font resource, not silently reuse the previous run's font.
    const baseFonts = new Set([...out.toString('latin1').matchAll(/\/BaseFont\s*\/([A-Za-z0-9+-]+)/g)].map(m => m[1]));
    const distinctFamilies = new Set([...baseFonts].map(name => name.replace(/^[A-Z]{6}\+/, '')));
    expect(distinctFamilies).toEqual(new Set(['Tinos-Regular', 'Tinos-Bold', 'Tinos-Italic']));
  }, 30000);
});

// batch 16 §6/§14/§15: a template opting into `languages: ["uk"], columns: 1` (the birth-
// registration surrogate-consent statement) must render one full-width UA column - no empty EN
// column, no divider - with its beforeTitle blocks appearing before the title, even while the page-
// wide layout selector is set to the bilingual default.
describe('Documents renderers - single-column template with beforeTitle (batch 16 §6/§14/§15)', () => {
  const buildBirthRegistrationDoc = async () => {
    const { buildGeneratedDocument } = await import('./documentsCatalogUtils');
    const template = {
      id: 'birth-registration-surrogate-consent',
      languages: ['uk'],
      columns: 1,
      beforeTitle: [
        { uk: 'ЗА МІСЦЕМ ВИМОГИ', align: 'right', bold: true },
      ],
      title: { uk: 'З А Я В А' },
      paragraphs: [
        { uk: 'Я, {{surrogateMother.name.uk.nominative}}, даю згоду.' },
      ],
    };
    return buildGeneratedDocument(template, { surrogateMother: { name: { uk: { nominative: 'Молвінських Юлія Володимирівна' } } } });
  };

  it('renders as a PDF without throwing, ignoring the page-wide two-column selector', async () => {
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
    const doc = await buildBirthRegistrationDoc();

    const element = React.createElement(DocumentsPdfDocument, { documents: [doc], layout: 'two-column', clinicLogos: [] });
    const buffer = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(1000);
  }, 20000);

  it('renders as a DOCX with beforeTitle text ordered before the title and before the body', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = await buildBirthRegistrationDoc();
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'two-column' });
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');

    const beforeTitleIndex = xml.indexOf('ЗА МІСЦЕМ ВИМОГИ');
    const titleIndex = xml.indexOf('З А Я В А');
    const bodyIndex = xml.indexOf('даю згоду');
    expect(beforeTitleIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeGreaterThan(beforeTitleIndex);
    expect(bodyIndex).toBeGreaterThan(titleIndex);
    // Single-column template: no second (EN) language column table for the title/body.
    expect(xml).not.toContain('undefined');
    expect(xml).not.toContain('[object Object]');
  }, 20000);
});

// Notarial layout standard (§3.2/§3.3): the addressee/signer block renders as a borderless
// 2-column layout table - column 1 empty (the stored left offset, default 8.5 cm of the 18 cm
// text width), column 2 holding the bold caption and the justified signer data with one empty
// line between them - and both exports honour the per-document beforeTitleOffsetPercent field.
describe('Documents DOCX builder - notarial signer block layout', () => {
  const extractXml = async blob => {
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    return zip.file('word/document.xml').async('string');
  };

  const buildSignerDoc = async offsetPercent => {
    const { buildGeneratedDocument } = await import('./documentsCatalogUtils');
    const template = {
      id: 'zayava-racs',
      languages: ['uk'],
      columns: 1,
      ...(offsetPercent !== undefined ? { beforeTitleOffsetPercent: offsetPercent } : {}),
      beforeTitle: [
        { uk: 'ЗА МІСЦЕМ ВИМОГИ', bold: true },
        { uk: '**Молвінських Юлія Володимирівна**, 27.05.1993 року народження, паспорт серії ЕВ409051.' },
      ],
      title: { uk: 'З А Я В А' },
      paragraphs: [{ uk: 'Я, **Молвінських Юлія Володимирівна**, даю згоду.' }],
    };
    return buildGeneratedDocument(template, {});
  };

  it('renders the signer block as a borderless table with the default 8.5 cm offset column', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = await buildSignerDoc(undefined);
    // Default text width with the standard 1.5 cm margins: 11906 - 851 - 851 = 10204 twips;
    // default offset 47.2% of it = 4816 twips ≈ the reference file's 4820-twip empty column.
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'two-column' });
    const xml = await extractXml(blob);

    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('w:w="4816"');
    // The caption is bold; the signer block table precedes the title.
    expect(xml).toMatch(/<w:b\/>[\s\S]*?<w:t[^>]*>ЗА МІСЦЕМ ВИМОГИ<\/w:t>/);
    expect(xml.indexOf('<w:tbl>')).toBeLessThan(xml.indexOf('З А Я В А'));
    // The inline **bold** name inside the data paragraph stays a real bold run, no markup leak.
    expect(xml).not.toContain('**');
  }, 20000);

  it('uses the stored per-document offset for the empty column width', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const doc = await buildSignerDoc(60);
    expect(doc.beforeTitleOffsetPercent).toBe(60);
    const blob = await buildDocumentsDocx({ documents: [doc], layout: 'two-column' });
    const xml = await extractXml(blob);
    // 60% of the 10204-twip text width.
    expect(xml).toContain('w:w="6122"');
  }, 20000);

  it('clamps an out-of-range stored offset into the 30-65% band', async () => {
    const doc = await buildSignerDoc(90);
    expect(doc.beforeTitleOffsetPercent).toBe(65);
  });

  it('renders the signer block in the PDF without throwing', async () => {
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
    const doc = await buildSignerDoc(undefined);

    const element = React.createElement(DocumentsPdfDocument, { documents: [doc], layout: 'two-column', clinicLogos: [] });
    const buffer = await pdf(element).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(1000);
  }, 20000);
});

// Batch 2026-07-23 C: four Documents Builder fixes, verified against the real renderers. Reading
// back exact glyph text/positions needs pdfjs-dist, which can't load under this sandbox's Jest
// (see DocumentsPageNumbering.smoke.test.js's note on the same limitation) - the pixel-level
// space/blank-line checks live in scripts/pdfQaCheck.js (plain Node, `npm run qa:pdf`) instead.
// These tests cover the pure render-time helper directly, plus render-without-throwing for the
// title-deletion crash-proofing.
describe('Documents PDF renderer - toPdfRenderableText (batch 2026-07-23 C §1/§3)', () => {
  it('turns a run of 2+ spaces into the same number of non-breaking spaces, leaving single spaces alone', async () => {
    const { toPdfRenderableText } = await import('./DocumentsPdfDocument');
    expect(toPdfRenderableText('A B')).toBe('A B'); // single space untouched
    expect(toPdfRenderableText('A          B')).toBe(`A${' '.repeat(10)}B`);
    expect(toPdfRenderableText('A  B   C')).toBe(`A${'  '}B${'   '}C`);
  });

  it('appends one non-breaking space after a trailing newline, so the empty last line keeps its height', async () => {
    const { toPdfRenderableText } = await import('./DocumentsPdfDocument');
    expect(toPdfRenderableText('ЗАЯВА\n')).toBe('ЗАЯВА\n ');
    expect(toPdfRenderableText('ЗАЯВА')).toBe('ЗАЯВА'); // no trailing newline, no change
    expect(toPdfRenderableText('ЗАЯВА\n\n')).toBe('ЗАЯВА\n\n '); // only one sentinel needed
  });

  it('never mutates the stored text - it only ever runs at render time on a copy', async () => {
    const { toPdfRenderableText } = await import('./DocumentsPdfDocument');
    const stored = 'Приватний нотаріус          Алексашина';
    toPdfRenderableText(stored);
    expect(stored).toBe('Приватний нотаріус          Алексашина'); // untouched
  });

  it('expands a tab character to 4 spaces before collapsing space runs - real-world regression: notarial templates copy-pasted out of Word use a tab stop for the signature gap, not typed spaces, and a bare tab has zero width in this PDF engine', async () => {
    const { toPdfRenderableText } = await import('./DocumentsPdfDocument');
    expect(toPdfRenderableText('A\tB')).toBe(`A${'\u00A0'.repeat(4)}B`);
    expect(toPdfRenderableText('Приватний нотаріус\t\t\tАлексашина Юлія Борисівна'))
      .toBe(`Приватний нотаріус${'\u00A0'.repeat(12)}Алексашина Юлія Борисівна`);
    // A mix of tabs and typed spaces around them still collapses into one unbroken run.
    expect(toPdfRenderableText('A\t \tB')).toBe(`A${'\u00A0'.repeat(9)}B`);
  });

  it('renders a document with multi-space runs and a trailing blank line without throwing', async () => {
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
    const { DEFAULT_DOC_FORMATTING } = await import('./documentsCatalogUtils');
    const doc = {
      id: 'spaces-and-blank-doc',
      title: { uk: 'Т' },
      paragraphs: [
        { type: 'text', uk: 'Приватний нотаріус          Алексашина Юлія Борисівна\n' },
        { type: 'text', uk: 'Наступний абзац.' },
      ],
    };
    const buffer = await pdf(React.createElement(documentsModule.default, {
      documents: [doc], layout: 'one-column-uk', formatting: DEFAULT_DOC_FORMATTING,
    })).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(500);
  }, 20000);
});

describe('Documents renderers - title deletion never crashes (batch 2026-07-23 C §2)', () => {
  const registerFonts = async Font => {
    Font.register({
      family: 'Tinos',
      fonts: [
        { src: toDataUri('Tinos-Regular.ttf'), fontWeight: 400 },
        { src: toDataUri('Tinos-Bold.ttf'), fontWeight: 700 },
      ],
    });
    Font.registerHyphenationCallback(word => [word]);
  };

  it('PDF export renders a document whose title was deleted, with no title block and no throw', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    await registerFonts(Font);
    const { buildGeneratedDocument, DEFAULT_DOC_FORMATTING } = await import('./documentsCatalogUtils');
    const template = { id: 'no-title-doc', paragraphs: [{ uk: 'ONLY_BODY_TEXT', en: 'ONLY_BODY_TEXT' }] };
    const generated = buildGeneratedDocument(template, {});
    const buffer = await pdf(React.createElement(documentsModule.default, {
      documents: [generated], layout: 'one-column-uk', formatting: DEFAULT_DOC_FORMATTING,
    })).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(500);
  }, 20000);

  it('DOCX export renders a document whose title was deleted, with no title paragraph and no throw', async () => {
    const { buildDocumentsDocx } = await import('./documentsDocxBuilder');
    const { buildGeneratedDocument } = await import('./documentsCatalogUtils');
    const template = { id: 'no-title-doc', paragraphs: [{ uk: 'ONLY_BODY_TEXT', en: 'ONLY_BODY_TEXT' }] };
    const generated = buildGeneratedDocument(template, {});
    const blob = await buildDocumentsDocx({ documents: [generated], layout: 'one-column-uk' });
    expect(blob.size).toBeGreaterThan(300);
    const arrayBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(Buffer.from(arrayBuffer));
    const xml = await zip.file('word/document.xml').async('string');
    expect(xml).toContain('ONLY_BODY_TEXT');
    expect(xml).not.toContain('undefined');
  }, 20000);

  it('an old template stored with a plain {uk, en} title (no `style` key) still renders centered, unchanged', async () => {
    const { pdf, Font } = await import('@react-pdf/renderer');
    const documentsModule = await import('./DocumentsPdfDocument');
    await registerFonts(Font);
    const { buildGeneratedDocument, DEFAULT_DOC_FORMATTING } = await import('./documentsCatalogUtils');
    const legacyTemplate = { id: 'legacy-doc', title: { uk: 'ЗАЯВА', en: 'STATEMENT' }, paragraphs: [{ uk: 'Тіло.', en: 'Body.' }] };
    const generated = buildGeneratedDocument(legacyTemplate, {});
    expect(generated.title.align).toBeUndefined();
    const buffer = await pdf(React.createElement(documentsModule.default, {
      documents: [generated], layout: 'one-column-uk', formatting: DEFAULT_DOC_FORMATTING,
    })).toBuffer();
    const chunks = [];
    await new Promise((resolve, reject) => {
      buffer.on('data', chunk => chunks.push(chunk));
      buffer.on('end', resolve);
      buffer.on('error', reject);
    });
    expect(Buffer.concat(chunks).length).toBeGreaterThan(500);
  }, 20000);
});
