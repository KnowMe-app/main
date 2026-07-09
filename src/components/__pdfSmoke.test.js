// Smoke test for the shared PDF theme building blocks (fonts, bronze motif SVG, brand-row,
// title-block, footer) - renders a minimal document end to end so a broken font registration or
// an invalid SVG prop fails fast here instead of only showing up as a blank PDF in the browser.
//
// This bypasses ensurePdfFontsRegistered()'s PUBLIC_URL-based font URLs (there's no dev server to
// fetch them from in a Jest/Node environment) and instead registers the same .ttf files directly
// from disk as data URIs.
const os = require('os');
const path = require('path');
const fs = require('fs');
const React = require('react');
const { pdf, Document, Page, Font } = require('@react-pdf/renderer');
const {
  BrandRow, BrandRule, BronzeMotif, TitleBlock, DocSeries, Footer, pdfSharedStyles,
} = require('./pdfTheme');

const toDataUri = file => {
  const buf = fs.readFileSync(path.join(__dirname, '../../public/fonts', file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
};

Font.register({
  family: 'Fraunces',
  fonts: [
    { src: toDataUri('Fraunces-Regular.ttf'), fontWeight: 400 },
    { src: toDataUri('Fraunces-Medium.ttf'), fontWeight: 500 },
    { src: toDataUri('Fraunces-SemiBold.ttf'), fontWeight: 600 },
    { src: toDataUri('Fraunces-Bold.ttf'), fontWeight: 700 },
  ],
});
Font.register({
  family: 'Inter',
  fonts: [
    { src: toDataUri('Inter-Regular.ttf'), fontWeight: 400 },
    { src: toDataUri('Inter-Medium.ttf'), fontWeight: 500 },
    { src: toDataUri('Inter-SemiBold.ttf'), fontWeight: 600 },
    { src: toDataUri('Inter-Bold.ttf'), fontWeight: 700 },
  ],
});

test('shared pdf theme building blocks render to a PDF buffer', async () => {
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: pdfSharedStyles.page },
      React.createElement(BronzeMotif),
      React.createElement(DocSeries, { index: 2, total: 3, label: 'Programme Milestone Invoice' }),
      React.createElement(BrandRow, { metaLines: ['Invoice #2', '09 July 2026', 'Irina Gliten'] }),
      React.createElement(BrandRule),
      React.createElement(TitleBlock, {
        eyebrow: 'Programme milestone invoice',
        title: 'Invoice #2 — Second instalment',
        subtitle: 'Part of a 3-instalment programme totalling 14,364 EUR.',
      }),
      React.createElement(Footer),
    ),
  );
  const stream = await pdf(doc).toBuffer();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', c => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const out = Buffer.concat(chunks);
  expect(out.length).toBeGreaterThan(1000);
  fs.writeFileSync(path.join(os.tmpdir(), 'ukrcom-pdf-theme-smoke.pdf'), out);
}, 20000);
