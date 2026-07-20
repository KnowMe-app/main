import {
  DEFAULT_DOC_FORMATTING,
  DOCUMENT_LAYOUTS,
  applyLogoLayoutAssignment,
  applyPlainTextEdit,
  buildVariablePickerGroups,
  collectContextLeafPaths,
  estimateColumnPageCapacity,
  estimateParagraphChars,
  buildCaseLabel,
  buildChildContext,
  buildDocumentsFileName,
  buildGeneratedDocument,
  catalogPartiesToBackend,
  clinicLogoEntriesToBackend,
  createChildRecord,
  createEmptyCase,
  createEmptyClinic,
  createEmptyCouple,
  createEmptyMaternityHospital,
  createEmptyNotary,
  createEmptyPartner,
  createEmptyRepresentative,
  createEmptySurrogateMother,
  createTransaction,
  deepMergeRecords,
  diffDocFormattingOverrides,
  emptyDocumentsCatalog,
  fillPlaceholders,
  findPartyReferences,
  formatDocumentDate,
  formatEnglishDateWords,
  formatUkrainianDateWords,
  getChildGenderForms,
  getClinicLogo,
  getEffectiveDocLayout,
  getLayoutColumnCount,
  getLayoutLang,
  getParagraphType,
  getTemplateLogoType,
  getValueByPath,
  isBilingualLayout,
  isIsoDate,
  isParagraphBold,
  isSectionHeading,
  isSingleLanguageTwoColumnLayout,
  MISSING_VALUE_PLACEHOLDER,
  mergeDocumentsCatalog,
  normalizeCaseRecord,
  normalizeDocFormatting,
  normalizeDocumentsCatalog,
  normalizeDocumentsSettings,
  orderCasesByRecent,
  orderRecordsByRecentIds,
  parseDocumentsTechnicalInput,
  parseFormattedRuns,
  pickLogoVariantForLayout,
  plainTextOf,
  pruneDocOverride,
  removeTransactionReferences,
  resolveCaseContext,
  resolveEffectiveDocFormatting,
  resolveMergedRecordsForPersistence,
  resolveTransaction,
  serializeFormattedRuns,
  shiftDocOverrideParagraphIndices,
  splitParagraphsIntoColumns,
  splitParagraphsIntoPages,
  TITLE_SCOPE,
  beforeTitleScope,
  getTemplateScopeText,
  paragraphScope,
  withTemplateScopeText,
  toggleInlineFormat,
  toggleRawInlineMarker,
  upsertRecentCaseId,
  upsertRecentId,
  validateBirthRegistrationCase,
  validateCaseRecord,
  validateDocumentTemplate,
  validateTransaction,
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

  // Bugfix regression: pasting `{ parties: { cases: { "case-1": { birthRegistration: {...} } } } }`
  // straight from the Firebase console (no inner `id` field, only the object key) used to create a
  // brand-new case with a random id instead of updating case-1, because toArray's Object.values()
  // silently dropped the key and mergeCollection then had nothing to match against.
  it('recovers a record\'s id from its object key when the record itself carries no `id` field', () => {
    const parsed = parseDocumentsTechnicalInput(JSON.stringify({
      parties: {
        cases: {
          'case-1': {
            birthRegistration: {
              child: { sex: 'female', birthDate: '2026-05-16' },
              statementDate: '2026-05-18',
              notaryId: 'notary-1',
            },
          },
        },
      },
    }));
    expect(parsed.parties.cases).toHaveLength(1);
    expect(parsed.parties.cases[0].id).toBe('case-1');
    // batch 18: the legacy top-level birthRegistration is migrated onto case.registrations.birth.
    expect(parsed.parties.cases[0].registrations.birth.notaryId).toBe('notary-1');
  });

  it('merging that id-less paste into an existing catalog updates case-1 in place instead of creating a second case', () => {
    const current = normalizeDocumentsCatalog({
      cases: {
        'case-1': {
          id: 'case-1', coupleId: 'couple-1', surrogateMotherId: 'surrogate-1',
        },
      },
    }, {});
    const incoming = parseDocumentsTechnicalInput(JSON.stringify({
      parties: { cases: { 'case-1': { birthRegistration: { statementDate: '2026-05-18', notaryId: 'notary-1' } } } },
    }));
    const { catalog, summary } = mergeDocumentsCatalog(current, incoming);
    expect(catalog.parties.cases).toHaveLength(1);
    expect(summary).toEqual({ added: 0, updated: 1 });
    expect(catalog.parties.cases[0]).toMatchObject({
      id: 'case-1',
      relations: { coupleId: 'couple-1', surrogateMotherId: 'surrogate-1' },
      registrations: { birth: { statementDate: '2026-05-18', notaryId: 'notary-1' } },
    });
  });

  it('also accepts the full export shape wrapped in a markdown fence', () => {
    const parsed = parseDocumentsTechnicalInput(`\`\`\`json\n${JSON.stringify({
      parties: { clinics: { 'clinic-9': { id: 'clinic-9' } } },
      templates: { 'doc-9': { id: 'doc-9', paragraphs: [] } },
    })}\n\`\`\``);
    expect(parsed.parties.clinics[0].id).toBe('clinic-9');
    expect(parsed.documents[0].id).toBe('doc-9');
  });

  // batch 17 §1/§2/§8: parties.clinics[clinicId].logo is now the primary clinic-logo source when
  // pasting technical input too (previously only normalizeDocumentsCatalog read it at all).
  describe('clinic-logo priority (batch 17)', () => {
    it('reads clinic.logo as the primary source for a pasted parties.clinics record', () => {
      const parsed = parseDocumentsTechnicalInput(JSON.stringify({
        parties: {
          clinics: {
            'clinic-1': { id: 'clinic-1', logo: [{ file: 'a.jpg', layout: '1col' }] },
          },
        },
      }));
      expect(parsed.clinicLogos['clinic-1']).toEqual([{ file: 'a.jpg', layout: '1col' }]);
    });

    it('clinic.logo wins over a pasted legacy parties.cases.clinics node for the same clinic', () => {
      const parsed = parseDocumentsTechnicalInput(JSON.stringify({
        parties: {
          clinics: { 'clinic-1': { id: 'clinic-1', logo: [{ file: 'current.jpg', layout: '1col' }] } },
          cases: { clinics: { 'clinic-1': { logo: [{ file: 'stale.jpg', layout: '1col' }] } } },
        },
      }));
      expect(parsed.clinicLogos['clinic-1']).toEqual([{ file: 'current.jpg', layout: '1col' }]);
    });

    it('falls back to parties.cases.clinics only when the clinic record has no logo field of its own', () => {
      const parsed = parseDocumentsTechnicalInput(JSON.stringify({
        parties: {
          clinics: { 'clinic-1': { id: 'clinic-1' } },
          cases: { clinics: { 'clinic-1': { logo: [{ file: 'legacy.jpg', layout: '1col' }] } } },
        },
      }));
      expect(parsed.clinicLogos['clinic-1']).toEqual([{ file: 'legacy.jpg', layout: '1col' }]);
    });
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
    expect(caseRecord.relations.coupleId).toBe('couple-1');
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
    // batch 18: case.surrogacyAgreement was migrated onto case.program.agreement.
    expect(fillPlaceholders('{{case.program.agreement.number.uk}}', context, 'uk')).toBe('без номера');
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

describe('spec: inserting/removing a paragraph at any position reindexes existing overrides', () => {
  it('shifts overrides at or after the insertion point up by one, keeping earlier ones untouched', () => {
    const docOverride = { title: { en: 'Kept' }, paragraphs: { 0: { en: 'First' }, 2: { en: 'Third' } } };
    const shifted = shiftDocOverrideParagraphIndices(docOverride, 1, 1);
    expect(shifted.title).toEqual({ en: 'Kept' });
    expect(shifted.paragraphs).toEqual({ 0: { en: 'First' }, 3: { en: 'Third' } });
  });

  it('shifts overrides after a removal down by one and drops the override at the removed index', () => {
    const docOverride = { paragraphs: { 0: { en: 'First' }, 1: { en: 'Removed' }, 2: { en: 'Third' } } };
    const shifted = shiftDocOverrideParagraphIndices(docOverride, 1, -1);
    expect(shifted.paragraphs).toEqual({ 0: { en: 'First' }, 1: { en: 'Third' } });
  });

  it('handles the Firebase dense-array override shape the same way as the object shape', () => {
    const docOverride = { paragraphs: [{ en: 'First' }, undefined, { en: 'Third' }] };
    const shifted = shiftDocOverrideParagraphIndices(docOverride, 0, 1);
    expect(shifted.paragraphs).toEqual({ 1: { en: 'First' }, 3: { en: 'Third' } });
  });

  it('leaves overrides without a doc-level paragraphs node untouched', () => {
    expect(shiftDocOverrideParagraphIndices(null, 0, 1)).toBeNull();
    expect(shiftDocOverrideParagraphIndices({ title: { en: 'Only title' } }, 0, 1)).toEqual({ title: { en: 'Only title' } });
  });
});

describe('clinic logos', () => {
  // batch 17 §8: parties.cases.clinics is a legacy fallback now - only consulted for a clinic that
  // doesn't already carry its own `logo` field.
  it('reads legacy bare file names from parties/cases/clinics as unassigned entries (fallback only)', () => {
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

  it('reads { file, layout } entries and drops unknown layout tags (legacy fallback path)', () => {
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

  // batch 17 §1/§2/§12: the clinic's own `logo` field is now the primary source - no
  // `parties.cases.clinics` node is needed at all once a clinic carries it directly.
  it('reads the logo directly from parties.clinics[clinicId].logo (primary, no cases.clinics needed)', () => {
    const catalog = normalizeDocumentsCatalog(
      { clinics: { 'clinic-1': { id: 'clinic-1', logo: ['legacy.jpg'] } } },
      null,
    );
    expect(catalog.clinicLogos['clinic-1']).toEqual([{ file: 'legacy.jpg', layout: '' }]);
  });

  it('parties.clinics[clinicId].logo wins over a stale parties.cases.clinics node for the same clinic (§12 #4)', () => {
    const catalog = normalizeDocumentsCatalog(
      {
        clinics: {
          'clinic-1': {
            id: 'clinic-1',
            logo: [{ file: 'current-1col.jpg', layout: '1col' }, { file: 'current-2col.jpg', layout: '2col' }],
          },
        },
        cases: {
          clinics: { 'clinic-1': { logo: [{ file: 'stale.jpg', layout: '1col' }] } },
        },
      },
      null,
    );
    expect(catalog.clinicLogos['clinic-1']).toEqual([
      { file: 'current-1col.jpg', layout: '1col' },
      { file: 'current-2col.jpg', layout: '2col' },
    ]);
  });

  it('resolveClinicLogo (getClinicLogo) reads {{logo}}/{{logo-long}} from parties.clinics[clinicId].logo (§12 #2/#3)', () => {
    const catalog = normalizeDocumentsCatalog(
      {
        clinics: {
          'clinic-1': {
            id: 'clinic-1',
            logo: [
              { file: '1784230621524-mwe7prn3.jpg', layout: '1col' },
              { file: '1784230642891-qzlngjn1.jpg', layout: '2col' },
            ],
          },
        },
        cases: { 'case-1': { id: 'case-1', clinicId: 'clinic-1' } },
      },
      null,
    );
    const context = resolveCaseContext(catalog, 'case-1');
    expect(getClinicLogo(catalog.clinicLogos[context.clinic.id], 'logo').file).toBe('1784230621524-mwe7prn3.jpg');
    expect(getClinicLogo(catalog.clinicLogos[context.clinic.id], 'logo-long').file).toBe('1784230642891-qzlngjn1.jpg');
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

describe('spec: Documents list ordered by most recently downloaded', () => {
  it('orderRecordsByRecentIds puts the most recently downloaded document first, same as cases', () => {
    const documents = [{ id: 'doc-a' }, { id: 'doc-b' }, { id: 'doc-c' }];
    expect(orderRecordsByRecentIds(documents, ['doc-c']).map(record => record.id)).toEqual(['doc-c', 'doc-a', 'doc-b']);
    expect(orderRecordsByRecentIds(documents, []).map(record => record.id)).toEqual(['doc-a', 'doc-b', 'doc-c']);
  });

  it('the last document downloaded ends up first, even across several downloads', () => {
    let recentDocIds = [];
    recentDocIds = upsertRecentId(recentDocIds, 'doc-a');
    recentDocIds = upsertRecentId(recentDocIds, 'doc-b');
    // doc-a downloaded again, most recently of all - it should be back at the front.
    recentDocIds = upsertRecentId(recentDocIds, 'doc-a');
    expect(recentDocIds).toEqual(['doc-a', 'doc-b']);
  });
});

describe('spec: every selected document downloads as its own separate file', () => {
  it('includes the document title in the file name so a batch never collides on one name', () => {
    const catalog = sampleCatalog();
    const caseRecord = catalog.parties.cases[0];
    const docA = { id: 'doc-a', title: { uk: 'Перший документ', en: 'First document' } };
    const docB = { id: 'doc-b', title: { uk: 'Другий документ', en: 'Second document' } };
    const nameA = buildDocumentsFileName(catalog, caseRecord, 'two-column', 'pdf', docA);
    const nameB = buildDocumentsFileName(catalog, caseRecord, 'two-column', 'pdf', docB);
    expect(nameA).not.toBe(nameB);
    expect(nameA).toContain('Перший_документ');
    expect(nameB).toContain('Другий_документ');
  });

  it('still produces a valid name when no specific document is given (batch-level fallback)', () => {
    const catalog = sampleCatalog();
    const caseRecord = catalog.parties.cases[0];
    expect(buildDocumentsFileName(catalog, caseRecord, 'two-column', 'pdf')).toMatch(/^Documents_.+\.pdf$/);
  });
});

describe('settings', () => {
  it('provides reference-document defaults', () => {
    const settings = normalizeDocumentsSettings(null);
    expect(settings.formatting).toEqual(DEFAULT_DOC_FORMATTING);
    expect(settings.clinicLogo).toBeNull();
    expect(settings.recentCaseIds).toEqual([]);
    expect(settings.recentDocIds).toEqual([]);
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
    expect(generated.logo).toBeNull();
    expect(generated.paragraphs.some(p => p.type === 'logo' || p.type === 'logo-long')).toBe(false);
  });

  it('a legacy leading {{logo}} paragraph becomes doc.logo and is not duplicated in the body', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context);
    expect(generated.logo).toBe('logo');
    // No paragraph renders as a body-level logo block - the former leading paragraph is consumed.
    expect(generated.paragraphs.some(p => p.type === 'logo' || p.type === 'logo-long')).toBe(false);
    expect(generated.paragraphs[0].type).toBe('logo-consumed');
  });
});

describe('spec: template.logo field renders before the title', () => {
  it('getTemplateLogoType reads the dedicated field first', () => {
    expect(getTemplateLogoType({ logo: '{{logo}}', paragraphs: [] })).toBe('logo');
    expect(getTemplateLogoType({ logo: '{{logo-long}}', paragraphs: [] })).toBe('logo-long');
    expect(getTemplateLogoType({ paragraphs: [] })).toBeNull();
  });

  // The logo field is edited as free text (spec: manually typing {{logo}}), so it must require the
  // literal token including braces - a bare "logo" (e.g. from a stray write that stripped the
  // braces) is not a graphical token and must never render a logo silently by accident.
  it('requires the literal {{logo}}/{{logo-long}} token - a bare word does not count', () => {
    expect(getTemplateLogoType({ logo: 'logo', paragraphs: [] })).toBeNull();
    expect(getTemplateLogoType({ logo: 'logo-long', paragraphs: [] })).toBeNull();
  });

  it('falls back to a legacy leading paragraph when there is no dedicated field', () => {
    expect(getTemplateLogoType({ paragraphs: [{ uk: '{{logo}}', en: '{{logo}}' }] })).toBe('logo');
    expect(getTemplateLogoType({ paragraphs: [{ uk: 'Body text.', en: 'Body text.' }] })).toBeNull();
  });

  it('buildGeneratedDocument exposes doc.logo from the dedicated field, with a clean paragraph body', () => {
    const catalog = richCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const template = {
      id: 'embryo-thawing-and-transfer-application',
      logo: '{{logo}}',
      title: { uk: 'Заява', en: 'Application' },
      paragraphs: [
        { uk: 'Я, {{wife.name.uk.nominative}}.', en: 'I, {{wife.name.en}}.' },
      ],
    };
    const generated = buildGeneratedDocument(template, context);
    expect(generated.logo).toBe('logo');
    expect(generated.paragraphs).toHaveLength(1);
    expect(generated.paragraphs[0].type).toBe('text');
    expect(generated.paragraphs[0].uk).toBe('Я, Тестова Марія.');
  });

  it('a template.logo of "{{logo-long}}" resolves to the wide, non-duplicated variant', () => {
    const template = { logo: '{{logo-long}}', paragraphs: [] };
    expect(getTemplateLogoType(template)).toBe('logo-long');
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

  // Regression: a short sub-clause (e.g. "5.4. ..." inside section "5") was previously matched by
  // the same regex as a real top-level heading ("5. ...") because it only checked length, not
  // numbering depth - bolding ordinary clause text in the exported document.
  it('does not flag a short sub-clause as a heading just because it is short', () => {
    const shortSubClause = '5.4. Клініка надає Пацієнту медичні послуги в межах сплачених сум.';
    expect(shortSubClause.length).toBeLessThan(120);
    expect(isSectionHeading(shortSubClause)).toBe(false);
    expect(isSectionHeading('6.1. Протягом всього періоду дії даний Договір може бути достроково розірваний за згодою сторін.')).toBe(false);
  });
});

describe('spec: manual bold override on a paragraph', () => {
  it('falls back to auto-detection when bold is not explicitly set', () => {
    expect(isParagraphBold({ uk: '1. Предмет Договору', en: '1. Subject' })).toBe(true);
    expect(isParagraphBold({ uk: '5.4. Клініка надає...', en: '5.4. The Clinic provides...' })).toBe(false);
  });

  it('an explicit bold:false always wins, even over an auto-detected heading', () => {
    expect(isParagraphBold({ uk: '1. Предмет Договору', en: '1. Subject', bold: false })).toBe(false);
  });

  it('an explicit bold:true always wins, even over ordinary body text', () => {
    expect(isParagraphBold({ uk: 'Просто текст.', en: 'Just text.', bold: true })).toBe(true);
  });

  it('buildGeneratedDocument threads the bold override through to the generated paragraph', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const template = {
      id: 'doc-with-bold',
      title: { uk: 'Т', en: 'T' },
      paragraphs: [{ uk: '5.4. Клініка надає...', en: '5.4. The Clinic provides...', bold: true }],
    };
    const generated = buildGeneratedDocument(template, context);
    expect(generated.paragraphs[0].bold).toBe(true);
  });

  it('buildGeneratedDocument threads a per-paragraph indentCm override through, clamped like the document-wide setting', () => {
    const catalog = sampleCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const template = {
      id: 'doc-with-indent',
      title: { uk: 'Т', en: 'T' },
      paragraphs: [
        { uk: 'Абзац з відступом.', en: 'Indented paragraph.', indentCm: 1.25 },
        { uk: 'Абзац без відступу.', en: 'Non-indented paragraph.' },
        { uk: 'Абзац з надто великим відступом.', en: 'Out-of-range indent.', indentCm: 99 },
      ],
    };
    const generated = buildGeneratedDocument(template, context);
    expect(generated.paragraphs[0].indentCm).toBe(1.25);
    expect(generated.paragraphs[1].indentCm).toBeUndefined();
    expect(generated.paragraphs[2].indentCm).toBe(5); // clamped to the same 0-5 range as firstLineIndentCm
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

describe('spec: insert-variable picker (collectContextLeafPaths / buildVariablePickerGroups)', () => {
  it('walks every string/number/boolean leaf into a flat {path, value} list, dotted paths intact', () => {
    const leaves = collectContextLeafPaths({
      name: { uk: { nominative: 'Кьогоку Ая' }, en: 'Kyogoku Aya' },
      birthDate: '1982-01-21',
    }, 'wife');
    expect(leaves).toEqual(expect.arrayContaining([
      { path: 'wife.name.uk.nominative', value: 'Кьогоку Ая' },
      { path: 'wife.name.en', value: 'Kyogoku Aya' },
      { path: 'wife.birthDate', value: '1982-01-21' },
    ]));
  });

  it('skips empty/blank strings, null/undefined, and arrays (never addresses a list as one placeholder)', () => {
    const leaves = collectContextLeafPaths({
      name: { uk: '', en: undefined },
      logo: [{ file: 'a.jpg', layout: '1col' }],
      taxId: null,
    }, 'clinic');
    expect(leaves).toEqual([]);
  });

  it('excludes the "id" field - never a useful placeholder', () => {
    const leaves = collectContextLeafPaths({ id: 'patient-1', role: 'wife' }, 'wife');
    expect(leaves).toEqual([{ path: 'wife.role', value: 'wife' }]);
  });

  it('buildVariablePickerGroups groups by role (Чоловік/Дружина/Спільне/Сурогатна мати/Довірена особа/Клініка — split by kind), never a combined "couple" block', () => {
    const context = {
      wife: { name: { en: 'Kyogoku Aya' } },
      husband: { name: { en: 'Kyogoku Keigo' } },
      couple: { marriage: { certificateNumber: 'M-1' } },
      program: { type: 'gestational' },
      surrogateMother: { name: { en: 'Molvinskykh Yuliia' } },
      representative: { name: { en: 'Koval Oleksandr' } },
      clinic: { kind: 'ukrainian', name: { en: 'Victoria' } },
    };
    const groups = buildVariablePickerGroups(context);
    expect(groups.map(g => g.label)).toEqual([
      'Чоловік', 'Дружина', 'Спільне', 'Сурогатна мати', 'Довірена особа', 'Клініка — українська',
    ]);

    expect(groups.find(g => g.label === 'Чоловік').items).toEqual([{ path: 'husband.name.en', value: 'Kyogoku Keigo' }]);
    expect(groups.find(g => g.label === 'Дружина').items).toEqual([{ path: 'wife.name.en', value: 'Kyogoku Aya' }]);

    const sharedGroup = groups.find(g => g.label === 'Спільне');
    expect(sharedGroup.items).toEqual(expect.arrayContaining([
      { path: 'couple.marriage.certificateNumber', value: 'M-1' },
      { path: 'program.type', value: 'gestational' },
    ]));

    const clinicGroup = groups.find(g => g.label === 'Клініка — українська');
    expect(clinicGroup.items).toEqual([{ path: 'clinic.name.en', value: 'Victoria' }]);
    expect(groups.find(g => g.label === 'Клініка — іноземна')).toBeUndefined();
  });

  it('splits the clinic group by kind: a foreign clinic only ever shows under "Клініка — іноземна"', () => {
    const groups = buildVariablePickerGroups({ clinic: { kind: 'foreign', name: { en: 'Victoria' } } });
    expect(groups.find(g => g.label === 'Клініка — іноземна').items).toEqual([{ path: 'clinic.name.en', value: 'Victoria' }]);
    expect(groups.find(g => g.label === 'Клініка — українська')).toBeUndefined();
  });

  it('tolerates a missing root (null context, or a group whose root is null/undefined) without throwing', () => {
    expect(() => buildVariablePickerGroups(null)).not.toThrow();
    expect(buildVariablePickerGroups(null).every(group => group.items.length === 0)).toBe(true);
    expect(buildVariablePickerGroups({ wife: null }).find(g => g.label === 'Дружина').items).toEqual([]);
  });
});

describe('spec: selection-based inline bold/italic (batch 13 §1)', () => {
  it('parses ** and a lone * as independent bold/italic toggles', () => {
    expect(parseFormattedRuns('Hello **world** and *everyone* else')).toEqual([
      { text: 'Hello ', bold: false, italic: false },
      { text: 'world', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'everyone', bold: false, italic: true },
      { text: ' else', bold: false, italic: false },
    ]);
  });

  it('parses overlapping bold+italic markers on the same fragment', () => {
    expect(parseFormattedRuns('***both***')).toEqual([
      { text: 'both', bold: true, italic: true },
    ]);
  });

  it('round-trips runs back to the same raw markup string', () => {
    const raw = 'Hello **world** and *everyone* else, ***both*** too.';
    expect(serializeFormattedRuns(parseFormattedRuns(raw))).toBe(raw);
  });

  it('plainTextOf strips every marker, leaving only the readable text', () => {
    expect(plainTextOf('Hello **world** and *everyone* else')).toBe('Hello world and everyone else');
  });

  it('does not treat runs of literal underscores (blank fill-in lines) as italic markers', () => {
    const raw = 'Дата: «___»_______ 2026 р.';
    expect(plainTextOf(raw)).toBe(raw);
    expect(parseFormattedRuns(raw)).toEqual([{ text: raw, bold: false, italic: false }]);
  });

  it('toggleInlineFormat bolds a plain-text range without disturbing the rest', () => {
    const next = toggleInlineFormat('Hello world else', 6, 11, 'bold');
    expect(plainTextOf(next)).toBe('Hello world else');
    expect(parseFormattedRuns(next)).toEqual([
      { text: 'Hello ', bold: false, italic: false },
      { text: 'world', bold: true, italic: false },
      { text: ' else', bold: false, italic: false },
    ]);
  });

  it('pressing bold again on an already-bold selection removes it (MS Word behavior)', () => {
    const bolded = toggleInlineFormat('Hello world else', 6, 11, 'bold');
    const unbolded = toggleInlineFormat(bolded, 6, 11, 'bold');
    expect(unbolded).toBe('Hello world else');
  });

  it('a partially-bold selection becomes fully bold on the first press, not toggled per-run', () => {
    const partiallyBold = toggleInlineFormat('Hello world else', 6, 8, 'bold'); // "wo" -> bold
    const fullyBold = toggleInlineFormat(partiallyBold, 6, 11, 'bold'); // whole "world" selected
    expect(parseFormattedRuns(fullyBold).find(run => run.text === 'world').bold).toBe(true);
  });

  it('bold and italic apply independently to overlapping ranges', () => {
    const bolded = toggleInlineFormat('Hello world else', 6, 11, 'bold');
    const both = toggleInlineFormat(bolded, 8, 13, 'italic'); // "rld el" overlaps the bold range
    const runs = parseFormattedRuns(both);
    expect(plainTextOf(both)).toBe('Hello world else');
    expect(runs.some(run => run.bold && run.italic)).toBe(true);
  });

  it('applyPlainTextEdit inserts new plain text inheriting the format at the caret', () => {
    const bolded = toggleInlineFormat('Hello world', 6, 11, 'bold'); // "world" bold
    // Insert " there" right after "world" (still inside the bold run) via a plain-text edit.
    const edited = applyPlainTextEdit(bolded, 'Hello world there');
    expect(plainTextOf(edited)).toBe('Hello world there');
    expect(parseFormattedRuns(edited).find(run => run.text.includes('there')).bold).toBe(true);
  });

  it('toggleRawInlineMarker wraps a raw-text selection in the marker (Template-mode Bold/Italic)', () => {
    expect(toggleRawInlineMarker('Я, {{wife.name.uk.nominative}}, кажу', 3, 30, 'bold'))
      .toBe('Я, **{{wife.name.uk.nominative}}**, кажу');
    expect(toggleRawInlineMarker('Hello world', 6, 11, 'italic')).toBe('Hello *world*');
  });

  it('toggleRawInlineMarker un-wraps when the selection sits exactly inside adjacent markers', () => {
    const bolded = toggleRawInlineMarker('Hello world', 6, 11, 'bold');
    expect(bolded).toBe('Hello **world**');
    expect(toggleRawInlineMarker(bolded, 8, 13, 'bold')).toBe('Hello world');
  });

  it('toggleRawInlineMarker is a no-op for a collapsed (empty) selection', () => {
    expect(toggleRawInlineMarker('Hello world', 5, 5, 'bold')).toBe('Hello world');
  });

  it('getTemplateScopeText/withTemplateScopeText address the title, a beforeTitle block, and a paragraph by one shared scope key', () => {
    const template = {
      title: { uk: 'Заява', en: 'Statement' },
      beforeTitle: [{ uk: 'ЗА МІСЦЕМ ВИМОГИ', align: 'right' }],
      paragraphs: [{ uk: 'Перший абзац', en: 'First paragraph' }],
    };
    expect(getTemplateScopeText(template, TITLE_SCOPE, 'uk')).toBe('Заява');
    expect(getTemplateScopeText(template, beforeTitleScope(0), 'uk')).toBe('ЗА МІСЦЕМ ВИМОГИ');
    expect(getTemplateScopeText(template, paragraphScope(0), 'en')).toBe('First paragraph');

    const withNewTitle = withTemplateScopeText(template, TITLE_SCOPE, 'uk', 'З А Я В А');
    expect(withNewTitle.title).toEqual({ uk: 'З А Я В А', en: 'Statement' });
    expect(withNewTitle.beforeTitle).toBe(template.beforeTitle); // untouched branches are not copied

    const withBoldedName = withTemplateScopeText(template, beforeTitleScope(0), 'uk', '**ЗА МІСЦЕМ ВИМОГИ**');
    expect(withBoldedName.beforeTitle[0]).toEqual({ uk: '**ЗА МІСЦЕМ ВИМОГИ**', align: 'right' });

    const withEditedParagraph = withTemplateScopeText(template, paragraphScope(0), 'uk', 'Змінений абзац');
    expect(withEditedParagraph.paragraphs[0]).toEqual({ uk: 'Змінений абзац', en: 'First paragraph' });
  });

  it('applyPlainTextEdit deletes text without corrupting the surrounding markup', () => {
    const bolded = toggleInlineFormat('Hello world else', 6, 11, 'bold');
    const edited = applyPlainTextEdit(bolded, 'Hello world'); // trailing " else" deleted
    expect(plainTextOf(edited)).toBe('Hello world');
    expect(parseFormattedRuns(edited)).toEqual([
      { text: 'Hello ', bold: false, italic: false },
      { text: 'world', bold: true, italic: false },
    ]);
  });
});

describe('spec: column layouts (batch 13 §4)', () => {
  it('exposes bilingual 2-col, single-language 1-col and single-language 2-col options', () => {
    const ids = DOCUMENT_LAYOUTS.map(option => option.id);
    expect(ids).toEqual(['two-column', 'one-column-uk', 'one-column-en', 'two-column-uk', 'two-column-en']);
  });

  it('isBilingualLayout is true only for the UA+EN layout', () => {
    expect(isBilingualLayout('two-column')).toBe(true);
    expect(isBilingualLayout('two-column-uk')).toBe(false);
    expect(isBilingualLayout('one-column-uk')).toBe(false);
  });

  it('isSingleLanguageTwoColumnLayout flags only the newspaper-style single-language layouts', () => {
    expect(isSingleLanguageTwoColumnLayout('two-column-uk')).toBe(true);
    expect(isSingleLanguageTwoColumnLayout('two-column-en')).toBe(true);
    expect(isSingleLanguageTwoColumnLayout('two-column')).toBe(false);
    expect(isSingleLanguageTwoColumnLayout('one-column-uk')).toBe(false);
  });

  it('getLayoutColumnCount is 2 for both bilingual and single-language 2-col layouts', () => {
    expect(getLayoutColumnCount('two-column')).toBe(2);
    expect(getLayoutColumnCount('two-column-uk')).toBe(2);
    expect(getLayoutColumnCount('two-column-en')).toBe(2);
    expect(getLayoutColumnCount('one-column-uk')).toBe(1);
    expect(getLayoutColumnCount('one-column-en')).toBe(1);
  });

  it('getLayoutLang resolves the single language for every non-bilingual layout', () => {
    expect(getLayoutLang('one-column-uk')).toBe('uk');
    expect(getLayoutLang('two-column-uk')).toBe('uk');
    expect(getLayoutLang('one-column-en')).toBe('en');
    expect(getLayoutLang('two-column-en')).toBe('en');
  });

  it('splitParagraphsIntoColumns balances whole paragraphs by character count of the given language', () => {
    const paragraphs = [
      { uk: 'a'.repeat(100), en: 'x' },
      { uk: 'b'.repeat(10), en: 'x' },
      { uk: 'c'.repeat(10), en: 'x' },
    ];
    const [left, right] = splitParagraphsIntoColumns(paragraphs, 'uk');
    expect(left).toEqual([paragraphs[0]]);
    expect(right).toEqual([paragraphs[1], paragraphs[2]]);
  });

  it('splitParagraphsIntoColumns never drops or duplicates a paragraph', () => {
    const paragraphs = Array.from({ length: 7 }, (_, i) => ({ uk: `p${i}`.repeat(i + 1), en: '' }));
    const [left, right] = splitParagraphsIntoColumns(paragraphs, 'uk');
    expect([...left, ...right]).toEqual(paragraphs);
  });

  it('a single paragraph with no others stays whole (never split mid-paragraph)', () => {
    const paragraphs = [{ uk: 'one long paragraph', en: '' }];
    const [left, right] = splitParagraphsIntoColumns(paragraphs, 'uk');
    expect(left).toEqual(paragraphs);
    expect(right).toEqual([]);
  });

  // Bugfix: a paragraph authored with embedded newlines (dash-prefixed sub-items as manual line
  // breaks within one paragraph, common in real contract text) forces a hard line break regardless
  // of how much of the line width was used - plain character counting badly underestimates how tall
  // it renders, which threw off both page-capacity chunking and this column balance for real
  // documents full of numbered/bulleted sub-clauses.
  it('estimateParagraphChars costs each newline-delimited segment by its own line count when charsPerLine is known', () => {
    expect(estimateParagraphChars({ uk: 'a'.repeat(10) }, 'uk', 10)).toBe(10); // exactly one line
    // Three short lines (each far under 10 chars) still cost 3 whole lines, not ~1 line worth of characters.
    const threeShortLines = { uk: 'ab\ncd\nef' };
    expect(estimateParagraphChars(threeShortLines, 'uk', 10)).toBe(30);
    // Without charsPerLine (the original behavior), newlines are just characters - no line-cost awareness.
    expect(estimateParagraphChars(threeShortLines, 'uk')).toBe(threeShortLines.uk.length);
  });

  it('splitParagraphsIntoColumns balances a newline-heavy paragraph correctly once charsPerLine is passed', () => {
    // "Bulleted" has few raw characters but many forced line breaks (as tall as ~9 lines); a plain
    // character count would wrongly call it "short" and load the whole rest onto the same column.
    const bulleted = { uk: 'x\ny\nz\nx\ny\nz\nx\ny\nz' };
    const plain = { uk: 'p'.repeat(90) };
    const charsPerLine = 10;
    const [, rightWithoutAwareness] = splitParagraphsIntoColumns([bulleted, plain], 'uk');
    expect(rightWithoutAwareness).toEqual([]); // bulleted (17 raw chars) "looks" tiny next to 90 chars of plain text
    const [leftAware, rightAware] = splitParagraphsIntoColumns([bulleted, plain], 'uk', charsPerLine);
    expect(leftAware).toEqual([bulleted]);
    expect(rightAware).toEqual([plain]);
  });
});

describe('spec: single-language 2-column pagination (bugfix - a column must never spill onto its own extra page)', () => {
  it('estimateColumnPageCapacity grows with column width, page height, and shrinks with font size', () => {
    const base = estimateColumnPageCapacity({ columnWidthPt: 250, pageContentHeightPt: 700, fontSize: 10, lineSpacing: 1 });
    const widerColumn = estimateColumnPageCapacity({ columnWidthPt: 500, pageContentHeightPt: 700, fontSize: 10, lineSpacing: 1 });
    const tallerPage = estimateColumnPageCapacity({ columnWidthPt: 250, pageContentHeightPt: 1400, fontSize: 10, lineSpacing: 1 });
    const biggerFont = estimateColumnPageCapacity({ columnWidthPt: 250, pageContentHeightPt: 700, fontSize: 20, lineSpacing: 1 });
    expect(widerColumn).toBeGreaterThan(base);
    expect(tallerPage).toBeGreaterThan(base);
    expect(biggerFont).toBeLessThan(base);
  });

  it('splits paragraphs into page-sized groups instead of one giant group', () => {
    // 10 paragraphs of 100 chars each = 1000 chars/column capacity - two columns per page share a
    // capacity of 2x that, so this must not all land in a single page group.
    const paragraphs = Array.from({ length: 10 }, (_, i) => ({ uk: 'x'.repeat(100), en: '', id: i }));
    const pages = splitParagraphsIntoPages(paragraphs, 'uk', 250);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(paragraphs);
  });

  it('never drops or duplicates a paragraph across page groups', () => {
    const paragraphs = Array.from({ length: 37 }, (_, i) => ({ uk: 'y'.repeat((i % 5) + 1), en: '', id: i }));
    const pages = splitParagraphsIntoPages(paragraphs, 'uk', 10);
    expect(pages.flat()).toEqual(paragraphs);
  });

  it('a small document that fits easily stays on a single page group', () => {
    const paragraphs = [{ uk: 'short', en: '' }, { uk: 'also short', en: '' }];
    const pages = splitParagraphsIntoPages(paragraphs, 'uk', 10000);
    expect(pages).toEqual([paragraphs]);
  });

  it('returns one empty page group for an empty document rather than an empty array', () => {
    expect(splitParagraphsIntoPages([], 'uk', 100)).toEqual([[]]);
  });
});

describe('spec: per-document format overrides (batch 13 §5)', () => {
  it('resolveEffectiveDocFormatting merges the reference formatting with a document override', () => {
    const reference = normalizeDocFormatting({ fontSize: 10, columnDivider: false });
    const effective = resolveEffectiveDocFormatting(reference, { fontSize: 12 });
    expect(effective.fontSize).toBe(12);
    expect(effective.columnDivider).toBe(false);
  });

  it('an empty/absent override resolves to exactly the reference formatting', () => {
    const reference = normalizeDocFormatting({ fontSize: 10 });
    expect(resolveEffectiveDocFormatting(reference, undefined)).toEqual(reference);
    expect(resolveEffectiveDocFormatting(reference, {})).toEqual(reference);
  });

  it('diffDocFormattingOverrides keeps only the fields that differ from the reference', () => {
    const reference = normalizeDocFormatting({ fontSize: 10, titleFontSize: 11, columnDivider: false });
    const working = normalizeDocFormatting({ fontSize: 12, titleFontSize: 11, columnDivider: false });
    expect(diffDocFormattingOverrides(reference, working)).toEqual({ fontSize: 12 });
  });

  it('dialing a value back to the reference drops it from the overrides instead of storing a redundant copy', () => {
    const reference = normalizeDocFormatting({ fontSize: 10 });
    const working = normalizeDocFormatting({ fontSize: 10 });
    expect(diffDocFormattingOverrides(reference, working)).toEqual({});
  });
});

// Fixture mirroring the reference statement (batch 16 §6): a surrogate mother's consent to the
// birth registration of a child born for a Japanese couple, medical conclusion issued by a named
// maternity hospital, signature witnessed by a named notary.
const birthRegistrationCatalog = (birthRegistrationOverride = {}) => normalizeDocumentsCatalog(
  {
    couples: {
      'couple-1': {
        id: 'couple-1',
        partners: [
          {
            id: 'wife-1', role: 'wife', name: { uk: { nominative: 'Кікава Харука' }, en: 'Kikawa Haruka' }, birthDate: '1988-12-03', citizenship: { uk: 'Японії', en: 'Japan' },
          },
          {
            id: 'husband-1', role: 'husband', name: { uk: { nominative: 'Кікава Йосуке' }, en: 'Kikawa Yosuke' }, birthDate: '1988-09-02', citizenship: { uk: 'Японії', en: 'Japan' },
          },
        ],
      },
    },
    surrogateMothers: {
      'surrogate-1': {
        id: 'surrogate-1',
        name: { uk: { nominative: 'Молвінських Юлія Володимирівна' } },
        birthDate: '1993-05-27',
        passport: { number: 'ЕВ409051', issueDate: '2016-04-28' },
        taxId: '3411512481',
        address: { uk: 'Кіровоградська область, місто Гайворон' },
      },
    },
    maternityHospitals: {
      'maternity-hospital-1': {
        id: 'maternity-hospital-1',
        name: { uk: 'КОМУНАЛЬНЕ НЕКОМЕРЦІЙНЕ ПІДПРИЄМСТВО "ПЕРИНАТАЛЬНИЙ ЦЕНТР М. КИЄВА"', en: '' },
        edrpou: '22964365',
      },
    },
    notaries: {
      'notary-1': {
        id: 'notary-1',
        name: { uk: { nominative: 'Алексашина Ю.Б.', instrumental: 'Алексашиною Ю.Б.' } },
        title: { uk: 'приватний нотаріус Київського міського нотаріального округу' },
        city: { uk: 'місто Київ, Україна', en: 'Kyiv, Ukraine' },
      },
    },
    cases: {
      'case-1': {
        id: 'case-1',
        coupleId: 'couple-1',
        surrogateMotherId: 'surrogate-1',
        birthRegistration: {
          child: { sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'місто Київ', en: 'Kyiv' } },
          medicalConclusion: { number: '1234-7H6A-2T6C-CK24', date: '2026-05-16', maternityHospitalId: 'maternity-hospital-1' },
          statementDate: '2026-05-18',
          notaryId: 'notary-1',
          ...birthRegistrationOverride,
        },
      },
    },
  },
  {
    'birth-registration-surrogate-consent': {
      id: 'birth-registration-surrogate-consent',
      languages: ['uk'],
      columns: 1,
      beforeTitle: [
        { uk: 'ЗА МІСЦЕМ ВИМОГИ', align: 'right', bold: true },
        { uk: 'Дані сурогатної матері: {{surrogateMother.name.uk.nominative}}', align: 'left' },
      ],
      title: { uk: 'З А Я В А' },
      paragraphs: [
        {
          uk: 'Я, {{surrogateMother.name.uk.nominative}}, даю згоду на те, щоб батьками, '
            + '{{child.gender.uk.bornByMe}} {{child.birthDate}} року {{child.gender.uk.whichWasBorn}} '
            + '{{child.gender.uk.childGenitive}}, були записані генетичні батьки.',
        },
      ],
    },
  },
);

describe('spec: birth-registration surrogate-consent document (batch 16 §6)', () => {
  describe('child gender grammar (§3/§4/§21 #1-4)', () => {
    it('female: "народженої мною" + "дівчинки"', () => {
      const forms = getChildGenderForms('female');
      expect(forms.uk.bornByMe).toBe('народженої мною');
      expect(forms.uk.childGenitive).toBe('дівчинки');
    });

    it('female: "яка народилась"', () => {
      expect(getChildGenderForms('female').uk.whichWasBorn).toBe('яка народилась');
    });

    it('male: "народженого мною" + "хлопчика"', () => {
      const forms = getChildGenderForms('male');
      expect(forms.uk.bornByMe).toBe('народженого мною');
      expect(forms.uk.childGenitive).toBe('хлопчика');
    });

    it('male: "який народився"', () => {
      expect(getChildGenderForms('male').uk.whichWasBorn).toBe('який народився');
    });

    it('buildChildContext keeps the raw child fields alongside the derived gender forms', () => {
      const child = buildChildContext({ sex: 'female', birthDate: '2026-05-16' });
      expect(child.sex).toBe('female');
      expect(child.birthDate).toBe('2026-05-16');
      expect(child.gender.uk.label).toBe('дівчинка');
      expect(child.gender.en.label).toBe('girl');
    });

    it('an unknown/missing sex resolves to blank grammar forms rather than throwing (§21 #14)', () => {
      const context = resolveCaseContext(birthRegistrationCatalog({ child: { birthDate: '2026-05-16' } }), 'case-1');
      expect(context.child.gender.uk.label).toBe('');
      expect(fillPlaceholders('{{child.gender.uk.label}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
    });
  });

  describe('maternity hospital + notary lookups (§7/§8, §21 #5-6/#12-13)', () => {
    it('resolves the maternity hospital via medicalConclusion.maternityHospitalId', () => {
      const context = resolveCaseContext(birthRegistrationCatalog(), 'case-1');
      expect(context.maternityHospital.edrpou).toBe('22964365');
      expect(fillPlaceholders('{{maternityHospital.name.uk}}', context, 'uk')).toContain('ПЕРИНАТАЛЬНИЙ ЦЕНТР');
    });

    it('resolves the notary via birthRegistration.notaryId', () => {
      const context = resolveCaseContext(birthRegistrationCatalog(), 'case-1');
      expect(context.notary.name.uk.nominative).toBe('Алексашина Ю.Б.');
      expect(fillPlaceholders('{{notary.title.uk}}', context, 'uk')).toBe('приватний нотаріус Київського міського нотаріального округу');
    });

    it('an unresolvable maternityHospitalId never crashes - the variable is just unresolved', () => {
      const catalog = birthRegistrationCatalog({ medicalConclusion: { number: 'X', date: '2026-05-16', maternityHospitalId: 'no-such-hospital' } });
      const context = resolveCaseContext(catalog, 'case-1');
      expect(context.maternityHospital).toBeNull();
      expect(fillPlaceholders('{{maternityHospital.name.uk}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
    });

    it('an unresolvable notaryId never crashes - the variable is just unresolved', () => {
      const catalog = birthRegistrationCatalog({ notaryId: 'no-such-notary' });
      const context = resolveCaseContext(catalog, 'case-1');
      expect(context.notary).toBeNull();
      expect(fillPlaceholders('{{notary.title.uk}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
    });
  });

  describe('Ukrainian date-in-words (§12, §21 #7) - generic, not hardcoded to one date', () => {
    it.each([
      ['2026-05-18', 'вісімнадцятого травня дві тисячі двадцять шостого року'],
      ['1993-05-27', 'двадцять сьомого травня тисяча дев\'ятсот дев\'яносто третього року'],
      ['2020-06-10', 'десятого червня дві тисячі двадцятого року'],
      ['2024-01-01', 'першого січня дві тисячі двадцять четвертого року'],
      ['1988-09-02', 'другого вересня тисяча дев\'ятсот вісімдесят восьмого року'],
    ])('%s -> %s', (iso, expected) => {
      expect(formatUkrainianDateWords(iso)).toBe(expected);
    });

    it('returns an empty string for a non-ISO or invalid value rather than throwing', () => {
      expect(formatUkrainianDateWords('')).toBe('');
      expect(formatUkrainianDateWords('18/05/2026')).toBe('');
      expect(formatUkrainianDateWords(undefined)).toBe('');
      expect(isIsoDate('2026-05-18')).toBe(true);
      expect(isIsoDate('2026-5-18')).toBe(false);
    });

    it('formatEnglishDateWords is generic across dates too', () => {
      expect(formatEnglishDateWords('2026-05-18')).toBe('eighteenth of May, 2026');
      expect(formatEnglishDateWords('1993-05-27')).toBe('twenty-seventh of May, 1993');
    });
  });

  describe('birthRegistration context + statement date words', () => {
    it('exposes birthRegistration.statementDateWords.uk derived from statementDate', () => {
      const context = resolveCaseContext(birthRegistrationCatalog(), 'case-1');
      expect(context.birthRegistration.statementDateWords.uk).toBe('вісімнадцятого травня дві тисячі двадцять шостого року');
      expect(fillPlaceholders('{{birthRegistration.statementDateWords.uk}}', context, 'uk')).toBe('вісімнадцятого травня дві тисячі двадцять шостого року');
    });

    it('renders child.birthDate as DD.MM.YYYY through the existing date formatter (§13)', () => {
      const context = resolveCaseContext(birthRegistrationCatalog(), 'case-1');
      expect(fillPlaceholders('{{child.birthDate}}', context, 'uk')).toBe('16.05.2026');
    });

    it('exposes medicalConclusion.* directly, not just nested under birthRegistration', () => {
      const context = resolveCaseContext(birthRegistrationCatalog(), 'case-1');
      expect(fillPlaceholders('{{medicalConclusion.number}}', context, 'uk')).toBe('1234-7H6A-2T6C-CK24');
    });

    it('resolves surrogateMother.taxId/address.uk and wife/husband.citizenship.uk via the generic path resolver (no code change needed, §9/§10)', () => {
      const context = resolveCaseContext(birthRegistrationCatalog(), 'case-1');
      expect(fillPlaceholders('{{surrogateMother.taxId}}', context, 'uk')).toBe('3411512481');
      expect(fillPlaceholders('{{surrogateMother.address.uk}}', context, 'uk')).toBe('Кіровоградська область, місто Гайворон');
      expect(fillPlaceholders('{{wife.citizenship.uk}}', context, 'uk')).toBe('Японії');
      expect(fillPlaceholders('{{husband.citizenship.uk}}', context, 'uk')).toBe('Японії');
    });
  });

  describe('pre-export validation (§20)', () => {
    it('reports no issues for a fully-filled case', () => {
      expect(validateBirthRegistrationCase(birthRegistrationCatalog(), 'case-1')).toEqual([]);
    });

    it('lists every missing required field without throwing', () => {
      const catalog = birthRegistrationCatalog({
        child: {}, medicalConclusion: {}, statementDate: '', notaryId: '',
      });
      const issues = validateBirthRegistrationCase(catalog, 'case-1');
      // batch 19: with statementDate/notaryId both blank and no transactionId either, there is
      // nothing at all to point at a transaction - reported as one missing reference rather than
      // two separate blank-field paths.
      expect(issues).toEqual(expect.arrayContaining([
        'case.childbirth.maternityHospitalId',
        'case.childbirth.children[0].sex',
        'case.childbirth.children[0].birthDate',
        'case.childbirth.children[0].birthPlace.uk',
        'case.childbirth.children[0].medicalConclusion.number',
        'case.childbirth.children[0].medicalConclusion.date',
        'case.registrations.birth.transactionId',
      ]));
    });

    it('flags an invalid sex value and a non-ISO date without blocking editing', () => {
      const catalog = birthRegistrationCatalog({ child: { sex: 'other', birthDate: '16.05.2026', birthPlace: { uk: 'Київ' } } });
      const issues = validateBirthRegistrationCase(catalog, 'case-1');
      expect(issues).toContain('case.childbirth.children[0].sex (must be "female" or "male")');
      expect(issues).toContain('case.childbirth.children[0].birthDate (must be YYYY-MM-DD)');
    });

    it('flags an unresolvable maternity hospital / notary id', () => {
      const catalog = birthRegistrationCatalog({ notaryId: 'ghost-notary' });
      const issues = validateBirthRegistrationCase(catalog, 'case-1');
      expect(issues).toContain('case.registrations.birth.notaryId (no matching notary)');
    });
  });

  describe('template-level languages/columns + beforeTitle (§14/§15/§16, §21 #8-11/#15)', () => {
    it('a single-column template resolves to one-column-uk regardless of the page-wide layout (§21 #9)', () => {
      const catalog = birthRegistrationCatalog();
      const context = resolveCaseContext(catalog, 'case-1');
      const generated = buildGeneratedDocument(catalog.documents[0], context);
      expect(generated.languages).toEqual(['uk']);
      expect(generated.columns).toBe(1);
      expect(getEffectiveDocLayout(generated, 'two-column')).toBe('one-column-uk');
    });

    it('resolves beforeTitle blocks with placeholders filled and align/bold normalized, kept separate from paragraphs (§21 #8)', () => {
      const catalog = birthRegistrationCatalog();
      const context = resolveCaseContext(catalog, 'case-1');
      const generated = buildGeneratedDocument(catalog.documents[0], context);
      expect(generated.beforeTitle).toHaveLength(2);
      expect(generated.beforeTitle[0]).toMatchObject({ uk: 'ЗА МІСЦЕМ ВИМОГИ', align: 'right', bold: true });
      expect(generated.beforeTitle[1].uk).toBe('Дані сурогатної матері: Молвінських Юлія Володимирівна');
      expect(generated.paragraphs.some(p => p.uk.includes('ЗА МІСЦЕМ ВИМОГИ'))).toBe(false);
    });

    it('a beforeTitle block defaults to 50% width, clamped to a sane 10-100 range (§21 #8)', () => {
      const template = {
        id: 'doc-1',
        title: { uk: 'Заява' },
        beforeTitle: [
          { uk: 'За місцем вимоги', align: 'right' },
          { uk: 'Явне значення', align: 'right', width: 70 },
          { uk: 'Замале', align: 'right', width: 2 },
          { uk: 'Завелике', align: 'right', width: 500 },
        ],
      };
      const generated = buildGeneratedDocument(template, {});
      expect(generated.beforeTitle.map(block => block.width)).toEqual([50, 70, 10, 100]);
    });

    it('a legacy template without languages/columns/beforeTitle keeps rendering under the page-wide layout unchanged (§21 #11)', () => {
      const legacyTemplate = { id: 'legacy', title: { uk: 'Договір', en: 'Agreement' }, paragraphs: [{ uk: 'Текст.', en: 'Text.' }] };
      const generated = buildGeneratedDocument(legacyTemplate, {});
      expect(generated.languages).toBeNull();
      expect(generated.columns).toBeNull();
      expect(generated.beforeTitle).toEqual([]);
      expect(getEffectiveDocLayout(generated, 'two-column')).toBe('two-column');
    });

    it('a missing `en` field renders empty - never undefined, "null", or backfilled from the uk text (§21 #4/#10)', () => {
      const generated = buildGeneratedDocument({ id: 'uk-only', title: { uk: 'Заява' }, beforeTitle: [{ uk: 'Блок' }], paragraphs: [{ uk: 'Текст.' }] }, {});
      [generated.title.en, generated.beforeTitle[0].en, generated.paragraphs[0].en].forEach(value => {
        expect(value).toBe('');
      });
    });
  });

  describe('align/bold formatting on beforeTitle + paragraphs (§17, §21 #15)', () => {
    it('an explicit paragraph.align overrides the default alignment', () => {
      const generated = buildGeneratedDocument({
        id: 'aligned',
        title: { uk: 'Заява' },
        paragraphs: [{ uk: 'Підпис', align: 'right' }, { uk: 'Звичайний абзац' }],
      }, {});
      expect(generated.paragraphs[0].align).toBe('right');
      expect(generated.paragraphs[1].align).toBeUndefined();
    });

    it('an invalid align value normalizes to "left" rather than being passed through as-is', () => {
      const generated = buildGeneratedDocument({
        id: 'bad-align',
        title: { uk: 'Заява' },
        beforeTitle: [{ uk: 'Блок', align: 'diagonal' }],
        paragraphs: [],
      }, {});
      expect(generated.beforeTitle[0].align).toBe('left');
    });
  });
});

// Normalized structure (batch 17): the clinic's logo lives on the clinic record itself
// (parties.clinics[clinicId].logo), never on a caseId - and a case only ever stores clinicId /
// maternityHospitalId references, never the party data itself.
describe('spec: normalized clinic + maternityHospital structure (batch 17)', () => {
  const clinicAndHospitalCatalog = () => normalizeDocumentsCatalog(
    {
      clinics: {
        'clinic-1': {
          id: 'clinic-1',
          name: { uk: 'Клініка генетики репродукції «Вікторія»', en: 'Reproductive Genetics Clinic "Victoria"' },
          logo: [
            { file: '1784230621524-mwe7prn3.jpg', layout: '1col' },
            { file: '1784230642891-qzlngjn1.jpg', layout: '2col' },
          ],
        },
      },
      maternityHospitals: {
        'maternity-hospital-1': {
          id: 'maternity-hospital-1',
          name: { uk: 'КОМУНАЛЬНЕ НЕКОМЕРЦІЙНЕ ПІДПРИЄМСТВО "ПЕРИНАТАЛЬНИЙ ЦЕНТР М. КИЄВА"', en: '' },
          shortName: { uk: 'Перинатальний центр м. Києва', en: '' },
          edrpou: '22964365',
          address: { uk: 'місто Київ', en: 'Kyiv' },
        },
      },
      cases: {
        'case-1': {
          id: 'case-1',
          clinicId: 'clinic-1',
          birthRegistration: {
            medicalConclusion: { number: '1234-7H6A-2T6C-CK24', date: '2026-05-16', maternityHospitalId: 'maternity-hospital-1' },
          },
        },
      },
    },
    {},
  );

  it('finds the clinic through case.clinicId, not a per-case node (§1, §12 #1)', () => {
    const context = resolveCaseContext(clinicAndHospitalCatalog(), 'case-1');
    expect(context.clinic.id).toBe('clinic-1');
    expect(fillPlaceholders('{{clinic.name.uk}}', context, 'uk')).toBe('Клініка генетики репродукції «Вікторія»');
  });

  it('resolveClinicLogo picks the 1col/2col variant from parties.clinics[clinicId].logo, not tied to caseId (§2, §12 #2/#3)', () => {
    const catalog = clinicAndHospitalCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const clinicLogos = catalog.clinicLogos[context.clinic.id];
    expect(getClinicLogo(clinicLogos, 'logo').file).toBe('1784230621524-mwe7prn3.jpg');
    expect(getClinicLogo(clinicLogos, 'logo-long').file).toBe('1784230642891-qzlngjn1.jpg');
  });

  it('exposes maternityHospital.shortName/address/edrpou through the generic resolver, no dedicated code (§3/§5)', () => {
    const context = resolveCaseContext(clinicAndHospitalCatalog(), 'case-1');
    expect(fillPlaceholders('{{maternityHospital.shortName.uk}}', context, 'uk')).toBe('Перинатальний центр м. Києва');
    expect(fillPlaceholders('{{maternityHospital.address.uk}}', context, 'uk')).toBe('місто Київ');
    expect(fillPlaceholders('{{maternityHospital.edrpou}}', context, 'uk')).toBe('22964365');
  });

  it('an unknown clinicId resolves clinic to null without crashing (§10, §12 #8)', () => {
    const catalog = clinicAndHospitalCatalog();
    catalog.parties.cases[0].relations.clinicId = 'no-such-clinic';
    const context = resolveCaseContext(catalog, 'case-1');
    expect(context.clinic).toBeNull();
    expect(() => fillPlaceholders('{{clinic.name.uk}}', context, 'uk')).not.toThrow();
    expect(fillPlaceholders('{{clinic.name.uk}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
  });

  it('an unknown maternityHospitalId resolves maternityHospital to null without crashing (§10, §12 #9)', () => {
    const catalog = clinicAndHospitalCatalog();
    catalog.parties.cases[0].childbirth.maternityHospitalId = 'ghost-hospital';
    const context = resolveCaseContext(catalog, 'case-1');
    expect(context.maternityHospital).toBeNull();
    expect(() => fillPlaceholders('{{maternityHospital.name.uk}}', context, 'uk')).not.toThrow();
    expect(fillPlaceholders('{{maternityHospital.name.uk}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
  });

  it('old clinic.* variables keep working unchanged (§12 #11)', () => {
    const context = resolveCaseContext(richCatalog(), 'case-1');
    expect(fillPlaceholders('{{clinic.medicalDirector.name.uk.genitive}}', context, 'uk')).toBe('Давид Лілії Володимирівни');
  });

  it('persisting the catalog never re-creates parties.cases.clinics (§12 #12)', () => {
    const catalog = clinicAndHospitalCatalog();
    const backend = catalogPartiesToBackend(catalog);
    expect(backend.cases['case-1'].clinics).toBeUndefined();
    expect(Object.values(backend.cases).some(record => record && record.clinics)).toBe(false);
    // The clinic record's own `logo` field is exactly what gets persisted - not a sibling node.
    expect(backend.clinics['clinic-1'].logo).toEqual([
      { file: '1784230621524-mwe7prn3.jpg', layout: '1col' },
      { file: '1784230642891-qzlngjn1.jpg', layout: '2col' },
    ]);
  });
});

// One case is one concrete relations combination (batch 18 §10): couple + clinic + surrogate
// mother + representative(s). Changing the clinic or surrogate mother means creating a new case,
// never mutating this one's relations in place - there is no active/replaced/from/to history.
describe('spec: normalized case structure (batch 18)', () => {
  const twoCasesOneProgramCatalog = () => normalizeDocumentsCatalog(
    {
      couples: {
        'couple-1': {
          id: 'couple-1',
          partners: [
            { id: 'w1', role: 'wife', name: { uk: { nominative: 'Тестова Марія' }, en: 'Testova Mariia' } },
            { id: 'h1', role: 'husband', name: { uk: { nominative: 'Тестовий Петро' }, en: 'Testovyi Petro' } },
          ],
        },
      },
      clinics: {
        'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка А' } },
        'clinic-2': { id: 'clinic-2', name: { uk: 'Клініка Б' } },
      },
      surrogateMothers: {
        'surrogate-1': { id: 'surrogate-1', name: { uk: { nominative: 'Сурогатна Одна' } } },
        'surrogate-2': { id: 'surrogate-2', name: { uk: { nominative: 'Сурогатна Два' } } },
      },
      representatives: {
        'representative-1': { id: 'representative-1', name: { uk: { nominative: 'Представник Один' } } },
      },
      maternityHospitals: {
        'maternity-hospital-1': { id: 'maternity-hospital-1', name: { uk: 'Пологовий 1' }, edrpou: '11111111' },
      },
      notaries: {
        'notary-1': { id: 'notary-1', name: { uk: { nominative: 'Нотаріус Один' } } },
      },
      cases: {
        'case-1': {
          id: 'case-1',
          programId: 'program-1',
          relations: {
            coupleId: 'couple-1', clinicId: 'clinic-1', surrogateMotherId: 'surrogate-1', representativeIds: ['representative-1'],
          },
          program: { type: 'surrogacy', agreement: { number: { uk: 'Договір №1', en: 'Agreement No.1' }, date: '2020-01-01' } },
          childbirth: {
            maternityHospitalId: 'maternity-hospital-1',
            children: [
              { id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' } },
              { id: 'child-2', sex: 'male', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-2', date: '2026-05-16' } },
            ],
          },
          registrations: { birth: { statementDate: '2026-05-18', notaryId: 'notary-1' } },
          documents: { overrides: { 'doc-1': { title: { uk: 'Перейменована заява' } } } },
        },
        'case-2': {
          id: 'case-2',
          programId: 'program-1',
          relations: { coupleId: 'couple-1', clinicId: 'clinic-2', surrogateMotherId: 'surrogate-2', representativeIds: [] },
          program: { type: 'surrogacy', agreement: { number: { uk: '', en: '' }, date: '' } },
          childbirth: { maternityHospitalId: '', children: [] },
          registrations: { birth: { statementDate: '', notaryId: '' } },
          documents: { overrides: {} },
        },
      },
    },
    {},
  );

  it('finds the couple through case.relations.coupleId (§19 #1)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.wife.name.uk.nominative).toBe('Тестова Марія');
    expect(context.husband.name.uk.nominative).toBe('Тестовий Петро');
  });

  it('finds the clinic through case.relations.clinicId (§19 #2)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.clinic.name.uk).toBe('Клініка А');
  });

  it('finds the surrogate mother through case.relations.surrogateMotherId (§19 #3)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.surrogateMother.name.uk.nominative).toBe('Сурогатна Одна');
  });

  it('finds the representative through case.relations.representativeIds (§19 #4)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.representative.name.uk.nominative).toBe('Представник Один');
  });

  it('reads the agreement from case.program.agreement (§19 #5)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(fillPlaceholders('{{case.program.type}}', context, 'uk')).toBe('surrogacy');
    expect(fillPlaceholders('{{case.program.agreement.number.uk}}', context, 'uk')).toBe('Договір №1');
    expect(fillPlaceholders('{{case.program.agreement.date}}', context, 'uk')).toBe('01.01.2020');
  });

  it('reads the maternity hospital from case.childbirth.maternityHospitalId (§19 #6)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.maternityHospital.edrpou).toBe('11111111');
  });

  it('the first child lands in context.child (§19 #7)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.child.sex).toBe('female');
    expect(context.child.gender.uk.label).toBe('дівчинка');
  });

  it('every child lands in context.children, gender-computed (§19 #8)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.children).toHaveLength(2);
    expect(context.children[0].gender.uk.label).toBe('дівчинка');
    expect(context.children[1].gender.uk.label).toBe('хлопчик');
  });

  it('medicalConclusion is read from the child, not the case (§19 #9)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.medicalConclusion.number).toBe('MC-1');
  });

  it('the birth registration is read from case.registrations.birth (§19 #10)', () => {
    const context = resolveCaseContext(twoCasesOneProgramCatalog(), 'case-1');
    expect(context.birthRegistration.statementDate).toBe('2026-05-18');
    expect(context.notary.name.uk.nominative).toBe('Нотаріус Один');
  });

  it('per-case document overrides are read from case.documents.overrides (§19 #11)', () => {
    const catalog = twoCasesOneProgramCatalog();
    const caseRecord = catalog.parties.cases.find(item => item.id === 'case-1');
    const template = { id: 'doc-1', title: { uk: 'Заява' }, paragraphs: [] };
    const generated = buildGeneratedDocument(template, resolveCaseContext(catalog, 'case-1'), caseRecord.documents.overrides['doc-1']);
    expect(generated.title.uk).toBe('Перейменована заява');
  });

  it('two cases sharing a programId can have different surrogate mothers (§19 #12)', () => {
    const catalog = twoCasesOneProgramCatalog();
    expect(resolveCaseContext(catalog, 'case-1').surrogateMother.id).toBe('surrogate-1');
    expect(resolveCaseContext(catalog, 'case-2').surrogateMother.id).toBe('surrogate-2');
  });

  it('two cases sharing a programId can have different clinics (§19 #13)', () => {
    const catalog = twoCasesOneProgramCatalog();
    expect(resolveCaseContext(catalog, 'case-1').clinic.id).toBe('clinic-1');
    expect(resolveCaseContext(catalog, 'case-2').clinic.id).toBe('clinic-2');
  });

  it('no case carries an active/replaced/from/to status (§19 #14)', () => {
    const empty = createEmptyCase({ caseId: 'case-9', programId: 'program-9' });
    expect(empty).not.toHaveProperty('active');
    expect(empty).not.toHaveProperty('replaced');
    expect(empty).not.toHaveProperty('from');
    expect(empty).not.toHaveProperty('to');
  });

  it('the caseId the caller picks determines the current relations combination, not an "active" flag (§19 #15)', () => {
    const catalog = twoCasesOneProgramCatalog();
    const programCases = catalog.parties.cases.filter(item => item.programId === 'program-1');
    expect(programCases).toHaveLength(2);
    expect(resolveCaseContext(catalog, programCases[1].id).clinic.id).toBe('clinic-2');
  });

  it('a legacy-shaped case can be normalized (§19 #16)', () => {
    const legacy = {
      id: 'case-legacy',
      coupleId: 'couple-1',
      clinicId: 'clinic-1',
      surrogateMotherId: 'surrogate-1',
      representativeIds: ['representative-1'],
      surrogacyAgreement: { number: { uk: 'без номера', en: 'without a number' }, date: '' },
      birthRegistration: {
        child: { sex: 'male', birthDate: '2026-01-01', birthPlace: { uk: 'Львів' } },
        medicalConclusion: { number: 'MC-9', date: '2026-01-01', maternityHospitalId: 'maternity-hospital-1' },
        statementDate: '2026-01-05',
        notaryId: 'notary-1',
      },
      docOverrides: { 'doc-1': { title: { uk: 'X' } } },
    };
    const normalized = normalizeCaseRecord(legacy);
    expect(normalized.relations).toEqual({
      coupleId: 'couple-1', clinicId: 'clinic-1', surrogateMotherId: 'surrogate-1', representativeIds: ['representative-1'],
    });
    expect(normalized.program.agreement.number.uk).toBe('без номера');
    expect(normalized.childbirth.maternityHospitalId).toBe('maternity-hospital-1');
    expect(normalized.childbirth.children).toHaveLength(1);
    expect(normalized.childbirth.children[0].sex).toBe('male');
    expect(normalized.childbirth.children[0].medicalConclusion).toEqual({ number: 'MC-9', date: '2026-01-01' });
    expect(normalized.registrations.birth).toEqual({ statementDate: '2026-01-05', notaryId: 'notary-1' });
    expect(normalized.documents.overrides).toEqual({ 'doc-1': { title: { uk: 'X' } } });
  });

  it('after normalizing, the legacy top-level fields are dropped, not carried forward (§19 #17)', () => {
    const normalized = normalizeCaseRecord({
      id: 'case-legacy',
      coupleId: 'couple-1',
      clinicId: 'clinic-1',
      surrogateMotherId: 'surrogate-1',
      representativeIds: ['representative-1'],
      surrogacyAgreement: { number: { uk: 'без номера', en: '' }, date: '' },
      birthRegistration: { statementDate: '2026-01-05', notaryId: 'notary-1' },
      docOverrides: {},
    });
    ['coupleId', 'clinicId', 'surrogateMotherId', 'representativeIds', 'surrogacyAgreement', 'birthRegistration', 'docOverrides']
      .forEach(legacyKey => expect(normalized).not.toHaveProperty(legacyKey));
  });

  it('a two-child array does not break the generated preview (§19 #18)', () => {
    const catalog = twoCasesOneProgramCatalog();
    const template = {
      id: 'doc-1',
      title: { uk: 'Заява' },
      paragraphs: [{ uk: '{{children.0.gender.uk.label}} та {{children.1.gender.uk.label}}' }],
    };
    const context = resolveCaseContext(catalog, 'case-1');
    expect(() => buildGeneratedDocument(template, context)).not.toThrow();
    const generated = buildGeneratedDocument(template, context);
    // Auto-capitalized at render time (§21 #7) - the paragraph starts with a variable that
    // resolved lowercase ("дівчинка"), so it must still read as a proper sentence.
    expect(generated.paragraphs[0].uk).toBe('Дівчинка та хлопчик');
  });

  it('capitalizes the first letter of a paragraph that starts lowercase, without mutating the stored template (§21 #7)', () => {
    const template = {
      id: 'doc-1',
      title: { uk: 'Заява' },
      paragraphs: [{ uk: 'п\'ятого травня дві тисячі... народилася дитина.', en: 'on the fifth of may... a child was born.' }],
    };
    const generated = buildGeneratedDocument(template, {});
    expect(generated.paragraphs[0].uk).toBe('П\'ятого травня дві тисячі... народилася дитина.');
    expect(generated.paragraphs[0].en).toBe('On the fifth of may... a child was born.');
    // The stored template text itself is untouched - only the resolved/rendered output changes.
    expect(template.paragraphs[0].uk).toBe('п\'ятого травня дві тисячі... народилася дитина.');
  });

  it('capitalizes past any leading bold/italic markers, never the marker character itself', () => {
    const template = { id: 'doc-1', title: { uk: 'Заява' }, paragraphs: [{ uk: '**сьогодні** гарний день.' }] };
    const generated = buildGeneratedDocument(template, {});
    expect(generated.paragraphs[0].uk).toBe('**Сьогодні** гарний день.');
  });

  it('is idempotent and leaves an already-capitalized or non-letter-leading paragraph unchanged', () => {
    const template = {
      id: 'doc-1',
      title: { uk: 'Заява' },
      paragraphs: [{ uk: 'Вже з великої літери.' }, { uk: '5 травня відбулося.' }, { uk: '' }],
    };
    const generated = buildGeneratedDocument(template, {});
    expect(generated.paragraphs[0].uk).toBe('Вже з великої літери.');
    expect(generated.paragraphs[1].uk).toBe('5 травня відбулося.');
    expect(generated.paragraphs[2].uk).toBe('');
  });

  it('an empty children array does not break the component (§19 #19)', () => {
    const catalog = twoCasesOneProgramCatalog();
    const context = resolveCaseContext(catalog, 'case-2');
    expect(context.children).toEqual([]);
    expect(context.child.sex).toBeUndefined();
    expect(context.child.gender.uk.label).toBe('');
    expect(() => fillPlaceholders('{{child.birthDate}}', context, 'uk')).not.toThrow();
    expect(fillPlaceholders('{{child.birthDate}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
  });

  it('the birth-registration surrogate-consent statement keeps generating correctly (§19 #20)', () => {
    const catalog = birthRegistrationCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const generated = buildGeneratedDocument(catalog.documents[0], context);
    expect(generated.paragraphs[0].uk).toContain('народженої мною 16.05.2026 року');
    expect(generated.paragraphs[0].uk).toContain('яка народилась');
    expect(generated.paragraphs[0].uk).not.toContain('undefined');
    expect(generated.paragraphs[0].uk).not.toContain('null');
    expect(generated.paragraphs[0].uk).not.toContain('[object Object]');
    expect(validateBirthRegistrationCase(catalog, 'case-1')).toEqual([]);
  });

  it('validateCaseRecord reports the base checklist without throwing on a bare/empty case', () => {
    expect(validateCaseRecord({})).toEqual(expect.arrayContaining([
      'case.id', 'case.programId', 'case.relations.coupleId', 'case.relations.clinicId',
      'case.relations.surrogateMotherId', 'case.childbirth.children', 'case.registrations.birth',
    ]));
    expect(validateCaseRecord(createEmptyCase({ caseId: 'case-9', programId: 'program-9' }))).toEqual(expect.arrayContaining([
      'case.relations.coupleId', 'case.relations.clinicId', 'case.relations.surrogateMotherId', 'case.childbirth.children', 'case.registrations.birth',
    ]));
    expect(validateCaseRecord(twoCasesOneProgramCatalog().parties.cases[0])).toEqual([]);
  });

  it('createChildRecord generates a stable id, never reusing an array index', () => {
    const first = createChildRecord();
    const second = createChildRecord();
    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^child-/);
    expect(first).toMatchObject({ sex: '', birthDate: '', birthPlace: { uk: '', en: '' }, medicalConclusion: { number: '', date: '' } });
  });
});

// A transaction is one concrete combination of couple + surrogate mother + notary for a specific
// legal act (batch 19): decoupled from the case's current relations, so the birth-registration
// statement uses exactly the participants recorded on its own transaction, not whatever the case's
// relations happen to be right now. The couple/surrogate mother below are deliberately different
// from the transaction's, to prove the document really reads through the transaction.
describe('spec: transactions (batch 19)', () => {
  const transactionCatalog = (transactionOverride = {}, birthOverride = {}) => normalizeDocumentsCatalog(
    {
      couples: {
        'couple-1': {
          id: 'couple-1',
          partners: [
            { id: 'w1', role: 'wife', name: { uk: { nominative: 'Кікава Харука' }, en: 'Kikawa Haruka' } },
            { id: 'h1', role: 'husband', name: { uk: { nominative: 'Кікава Йосуке' }, en: 'Kikawa Yosuke' } },
          ],
        },
        'couple-2': {
          id: 'couple-2',
          partners: [{ id: 'w2', role: 'wife', name: { uk: { nominative: 'Інша Дружина' } } }],
        },
      },
      surrogateMothers: {
        'surrogate-1': { id: 'surrogate-1', name: { uk: { nominative: 'Молвінських Юлія Володимирівна' } }, taxId: '3411512481', address: { uk: 'Гайворон' } },
        'surrogate-2': { id: 'surrogate-2', name: { uk: { nominative: 'Інша Сурогатна' } } },
      },
      notaries: {
        'notary-1': {
          id: 'notary-1',
          name: { uk: { nominative: 'Алексашина Юлія Борисівна', genitive: 'Алексашиної Юлії Борисівни', short: 'Алексашина Ю.Б.' } },
          title: { uk: 'приватний нотаріус Київського міського нотаріального округу' },
          city: { uk: 'місто Київ, Україна' },
        },
      },
      maternityHospitals: {},
      transactions: {
        'transaction-1': {
          id: 'transaction-1',
          type: 'birth-registration-surrogate-consent',
          caseId: 'case-1',
          coupleId: 'couple-1',
          surrogateMotherId: 'surrogate-1',
          notaryId: 'notary-1',
          statementDate: '2026-05-18',
          registryNumber: '',
          ...transactionOverride,
        },
      },
      cases: {
        'case-1': {
          id: 'case-1',
          // Deliberately a different couple/surrogate mother than the transaction's, so a test
          // failure here would mean the document fell back to case.relations instead.
          relations: { coupleId: 'couple-2', surrogateMotherId: 'surrogate-2' },
          childbirth: {
            maternityHospitalId: '',
            children: [{ id: 'child-1', sex: 'female', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-1', date: '2026-05-16' } }],
          },
          registrations: { birth: { transactionId: 'transaction-1', ...birthOverride } },
        },
      },
    },
    {},
  );

  it('the transaction is resolved via case.registrations.birth.transactionId (§18 #1)', () => {
    const catalog = transactionCatalog();
    const caseRecord = catalog.parties.cases[0];
    const transaction = resolveTransaction(catalog, caseRecord, 'birth-registration-surrogate-consent');
    expect(transaction.id).toBe('transaction-1');
    // A type mismatch resolves to null, same as a missing transaction.
    expect(resolveTransaction(catalog, caseRecord, 'some-other-document')).toBeNull();
  });

  it('the couple is read via transaction.coupleId, not case.relations (§18 #2, §18 #12)', () => {
    const context = resolveCaseContext(transactionCatalog(), 'case-1');
    expect(context.wife.name.uk.nominative).toBe('Кікава Харука');
    expect(context.husband.name.uk.nominative).toBe('Кікава Йосуке');
  });

  it('the surrogate mother is read via transaction.surrogateMotherId, not case.relations (§18 #3, §18 #12)', () => {
    const context = resolveCaseContext(transactionCatalog(), 'case-1');
    expect(context.surrogateMother.name.uk.nominative).toBe('Молвінських Юлія Володимирівна');
  });

  it('the notary is read via transaction.notaryId (§18 #4)', () => {
    const context = resolveCaseContext(transactionCatalog(), 'case-1');
    expect(context.notary.name.uk.nominative).toBe('Алексашина Юлія Борисівна');
    expect(fillPlaceholders('{{notary.name.uk.short}}', context, 'uk')).toBe('Алексашина Ю.Б.');
    expect(fillPlaceholders('{{notary.title.uk}}', context, 'uk')).toBe('приватний нотаріус Київського міського нотаріального округу');
  });

  it('the statement date is read from transaction.statementDate (§18 #5)', () => {
    const context = resolveCaseContext(transactionCatalog(), 'case-1');
    expect(fillPlaceholders('{{birthRegistration.statementDate}}', context, 'uk')).toBe('18.05.2026');
    expect(fillPlaceholders('{{transaction.statementDate}}', context, 'uk')).toBe('18.05.2026');
    expect(fillPlaceholders('{{birthRegistration.statementDateWords.uk}}', context, 'uk')).toBe('вісімнадцятого травня дві тисячі двадцять шостого року');
  });

  it('the registry number is read from transaction.registryNumber (§18 #6)', () => {
    const context = resolveCaseContext(transactionCatalog({ registryNumber: '12345' }), 'case-1');
    expect(fillPlaceholders('{{birthRegistration.registryNumber}}', context, 'uk')).toBe('12345');
    expect(fillPlaceholders('{{transaction.registryNumber}}', context, 'uk')).toBe('12345');
  });

  it('an empty registryNumber leaves a blank line to fill in by hand, never undefined/null (§18 #7)', () => {
    const context = resolveCaseContext(transactionCatalog(), 'case-1');
    const rendered = fillPlaceholders('Зареєстровано в реєстрі за № {{birthRegistration.registryNumber}}', context, 'uk');
    expect(rendered).toBe(`Зареєстровано в реєстрі за № ${MISSING_VALUE_PLACEHOLDER}`);
    expect(rendered).not.toContain('undefined');
    expect(rendered).not.toContain('null');
  });

  it('case.registrations.birth carries only transactionId, never a duplicated notaryId/statementDate (§18 #8)', () => {
    const emptyCase = createEmptyCase({ caseId: 'case-9', programId: 'program-9' });
    expect(Object.keys(emptyCase.registrations.birth)).toEqual(['transactionId']);
    const catalog = transactionCatalog();
    expect(Object.keys(catalog.parties.cases[0].registrations.birth)).toEqual(['transactionId']);
  });

  it('a transaction never carries status/draft/active fields (§18 #9)', () => {
    const transaction = createTransaction({
      transactionId: 'transaction-9', caseId: 'case-9', type: 'birth-registration-surrogate-consent', coupleId: 'couple-1', surrogateMotherId: 'surrogate-1', notaryId: 'notary-1',
    });
    ['status', 'draft', 'active', 'replaced', 'createdAt', 'updatedAt'].forEach(key => expect(transaction).not.toHaveProperty(key));
    expect(Object.keys(transaction).sort()).toEqual(
      ['id', 'type', 'caseId', 'coupleId', 'surrogateMotherId', 'notaryId', 'statementDate', 'registryNumber'].sort(),
    );
  });

  it('changing the notary on a transaction never touches the notary record itself (§18 #10)', () => {
    const catalog = transactionCatalog();
    const originalNotaryName = catalog.parties.notaries.find(n => n.id === 'notary-1').name.uk.nominative;
    const updatedTransaction = { ...catalog.parties.transactions[0], notaryId: 'notary-1' };
    const updatedCatalog = {
      ...catalog,
      parties: {
        ...catalog.parties,
        transactions: catalog.parties.transactions.map(t => (t.id === updatedTransaction.id ? updatedTransaction : t)),
      },
    };
    expect(updatedCatalog.parties.notaries.find(n => n.id === 'notary-1').name.uk.nominative).toBe(originalNotaryName);
  });

  it('removeTransactionReferences deletes only the transaction and its case reference, never the couple/surrogate mother/notary (§18 #11)', () => {
    const catalog = transactionCatalog();
    const updated = removeTransactionReferences(catalog, 'transaction-1');
    expect(updated.parties.transactions).toHaveLength(0);
    expect(updated.parties.cases[0].registrations.birth.transactionId).toBeUndefined();
    expect(updated.parties.couples.find(c => c.id === 'couple-1')).toBeDefined();
    expect(updated.parties.surrogateMothers.find(s => s.id === 'surrogate-1')).toBeDefined();
    expect(updated.parties.notaries.find(n => n.id === 'notary-1')).toBeDefined();
  });

  it('the generated document uses the specific transaction\'s own participants (§18 #12)', () => {
    const catalog = transactionCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const template = {
      id: 'birth-registration-surrogate-consent',
      title: { uk: 'З А Я В А' },
      paragraphs: [{ uk: 'Я, {{surrogateMother.name.uk.nominative}}, за участі {{wife.name.uk.nominative}} та {{husband.name.uk.nominative}}, нотаріус {{notary.name.uk.nominative}}.' }],
    };
    const generated = buildGeneratedDocument(template, context);
    expect(generated.paragraphs[0].uk).toBe(
      'Я, Молвінських Юлія Володимирівна, за участі Кікава Харука та Кікава Йосуке, нотаріус Алексашина Юлія Борисівна.',
    );
  });

  it('a missing transactionId is reported as a validation warning, not a crash (§18 #13)', () => {
    const catalog = transactionCatalog();
    catalog.parties.cases[0].registrations.birth = {};
    const context = resolveCaseContext(catalog, 'case-1');
    expect(context.transaction).toBeNull();
    expect(() => fillPlaceholders('{{notary.name.uk.nominative}}', context, 'uk')).not.toThrow();
    expect(validateBirthRegistrationCase(catalog, 'case-1')).toContain('case.registrations.birth.transactionId');
  });

  it('an unresolvable notaryId on the transaction never crashes the preview (§18 #14)', () => {
    const catalog = transactionCatalog({ notaryId: 'ghost-notary' });
    const context = resolveCaseContext(catalog, 'case-1');
    expect(context.notary).toBeNull();
    expect(() => fillPlaceholders('{{notary.name.uk.nominative}}', context, 'uk')).not.toThrow();
    expect(fillPlaceholders('{{notary.name.uk.nominative}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
    expect(validateTransaction(catalog, 'transaction-1')).toContain('transaction.notaryId (no matching notary)');
  });

  it('never leaks undefined/null/[object Object] into the generated statement (§18 #15)', () => {
    const catalog = transactionCatalog();
    const context = resolveCaseContext(catalog, 'case-1');
    const template = {
      id: 'birth-registration-surrogate-consent',
      title: { uk: 'З А Я В А' },
      paragraphs: [{ uk: 'Зареєстровано в реєстрі за № {{birthRegistration.registryNumber}}, нотаріус {{notary.name.uk.short}}, {{notary.city.uk}}.' }],
    };
    const generated = buildGeneratedDocument(template, context);
    expect(generated.paragraphs[0].uk).not.toContain('undefined');
    expect(generated.paragraphs[0].uk).not.toContain('null');
    expect(generated.paragraphs[0].uk).not.toContain('[object Object]');
  });

  describe('validateTransaction', () => {
    it('reports no issues for a fully-filled transaction', () => {
      const catalog = transactionCatalog();
      expect(validateTransaction(catalog, 'transaction-1')).toEqual([]);
    });

    it('flags every missing required field, but never registryNumber (empty is allowed)', () => {
      const catalog = transactionCatalog({
        type: '', coupleId: '', surrogateMotherId: '', notaryId: '', statementDate: '', registryNumber: '',
      });
      const issues = validateTransaction(catalog, 'transaction-1');
      expect(issues).toEqual(expect.arrayContaining([
        'transaction.type', 'transaction.coupleId', 'transaction.surrogateMotherId', 'transaction.notaryId', 'transaction.statementDate',
      ]));
      expect(issues).not.toContain('transaction.registryNumber');
    });

    it('flags an unresolvable coupleId/surrogateMotherId', () => {
      const catalog = transactionCatalog({ coupleId: 'ghost-couple', surrogateMotherId: 'ghost-sm' });
      const issues = validateTransaction(catalog, 'transaction-1');
      expect(issues).toContain('transaction.coupleId (no matching couple)');
      expect(issues).toContain('transaction.surrogateMotherId (no matching surrogate mother)');
    });

    it('flags a non-ISO statementDate', () => {
      const catalog = transactionCatalog({ statementDate: '18.05.2026' });
      expect(validateTransaction(catalog, 'transaction-1')).toContain('transaction.statementDate (must be YYYY-MM-DD)');
    });
  });

  it('exposes transaction.statementDateWords.uk/en directly on the transaction, not only via birthRegistration (Batch 18 §3)', () => {
    const context = resolveCaseContext(transactionCatalog(), 'case-1');
    expect(fillPlaceholders('{{transaction.statementDateWords.uk}}', context, 'uk')).toBe('вісімнадцятого травня дві тисячі двадцять шостого року');
    expect(fillPlaceholders('{{transaction.statementDateWords.en}}', context, 'en')).toBe('eighteenth of May, 2026');
  });

  it('a transactionId pointing at a differently-typed transaction is treated as missing, not validated as-is (type-check fix)', () => {
    const catalog = transactionCatalog({ type: 'some-other-document' });
    const context = resolveCaseContext(catalog, 'case-1');
    expect(context.transaction).toBeNull();
    const issues = validateBirthRegistrationCase(catalog, 'case-1');
    expect(issues).toContain('case.registrations.birth.transactionId (transaction is not a birth-registration-surrogate-consent)');
    // Never falls through to reporting the wrongly-typed transaction's own fields as if it were valid.
    expect(issues).not.toContain('transaction.notaryId');
  });

  describe('child selector (Batch 18 §2: twins)', () => {
    const twinsCatalog = () => {
      const catalog = transactionCatalog();
      catalog.parties.cases[0].childbirth.children.push({
        id: 'child-2', sex: 'male', birthDate: '2026-05-16', birthPlace: { uk: 'Київ' }, medicalConclusion: { number: 'MC-2', date: '2026-05-16' },
      });
      return catalog;
    };

    it('defaults to the first child when no childId is given', () => {
      const context = resolveCaseContext(twinsCatalog(), 'case-1');
      expect(context.selectedChildId).toBe('child-1');
      expect(context.child.sex).toBe('female');
      expect(context.children).toHaveLength(2);
    });

    it('selects the requested child by id, leaving the full children array untouched', () => {
      const context = resolveCaseContext(twinsCatalog(), 'case-1', { childId: 'child-2' });
      expect(context.selectedChildId).toBe('child-2');
      expect(context.child.sex).toBe('male');
      expect(context.medicalConclusion.number).toBe('MC-2');
      expect(context.children.map(child => child.id)).toEqual(['child-1', 'child-2']);
    });

    it('an unresolvable childId falls back to the first child rather than crashing', () => {
      const context = resolveCaseContext(twinsCatalog(), 'case-1', { childId: 'ghost-child' });
      expect(context.selectedChildId).toBe('child-1');
    });
  });
});

// spec: Parties page (batch 19) - canonical blank records + reference-check for deletes.
describe('spec: Parties page record shapes', () => {
  it('creates blank couple/surrogateMother/representative/clinic/maternityHospital/notary records with a stable id and no undefined fields', () => {
    const couple = createEmptyCouple();
    expect(couple.id).toMatch(/^couple-/);
    expect(couple.partners.map(partner => partner.role)).toEqual(['wife', 'husband']);
    expect(couple.partners.every(partner => partner.name.uk.nominative === '')).toBe(true);

    const partner = createEmptyPartner({ role: 'wife' });
    expect(partner.role).toBe('wife');
    expect(partner.id).toMatch(/^partner-/);

    expect(createEmptySurrogateMother().id).toMatch(/^surrogate-mother-/);
    expect(createEmptyRepresentative().id).toMatch(/^representative-/);
    expect(createEmptyClinic().id).toMatch(/^clinic-/);
    expect(createEmptyMaternityHospital().id).toMatch(/^maternity-hospital-/);
    expect(createEmptyNotary().id).toMatch(/^notary-/);

    // Two calls never collide, same guarantee makeRecordId already gives createChildRecord/createTransaction.
    expect(createEmptyCouple().id).not.toBe(couple.id);
  });

  it('findPartyReferences reports the cases/transactions pointing at a party, without deleting or blocking anything', () => {
    const catalog = normalizeDocumentsCatalog({
      couples: { 'couple-1': { id: 'couple-1', partners: [{ id: 'p1', role: 'wife', name: { en: 'Jane Doe' } }] } },
      clinics: { 'clinic-1': { id: 'clinic-1', name: { uk: 'Клініка' } } },
      surrogateMothers: { 'surrogate-1': { id: 'surrogate-1', name: { en: 'Jane Roe' } } },
      representatives: { 'rep-1': { id: 'rep-1' } },
      notaries: { 'notary-1': { id: 'notary-1' } },
      maternityHospitals: { 'hospital-1': { id: 'hospital-1' } },
      cases: {
        'case-1': {
          id: 'case-1',
          relations: {
            coupleId: 'couple-1', clinicId: 'clinic-1', surrogateMotherId: 'surrogate-1', representativeIds: ['rep-1'],
          },
          childbirth: { maternityHospitalId: 'hospital-1', children: [] },
        },
      },
      transactions: {
        'transaction-1': {
          id: 'transaction-1', coupleId: 'couple-1', surrogateMotherId: 'surrogate-1', notaryId: 'notary-1',
        },
      },
    });

    expect(findPartyReferences(catalog, 'couples', 'couple-1')).toEqual([
      expect.stringContaining('case'), expect.stringContaining('transaction "transaction-1"'),
    ]);
    expect(findPartyReferences(catalog, 'clinics', 'clinic-1')).toEqual([expect.stringContaining('case')]);
    expect(findPartyReferences(catalog, 'representatives', 'rep-1')).toEqual([expect.stringContaining('case')]);
    expect(findPartyReferences(catalog, 'maternityHospitals', 'hospital-1')).toEqual([expect.stringContaining('case')]);
    expect(findPartyReferences(catalog, 'notaries', 'notary-1')).toEqual([expect.stringContaining('transaction "transaction-1"')]);
    expect(findPartyReferences(catalog, 'couples', 'nobody')).toEqual([]);
  });
});
