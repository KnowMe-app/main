// Cross-document PDF QA gate (UKRCOM Invoice Builder bug-fix list, "Наскрізна QA-вимога").
//
// Renders real Invoice / Program Budget / Expected Expenses PDFs with @react-pdf/renderer - the
// same code path InvoiceBuilderPage.jsx uses at "Generate PDF" time - and fails the build if any
// generated PDF regresses on the four production bugs this list fixed:
//   1. Debug source-reference strings ("schedule.*", "catalog.*", "manual entry") leaking into the
//      client-facing PDF instead of staying an internal-only detail.
//   2. Corrupted/substituted characters from a font-subsetting bug (verified by checking every
//      input string round-trips into the extracted PDF text byte-for-byte).
//   3. Blank pages (only running header/footer, no real content) from a pagination bug.
//   4. The UKRCOM agency brand leaking onto the Payment Details page, whose beneficiary is a
//      separate legal entity from the agency.
//
// Run with `npm run qa:pdf`. This intentionally runs as a plain Node script (via @babel/register)
// rather than a Jest test: pdf-parse's pdfjs-dist dependency does not load inside Jest's sandboxed
// module environment (jsdom or node), only under a real Node process.
/* eslint-disable no-console */
require('@babel/register')({
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'classic' }],
  ],
  extensions: ['.js', '.jsx'],
  ignore: [/node_modules/],
});

const path = require('path');
const fs = require('fs');
const React = require('react');
const { pdf, Font } = require('@react-pdf/renderer');
const { PDFParse } = require('pdf-parse');

const ROOT = path.join(__dirname, '..');
const MIN_PAGE_CHARS = 120;
const DEBUG_STRING_PATTERN = /(schedule\.[a-z0-9._]*|catalog\.[a-z0-9._]*|manual entry)/i;

const toDataUri = file => {
  const buf = fs.readFileSync(path.join(ROOT, 'public/fonts', file));
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

const failures = [];
const fail = message => failures.push(message);

const renderPdf = async element => {
  const stream = await pdf(element).toBuffer();
  const chunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', c => chunks.push(c));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const buffer = Buffer.concat(chunks);
  const parser = new PDFParse({ data: buffer });
  const parsed = await parser.getText();
  return parsed.pages.map(p => p.text);
};

const checkNoDebugStrings = (docName, pagesText) => {
  pagesText.forEach((text, index) => {
    const match = DEBUG_STRING_PATTERN.exec(text);
    if (match) fail(`${docName} page ${index + 1}: leaked debug string "${match[0]}"`);
  });
};

const checkNoBlankPages = (docName, pagesText) => {
  pagesText.forEach((text, index) => {
    if (text.trim().length < MIN_PAGE_CHARS) {
      fail(`${docName} page ${index + 1}: only ${text.trim().length} chars of content (looks blank)`);
    }
  });
};

// Every literal input string should survive into the extracted text unchanged - a font-subsetting
// glyph-collision bug (P0.2) shows up as a handful of substituted characters inside an otherwise
// correct string, which a plain substring check catches directly.
const checkStringsRoundTrip = (docName, pagesText, expectedStrings) => {
  const combined = pagesText.join('\n');
  expectedStrings.forEach(expected => {
    if (!combined.includes(expected)) {
      fail(`${docName}: expected text "${expected}" not found verbatim in extracted PDF text (possible font-subsetting corruption)`);
    }
  });
};

const checkNoBrandOnPages = (docName, pagesText, pageIndexes, brand) => {
  pageIndexes.forEach(index => {
    const text = pagesText[index] || '';
    if (text.includes(brand)) {
      fail(`${docName} page ${index + 1}: unexpected "${brand}" mention on a page that must stay brand-neutral`);
    }
  });
};

const checkStringsAbsent = (docName, pagesText, forbiddenStrings) => {
  const combined = pagesText.join('\n');
  forbiddenStrings.forEach(forbidden => {
    if (combined.includes(forbidden)) {
      fail(`${docName}: payment-only text "${forbidden}" must not appear in this document`);
    }
  });
};

async function checkInvoice() {
  const InvoicePdfDocument = require('../src/components/InvoicePdfDocument').default;
  const beneficiary = {
    title: 'PE KOVAL OLEKSANDR',
    address: 'Ukraine, c. Kyiv, st. Bohatyrska, build. 6/1, fl. 129',
    iban: 'UA743220010000026000300004046',
    bankName: 'JSC UNIVERSAL BANK, KYIV, UKRAINE',
    swiftCode: 'UNJSUAUKXXX',
  };
  const customers = [{ name: 'Amny Athamny', address: 'Netherlands' }];
  const catalogItemsById = new Map([
    ['1', { id: '1', name: 'Pregnancy blood test', description: 'Blood test to confirm pregnancy, week 8.', price: 60 }],
    ['2', { id: '2', name: 'Consultation services', description: 'Standard consultation package.', price: 120 }],
  ]);

  // Service invoice - plain catalog items, no package/percent rows.
  const servicePages = await renderPdf(React.createElement(InvoicePdfDocument, {
    beneficiary,
    customers,
    invoiceServices: [{ id: 'e1', kind: 'item', catalogId: '1' }, { id: 'e2', kind: 'item', catalogId: '2' }],
    catalogItemsById,
    priceContext: { itemsById: catalogItemsById, rates: null },
    notes: [
      'Purpose of the payment must be exactly like in invoice.',
      'Please make sure you pay the whole amount. Do not use SHA option while making payment.',
      'Regular invoice note for the client.',
    ],
    taxPercent: 0,
    invoiceNumber: '09/07/2026',
    invoiceDate: '09.07.2026',
    purposeOfPayment: 'Payment for services.',
  }));
  checkNoDebugStrings('Invoice (service)', servicePages);
  checkNoBlankPages('Invoice (service)', servicePages);
  checkStringsRoundTrip('Invoice (service)', servicePages, [
    'Pregnancy blood test', 'Blood test to confirm pregnancy, week 8.', 'Consultation services',
    'Regular invoice note for the client.',
  ]);
  checkStringsAbsent('Invoice (service)', servicePages, [
    'Purpose of the payment must be exactly like in invoice.',
    'Please make sure you pay the whole amount. Do not use SHA option while making payment.',
  ]);
  checkNoBrandOnPages('Invoice (service)', servicePages, [1], 'UKRCOM');
  if (!servicePages[0].replace(/\s+/g, '').toUpperCase().includes('SERVICEINVOICE')) {
    fail('Invoice (service): expected a "Service invoice" eyebrow, got something else');
  }

  // Programme milestone invoice - a percent-of-package row.
  const milestonePages = await renderPdf(React.createElement(InvoicePdfDocument, {
    beneficiary,
    customers,
    invoiceServices: [{ id: 'e1', kind: 'percent', packageId: '3', percent: 20 }],
    catalogItemsById,
    priceContext: {
      itemsById: catalogItemsById,
      rates: null,
      packagesById: new Map([['3', { id: '3', name: 'IVF + ED + SM', listedPrice: 46000 }]]),
    },
    notes: [],
    taxPercent: 14,
    invoiceNumber: '09/07/2026',
    invoiceDate: '09.07.2026',
    purposeOfPayment: 'Payment for milestone.',
  }));
  checkNoDebugStrings('Invoice (milestone)', milestonePages);
  checkNoBlankPages('Invoice (milestone)', milestonePages);
  checkNoBrandOnPages('Invoice (milestone)', milestonePages, [1], 'UKRCOM');
  if (!milestonePages[0].replace(/\s+/g, '').toUpperCase().includes('PROGRAMMEMILESTONEINVOICE')) {
    fail('Invoice (milestone): expected a "Programme milestone invoice" eyebrow, got something else');
  }

  // Custom package (P0, round4 #2) - a package with no Budget catalog entry (catalogId '') must
  // render its full name/children/price straight from the invoice, never depend on a catalog
  // lookup or crash when priceContext.packagesById has nothing for it.
  const customPackagePages = await renderPdf(React.createElement(InvoicePdfDocument, {
    beneficiary,
    customers,
    invoiceServices: [{
      id: 'e1',
      kind: 'package',
      catalogId: '',
      customized: true,
      name: 'Bespoke concierge programme',
      children: [
        { id: 'c1', kind: 'custom', name: 'Dedicated case manager', price: 2000 },
        { id: 'c2', kind: 'item', catalogId: '1' },
      ],
    }],
    catalogItemsById,
    priceContext: { itemsById: catalogItemsById, rates: null, packagesById: new Map() },
    notes: [],
    taxPercent: 0,
    invoiceNumber: '09/07/2026',
    invoiceDate: '09.07.2026',
    purposeOfPayment: 'Payment for the bespoke programme.',
  }));
  checkNoDebugStrings('Invoice (custom package)', customPackagePages);
  checkNoBlankPages('Invoice (custom package)', customPackagePages);
  checkStringsRoundTrip('Invoice (custom package)', customPackagePages, [
    'Bespoke concierge programme', 'Dedicated case manager', 'Pregnancy blood test',
  ]);
  const customPackageCombined = customPackagePages.join('\n');
  if (/set out in your Budget/i.test(customPackageCombined)) {
    fail('Invoice (custom package): a package with no Budget catalog entry pointed the client at "your Budget" instead of showing its own contents');
  }
}

async function checkExpectedExpenses() {
  const ExpectedExpensesPdfDocument = require('../src/components/ExpectedExpensesPdfDocument').default;
  const plan = require('../src/data/expectedExpensesSeed.json');
  const NAMES = {
    32: 'Ultrasound confirmation of pregnancy, week 12',
    61: 'Insurance for surrogate mother',
    62: 'Insurance for newborn',
    63: 'Surrogate mother deposit, week 36',
    64: 'Surrogate mother lawyer service',
  };
  const ids = new Set();
  plan.packageSnapshot.children.forEach(c => ids.add(String(c.catalogId)));
  plan.milestones.forEach(m => m.services.forEach(s => { if (s.catalogId) ids.add(String(s.catalogId)); }));
  const items = Array.from(ids).map(id => ({
    id,
    name: NAMES[id] || `Service item ${id}`,
    description: 'Included as part of the standard programme package.',
    category: 'general',
    price: 100 + Number(id),
  }));
  const catalogItemsById = new Map(items.map(i => [String(i.id), i]));
  const customers = [{ name: 'Amny Athamny', address: 'Netherlands' }, { name: 'Fons Mitchell Drost', address: 'Netherlands' }];

  const pagesText = await renderPdf(React.createElement(ExpectedExpensesPdfDocument, {
    plan,
    customers,
    catalogItemsById,
    priceContext: { itemsById: catalogItemsById, rates: null },
    planDate: new Date('2026-07-09'),
  }));

  checkNoDebugStrings('Expected Expenses', pagesText);
  checkNoBlankPages('Expected Expenses', pagesText);
  checkStringsRoundTrip('Expected Expenses', pagesText, [
    NAMES[32], NAMES[61], NAMES[62], NAMES[63], NAMES[64],
  ]);

  // This document is one flowing, auto-paginating <Page> (spec's "Consolidate UKRCOM document
  // system" brief) - the programme overview (included services + payment schedule) renders exactly
  // once at the top, followed by one compact "Payment #N" block per milestone. So the regression
  // to guard against isn't a fixed page count (physical page count depends on how much content
  // fits per sheet), it's the overview or any milestone block being duplicated - the original
  // "Budget-duplication" bug this document was fixed for.
  const combined = pagesText.join('\n');
  const countOccurrences = (text, pattern) => (text.match(pattern) || []).length;

  const overviewCount = countOccurrences(combined, /Included in this programme/gi);
  if (overviewCount !== 1) {
    fail(`Expected Expenses: "Included in this programme" should appear exactly once (found ${overviewCount}) - the Budget-duplication regression may be back`);
  }
  const scheduleHeadingCount = countOccurrences(combined, /^Payment schedule$/gim);
  if (scheduleHeadingCount !== 1) {
    fail(`Expected Expenses: "Payment schedule" heading should appear exactly once (found ${scheduleHeadingCount}) - the Budget-duplication regression may be back`);
  }
  plan.milestones.forEach((milestone, index) => {
    const marker = new RegExp(`Payment #${index + 1}\\s*[—-]\\s*${milestone.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
    const count = countOccurrences(combined, marker);
    if (count !== 1) {
      fail(`Expected Expenses: "Payment #${index + 1} — ${milestone.title}" block should appear exactly once (found ${count})`);
    }
  });

  // Custom package + hand-built schedule (round4 #4) - no catalog package/schedule behind it at
  // all (packageId '', empty packageSnapshot.children), must still render without crashing.
  const customSchedulePlan = {
    packageId: '',
    packageSnapshot: { name: 'Bespoke concierge programme', description: '', listedPrice: 10000, currency: 'EUR', children: [] },
    milestones: [
      { id: 'm1', title: 'Deposit', taxPercent: 0, showPackageOverview: true, services: [{ id: 's1', kind: 'custom', name: 'Deposit', price: 4000 }] },
      { id: 'm2', title: 'Final payment', taxPercent: 0, showPackageOverview: false, services: [{ id: 's2', kind: 'custom', name: 'Final payment', price: 6000 }] },
    ],
  };
  const customSchedulePages = await renderPdf(React.createElement(ExpectedExpensesPdfDocument, {
    plan: customSchedulePlan,
    customers,
    catalogItemsById: new Map(),
    priceContext: { itemsById: new Map(), rates: null },
    planDate: new Date('2026-07-11'),
  }));
  checkNoDebugStrings('Expected Expenses (custom schedule)', customSchedulePages);
  checkNoBlankPages('Expected Expenses (custom schedule)', customSchedulePages);
  checkStringsRoundTrip('Expected Expenses (custom schedule)', customSchedulePages, [
    'Bespoke concierge programme', 'Deposit', 'Final payment',
  ]);
}

async function checkBudget() {
  const BudgetPdfDocument = require('../src/components/BudgetPdfDocument').default;
  const categories = ['pregnancyAndDiagnostics', 'insurance', 'surrogateMother', 'legal', 'clinic', 'donor'];
  const items = [];
  for (let i = 1; i <= 40; i++) {
    items.push({
      id: String(i),
      name: `Service item ${i}, week checkup`,
      description: 'A short description of what this service covers, billed in EUR.',
      category: categories[i % categories.length],
      price: 100 + i * 7,
      currency: 'EUR',
    });
  }
  const packages = [];
  for (let p = 1; p <= 3; p++) {
    packages.push({
      id: String(p),
      name: `Programme package ${p}`,
      description: 'What this surrogacy programme package includes.',
      listedPrice: 20000 + p * 4000,
      currency: 'EUR',
      children: items.slice(0, 12 + p * 3).map(it => it.id),
      paymentScheduleId: `sched-${p}`,
    });
  }
  const paymentSchedules = packages.map(pkg => ({
    id: `sched-${pkg.id}`,
    payments: [
      { title: 'To start the program', amount: Math.round(pkg.listedPrice * 0.2) },
      { title: 'Two weeks before embryo transfer', amount: Math.round(pkg.listedPrice * 0.1) },
      { title: 'After confirmation of pregnancy by ultrasound', amount: Math.round(pkg.listedPrice * 0.15) },
      { title: 'On the 12th week of pregnancy', amount: Math.round(pkg.listedPrice * 0.2) },
      { title: 'On the 18th week of pregnancy', amount: Math.round(pkg.listedPrice * 0.2) },
      { title: 'On the 36th week of pregnancy', amount: Math.round(pkg.listedPrice * 0.15) },
    ],
  }));
  const catalog = {
    items,
    packages,
    technical: { paymentSchedules },
    clientNotes: {
      programMilestones: ['Milestones are billed as scheduled.'],
      surrogateMotherExpenses: ['SM expenses are reimbursed monthly.'],
    },
  };

  const pagesText = await renderPdf(React.createElement(BudgetPdfDocument, { catalog, rates: null }));
  checkNoDebugStrings('Program Budget', pagesText);
  checkNoBlankPages('Program Budget', pagesText);
  checkStringsRoundTrip('Program Budget', pagesText, [
    'Service item 1, week checkup', 'Programme package 1',
  ]);

  // Client-facing reading order is Programs -> Payment schedule -> Included services (round7 spec
  // A.2, see BudgetPdfDocument) - the schedule stays on page 1 right after Programs.
  const combined = pagesText.join('\n');
  const includedIndex = combined.indexOf('Included services by program');
  const scheduleIndex = combined.indexOf('Payment schedule');
  if (includedIndex === -1 || scheduleIndex === -1 || scheduleIndex > includedIndex) {
    fail('Program Budget: expected section order Programmes -> Payment schedule -> Included services -> Other expenses');
  }
}

async function main() {
  await checkInvoice();
  await checkExpectedExpenses();
  await checkBudget();

  if (failures.length) {
    console.error(`PDF QA check FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
    failures.forEach(message => console.error(`  - ${message}`));
    process.exit(1);
  }
  console.log('PDF QA check passed: no debug strings, no blank pages, no corrupted text, no brand leakage on neutral pages.');
}

main().catch(error => {
  console.error('PDF QA check crashed:', error);
  process.exit(1);
});
