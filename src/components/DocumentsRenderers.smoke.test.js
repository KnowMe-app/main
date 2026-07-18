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

