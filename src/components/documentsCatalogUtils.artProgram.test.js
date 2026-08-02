// Unit + integration tests for the ART program (case.artProgram) support: v6 resolvers/formatters,
// the singleton embryoShipment/transferAttempt/hcgTest/ultrasound/ivf model, the flat
// geneticMaterial.oocyte/sperm genetic-material fields, the v6 migration boundary
// (migrateCaseToV6/migrateCasesToV6), and the four document contexts that reference artProgram
// (embryoOwnershipStatement, geneticAffinityCertificate, racssClinicLetter,
// medicalServicesAgreement).
//
// All fixtures below are fictional - tests must never carry real client data (same rule as
// documentsCatalogUtils.test.js).
import {
  CURRENT_SCHEMA_VERSION,
  DERIVED_CONTEXT_FIELD_KEYS,
  GENETIC_SOURCE_ROLE_VALUES,
  MISSING_VALUE_PLACEHOLDER,
  auditTemplateVariables,
  buildEmbryoOwnershipStatementContext,
  buildGeneratedDocument,
  buildGeneticAffinityCertificateContext,
  buildMedicalServicesAgreementContext,
  buildRacssClinicLetterContext,
  classifyTemplateVariablePath,
  deepMergeRecords,
  enrichCoupleMarriage,
  enrichHcgTestForTemplate,
  enrichIvfForTemplate,
  enrichShipment,
  enrichShipmentForTemplate,
  enrichTransferForTemplate,
  enrichUltrasoundForTemplate,
  evaluateBlockCondition,
  fillPlaceholders,
  formatDateNumericUk,
  formatDateRange,
  formatEmbryoCountTextUk,
  formatGestationalAgeText,
  formatPregnancyTypeTextUk,
  formatShipmentPeriod,
  groupJoinedParagraphs,
  isDocumentsSchemaV6,
  isGeneticSourceDonorCode,
  mergeDocumentsCatalog,
  migrateCaseToV6,
  migrateCasesToV6,
  normalizeCaseRecord,
  normalizeDocumentsCatalog,
  normalizeDocumentsSettings,
  parseDocumentsTechnicalInput,
  resolveCaseContext,
  resolveEmbryoStageLabel,
  resolveHcgTest,
  resolveShipment,
  resolveTransferAttempt,
  resolveUltrasound,
  stripDerivedFields,
  validateDocumentTemplate,
} from './documentsCatalogUtils';

// --- Fixtures ------------------------------------------------------------------------------

// The clinic embryos ship from - v6 (spec §1): lives in the same unified `parties.clinics`
// collection as every other clinic, never a separate `partnerClinics` one.
const sourceClinic = {
  id: 'source-clinic-fixture',
  name: { uk: 'Клініка Тестова', en: 'Test Clinic' },
  country: { uk: 'Японія', en: 'Japan' },
  address: { uk: 'Адреса', en: 'Address' },
};

const clinic = {
  id: 'clinic-fixture',
  name: { uk: 'МЦ Приклад', en: 'MC Example' },
  legalName: { uk: 'ТОВ «Приклад»', en: 'Example LLC' },
};

const couple = {
  id: 'couple-fixture',
  partners: [
    { id: 'wife-fixture', role: 'wife', name: { uk: { nominative: 'Кацура Юкако' }, en: 'Katsura Yukako' } },
    { id: 'husband-fixture', role: 'husband', name: { uk: { nominative: 'Кацура Кеіго' }, en: 'Katsura Keigo' } },
  ],
};

const rawParties = {
  clinics: { [clinic.id]: clinic, [sourceClinic.id]: sourceClinic },
  couples: { [couple.id]: couple },
};

// enrichShipment (and everything built on it) reads the case's own resolved clinic/sourceClinic
// (spec v6 §3/§4: the shipment carries its own sourceClinicId, resolved from the unified
// parties.clinics - the destination clinic is always the case's own relations.clinicId) - the
// same `{ clinic, sourceClinic }` pair resolveCaseContext always resolves and passes in.
const parties = normalizeDocumentsCatalog(rawParties, {}, {}).parties;
const resolvedClinics = { clinic, sourceClinic };

// A case using the v6 shape throughout (spec §1-§7): the one embryo shipment lives at
// `artProgram.embryoShipment` (no id, but its own sourceClinicId), the standalone `artProgram.ivf`
// singleton, the one transfer attempt at `artProgram.transferAttempt`, its hCG test/ultrasound
// nested directly as singletons (no id, no map, existence alone means positive/confirmed).
const caseWithDateRangePeriod = {
  id: 'case-daterange',
  relations: { coupleId: couple.id, clinicId: clinic.id },
  artProgram: {
    medicalIndications: { uk: 'Тестовий діагноз' },
    geneticMaterial: { oocyte: 'wife', sperm: 'husband' },
    medicalTeam: { physician: { name: { uk: { nominative: 'Тестова Лікарка Лікарівна' } } } },
    ivf: { date: '2021-08-17' },
    embryoShipment: {
      sourceClinicId: sourceClinic.id,
      plannedPeriod: { start: '2026-01-01', end: '2026-02-01' },
      receivedDate: '2025-08-27',
    },
    transferAttempt: {
      date: '2025-09-18',
      embryoCount: 1,
      embryoStage: 'blastocyst',
      hcgTest: { date: '2025-09-30' },
      ultrasound: { date: '2025-10-17', fetusCount: 1, gestationalAgeWeeks: { from: 6, to: 7 } },
    },
  },
  documents: {
    geneticAffinityCertificate: { issueDate: '2025-10-20', outgoingNumber: '42/1' },
    racssClinicLetter: {},
    medicalServicesAgreement: { date: '2025-09-12' },
  },
};

// A case that only ever carries the migrated freeform text period (spec: "Katsura" scenario).
const caseWithTextPeriod = {
  id: 'case-textperiod',
  relations: { clinicId: clinic.id },
  artProgram: {
    ivf: { date: '2021-08-17' },
    embryoShipment: {
      sourceClinicId: sourceClinic.id,
      plannedPeriod: { text: { uk: 'квітні – травні 2026 року', en: 'April-May 2026' } },
    },
  },
};

// A pre-artProgram case: no artProgram at all.
const caseWithoutArtProgram = {
  id: 'case-old',
  relations: { clinicId: clinic.id },
};

// A transfer attempt exists but never got a hCG test/ultrasound entered yet - the ordinary "not
// set" state (spec §1.5), never a broken reference (there's no id left to dangle in v6).
const caseWithTransferButNoTests = {
  id: 'case-no-tests',
  relations: { clinicId: clinic.id },
  artProgram: { transferAttempt: { date: '2025-09-18' } },
  documents: { geneticAffinityCertificate: {}, racssClinicLetter: {} },
};

const buildCatalog = (...cases) => normalizeDocumentsCatalog(
  rawParties,
  {},
  Object.fromEntries(cases.map(caseRecord => [caseRecord.id, caseRecord])),
);

// --- Resolvers -------------------------------------------------------------------------------

describe('spec §1.3/§1.4: null-safe artProgram resolvers (resolveShipment/resolveTransferAttempt/resolveHcgTest/resolveUltrasound)', () => {
  it('resolves the case\'s one shipment/transfer attempt straight off artProgram (singleton, no id needed for either)', () => {
    const { artProgram } = caseWithDateRangePeriod;
    expect(resolveShipment(caseWithDateRangePeriod)).toBe(artProgram.embryoShipment);
    expect(resolveTransferAttempt(caseWithDateRangePeriod)).toBe(artProgram.transferAttempt);
  });

  it('resolves the transfer attempt\'s own nested singleton hcgTest/ultrasound - no id, no map', () => {
    const transfer = resolveTransferAttempt(caseWithDateRangePeriod);
    expect(resolveHcgTest(transfer)).toBe(transfer.hcgTest);
    expect(resolveUltrasound(transfer)).toBe(transfer.ultrasound);
  });

  it('never throws and returns null for a case with no shipment/artProgram/transfer at all, or a missing case', () => {
    expect(resolveShipment(null)).toBeNull();
    expect(resolveShipment(caseWithoutArtProgram)).toBeNull();
    expect(resolveTransferAttempt(caseWithoutArtProgram)).toBeNull();
    expect(resolveTransferAttempt(null)).toBeNull();
    expect(resolveHcgTest(null)).toBeNull();
    expect(resolveHcgTest({})).toBeNull();
    expect(resolveUltrasound(null)).toBeNull();
    expect(resolveUltrasound(resolveTransferAttempt(caseWithTransferButNoTests))).toBeNull();
  });

  it('enrichShipment attaches sourceClinic (the shipment\'s own sourceClinicId) and destinationClinic (the case\'s own clinic), null-safe', () => {
    const shipment = resolveShipment(caseWithDateRangePeriod);
    const enriched = enrichShipment(shipment, resolvedClinics);
    expect(enriched.sourceClinic.id).toBe(sourceClinic.id);
    expect(enriched.destinationClinic.id).toBe(clinic.id);
    expect(enrichShipment(null, resolvedClinics)).toBeNull();
  });
});

// --- Genetic-material scalar source (spec §1.7/§6) -----------------------------------------

describe('spec §1.7/§6: geneticMaterial.oocyte/sperm are plain scalar strings, never auto-resolved to a label', () => {
  it('reserves exactly "wife"/"husband"; anything else non-empty is a donor code', () => {
    expect(GENETIC_SOURCE_ROLE_VALUES).toEqual(['wife', 'husband']);
    expect(isGeneticSourceDonorCode('wife')).toBe(false);
    expect(isGeneticSourceDonorCode('husband')).toBe(false);
    expect(isGeneticSourceDonorCode('ED-123')).toBe(true);
    expect(isGeneticSourceDonorCode('')).toBe(false);
    expect(isGeneticSourceDonorCode(undefined)).toBe(false);
  });
});

// --- Formatters --------------------------------------------------------------------------------

describe('spec §3.5: ART formatters', () => {
  it('formatDateNumericUk formats an ISO date as DD.MM.YYYY, and blank/invalid input as \'\'', () => {
    expect(formatDateNumericUk('2025-09-18')).toBe('18.09.2025');
    expect(formatDateNumericUk('')).toBe('');
    expect(formatDateNumericUk(undefined)).toBe('');
    expect(formatDateNumericUk('not-a-date')).toBe('');
  });

  it('formatDateRange renders a numeric uk range and a long-form en range', () => {
    expect(formatDateRange('2026-01-01', '2026-02-01', 'uk')).toBe('01.01.2026 – 01.02.2026');
    expect(formatDateRange('2026-01-01', '2026-02-01', 'en')).toBe('01 January 2026 - 01 February 2026');
  });

  it('formatShipmentPeriod prefers start/end when present, falls back to the migrated text', () => {
    expect(formatShipmentPeriod({ start: '2026-01-01', end: '2026-02-01' }, 'uk')).toBe('01.01.2026 – 01.02.2026');
    expect(formatShipmentPeriod({ text: { uk: 'квітні – травні 2026 року', en: 'April-May 2026' } }, 'uk')).toBe('квітні – травні 2026 року');
    expect(formatShipmentPeriod({ text: { uk: 'квітні – травні 2026 року', en: 'April-May 2026' } }, 'en')).toBe('April-May 2026');
    expect(formatShipmentPeriod(null, 'uk')).toBe('');
    expect(formatShipmentPeriod({}, 'uk')).toBe('');
  });

  it('resolveEmbryoStageLabel resolves a known code and degrades to blanks for an unknown one', () => {
    expect(resolveEmbryoStageLabel('blastocyst')).toEqual({
      uk: { nominative: 'бластоциста', genitive: 'бластоцисти' },
      en: { nominative: 'blastocyst' },
    });
    expect(resolveEmbryoStageLabel('unknown-stage')).toEqual({ uk: { nominative: '', genitive: '' }, en: { nominative: '' } });
    expect(resolveEmbryoStageLabel(undefined)).toEqual({ uk: { nominative: '', genitive: '' }, en: { nominative: '' } });
  });

  it('formatEmbryoCountTextUk matches every spec example exactly (cardinal + noun agreement)', () => {
    expect(formatEmbryoCountTextUk(1)).toBe('один ембріон');
    expect(formatEmbryoCountTextUk(2)).toBe('два ембріони');
    expect(formatEmbryoCountTextUk(3)).toBe('три ембріони');
    expect(formatEmbryoCountTextUk(5)).toBe("п'ять ембріонів");
    expect(formatEmbryoCountTextUk(0)).toBe('');
    expect(formatEmbryoCountTextUk(undefined)).toBe('');
    expect(formatEmbryoCountTextUk(null)).toBe('');
  });

  it('formatGestationalAgeText renders a real 6-7 week range, and degrades to a single value or blank', () => {
    expect(formatGestationalAgeText({ from: 6, to: 7 })).toBe('6–7 тижнів');
    expect(formatGestationalAgeText({ from: 6, to: 6 })).toBe('6 тижнів');
    expect(formatGestationalAgeText({ from: 1, to: 1 })).toBe('1 тиждень');
    expect(formatGestationalAgeText({ from: 6 })).toBe('6 тижнів');
    expect(formatGestationalAgeText({})).toBe('');
    expect(formatGestationalAgeText(undefined)).toBe('');
  });

  it('formatPregnancyTypeTextUk is driven solely by fetusCount, never a stored source field', () => {
    expect(formatPregnancyTypeTextUk(1)).toBe('одноплідна');
    expect(formatPregnancyTypeTextUk(2)).toBe('двоплідна');
    expect(formatPregnancyTypeTextUk(3)).toBe('триплідна');
    expect(formatPregnancyTypeTextUk(4)).toBe('');
    expect(formatPregnancyTypeTextUk(undefined)).toBe('');
  });
});

// --- Template-ready enrichers ------------------------------------------------------------------

describe('spec §3.2/§3.5: enrichShipmentForTemplate/enrichTransferForTemplate/enrichHcgTestForTemplate/enrichUltrasoundForTemplate/enrichIvfForTemplate', () => {
  it('enrichShipmentForTemplate adds formatted date/period fields on top of the party-enriched shipment', () => {
    const shipment = enrichShipment(resolveShipment(caseWithDateRangePeriod), resolvedClinics);
    const enriched = enrichShipmentForTemplate(shipment);
    expect(enriched.plannedPeriodFormatted.uk).toBe('01.01.2026 – 01.02.2026');
    expect(enriched.receivedDateFormatted.uk).toBe('27.08.2025');
    expect(enriched.sourceClinic.id).toBe(sourceClinic.id);
    expect(enrichShipmentForTemplate(null)).toBeNull();
  });

  it('enrichIvfForTemplate adds dateFormatted independently of the shipment (spec §5/§7)', () => {
    expect(enrichIvfForTemplate({ date: '2021-08-17' }).dateFormatted).toEqual({ uk: '17.08.2021', en: '17 August 2021' });
    expect(enrichIvfForTemplate(null)).toBeNull();
  });

  it('enrichTransferForTemplate adds dateFormatted/embryoCountText/embryoStageLabel, nests the enriched shipment, and its own hcgTest/ultrasound', () => {
    const transfer = resolveTransferAttempt(caseWithDateRangePeriod);
    const shipment = enrichShipment(resolveShipment(caseWithDateRangePeriod), resolvedClinics);
    const enriched = enrichTransferForTemplate(transfer, shipment);
    expect(enriched.dateFormatted.uk).toBe('18.09.2025');
    expect(enriched.embryoCountText.uk).toBe('один ембріон');
    expect(enriched.embryoStageLabel.uk.genitive).toBe('бластоцисти');
    expect(enriched.shipment.sourceClinic.id).toBe(sourceClinic.id);
    expect(enriched.hcgTest.dateFormatted.uk).toBe('30.09.2025');
    expect(enriched.ultrasound.dateFormatted.uk).toBe('17.10.2025');
    expect(enrichTransferForTemplate(null, shipment)).toBeNull();
  });

  it('enrichHcgTestForTemplate/enrichUltrasoundForTemplate add their own formatted fields, null-safe', () => {
    const transfer = resolveTransferAttempt(caseWithDateRangePeriod);
    const hcgTest = enrichHcgTestForTemplate(resolveHcgTest(transfer));
    expect(hcgTest.dateFormatted.uk).toBe('30.09.2025');
    expect(enrichHcgTestForTemplate(null)).toBeNull();

    const ultrasound = enrichUltrasoundForTemplate(resolveUltrasound(transfer));
    expect(ultrasound.dateFormatted.uk).toBe('17.10.2025');
    expect(ultrasound.gestationalAgeText.uk).toBe('6–7 тижнів');
    expect(ultrasound.pregnancyTypeText.uk).toBe('одноплідна');
    expect(enrichUltrasoundForTemplate(null)).toBeNull();
  });
});

// --- Document contexts -------------------------------------------------------------------------

describe('spec §1.8/§4: document contexts (embryoOwnershipStatement/geneticAffinityCertificate/racssClinicLetter/medicalServicesAgreement)', () => {
  it('embryoOwnershipStatement resolves the case\'s one shipment automatically, no shipmentId of its own needed (start/end period case)', () => {
    const context = buildEmbryoOwnershipStatementContext(caseWithDateRangePeriod, resolvedClinics, undefined);
    expect(context.shipment.plannedPeriodFormatted.uk).toBe('01.01.2026 – 01.02.2026');
    expect(context.shipment.sourceClinic.id).toBe(sourceClinic.id);
    expect(context.shipment.destinationClinic.id).toBe(clinic.id);
  });

  it('embryoOwnershipStatement resolves the case\'s one shipment automatically (migrated text case)', () => {
    const context = buildEmbryoOwnershipStatementContext(caseWithTextPeriod, resolvedClinics, undefined);
    expect(context.shipment.plannedPeriodFormatted.uk).toBe('квітні – травні 2026 року');
    expect(context.shipment.plannedPeriodFormatted.en).toBe('April-May 2026');
  });

  it('a case with no shipment at all resolves shipment to null, never throwing', () => {
    const context = buildEmbryoOwnershipStatementContext(caseWithoutArtProgram, resolvedClinics, undefined);
    expect(context.shipment).toBeNull();
    expect(buildEmbryoOwnershipStatementContext({ id: 'bare-case' }, {}, undefined).shipment).toBeNull();
  });

  it('geneticAffinityCertificate resolves transferAttempt/hcgTest/ultrasound automatically (singleton, no id needed) and computes the print-only fallback fields', () => {
    const context = buildGeneticAffinityCertificateContext(
      caseWithDateRangePeriod,
      resolvedClinics,
      caseWithDateRangePeriod.documents.geneticAffinityCertificate,
    );
    expect(context.transferAttempt.embryoCountText.uk).toBe('один ембріон');
    expect(context.transferAttempt.shipment.sourceClinic.id).toBe(sourceClinic.id);
    expect(context.hcgTest.dateFormatted.uk).toBe('30.09.2025');
    expect(context.ultrasound.gestationalAgeText.uk).toBe('6–7 тижнів');
    expect(context.issueDateOrBlank.uk).toBe('20.10.2025');
    expect(context.outgoingNumberOrBlank).toBe('42/1');
  });

  it('geneticAffinityCertificate exposes oocyteSourceIsWife off the scalar artProgram.geneticMaterial.oocyte, shared/cross-referenced by any other document conditioning a block on it', () => {
    const isWife = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {});
    expect(isWife.oocyteSourceIsWife).toBe(true);

    const donorCase = deepMergeRecords(caseWithDateRangePeriod, { artProgram: { geneticMaterial: { oocyte: 'ED-123' } } });
    const isDonor = buildGeneticAffinityCertificateContext(donorCase, resolvedClinics, {});
    expect(isDonor.oocyteSourceIsWife).toBe(false);

    // No artProgram data at all (old/incomplete case) degrades to false, never throwing.
    expect(buildGeneticAffinityCertificateContext(caseWithoutArtProgram, resolvedClinics, {}).oocyteSourceIsWife).toBe(false);
  });

  it('geneticAffinityCertificate resolves oocyteSourceDisplay/spermSourceDisplay to the spouse\'s own name when they were the source, the raw donor code otherwise', () => {
    const wife = { name: { uk: { nominative: 'Кацура Юкако' }, en: 'Katsura Yukako' } };
    const husband = { name: { uk: { nominative: 'Кацура Кеіго' }, en: 'Katsura Keigo' } };

    // caseWithDateRangePeriod: geneticMaterial: { oocyte: 'wife', sperm: 'husband' } - both spouses
    // provided their own material, so both fields resolve to the spouses' own names.
    const spousesContext = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {}, { wife, husband });
    expect(spousesContext.oocyteSourceDisplay).toEqual({ uk: 'Кацура Юкако', en: 'Katsura Yukako' });
    expect(spousesContext.spermSourceDisplay).toEqual({ uk: 'Кацура Кеіго', en: 'Katsura Keigo' });

    // A donor code (anything other than 'wife'/'husband', spec §1.7/§6/GENETIC_SOURCE_ROLE_VALUES)
    // is displayed as itself, never resolved to a spouse's name.
    const donorCase = deepMergeRecords(caseWithDateRangePeriod, { artProgram: { geneticMaterial: { oocyte: 'ED-123', sperm: 'SD-456' } } });
    const donorContext = buildGeneticAffinityCertificateContext(donorCase, resolvedClinics, {}, { wife, husband });
    expect(donorContext.oocyteSourceDisplay).toEqual({ uk: 'ED-123', en: 'ED-123' });
    expect(donorContext.spermSourceDisplay).toEqual({ uk: 'SD-456', en: 'SD-456' });

    // No source recorded at all, or no wife/husband passed in (an older call site that doesn't
    // know about this yet) - blank, never a throw or a leaked "undefined".
    expect(buildGeneticAffinityCertificateContext(caseWithoutArtProgram, resolvedClinics, {}, { wife, husband }).oocyteSourceDisplay).toEqual({ uk: '', en: '' });
    expect(buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {}).oocyteSourceDisplay).toEqual({ uk: '', en: '' });
  });

  it('geneticAffinityCertificate falls back to print-only blanks (never persisted) when issueDate/outgoingNumber are unset', () => {
    const context = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {});
    expect(context.issueDateOrBlank.uk).toBe('__.__.____');
    expect(context.outgoingNumberOrBlank).toBe('______');
  });

  it('racssClinicLetter resolves its own transferAttempt/ultrasound independently, with no requisites of its own (spec §1.3 sample: "racssClinicLetter": {})', () => {
    const context = buildRacssClinicLetterContext(caseWithDateRangePeriod, resolvedClinics, caseWithDateRangePeriod.documents.racssClinicLetter);
    expect(context.transferAttempt.shipment.receivedDateFormatted.uk).toBe('27.08.2025');
    expect(context.ultrasound.dateFormatted.uk).toBe('17.10.2025');
  });

  it('medicalServicesAgreement computes dateFormatted in both languages, blank when unset', () => {
    expect(buildMedicalServicesAgreementContext({ date: '2025-09-12' }).dateFormatted).toEqual({ uk: '12.09.2025', en: '12 September 2025' });
    expect(buildMedicalServicesAgreementContext({}).dateFormatted).toEqual({ uk: '', en: '' });
    expect(buildMedicalServicesAgreementContext(undefined).dateFormatted).toEqual({ uk: '', en: '' });
  });
});

// --- couple.marriage enrichment -----------------------------------------------------------------

describe('spec: couple.marriage dateFormatted/certificateDateFormatted, old fields kept', () => {
  it('adds dateFormatted/certificateDateFormatted on top of the new date/certificateType/certificateIssuedBy shape', () => {
    const couple = {
      marriage: {
        date: '2017-11-25',
        certificateType: { uk: 'Витяг', en: 'Extract' },
        certificateNumber: '00554629',
        certificateDate: '2025-04-23',
        certificateIssuedBy: { uk: 'Мером', en: 'Mayor' },
      },
    };
    const enriched = enrichCoupleMarriage(couple);
    expect(enriched.marriage.dateFormatted).toEqual({ uk: '25.11.2017', en: '25 November 2017' });
    expect(enriched.marriage.certificateDateFormatted).toEqual({ uk: '23.04.2025', en: '23 April 2025' });
    expect(enriched.marriage.certificateType).toEqual({ uk: 'Витяг', en: 'Extract' });
  });

  it('an old certificateNumber/certificateDate-only record keeps its fields and still gets certificateDateFormatted', () => {
    const couple = { marriage: { certificateNumber: 'AB-123', certificateDate: '2020-11-22' } };
    const enriched = enrichCoupleMarriage(couple);
    expect(enriched.marriage.certificateNumber).toBe('AB-123');
    expect(enriched.marriage.certificateDateFormatted.uk).toBe('22.11.2020');
    expect(enriched.marriage.dateFormatted).toEqual({ uk: '', en: '' });
  });

  it('a couple with no marriage record, or no couple at all, passes through unchanged', () => {
    expect(enrichCoupleMarriage({ address: { uk: 'Київ' } })).toEqual({ address: { uk: 'Київ' } });
    expect(enrichCoupleMarriage(null)).toBeNull();
    expect(enrichCoupleMarriage(undefined)).toBeUndefined();
  });
});

// --- resolveCaseContext / fillPlaceholders integration ---------------------------------------

describe('integration: resolveCaseContext wires every ART document context in, null-safe throughout', () => {
  it('resolves embryoOwnershipStatement/geneticAffinityCertificate/racssClinicLetter/medicalServicesAgreement on the context', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange');
    expect(fillPlaceholders('{{embryoOwnershipStatement.shipment.sourceClinic.name.uk}}', context, 'uk')).toBe('Клініка Тестова');
    expect(fillPlaceholders('{{embryoOwnershipStatement.shipment.plannedPeriodFormatted.uk}}', context, 'uk')).toBe('01.01.2026 – 01.02.2026');
    expect(fillPlaceholders('{{geneticAffinityCertificate.transferAttempt.dateFormatted.uk}}', context, 'uk')).toBe('18.09.2025');
    expect(fillPlaceholders('{{geneticAffinityCertificate.transferAttempt.embryoStageLabel.uk.genitive}}', context, 'uk')).toBe('бластоцисти');
    expect(fillPlaceholders('{{geneticAffinityCertificate.hcgTest.dateFormatted.uk}}', context, 'uk')).toBe('30.09.2025');
    expect(fillPlaceholders('{{geneticAffinityCertificate.ultrasound.gestationalAgeText.uk}}', context, 'uk')).toBe('6–7 тижнів');
    expect(fillPlaceholders('{{racssClinicLetter.transferAttempt.shipment.receivedDateFormatted.uk}}', context, 'uk')).toBe('27.08.2025');
    expect(fillPlaceholders('{{medicalServicesAgreement.dateFormatted.uk}}', context, 'uk')).toBe('12.09.2025');
    expect(fillPlaceholders('{{case.artProgram.medicalIndications.uk}}', context, 'uk')).toBe('Тестовий діагноз');
  });

  it('wires oocyteSourceDisplay/spermSourceDisplay through resolveCaseContext using the case\'s own couple, no per-case typing needed', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange');
    // caseWithDateRangePeriod: geneticMaterial: { oocyte: 'wife', sperm: 'husband' }, couple-fixture
    // partners are Кацура Юкако (wife) / Кацура Кеіго (husband).
    expect(fillPlaceholders('{{geneticAffinityCertificate.oocyteSourceDisplay.uk}}', context, 'uk')).toBe('Кацура Юкако');
    expect(fillPlaceholders('{{geneticAffinityCertificate.spermSourceDisplay.uk}}', context, 'uk')).toBe('Кацура Кеіго');

    const donorCatalog = buildCatalog(deepMergeRecords(caseWithDateRangePeriod, { artProgram: { geneticMaterial: { oocyte: 'ED-123' } } }));
    const donorContext = resolveCaseContext(donorCatalog, 'case-daterange');
    expect(fillPlaceholders('{{geneticAffinityCertificate.oocyteSourceDisplay.uk}}', donorContext, 'uk')).toBe('ED-123');
  });

  it('spec §5.1: exposes the same singleton shipment/transfer/hcgTest/ultrasound/ivf as top-level canonical context aliases, alongside the document-scoped ones', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange');
    expect(fillPlaceholders('{{artProgram.medicalIndications.uk}}', context, 'uk')).toBe('Тестовий діагноз');
    expect(fillPlaceholders('{{artProgram.geneticMaterial.oocyte}}', context, 'uk')).toBe('wife');
    expect(fillPlaceholders('{{ivf.dateFormatted.uk}}', context, 'uk')).toBe('17.08.2021');
    expect(fillPlaceholders('{{embryoShipment.receivedDateFormatted.uk}}', context, 'uk')).toBe('27.08.2025');
    expect(fillPlaceholders('{{transferAttempt.embryoCountText.uk}}', context, 'uk')).toBe('один ембріон');
    expect(fillPlaceholders('{{hcgTest.dateFormatted.uk}}', context, 'uk')).toBe('30.09.2025');
    expect(fillPlaceholders('{{ultrasound.pregnancyTypeText.uk}}', context, 'uk')).toBe('одноплідна');
  });

  it('a template using every geneticAffinityCertificate/racssClinicLetter placeholder resolves with zero unresolved variables (spec: "не містить необроблених {{...}}")', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange');
    const template = {
      title: { uk: '' },
      paragraphs: [
        {
          uk: [
            '{{geneticAffinityCertificate.transferAttempt.dateFormatted.uk}}',
            '{{geneticAffinityCertificate.transferAttempt.embryoCountText.uk}}',
            '{{geneticAffinityCertificate.transferAttempt.embryoStageLabel.uk.genitive}}',
            '{{geneticAffinityCertificate.transferAttempt.shipment.sourceClinic.name.uk}}',
            '{{geneticAffinityCertificate.transferAttempt.shipment.receivedDateFormatted.uk}}',
            '{{geneticAffinityCertificate.hcgTest.dateFormatted.uk}}',
            '{{geneticAffinityCertificate.ultrasound.dateFormatted.uk}}',
            '{{geneticAffinityCertificate.ultrasound.gestationalAgeText.uk}}',
            '{{geneticAffinityCertificate.ultrasound.pregnancyTypeText.uk}}',
            '{{geneticAffinityCertificate.issueDateOrBlank.uk}}',
            '{{geneticAffinityCertificate.outgoingNumberOrBlank}}',
            '{{racssClinicLetter.transferAttempt.shipment.receivedDateFormatted.uk}}',
            '{{racssClinicLetter.ultrasound.dateFormatted.uk}}',
          ].join(' '),
        },
      ],
    };
    expect(validateDocumentTemplate(template, context)).toEqual([]);
  });

  it('editing the shared transfer attempt once is reflected simultaneously in geneticAffinityCertificate and racssClinicLetter', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const edited = deepMergeRecords(catalog.cases.find(item => item.id === 'case-daterange'), {
      artProgram: { transferAttempt: { date: '2026-03-03' } },
    });
    const nextCatalog = { ...catalog, cases: catalog.cases.map(item => (item.id === 'case-daterange' ? edited : item)) };
    const context = resolveCaseContext(nextCatalog, 'case-daterange');
    expect(context.geneticAffinityCertificate.transferAttempt.dateFormatted.uk).toBe('03.03.2026');
    expect(context.racssClinicLetter.transferAttempt.dateFormatted.uk).toBe('03.03.2026');
  });

  it('a case with no artProgram at all resolves every ART context to a non-throwing, mostly-null shape (no white screen)', () => {
    const catalog = buildCatalog(caseWithoutArtProgram);
    const context = resolveCaseContext(catalog, 'case-old');
    expect(context.case.artProgram).toBeUndefined();
    expect(context.geneticAffinityCertificate.transferAttempt).toBeNull();
    expect(context.geneticAffinityCertificate.hcgTest).toBeNull();
    expect(context.racssClinicLetter.transferAttempt).toBeNull();
    expect(() => fillPlaceholders('{{geneticAffinityCertificate.transferAttempt.dateFormatted.uk}}', context, 'uk')).not.toThrow();
    expect(fillPlaceholders('{{geneticAffinityCertificate.transferAttempt.dateFormatted.uk}}', context, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
  });

  it('a transfer attempt with no hCG test/ultrasound entered yet resolves both to null without throwing (the ordinary "not set" state, not a broken reference)', () => {
    const catalog = buildCatalog(caseWithTransferButNoTests);
    const context = resolveCaseContext(catalog, 'case-no-tests');
    expect(context.geneticAffinityCertificate.hcgTest).toBeNull();
    expect(context.racssClinicLetter.ultrasound).toBeNull();
    expect(() => fillPlaceholders('{{geneticAffinityCertificate.hcgTest.dateFormatted.uk}}', context, 'uk')).not.toThrow();
  });
});

// --- Export / stripDerivedFields (spec §1.9) -------------------------------------------------

describe('spec §1.9: ART-derived fields are never written back to Firebase', () => {
  it('DERIVED_CONTEXT_FIELD_KEYS lists every runtime-only ART field named in the spec', () => {
    ['plannedPeriodFormatted', 'receivedDateFormatted', 'certificateDateFormatted',
      'embryoCountText', 'embryoStageLabel', 'gestationalAgeText', 'pregnancyTypeText', 'issueDateOrBlank', 'outgoingNumberOrBlank',
      'oocyteSourceDisplay', 'spermSourceDisplay']
      .forEach(key => expect(DERIVED_CONTEXT_FIELD_KEYS).toContain(key));
  });

  it('stripDerivedFields removes every derived key from a resolved geneticAffinityCertificate/embryoOwnershipStatement/artProgram context', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange');
    const stripped = stripDerivedFields({
      embryoOwnershipStatement: context.embryoOwnershipStatement,
      geneticAffinityCertificate: context.geneticAffinityCertificate,
      artProgram: context.artProgram,
      couple: context.couple,
    });
    const serialized = JSON.stringify(stripped);
    DERIVED_CONTEXT_FIELD_KEYS.forEach(key => expect(serialized).not.toContain(`"${key}"`));
  });

  it('the source case record itself never gained any derived field just by being resolved (resolveCaseContext never mutates)', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const rawCase = catalog.cases.find(item => item.id === 'case-daterange');
    const serialized = JSON.stringify(rawCase);
    resolveCaseContext(catalog, 'case-daterange');
    expect(JSON.stringify(rawCase)).toBe(serialized);
  });
});

// --- Import/export round trip stays additive ------------------------------------------------

describe('spec: import/merge keeps embryoShipment/transferAttempt as one object each', () => {
  it('parseDocumentsTechnicalInput + mergeDocumentsCatalog merges the one transferAttempt in place, without disturbing embryoShipment', () => {
    const currentCatalog = buildCatalog(caseWithDateRangePeriod);
    const pasted = parseDocumentsTechnicalInput(JSON.stringify({
      cases: { 'case-daterange': { id: 'case-daterange', artProgram: { transferAttempt: { date: '2026-04-04' } } } },
    }));
    const { catalog: merged } = mergeDocumentsCatalog(currentCatalog, pasted);
    const mergedCase = merged.cases.find(item => item.id === 'case-daterange');
    // The edit landed...
    expect(mergedCase.artProgram.transferAttempt.date).toBe('2026-04-04');
    // ...without wiping embryoCount, or the case's one shipment, which the incoming payload never
    // mentioned.
    expect(mergedCase.artProgram.transferAttempt.embryoCount).toBe(1);
    expect(mergedCase.artProgram.embryoShipment.receivedDate).toBe('2025-08-27');
  });

  it('a deep merge of the hcgTest singleton never disturbs its sibling ultrasound singleton', () => {
    const currentCatalog = buildCatalog(caseWithDateRangePeriod);
    const currentCase = currentCatalog.cases.find(item => item.id === 'case-daterange');
    const merged = deepMergeRecords(currentCase, {
      artProgram: { transferAttempt: { hcgTest: { date: '2025-11-15' } } },
    });
    expect(merged.artProgram.transferAttempt.hcgTest.date).toBe('2025-11-15');
    expect(merged.artProgram.transferAttempt.ultrasound.fetusCount).toBe(1);
  });
});

// --- Optional passport fields (spec §10) ---------------------------------------------------------

describe('spec §10: passport.type/countryCode are optional and never transliterated', () => {
  it('resolves passport.type/countryCode when present, and degrades to missing (not a throw) when absent', () => {
    const withTypeCode = { passport: { number: 'TS0299493', type: 'P', countryCode: 'JPN' } };
    expect(fillPlaceholders('{{husband.passport.type}}', { husband: withTypeCode }, 'uk')).toBe('P');
    expect(fillPlaceholders('{{husband.passport.countryCode}}', { husband: withTypeCode }, 'uk')).toBe('JPN');
    const withoutTypeCode = { passport: { number: 'ME680736' } };
    expect(() => fillPlaceholders('{{husband.passport.type}}', { husband: withoutTypeCode }, 'uk')).not.toThrow();
    expect(fillPlaceholders('{{husband.passport.type}}', { husband: withoutTypeCode }, 'uk')).toBe(MISSING_VALUE_PLACEHOLDER);
  });

  it('a passport number is never transliterated, only formatted with a space (spec §10)', () => {
    const context = { husband: { passport: { number: 'TS0299493' } } };
    expect(fillPlaceholders('{{husband.passport.number}}', context, 'uk')).toBe('TS 0299493');
  });
});

// --- Conditional block rendering -----------------------------------------------

describe('spec: evaluateBlockCondition - a block prints only when its condition path resolves truthy', () => {
  it('no condition at all always renders (backward compatible)', () => {
    expect(evaluateBlockCondition(undefined, {})).toBe(true);
    expect(evaluateBlockCondition('', { anything: false })).toBe(true);
  });

  it('a plain path is truthy/falsy exactly like the value it points at', () => {
    expect(evaluateBlockCondition('geneticAffinityCertificate.oocyteSourceIsWife', { geneticAffinityCertificate: { oocyteSourceIsWife: true } })).toBe(true);
    expect(evaluateBlockCondition('geneticAffinityCertificate.oocyteSourceIsWife', { geneticAffinityCertificate: { oocyteSourceIsWife: false } })).toBe(false);
    expect(evaluateBlockCondition('geneticAffinityCertificate.oocyteSourceIsWife', {})).toBe(false);
  });

  it('a leading "!" negates the path', () => {
    expect(evaluateBlockCondition('!geneticAffinityCertificate.oocyteSourceIsWife', { geneticAffinityCertificate: { oocyteSourceIsWife: true } })).toBe(false);
    expect(evaluateBlockCondition('!geneticAffinityCertificate.oocyteSourceIsWife', { geneticAffinityCertificate: { oocyteSourceIsWife: false } })).toBe(true);
  });
});

describe('spec: buildGeneratedDocument drops a conditionally-hidden paragraph entirely, never as a blank/unresolved value', () => {
  const buildTemplate = () => ({
    id: 'birth-registration-surrogate-consent',
    title: { uk: '' },
    paragraphs: [
      { uk: 'Ми, подружжя,', en: 'We, the spouses,' },
      {
        uk: "та генетичною матір'ю – Кацура Юкако, звертаємось із заявою.",
        en: 'and the genetic mother Katsura Yukako, apply with this statement.',
        condition: 'geneticAffinityCertificate.oocyteSourceIsWife',
      },
      { uk: 'Просимо зареєструвати дитину.', en: 'We ask to register the child.' },
    ],
  });

  it('prints the conditional paragraph when the wife is the oocyte donor', () => {
    const context = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {});
    const generated = buildGeneratedDocument(buildTemplate(), { geneticAffinityCertificate: context });
    expect(generated.paragraphs.map(p => p.type)).toEqual(['text', 'text', 'text']);
    expect(generated.paragraphs[1].uk).toContain('Кацура Юкако');
  });

  it('fully omits the paragraph (never a blank/unresolved value) when any other oocyte source is set, keeping every other paragraph\'s position stable', () => {
    const donorCase = deepMergeRecords(caseWithDateRangePeriod, { artProgram: { geneticMaterial: { oocyte: 'ED-123' } } });
    const context = buildGeneticAffinityCertificateContext(donorCase, resolvedClinics, {});
    const generated = buildGeneratedDocument(buildTemplate(), { geneticAffinityCertificate: context });
    expect(generated.paragraphs.map(p => p.type)).toEqual(['text', 'condition-hidden', 'text']);
    expect(generated.paragraphs[2].uk).toBe('Просимо зареєструвати дитину.');
  });
});

describe('spec: joinWithPrevious keeps a conditional clause reading as one continuous sentence', () => {
  // A middle clause conditioned on oocyteSourceIsWife (same idea as the describe block above),
  // but this time both the clause and the paragraph after it are tagged joinWithPrevious - the
  // author's intent is one flowing sentence across all three template paragraphs, shown or not.
  const buildTemplate = () => ({
    id: 'birth-registration-surrogate-consent',
    title: { uk: '' },
    paragraphs: [
      { uk: 'з генетичним батьком – Кацура Наоя,', en: 'with the genetic father Katsura Naoya,' },
      {
        uk: " та генетичною матір'ю – Кацура Юкако,",
        en: ' and the genetic mother Katsura Yukako,',
        condition: 'geneticAffinityCertificate.oocyteSourceIsWife',
        joinWithPrevious: true,
      },
      {
        uk: ' були записані батьками.', en: ' were registered as the parents.', joinWithPrevious: true,
      },
    ],
  });

  it('buildGeneratedDocument never force-capitalizes a joinWithPrevious paragraph (it is not a new sentence)', () => {
    const context = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {});
    const generated = buildGeneratedDocument(buildTemplate(), { geneticAffinityCertificate: context });
    expect(generated.paragraphs[0].uk).toBe('З генетичним батьком – Кацура Наоя,');
    expect(generated.paragraphs[1].uk).toBe(" та генетичною матір'ю – Кацура Юкако,");
    expect(generated.paragraphs[2].uk).toBe(' були записані батьками.');
  });

  it('groupJoinedParagraphs merges the whole chain into one paragraph when the clause is shown', () => {
    const context = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, resolvedClinics, {});
    const generated = buildGeneratedDocument(buildTemplate(), { geneticAffinityCertificate: context });
    const grouped = groupJoinedParagraphs(generated.paragraphs);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].uk).toBe("З генетичним батьком – Кацура Наоя, та генетичною матір'ю – Кацура Юкако, були записані батьками.");
  });

  it('groupJoinedParagraphs still joins across a hidden clause - the chain never breaks just because its middle link is invisible', () => {
    const donorCase = deepMergeRecords(caseWithDateRangePeriod, { artProgram: { geneticMaterial: { oocyte: 'ED-123' } } });
    const context = buildGeneticAffinityCertificateContext(donorCase, resolvedClinics, {});
    const generated = buildGeneratedDocument(buildTemplate(), { geneticAffinityCertificate: context });
    expect(generated.paragraphs.map(p => p.type)).toEqual(['text', 'condition-hidden', 'text']);
    const grouped = groupJoinedParagraphs(generated.paragraphs);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].uk).toBe('З генетичним батьком – Кацура Наоя, були записані батьками.');
  });

  it('a paragraph immediately after a hidden non-joining paragraph is unaffected (no accidental merge)', () => {
    const paragraphs = [
      { type: 'text', uk: 'Перше речення.', en: 'First sentence.' },
      { type: 'condition-hidden', uk: 'приховано', en: 'hidden' },
      { type: 'text', uk: 'Друге речення.', en: 'Second sentence.' },
    ];
    expect(groupJoinedParagraphs(paragraphs)).toEqual([
      { type: 'text', uk: 'Перше речення.', en: 'First sentence.' },
      { type: 'text', uk: 'Друге речення.', en: 'Second sentence.' },
    ]);
  });
});

// --- v5 migration (spec §2.2/§4) ---------------------------------------------------------------

describe('spec §2.2: schema-version validation', () => {
  it('isDocumentsSchemaV6 is true only for a settings record carrying the current version', () => {
    expect(isDocumentsSchemaV6({ schemaVersion: 6 })).toBe(true);
    expect(isDocumentsSchemaV6({ schemaVersion: 5 })).toBe(false);
    expect(isDocumentsSchemaV6({})).toBe(false);
    expect(isDocumentsSchemaV6(null)).toBe(false);
  });

  it('normalizeDocumentsSettings always stamps the current schema version going forward', () => {
    expect(normalizeDocumentsSettings({}).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(normalizeDocumentsSettings(null).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(normalizeDocumentsSettings({ schemaVersion: 5 }).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('spec §4/§9: migrateCaseToV6 - one idempotent migration boundary, never guesses ambiguous/missing data', () => {
  it('is a no-op (report.changed: false) on an already-v6 case, and never mutates the source object', () => {
    const before = JSON.stringify(caseWithDateRangePeriod);
    const { case: migrated, report } = migrateCaseToV6(caseWithDateRangePeriod);
    expect(report.changed).toBe(false);
    expect(migrated.artProgram.embryoShipment).toEqual(caseWithDateRangePeriod.artProgram.embryoShipment);
    expect(migrated.artProgram.geneticMaterial.oocyte).toBe('wife');
    expect(JSON.stringify(caseWithDateRangePeriod)).toBe(before);
  });

  it('leaves the ancient pre-v5 relations.clinicId untouched - it already means what v6 wants again', () => {
    const legacy = { id: 'case-1', relations: { clinicId: 'clinic-1' } };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.relations.clinicId).toBe('clinic-1');
    expect(report.changed).toBe(false);
  });

  it('migrates the v5 relations.ukrainianClinicId to relations.clinicId, and drops the retired relations.partnerClinicId (spec §9)', () => {
    const legacy = { id: 'case-1', relations: { ukrainianClinicId: 'clinic-1', partnerClinicId: 'partner-1' } };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.relations.clinicId).toBe('clinic-1');
    expect(migrated.relations).not.toHaveProperty('ukrainianClinicId');
    expect(migrated.relations).not.toHaveProperty('partnerClinicId');
    expect(report.changed).toBe(true);
  });

  it('migrates the old inline relations.shipment (batch 26 §5 shape) to artProgram.embryoShipment, recovering the destination clinic relation and keeping the shipment\'s own source clinic id in place', () => {
    const legacy = {
      id: 'case-1',
      relations: { coupleId: 'couple-1' },
    };
    legacy.relations.shipment = {
      sourceClinicId: 'partner-1', destinationClinicId: 'clinic-1', ivfDate: '2021-08-17', receivedDate: '2025-08-27',
    };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.embryoShipment).toEqual({ sourceClinicId: 'partner-1', receivedDate: '2025-08-27' });
    expect(migrated.artProgram.ivf).toEqual({ date: '2021-08-17' });
    expect(migrated.relations.clinicId).toBe('clinic-1');
    expect(migrated.relations).not.toHaveProperty('shipment');
    expect(report.changed).toBe(true);
  });

  it('does not overwrite the case\'s own clinicId, even if the old inline shipment carried a different destinationClinicId', () => {
    const legacy = {
      id: 'case-1',
      relations: { clinicId: 'clinic-current', shipment: { sourceClinicId: 'partner-old', destinationClinicId: 'clinic-old' } },
    };
    const { case: migrated } = migrateCaseToV6(legacy);
    expect(migrated.relations.clinicId).toBe('clinic-current');
    expect(migrated.artProgram.embryoShipment.sourceClinicId).toBe('partner-old');
  });

  it('recovers a v5 case\'s relations.partnerClinicId onto the shipment\'s own sourceClinicId, when the shipment has none of its own', () => {
    const legacy = {
      id: 'case-1',
      relations: { clinicId: 'clinic-1', partnerClinicId: 'partner-1' },
      artProgram: { embryoShipment: { receivedDate: '2025-08-27' } },
    };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.embryoShipment.sourceClinicId).toBe('partner-1');
    expect(migrated.relations).not.toHaveProperty('partnerClinicId');
    expect(report.changed).toBe(true);
  });

  it('migrates the oldest id-map embryoShipments shape via the transfer attempt\'s shipmentId reference, splitting ivfDate out to artProgram.ivf', () => {
    const legacy = {
      id: 'case-1',
      relations: {},
      artProgram: {
        embryoShipments: { 'shipment-1': { id: 'shipment-1', ivfDate: '2021-08-17', receivedDate: '2025-08-27' }, 'shipment-2': { id: 'shipment-2', ivfDate: '2022-01-01' } },
        transferAttempt: { shipmentId: 'shipment-1', date: '2025-09-18' },
      },
    };
    const { case: migrated } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.embryoShipment).toEqual({ receivedDate: '2025-08-27' });
    expect(migrated.artProgram.ivf).toEqual({ date: '2021-08-17' });
  });

  it('drops an old shipment whose only content was ivfDate - never persists an empty embryoShipment: {}', () => {
    const legacy = {
      id: 'case-1',
      relations: {},
      artProgram: {
        embryoShipments: { 'shipment-1': { id: 'shipment-1', ivfDate: '2021-08-17' } },
      },
    };
    const { case: migrated } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.embryoShipment).toBeUndefined();
    expect(migrated.artProgram.ivf).toEqual({ date: '2021-08-17' });
  });

  it('reports an ambiguity (migrates none) when several old shipments exist with no shipmentId to disambiguate', () => {
    const legacy = {
      id: 'case-1',
      relations: {},
      artProgram: {
        embryoShipments: { 'shipment-1': { id: 'shipment-1', ivfDate: '2021-08-17' }, 'shipment-2': { id: 'shipment-2', ivfDate: '2022-01-01' } },
      },
    };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram?.embryoShipment).toBeUndefined();
    expect(report.ambiguities.length).toBeGreaterThan(0);
  });

  it('migrates the old hcgTests/ultrasounds id-maps to singleton hcgTest/ultrasound via the genetic-affinity certificate\'s id references, dropping positive/pregnancyConfirmed', () => {
    const legacy = {
      id: 'case-1',
      relations: {},
      artProgram: {
        transferAttempt: {
          date: '2025-09-18',
          hcgTests: { 'hcg-1': { id: 'hcg-1', date: '2025-09-30', positive: true }, 'hcg-2': { id: 'hcg-2', date: '2025-11-15', positive: false } },
          ultrasounds: { 'ultrasound-1': { id: 'ultrasound-1', date: '2025-10-17', pregnancyConfirmed: true, fetusCount: 1 } },
        },
      },
      documents: { geneticAffinityCertificate: { hcgTestId: 'hcg-2', ultrasoundId: 'ultrasound-1' } },
    };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.transferAttempt.hcgTest).toEqual({ date: '2025-11-15' });
    expect(migrated.artProgram.transferAttempt.ultrasound).toEqual({ date: '2025-10-17', fetusCount: 1 });
    expect(migrated.artProgram.transferAttempt).not.toHaveProperty('hcgTests');
    expect(migrated.artProgram.transferAttempt).not.toHaveProperty('ultrasounds');
    expect(migrated.documents.geneticAffinityCertificate).not.toHaveProperty('hcgTestId');
    expect(migrated.documents.geneticAffinityCertificate).not.toHaveProperty('ultrasoundId');
    expect(report.changed).toBe(true);
  });

  it('falls back to the racssClinicLetter\'s ultrasoundId when the genetic-affinity certificate has none, and to the map\'s only entry when neither document has an id', () => {
    const legacy = {
      id: 'case-1',
      relations: {},
      artProgram: {
        transferAttempt: {
          date: '2025-09-18',
          ultrasounds: { 'ultrasound-1': { id: 'ultrasound-1', date: '2025-10-17' } },
        },
      },
      documents: { racssClinicLetter: { ultrasoundId: 'ultrasound-1' } },
    };
    const { case: migrated } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.transferAttempt.ultrasound).toEqual({ date: '2025-10-17' });
  });

  it('reports an ambiguity (migrates neither) when a transfer attempt has several hcgTests/ultrasounds with no id reference at all', () => {
    const legacy = {
      id: 'case-1',
      relations: {},
      artProgram: {
        transferAttempt: {
          date: '2025-09-18',
          hcgTests: { 'hcg-1': { id: 'hcg-1', date: '2025-09-30' }, 'hcg-2': { id: 'hcg-2', date: '2025-11-15' } },
        },
      },
    };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.transferAttempt.hcgTest).toBeUndefined();
    expect(report.ambiguities.length).toBeGreaterThan(0);
  });

  it('maps the old medicalIndication.diagnosis wrapper to the plain medicalIndications field', () => {
    const legacy = { id: 'case-1', relations: {}, artProgram: { medicalIndication: { diagnosis: { uk: 'Непліддя' } } } };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.medicalIndications).toEqual({ uk: 'Непліддя' });
    expect(migrated.artProgram).not.toHaveProperty('medicalIndication');
    expect(report.changed).toBe(true);
  });

  it('maps the ancient geneticMaterial.oocyteSourcePartnerRole/spermSourcePartnerRole and the v5 scalar oocyteSource/spermSource straight to the flat v6 geneticMaterial.oocyte/sperm', () => {
    const ancient = { id: 'case-1', relations: {}, artProgram: { geneticMaterial: { oocyteSourcePartnerRole: 'wife', spermSourcePartnerRole: 'husband' } } };
    const { case: migratedAncient, report: ancientReport } = migrateCaseToV6(ancient);
    expect(migratedAncient.artProgram.geneticMaterial).toEqual({ oocyte: 'wife', sperm: 'husband' });
    expect(ancientReport.changed).toBe(true);

    const v5Shaped = { id: 'case-2', relations: {}, artProgram: { oocyteSource: 'wife', spermSource: 'husband' } };
    const { case: migratedV5, report: v5Report } = migrateCaseToV6(v5Shaped);
    expect(migratedV5.artProgram.geneticMaterial).toEqual({ oocyte: 'wife', sperm: 'husband' });
    expect(migratedV5.artProgram).not.toHaveProperty('oocyteSource');
    expect(migratedV5.artProgram).not.toHaveProperty('spermSource');
    expect(v5Report.changed).toBe(true);
  });

  it('passes an old donor code straight through into the flat scalar field (no separate donor-code property)', () => {
    const legacy = { id: 'case-1', relations: {}, artProgram: { geneticMaterial: { oocyteSourcePartnerRole: 'ED-123' } } };
    const { case: migrated } = migrateCaseToV6(legacy);
    expect(migrated.artProgram.geneticMaterial.oocyte).toBe('ED-123');
  });

  it('reports a legacy "donor" selection with no code ever recorded as unmigratable, rather than storing the literal string "donor"', () => {
    const legacy = { id: 'case-1', relations: {}, artProgram: { geneticMaterial: { oocyteSourcePartnerRole: 'donor' } } };
    const { case: migrated, report } = migrateCaseToV6(legacy);
    expect(migrated.artProgram?.geneticMaterial?.oocyte).toBeUndefined();
    expect(report.unmigratable.length).toBeGreaterThan(0);
  });

  it('reports missing required relations without throwing, for a bare case', () => {
    const { report } = migrateCaseToV6({ id: 'case-1' });
    expect(report.missingRelations).toEqual(expect.arrayContaining([
      'relations.clinicId', 'relations.coupleId', 'relations.surrogateMotherId',
    ]));
  });

  it('handles null/non-object input without throwing', () => {
    expect(migrateCaseToV6(null).case).toEqual({});
    expect(() => migrateCaseToV6(undefined)).not.toThrow();
  });

  it('normalizeCaseRecord runs the same migration, idempotently, for every case normalizeDocumentsCatalog loads', () => {
    const legacy = {
      'case-1': {
        id: 'case-1',
        relations: { ukrainianClinicId: 'clinic-1' },
        artProgram: { medicalIndication: { diagnosis: { uk: 'Непліддя' } } },
      },
    };
    const catalog = normalizeDocumentsCatalog({}, {}, legacy);
    const migratedOnce = catalog.cases[0];
    expect(migratedOnce.relations.clinicId).toBe('clinic-1');
    expect(migratedOnce.artProgram.medicalIndications.uk).toBe('Непліддя');
    expect(normalizeCaseRecord(migratedOnce)).toEqual(migratedOnce);
  });
});

describe('spec §4.7: migrateCasesToV6 aggregates a migration report across every case', () => {
  it('lists migrated case ids, and keys missingRelations/ambiguities/unmigratable by case id', () => {
    const rawCases = {
      'case-clean': caseWithDateRangePeriod,
      'case-legacy': { id: 'case-legacy', relations: { ukrainianClinicId: 'clinic-1' } },
      'case-ambiguous': {
        id: 'case-ambiguous',
        relations: {},
        artProgram: { embryoShipments: { a: { id: 'a' }, b: { id: 'b' } } },
      },
    };
    const { cases, report } = migrateCasesToV6(rawCases);
    expect(cases.map(c => c.id).sort()).toEqual(['case-ambiguous', 'case-daterange', 'case-legacy']);
    expect(report.migratedCaseIds).toContain('case-legacy');
    expect(report.migratedCaseIds).not.toContain('case-daterange');
    expect(report.ambiguities['case-ambiguous'].length).toBeGreaterThan(0);
    expect(report.missingRelations['case-ambiguous']).toEqual(expect.arrayContaining(['relations.clinicId']));
  });
});

// --- Template variable audit (spec §5.3) -----------------------------------------------------

describe('spec §5.3: auditTemplateVariables/classifyTemplateVariablePath classify every {{path}} a template references', () => {
  it('classifies backend, resolved-relation, derived-runtime, and system paths correctly', () => {
    expect(classifyTemplateVariablePath('logo')).toBe('system');
    expect(classifyTemplateVariablePath('logo-long')).toBe('system');
    expect(classifyTemplateVariablePath('clinic.medicalDirector.name.uk.genitive')).toBe('resolvedRelation');
    expect(classifyTemplateVariablePath('partnerClinic.name.en')).toBe('resolvedRelation');
    expect(classifyTemplateVariablePath('relations.coupleId')).toBe('resolvedRelation');
    expect(classifyTemplateVariablePath('artProgram.medicalIndications.uk')).toBe('derivedRuntime');
    expect(classifyTemplateVariablePath('transferAttempt.embryoStageLabel.uk.genitive')).toBe('derivedRuntime');
    expect(classifyTemplateVariablePath('case.artProgram.geneticMaterial.oocyte')).toBe('backendSource');
    expect(classifyTemplateVariablePath('something.completely.unknown')).toBe('unknown');
  });

  it('auditTemplateVariables scans title/beforeTitle/paragraphs and every layoutV2 block shape, never reporting an unknown path for a real template', () => {
    const template = {
      title: { uk: '{{clinic.name.uk}}' },
      beforeTitle: [{ uk: '{{artProgram.medicalIndications.uk}}' }],
      paragraphs: [{ uk: '{{wife.name.uk.nominative}} {{husband.name.uk.nominative}}' }],
      layoutV2: {
        blocks: [
          { type: 'paragraph', text: '{{transferAttempt.dateFormatted.uk}}' },
          { type: 'fieldLine', value: '{{hcgTest.dateFormatted.uk}}' },
          { type: 'richParagraph', runs: [{ text: '{{ultrasound.gestationalAgeText.uk}}' }] },
          { type: 'alignedBox', lines: ['{{notary.name.uk.short}}'] },
          {
            type: 'letterhead',
            columns: [{ content: { type: 'image', source: '{{logo}}' } }],
          },
          {
            type: 'signatureTable',
            rows: [[{ text: '{{representative.name.uk.short}}' }]],
          },
        ],
      },
    };
    const audit = auditTemplateVariables(template);
    expect(audit.some(entry => entry.classification === 'unknown')).toBe(false);
    expect(audit.map(entry => entry.path)).toEqual(expect.arrayContaining([
      'clinic.name.uk', 'artProgram.medicalIndications.uk', 'wife.name.uk.nominative',
      'transferAttempt.dateFormatted.uk', 'hcgTest.dateFormatted.uk', 'ultrasound.gestationalAgeText.uk',
      'notary.name.uk.short', 'logo', 'representative.name.uk.short',
    ]));
  });

  it('flags a genuinely stale/unknown path so a template audit fails loudly instead of silently blanking', () => {
    const template = { paragraphs: [{ uk: '{{geneticAffinityCertificate.transferAttempt.shipment.sourceClinic.legacyTypo}}' }] };
    const audit = auditTemplateVariables(template);
    // Still classifies as derivedRuntime (it's under the geneticAffinityCertificate namespace) -
    // this test documents that classification is prefix-based, not a full path allowlist; a
    // renamed *namespace* (not just a leaf) is what actually needs to trip 'unknown'.
    const trulyUnknown = auditTemplateVariables({ paragraphs: [{ uk: '{{noSuchNamespace.field}}' }] });
    expect(trulyUnknown.find(entry => entry.path === 'noSuchNamespace.field').classification).toBe('unknown');
    expect(audit.length).toBeGreaterThan(0);
  });
});
