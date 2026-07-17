import {
  DEFAULT_DOC_FORMATTING,
  applyLogoLayoutAssignment,
  buildCaseLabel,
  buildGeneratedDocument,
  clinicLogoEntriesToBackend,
  deepMergeRecords,
  emptyDocumentsCatalog,
  fillPlaceholders,
  formatDocumentDate,
  getClinicLogo,
  getParagraphType,
  getValueByPath,
  isSectionHeading,
  mergeDocumentsCatalog,
  normalizeDocFormatting,
  normalizeDocumentsCatalog,
  normalizeDocumentsSettings,
  orderCasesByRecent,
  parseDocumentsTechnicalInput,
  pickLogoVariantForLayout,
  pruneDocOverride,
  resolveCaseContext,
  resolveMergedRecordsForPersistence,
  upsertRecentCaseId,
  validateDocumentTemplate,
} from './documentsCatalogUtils';

// All party fixtures below are fictional - tests must never carry real client data.
const sampleCatalog = () => normalizeDocumentsCatalog(
  {
    couples: {
      'couple-1': {
        id: 'couple-1',
        partners: [
          {
            id: 'patient-1',
            role: 'wife',
            name: { uk: { nominative: 'Тестова Марія', genitive: 'Тестової Марії' }, en: 'Testova Mariia' },
            birthDate: '1990-01-01',
            passport: { number: 'AA000001', issuedBy: { uk: 'МЗС', en: 'MFA' }, issueDate: '2020-02-02' },
          },
          {
            id: 'patient-2',
            role: 'husband',
            name: { uk: { nominative: 'Тестовий Петро' }, en: 'Testovyi Petro' },
            birthDate: '1989-03-03',
          },
        ],
        marriage: { certificateNumber: 'C-04', certificateDate: '2015-11-22' },
        address: { uk: 'місто Тестове, Україна', en: 'Test City, Ukraine' },
      },
    },
    surrogateMothers: {
      'surrogate-mother-1': {
        id: 'surrogate-mother-1',
        name: { uk: { nominative: 'Прикладова Оксана' }, en: 'Prykladova Oksana' },
        passport: { number: 'BB000002' },
      },
    },
    representatives: {
      'representative-1': { id: 'representative-1', name: { uk: { nominative: 'Зразковий Іван' }, en: 'Zrazkovyi Ivan' } },
    },
    clinics: {
      'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка «Мрія»', en: 'Clinic "Mriia"' } },
    },
    cases: {
      'case-1': {
        id: 'case-1',
        coupleId: 'couple-1',
        surrogateMotherId: 'surrogate-mother-1',
        clinicId: 'clinic-1',
        representativeIds: ['representative-1'],
        surrogacyAgreement: { number: { uk: 'без номера', en: 'without a number' } },
      },
    },
  },
  {
    'embryo-transfer-consent': {
      id: 'embryo-transfer-consent',
      title: { uk: 'Згода', en: 'Consent' },
      paragraphs: [
        { uk: 'Я, {{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.', en: 'I, {{wife.name.en}}, born {{wife.birthDate}}' },
      ],
    },
  },
);

describe('parseDocumentsTechnicalInput', () => {
  it('parses the reference JSON shape (data + documents)', () => {
    const parsed = parseDocumentsTechnicalInput(JSON.stringify({
      data: { couples: [{ id: 'couple-9' }], cases: [{ id: 'case-9' }] },
      documents: [{ id: 'doc-9', title: { uk: 'Т', en: 'T' }, paragraphs: [] }],
    }));
    expect(parsed.parties.couples).toHaveLength(1);
    expect(parsed.parties.cases[0].id).toBe('case-9');
    expect(parsed.documents[0].id).toBe('doc-9');
  });

  it('accepts partial payloads and markdown fences', () => {
    const parsed = parseDocumentsTechnicalInput('```json\n{"documents":[{"id":"doc-1"}]}\n```');
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.parties.couples).toHaveLength(0);
  });

  it('accepts top-level party collections without the data wrapper', () => {
    const parsed = parseDocumentsTechnicalInput('{"clinics":[{"id":"clinic-2"}]}');
    expect(parsed.parties.clinics[0].id).toBe('clinic-2');
  });

  it('strips exported clinic-logo nodes from parsed case records', () => {
    const parsed = parseDocumentsTechnicalInput(JSON.stringify({
      data: {
        cases: {
          'case-1': { id: 'case-1', clinicId: 'clinic-1' },
          clinics: { 'clinic-1': { logo: ['square.jpg'] } },
        },
      },
    }));
    expect(parsed.parties.cases.map(record => record.id)).toEqual(['case-1']);
  });

  it('rejects invalid or empty input', () => {
    expect(() => parseDocumentsTechnicalInput('')).toThrow(/Paste/);
    expect(() => parseDocumentsTechnicalInput('not json')).toThrow(/Invalid JSON/);
    expect(() => parseDocumentsTechnicalInput('{"foo": 1}')).toThrow(/No parties or documents/);
  });

  // The backend's full documentsBuilder export (`{ parties, templates, settings }`, i.e.
  // documentsBuilder/{parties,templates,settings} dumped together) previously produced nothing:
  // party collections live one level deeper under `parties`, and templates are called `templates`
  // (an id-keyed dict), not `documents` (an array).
  it('parses the full backend export shape (parties.* nesting + id-keyed templates)', () => {
    const parsed = parseDocumentsTechnicalInput(JSON.stringify({
      parties: {
        couples: { 'couple-1': { id: 'couple-1', partners: [] } },
        cases: {
          'case-1': { id: 'case-1', clinicId: 'clinic-1' },
          clinics: { 'clinic-1': { logo: [{ file: 'square.jpg', layout: '1col' }, { file: 'wide.jpg', layout: '2col' }] } },
        },
        clinics: { 'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка' } } },
      },
      settings: { formatting: { fontSize: 12 }, recentCaseIds: ['case-1'] },
      templates: {
        'embryo-transfer-consent': { id: 'embryo-transfer-consent', title: { uk: 'Згода', en: 'Consent' }, paragraphs: [] },
        'medical-services-agreement': { id: 'medical-services-agreement', title: { uk: 'Договір', en: 'Agreement' }, paragraphs: [] },
      },
    }));
    expect(parsed.parties.couples.map(record => record.id)).toEqual(['couple-1']);
    expect(parsed.parties.cases.map(record => record.id)).toEqual(['case-1']);
    expect(parsed.parties.clinics.map(record => record.id)).toEqual(['clinic-1']);
    expect(parsed.documents.map(record => record.id)).toEqual(['embryo-transfer-consent', 'medical-services-agreement']);
    expect(parsed.clinicLogos['clinic-1']).toEqual([
      { file: 'square.jpg', layout: '1col' },
      { file: 'wide.jpg', layout: '2col' },
    ]);
  });

  it('also accepts the full export shape wrapped in a markdown fence', () => {
    const parsed = parseDocumentsTechnicalInput(`\`\`\`json\n${JSON.stringify({
      parties: { clinics: { 'clinic-9': { id: 'clinic-9' } } },
      templates: { 'doc-9': { id: 'doc-9', paragraphs: [] } },
    })}\n\`\`\``);
    expect(parsed.parties.clinics[0].id).toBe('clinic-9');
    expect(parsed.documents[0].id).toBe('doc-9');
  });
});

describe('mergeDocumentsCatalog', () => {
  it('adds new records and keeps everything already there (never wipes)', () => {
    const current = sampleCatalog();
    const incoming = parseDocumentsTechnicalInput(JSON.stringify({
      data: { couples: [{ id: 'couple-2', partners: [] }] },
      documents: [{ id: 'doc-2', title: { uk: 'Заява', en: 'Statement' } }],
    }));
    const { catalog, summary } = mergeDocumentsCatalog(current, incoming);
    expect(summary).toEqual({ added: 2, updated: 0 });
    expect(catalog.parties.couples.map(record => record.id)).toEqual(['couple-1', 'couple-2']);
    expect(catalog.documents.map(record => record.id)).toEqual(['embryo-transfer-consent', 'doc-2']);
  });

  it('deep-merges same-id records field by field, keeping fields the payload omits', () => {
    const current = sampleCatalog();
    const incoming = parseDocumentsTechnicalInput(JSON.stringify({
      data: { clinics: [{ id: 'clinic-1', license: 'L-123' }] },
    }));
    const { catalog, summary } = mergeDocumentsCatalog(current, incoming);
    expect(summary.updated).toBe(1);
    const clinic = catalog.parties.clinics[0];
    expect(clinic.name.uk).toBe('Клініка «Мрія»');
    expect(clinic.license).toBe('L-123');
  });

  it('supports arbitrary extra key/value pairs on records', () => {
    const current = sampleCatalog();
    const incoming = parseDocumentsTechnicalInput(JSON.stringify({
      data: { cases: [{ id: 'case-1', embryoCount: 2, extra: { anything: 'goes' } }] },
    }));
    const { catalog } = mergeDocumentsCatalog(current, incoming);
    const caseRecord = catalog.parties.cases[0];
    expect(caseRecord.embryoCount).toBe(2);
    expect(caseRecord.extra.anything).toBe('goes');
    expect(caseRecord.coupleId).toBe('couple-1');
  });

  it('generates ids for records pasted without one', () => {
    const { catalog } = mergeDocumentsCatalog(emptyDocumentsCatalog(), parseDocumentsTechnicalInput(
      '{"documents":[{"title":{"uk":"Без id","en":"No id"}}]}',
    ));
    expect(catalog.documents[0].id).toMatch(/^document-/);
  });

  it('merges incoming clinic logo layout assignments additively, keyed by clinic id', () => {
    const current = { ...emptyDocumentsCatalog(), clinicLogos: { 'clinic-old': [{ file: 'kept.jpg', layout: '1col' }] } };
    const incoming = parseDocumentsTechnicalInput(JSON.stringify({
      parties: { cases: { clinics: { 'clinic-new': { logo: [{ file: 'new.jpg', layout: '2col' }] } } } },
    }));
    const { catalog } = mergeDocumentsCatalog(current, incoming);
    expect(catalog.clinicLogos['clinic-old']).toEqual([{ file: 'kept.jpg', layout: '1col' }]);
    expect(catalog.clinicLogos['clinic-new']).toEqual([{ file: 'new.jpg', layout: '2col' }]);
  });

  it('resolves generated ids when building additive persistence patches', () => {
    const current = sampleCatalog();
    const incoming = parseDocumentsTechnicalInput(JSON.stringify({
      data: { clinics: [{ name: { en: 'Generated Clinic' } }] },
      documents: [{ title: { uk: 'Без id', en: 'No id' } }],
    }));
    const { catalog } = mergeDocumentsCatalog(current, incoming);

    const [clinicPatchRecord] = resolveMergedRecordsForPersistence(
      current.parties.clinics,
      catalog.parties.clinics,
      incoming.parties.clinics,
    );
    const [templatePatchRecord] = resolveMergedRecordsForPersistence(
      current.documents,
      catalog.documents,
      incoming.documents,
    );

    expect(clinicPatchRecord.id).toMatch(/^clinic-/);
    expect(clinicPatchRecord.name.en).toBe('Generated Clinic');
    expect(templatePatchRecord.id).toMatch(/^document-/);
    expect(templatePatchRecord.title.en).toBe('No id');
  });
});

describe('deepMergeRecords', () => {
  it('never lets empty incoming values erase existing data', () => {
    expect(deepMergeRecords({ a: 'kept' }, { a: '' }).a).toBe('kept');
    expect(deepMergeRecords({ a: 'kept' }, { a: null }).a).toBe('kept');
    expect(deepMergeRecords({ list: [1] }, { list: [] }).list).toEqual([1]);
  });

  it('replaces provided scalars and arrays', () => {
    expect(deepMergeRecords({ a: 'old' }, { a: 'new' }).a).toBe('new');
    expect(deepMergeRecords({ list: [1] }, { list: [2, 3] }).list).toEqual([2, 3]);
  });
});

describe('placeholders', () => {
  it('resolves nested paths, cases and languages', () => {
    const context = resolveCaseContext(sampleCatalog(), 'case-1');
    expect(fillPlaceholders('{{wife.name.uk.nominative}}', context, 'uk')).toBe('Тестова Марія');
    expect(fillPlaceholders('{{wife.name.uk.genitive}}', context, 'uk')).toBe('Тестової Марії');
    expect(fillPlaceholders('{{clinic.name.en}}', context, 'en')).toBe('Clinic "Mriia"');
    expect(fillPlaceholders('{{case.surrogacyAgreement.number.uk}}', context, 'uk')).toBe('без номера');
  });

  it('falls back by language and to nominative when the path stops early', () => {
    const context = resolveCaseContext(sampleCatalog(), 'case-1');
    expect(fillPlaceholders('{{clinic.name}}', context, 'en')).toBe('Clinic "Mriia"');
    expect(fillPlaceholders('{{surrogateMother.name}}', context, 'uk')).toBe('Прикладова Оксана');
  });

  it('formats ISO dates as DD.MM.YYYY and blanks missing values', () => {
    const context = resolveCaseContext(sampleCatalog(), 'case-1');
    expect(fillPlaceholders('{{wife.birthDate}}', context, 'uk')).toBe('01.01.1990');
    expect(fillPlaceholders('{{husband.passport.number}}', context, 'uk')).toBe('__________');
    expect(formatDocumentDate('not-a-date')).toBe('not-a-date');
  });

  it('buildGeneratedDocument fills the title and every paragraph in both languages', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context);
    expect(generated.paragraphs[0].uk).toBe('Я, Тестова Марія, 01.01.1990 р.н.');
    expect(generated.paragraphs[0].en).toBe('I, Testova Mariia, born 01.01.1990');
  });
});

describe('data-mode overrides', () => {
  it('applies per-case overrides on top of the resolved template text', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context, {
      title: { en: 'Edited consent' },
      paragraphs: { 0: { uk: 'Відредагований абзац' } },
    });
    expect(generated.title.en).toBe('Edited consent');
    expect(generated.title.uk).toBe('Згода');
    expect(generated.paragraphs[0].uk).toBe('Відредагований абзац');
    expect(generated.paragraphs[0].en).toBe('I, Testova Mariia, born 01.01.1990');
  });

  it('accepts array-shaped paragraph overrides (Firebase dense-node shape)', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context, {
      paragraphs: [{ en: 'Array override' }],
    });
    expect(generated.paragraphs[0].en).toBe('Array override');
  });

  it('pruneDocOverride keeps only real deviations from the baseline', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const baseline = buildGeneratedDocument(catalog.documents[0], context);
    const pruned = pruneDocOverride({
      title: { uk: 'Згода', en: 'Edited consent' },
      paragraphs: { 0: { uk: baseline.paragraphs[0].uk, en: 'Changed' } },
    }, baseline);
    expect(pruned).toEqual({ title: { en: 'Edited consent' }, paragraphs: { 0: { en: 'Changed' } } });
  });

  it('pruneDocOverride returns null when everything matches the baseline again', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const baseline = buildGeneratedDocument(catalog.documents[0], context);
    expect(pruneDocOverride({ title: { uk: baseline.title.uk } }, baseline)).toBeNull();
    expect(pruneDocOverride(null, baseline)).toBeNull();
  });
});

describe('clinic logos', () => {
  it('reads legacy bare file names from parties/cases/clinics as unassigned entries', () => {
    const catalog = normalizeDocumentsCatalog(
      {
        clinics: { 'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка' } } },
        cases: {
          'case-1': { id: 'case-1', clinicId: 'clinic-1' },
          clinics: { 'clinic-1': { logo: ['a.jpg', 'b.png'] } },
        },
      },
      null,
    );
    expect(catalog.clinicLogos['clinic-1']).toEqual([
      { file: 'a.jpg', layout: '' },
      { file: 'b.png', layout: '' },
    ]);
    expect(catalog.parties.cases.map(record => record.id)).toEqual(['case-1']);
  });

  it('reads { file, layout } entries and drops unknown layout tags', () => {
    const catalog = normalizeDocumentsCatalog(
      {
        cases: {
          clinics: {
            'clinic-1': {
              logo: [
                { file: 'square.jpg', layout: '2col' },
                { file: 'wide.jpg', layout: '1col' },
                { file: 'spare.jpg', layout: 'diagonal' },
                'legacy.jpg',
              ],
            },
          },
        },
      },
      null,
    );
    expect(catalog.clinicLogos['clinic-1']).toEqual([
      { file: 'square.jpg', layout: '2col' },
      { file: 'wide.jpg', layout: '1col' },
      { file: 'spare.jpg', layout: '' },
      { file: 'legacy.jpg', layout: '' },
    ]);
  });

  it('falls back to legacy file names stored on the clinic record', () => {
    const catalog = normalizeDocumentsCatalog(
      { clinics: { 'clinic-1': { id: 'clinic-1', logo: ['legacy.jpg'] } } },
      null,
    );
    expect(catalog.clinicLogos['clinic-1']).toEqual([{ file: 'legacy.jpg', layout: '' }]);
  });

  it('picks the variant assigned to the selected column mode', () => {
    const twoCol = { fileName: 'square.jpg', dataUrl: 'data:1', layout: '2col', width: 200, height: 180 };
    const oneCol = { fileName: 'wide.jpg', dataUrl: 'data:2', layout: '1col', width: 900, height: 120 };
    const spare = { fileName: 'spare.jpg', dataUrl: 'data:3', layout: '', width: 1200, height: 100 };
    expect(pickLogoVariantForLayout([oneCol, twoCol, spare], 'two-column')).toBe(twoCol);
    expect(pickLogoVariantForLayout([oneCol, twoCol, spare], 'one-column-uk')).toBe(oneCol);
    expect(pickLogoVariantForLayout([oneCol, twoCol, spare], 'one-column-en')).toBe(oneCol);
  });

  it('falls back to the other assigned variant instead of rendering no logo', () => {
    const twoCol = { fileName: 'square.jpg', dataUrl: 'data:1', layout: '2col', width: 200, height: 180 };
    const spare = { fileName: 'spare.jpg', dataUrl: 'data:3', layout: '', width: 1200, height: 100 };
    // The '1 col' variant was deleted: the '2 col' variant is used, the unassigned one is not.
    expect(pickLogoVariantForLayout([twoCol, spare], 'one-column-uk')).toBe(twoCol);
    const oneCol = { fileName: 'wide.jpg', dataUrl: 'data:2', layout: '1col', width: 900, height: 120 };
    expect(pickLogoVariantForLayout([oneCol, spare], 'two-column')).toBe(oneCol);
  });

  it('keeps the aspect-ratio heuristic while no variant is assigned', () => {
    const compact = { fileName: 'square.jpg', dataUrl: 'data:1', width: 200, height: 180 };
    const long = { fileName: 'wide.jpg', dataUrl: 'data:2', width: 900, height: 120 };
    const portrait = { fileName: 'portrait.jpg', dataUrl: 'data:3', width: 100, height: 400 };
    expect(pickLogoVariantForLayout([compact, long], 'two-column')).toBe(compact);
    expect(pickLogoVariantForLayout([portrait, compact], 'two-column')).toBe(compact);
    expect(pickLogoVariantForLayout([compact, long], 'one-column-uk')).toBe(long);
    expect(pickLogoVariantForLayout([compact, long], 'one-column-en')).toBe(long);
    expect(pickLogoVariantForLayout([long], 'two-column')).toBe(long);
    expect(pickLogoVariantForLayout([], 'two-column')).toBeNull();
  });

  it('assigns a layout with one tap, keeping at most one variant per layout', () => {
    const variants = [
      { fileName: 'a.jpg', layout: '1col' },
      { fileName: 'b.jpg', layout: '' },
    ];
    // Assigning '1col' to b moves the assignment off a.
    expect(applyLogoLayoutAssignment(variants, 'b.jpg', '1col')).toEqual([
      { fileName: 'a.jpg', layout: '' },
      { fileName: 'b.jpg', layout: '1col' },
    ]);
    // Tapping the active tag again unassigns.
    expect(applyLogoLayoutAssignment(variants, 'a.jpg', '1col')).toEqual([
      { fileName: 'a.jpg', layout: '' },
      { fileName: 'b.jpg', layout: '' },
    ]);
    // Assigning the other layout leaves the '1col' assignment alone.
    expect(applyLogoLayoutAssignment(variants, 'b.jpg', '2col')).toEqual([
      { fileName: 'a.jpg', layout: '1col' },
      { fileName: 'b.jpg', layout: '2col' },
    ]);
    // DB-shaped entries ({ file }) work the same way.
    expect(applyLogoLayoutAssignment([{ file: 'a.jpg', layout: '' }], 'a.jpg', '2col')).toEqual([
      { file: 'a.jpg', layout: '2col' },
    ]);
  });

  it('persists every variant as { file, layout }, omitting layout while unassigned', () => {
    expect(clinicLogoEntriesToBackend([
      { fileName: 'square.jpg', dataUrl: 'data:1', layout: '2col', width: 200, height: 180 },
      { fileName: 'spare.jpg', dataUrl: 'data:2', layout: '', width: 900, height: 120 },
    ])).toEqual([
      { file: 'square.jpg', layout: '2col' },
      { file: 'spare.jpg' },
    ]);
  });
});

describe('case selector helpers', () => {
  it('builds a readable case label', () => {
    const catalog = sampleCatalog();
    expect(buildCaseLabel(catalog, catalog.parties.cases[0]))
      .toBe('Testova Mariia & Testovyi Petro — SM Prykladova Oksana');
  });

  it('orders cases by most recently used first', () => {
    const cases = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(orderCasesByRecent(cases, ['c']).map(record => record.id)).toEqual(['c', 'a', 'b']);
    expect(orderCasesByRecent(cases, []).map(record => record.id)).toEqual(['a', 'b', 'c']);
  });

  it('upserts the recent case id to the front without duplicates', () => {
    expect(upsertRecentCaseId(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(upsertRecentCaseId([], 'x')).toEqual(['x']);
  });
});

describe('settings', () => {
  it('provides reference-document defaults', () => {
    const settings = normalizeDocumentsSettings(null);
    expect(settings.formatting).toEqual(DEFAULT_DOC_FORMATTING);
    expect(settings.clinicLogo).toBeNull();
    expect(settings.recentCaseIds).toEqual([]);
  });

  it('clamps out-of-range formatting values and keeps valid ones', () => {
    const formatting = normalizeDocFormatting({ fontSize: 200, lineSpacing: 1.5, marginLeftCm: -4 });
    expect(formatting.fontSize).toBe(24);
    expect(formatting.lineSpacing).toBe(1.5);
    expect(formatting.marginLeftCm).toBe(0.5);
  });

  it('does not store clinic logo data URLs in settings', () => {
    const settings = normalizeDocumentsSettings({
      clinicLogo: { dataUrl: 'data:image/png;base64,AAA', width: 620, height: 128 },
    });
    expect(settings.clinicLogo).toBeNull();
  });
});

// Catalog carrying the full clinic detail shape (spec §2) plus a template exercising both
// {{logo}}/{{logo-long}} tokens and a long section-heading-bearing agreement.
const richCatalog = () => normalizeDocumentsCatalog(
  {
    couples: {
      'couple-1': {
        id: 'couple-1',
        partners: [
          {
            id: 'patient-2', role: 'husband', name: { en: 'Testovyi Petro', uk: { nominative: 'Тестовий Петро' } }, birthDate: '1979-04-27',
          },
          {
            id: 'patient-1', role: 'wife', name: { en: 'Testova Mariia', uk: { nominative: 'Тестова Марія' } }, birthDate: '1982-01-21',
          },
        ],
        marriage: { certificateNumber: 'C-04', certificateDate: '2020-11-22' },
        address: { uk: 'місто Тестове', en: 'Test City' },
      },
    },
    representatives: {},
    clinics: {
      'clinic-1': {
        id: 'clinic-1',
        name: { uk: 'Клініка «Вікторія»', en: 'Clinic "Victoria"' },
        legalName: { uk: 'ТОВ «Вікторія»', en: 'Victoria LLC' },
        medicalCenterName: { uk: 'МЦ «Вікторія»', en: 'MC "Victoria"' },
        address: { uk: 'Київ', en: 'Kyiv' },
        phone: '+380440000000',
        email: 'info@victoria.example',
        edrpou: '35085030',
        taxId: '350850326598',
        vatCertificateNumber: '200107025',
        bank: {
          account: '26001014039074',
          mfo: '380333',
          name: { uk: 'Укрексімбанк', en: 'Ukreximbank' },
          address: { uk: 'Київ, банк', en: 'Kyiv, bank' },
        },
        license: { number: 'АД №063736', date: '2012-09-28', issuedBy: { uk: 'МОЗ України', en: 'Ministry of Health' } },
        medicalDirector: {
          name: {
            uk: { nominative: 'Давид Лілія Володимирівна', genitive: 'Давид Лілії Володимирівни', short: 'Давид Л.В.' },
            en: { full: 'Davyd Liliia Volodymyrivna', short: 'L.V. Davyd' },
          },
          authority: { type: { uk: 'Наказ', en: 'Order' }, number: '064', date: '2021-12-31' },
        },
      },
    },
    cases: {
      'case-1': { id: 'case-1', coupleId: 'couple-1', clinicId: 'clinic-1', representativeIds: [] },
      clinics: { 'clinic-1': { logo: [{ file: 'square.jpg', layout: '1col' }, { file: 'wide.jpg', layout: '2col' }] } },
    },
  },
  {
    'embryo-transfer-consent': {
      id: 'embryo-transfer-consent',
      title: { uk: 'Згода', en: 'Consent' },
      paragraphs: [
        { uk: '{{logo}}', en: '{{logo}}' },
        { uk: 'Я, {{wife.name.uk.nominative}}, {{wife.birthDate}} р.н.', en: 'I, {{wife.name.en}}, born {{wife.birthDate}}' },
        { uk: '{{clinic.medicalDirector.name.uk.genitive}}', en: '{{clinic.medicalDirector.name.en.full}}' },
      ],
    },
  },
);

describe('spec: universal placeholder resolver', () => {
  it('resolves an arbitrarily deep clinic.medicalDirector path (getValueByPath)', () => {
    const context = resolveCaseContext(richCatalog(), 'case-1');
    expect(getValueByPath(context, 'clinic.medicalDirector.name.uk.genitive')).toBe('Давид Лілії Володимирівни');
    expect(fillPlaceholders('{{clinic.medicalDirector.name.uk.genitive}}', context, 'uk')).toBe('Давид Лілії Володимирівни');
    expect(fillPlaceholders('{{clinic.medicalDirector.authority.date}}', context, 'uk')).toBe('31.12.2021');
    expect(fillPlaceholders('{{clinic.bank.name.uk}}', context, 'uk')).toBe('Укрексімбанк');
    expect(fillPlaceholders('{{clinic.license.issuedBy.en}}', context, 'en')).toBe('Ministry of Health');
  });

  it('formats an ISO date as DD.MM.YYYY', () => {
    expect(formatDocumentDate('2024-02-08')).toBe('08.02.2024');
  });

  it('never turns a missing variable into the literal "undefined"/"null"/empty string', () => {
    const context = resolveCaseContext(richCatalog(), 'case-1');
    const output = fillPlaceholders('{{representative.powerOfAttorney.apostilleDate}}', context, 'uk');
    expect(output).not.toBe('undefined');
    expect(output).not.toBe('null');
    expect(output.trim()).not.toBe('');
    expect(output).toBe('__________');
  });

  it('lists genuinely unresolved variables without flagging logo/logo-long', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const template = {
      title: { uk: '{{logo}}', en: '' },
      paragraphs: [
        { uk: '{{representative.powerOfAttorney.apostilleDate}}', en: '{{representative.powerOfAttorney.apostilleDate}}' },
        { uk: '{{logo-long}}', en: '{{logo-long}}' },
      ],
    };
    // The fixture case has no representative at all, so this path never resolves.
    expect(validateDocumentTemplate(template, context)).toEqual(['representative.powerOfAttorney.apostilleDate']);
  });
});

describe('spec: logo paragraph type + clinic logo resolver', () => {
  it('recognizes {{logo}} as a service block, never as text', () => {
    expect(getParagraphType({ uk: '{{logo}}', en: '{{logo}}' })).toBe('logo');
    expect(getParagraphType({ uk: '{{logo}}', en: '' })).toBe('logo');
  });

  it('recognizes {{logo-long}} distinctly from {{logo}}', () => {
    expect(getParagraphType({ uk: '{{logo-long}}', en: '{{logo-long}}' })).toBe('logo-long');
    expect(getParagraphType({ uk: 'Дата: ____________________', en: 'Date: ____________________' })).toBe('text');
  });

  it('maps {{logo}} to the 1col variant and {{logo-long}} to the 2col variant, never mixing them up', () => {
    const variants = [
      { file: 'square.jpg', dataUrl: 'data:1', layout: '1col' },
      { file: 'wide.jpg', dataUrl: 'data:2', layout: '2col' },
    ];
    expect(getClinicLogo(variants, 'logo').file).toBe('square.jpg');
    expect(getClinicLogo(variants, 'logo-long').file).toBe('wide.jpg');
    // Also accepts the raw `{ logo: [...] }` shape.
    expect(getClinicLogo({ logo: variants }, 'logo-long').file).toBe('wide.jpg');
  });

  it('returns null (never throws or fabricates a file name) when the matching variant is missing', () => {
    expect(getClinicLogo([{ file: 'square.jpg', layout: '1col' }], 'logo-long')).toBeNull();
    expect(getClinicLogo([], 'logo')).toBeNull();
    expect(getClinicLogo(null, 'logo')).toBeNull();
  });

  it('a document without any logo token never gets a logo attached', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const noLogoTemplate = {
      id: 'medical-services-agreement',
      title: { uk: 'Договір', en: 'Agreement' },
      paragraphs: [{ uk: 'Текст без логотипу.', en: 'Text without a logo.' }],
    };
    const generated = buildGeneratedDocument(noLogoTemplate, context);
    expect(generated.paragraphs.some(p => p.type === 'logo' || p.type === 'logo-long')).toBe(false);
  });

  it('tags a {{logo}} paragraph once per occurrence - a renderer never has to guess and never duplicates a logo-long block', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context);
    const logoParagraphs = generated.paragraphs.filter(p => p.type === 'logo');
    expect(logoParagraphs).toHaveLength(1);
    // The token itself is preserved (not blanked out by fillPlaceholders) for the renderer to act on.
    expect(logoParagraphs[0].uk).toBe('{{logo}}');
  });
});

describe('spec: section headings', () => {
  it('flags a short numbered heading as bold-worthy', () => {
    expect(isSectionHeading('1. Предмет Договору')).toBe(true);
    expect(isSectionHeading('11. Реквізити та підписи сторін:')).toBe(true);
  });

  it('does not flag a long numbered clause as a heading', () => {
    const longClause = '1.1. Клініка зобов\'язується надати Пацієнту медичні послуги у сфері застосування допоміжних репродуктивних технологій, відповідно до чинного законодавства України та ліцензії.';
    expect(longClause.length).toBeGreaterThan(120);
    expect(isSectionHeading(longClause)).toBe(false);
  });

  it('does not flag ordinary body text', () => {
    expect(isSectionHeading('Дата: ____________________')).toBe(false);
  });
});

describe('spec: long multi-page documents', () => {
  it('renders every paragraph of a ~90-paragraph agreement without dropping any', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const paragraphs = Array.from({ length: 90 }, (_, index) => ({
      uk: `${index + 1}. Пункт договору номер ${index + 1}.`,
      en: `${index + 1}. Agreement clause number ${index + 1}.`,
    }));
    const longTemplate = {
      id: 'medical-services-agreement',
      title: { uk: 'Договір', en: 'Agreement' },
      allowPageBreaks: true,
      paragraphs,
    };
    const generated = buildGeneratedDocument(longTemplate, context);
    expect(generated.paragraphs).toHaveLength(90);
    expect(generated.allowPageBreaks).toBe(true);
    expect(generated.paragraphs[89].uk).toBe('90. Пункт договору номер 90.');
  });
});

describe('spec: bilingual paragraph pairing stays in sync', () => {
  it('keeps the uk/en text of one logical paragraph at the same array index', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context);
    // Index 1 in the fixture template is the wife paragraph - both languages describe the same
    // person at the same position, never the uk half of one pair next to the en half of another.
    expect(generated.paragraphs[1].uk).toContain('Тестова Марія');
    expect(generated.paragraphs[1].en).toContain('Testova Mariia');
  });
});

describe('spec: safe optional entities', () => {
  it('finds partners by role even when the wife is not at index 0', () => {
    // richCatalog() deliberately lists the husband before the wife.
    const context = resolveCaseContext(richCatalog(), 'case-1');
    expect(context.wife.name.uk.nominative).toBe('Тестова Марія');
    expect(context.husband.name.uk.nominative).toBe('Тестовий Петро');
  });

  it('does not crash when the case has no surrogate mother, no representative and no clinic logo', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    expect(context.surrogateMother).toBeNull();
    expect(context.representative).toBeNull();
    expect(() => buildGeneratedDocument(catalog.documents[0], context)).not.toThrow();
    const generated = buildGeneratedDocument(catalog.documents[0], context);
    expect(generated.paragraphs[1].uk).toContain('Тестова Марія');
  });

  it('resolveCaseContext returns null for an unknown case instead of throwing', () => {
    expect(resolveCaseContext(richCatalog(), 'no-such-case')).toBeNull();
  });
});
