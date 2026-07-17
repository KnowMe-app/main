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
