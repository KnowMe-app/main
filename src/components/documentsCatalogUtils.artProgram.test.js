// Unit + integration tests for the ART program (case.artProgram) support: resolvers, formatters,
// the four document contexts that reference it (embryoOwnershipStatement, geneticAffinityCertificate,
// racssClinicLetter, medicalServicesAgreement), and couple.marriage enrichment.
//
// All fixtures below are fictional - tests must never carry real client data (same rule as
// documentsCatalogUtils.test.js).
import {
  DERIVED_CONTEXT_FIELD_KEYS,
  MISSING_VALUE_PLACEHOLDER,
  buildEmbryoOwnershipStatementContext,
  buildGeneticAffinityCertificateContext,
  buildMedicalServicesAgreementContext,
  buildRacssClinicLetterContext,
  deepMergeRecords,
  enrichCoupleMarriage,
  enrichHcgTestForTemplate,
  enrichShipment,
  enrichShipmentForTemplate,
  enrichTransferForTemplate,
  enrichUltrasoundForTemplate,
  fillPlaceholders,
  formatDateNumericUk,
  formatDateRange,
  formatEmbryoCountTextUk,
  formatGestationalAgeText,
  formatHcgTestOptionLabel,
  formatPregnancyTypeTextUk,
  formatShipmentOptionLabel,
  formatShipmentPeriod,
  formatTransferOptionLabel,
  formatUltrasoundOptionLabel,
  mergeDocumentsCatalog,
  normalizeDocumentsCatalog,
  parseDocumentsTechnicalInput,
  resolveCaseContext,
  resolveEmbryoStageLabel,
  resolveHcgTest,
  resolveShipment,
  resolveTransferAttempt,
  resolveUltrasound,
  stripDerivedFields,
  validateArtProgramReferences,
  validateDocumentTemplate,
} from './documentsCatalogUtils';

// --- Fixtures ------------------------------------------------------------------------------

const partnerClinic = {
  id: 'partner-clinic-fixture',
  name: { uk: 'Клініка Тестова', en: 'Test Clinic' },
  country: { uk: 'Японія', en: 'Japan' },
  address: { uk: 'Адреса', en: 'Address' },
};

const clinic = {
  id: 'clinic-fixture',
  name: { uk: 'МЦ Приклад', en: 'MC Example' },
  legalName: { uk: 'ТОВ «Приклад»', en: 'Example LLC' },
};

const rawParties = {
  clinics: { [clinic.id]: clinic },
  partnerClinics: { [partnerClinic.id]: partnerClinic },
};

// enrichShipment (and everything built on it) reads `parties.clinics`/`parties.partnerClinics` as
// arrays - the same normalized shape resolveCaseContext always passes it (catalog.parties from
// normalizeDocumentsCatalog), never the raw id-keyed map a Firebase snapshot carries.
const parties = normalizeDocumentsCatalog(rawParties, {}, {}).parties;

// A case that uses the new startDate/endDate planned-period shape (spec: "Kikawa" scenario).
const caseWithDateRangePeriod = {
  id: 'case-daterange',
  relations: { clinicId: clinic.id, partnerClinicId: partnerClinic.id },
  artProgram: {
    medicalIndication: { diagnosis: { uk: 'Тестовий діагноз' } },
    geneticMaterial: { oocyteSourcePartnerRole: 'wife', spermSourcePartnerRole: 'husband' },
    medicalTeam: { physician: { name: { uk: { nominative: 'Тестова Лікарка Лікарівна' } } } },
    embryoShipments: {
      'shipment-1': {
        id: 'shipment-1',
        sourceClinicId: partnerClinic.id,
        destinationClinicId: clinic.id,
        ivfDate: '2021-08-17',
        plannedPeriod: { startDate: '2026-01-01', endDate: '2026-02-01' },
        receivedDate: '2025-08-27',
      },
    },
    transferAttempts: {
      'transfer-1': {
        id: 'transfer-1',
        shipmentId: 'shipment-1',
        date: '2025-09-18',
        embryoCount: 1,
        embryoStage: 'blastocyst',
        hcgTests: {
          'hcg-1': { id: 'hcg-1', date: '2025-09-30', positive: true },
        },
        ultrasounds: {
          'ultrasound-1': {
            id: 'ultrasound-1', date: '2025-10-17', pregnancyConfirmed: true, fetusCount: 1, gestationalAgeWeeks: { from: 6, to: 7 },
          },
        },
      },
      'transfer-2': {
        id: 'transfer-2',
        shipmentId: 'shipment-1',
        date: '2025-11-01',
        embryoCount: 2,
        embryoStage: 'blastocyst',
        hcgTests: {
          'hcg-2': { id: 'hcg-2', date: '2025-11-15', positive: false },
        },
        ultrasounds: {},
      },
    },
  },
  documents: {
    embryoOwnershipStatement: { shipmentId: 'shipment-1' },
    geneticAffinityCertificate: {
      transferAttemptId: 'transfer-1', hcgTestId: 'hcg-1', ultrasoundId: 'ultrasound-1', issueDate: '2025-10-20', outgoingNumber: '42/1',
    },
    racssClinicLetter: { transferAttemptId: 'transfer-1', ultrasoundId: 'ultrasound-1' },
    medicalServicesAgreement: { date: '2025-09-12' },
  },
};

// A case that only ever carries the migrated freeform text period (spec: "Katsura" scenario).
const caseWithTextPeriod = {
  id: 'case-textperiod',
  relations: { clinicId: clinic.id, partnerClinicId: partnerClinic.id },
  artProgram: {
    embryoShipments: {
      'shipment-1': {
        id: 'shipment-1',
        sourceClinicId: partnerClinic.id,
        destinationClinicId: clinic.id,
        ivfDate: '2021-08-17',
        plannedPeriod: { text: { uk: 'квітні – травні 2026 року', en: 'April-May 2026' } },
      },
    },
  },
  documents: {
    embryoOwnershipStatement: { shipmentId: 'shipment-1' },
  },
};

// A pre-artProgram case: no artProgram at all, and embryoOwnershipStatement still stored the old
// way (spec §14 backward compatibility).
const caseWithoutArtProgram = {
  id: 'case-old',
  relations: { clinicId: clinic.id },
  documents: {
    embryoOwnershipStatement: {
      ivfDate: '2021-08-17',
      shipmentPeriod: { uk: 'квітні – травні 2026 року', en: 'April-May 2026' },
    },
  },
};

// Every document reference points at an id that doesn't exist (spec §13/§15).
const caseWithBrokenReferences = {
  id: 'case-broken',
  relations: { clinicId: clinic.id },
  artProgram: {
    embryoShipments: {
      'shipment-1': { id: 'shipment-1', sourceClinicId: partnerClinic.id, destinationClinicId: clinic.id },
    },
    transferAttempts: {
      'transfer-1': {
        id: 'transfer-1', shipmentId: 'shipment-1', date: '2025-09-18', hcgTests: {}, ultrasounds: {},
      },
    },
  },
  documents: {
    embryoOwnershipStatement: { shipmentId: 'shipment-999' },
    geneticAffinityCertificate: { transferAttemptId: 'transfer-999', hcgTestId: 'hcg-999', ultrasoundId: 'ultrasound-999' },
    racssClinicLetter: { transferAttemptId: 'transfer-1', ultrasoundId: 'ultrasound-999' },
  },
};

const buildCatalog = (...cases) => normalizeDocumentsCatalog(
  rawParties,
  {},
  Object.fromEntries(cases.map(caseRecord => [caseRecord.id, caseRecord])),
);

// --- Resolvers -------------------------------------------------------------------------------

describe('spec: null-safe artProgram resolvers (resolveShipment/resolveTransferAttempt/resolveHcgTest/resolveUltrasound)', () => {
  it('resolves an existing shipment/transferAttempt by id', () => {
    const { artProgram } = caseWithDateRangePeriod;
    expect(resolveShipment(caseWithDateRangePeriod, 'shipment-1')).toBe(artProgram.embryoShipments['shipment-1']);
    expect(resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-1')).toBe(artProgram.transferAttempts['transfer-1']);
  });

  it('resolves an existing hCG test/ultrasound from within its transfer attempt', () => {
    const transfer = resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-1');
    expect(resolveHcgTest(transfer, 'hcg-1')).toBe(transfer.hcgTests['hcg-1']);
    expect(resolveUltrasound(transfer, 'ultrasound-1')).toBe(transfer.ultrasounds['ultrasound-1']);
  });

  it('never throws and returns null for a missing/unset id, a missing artProgram, or a missing case', () => {
    expect(resolveShipment(null, 'shipment-1')).toBeNull();
    expect(resolveShipment(caseWithDateRangePeriod, '')).toBeNull();
    expect(resolveShipment(caseWithDateRangePeriod, undefined)).toBeNull();
    expect(resolveShipment(caseWithoutArtProgram, 'shipment-1')).toBeNull();
    expect(resolveShipment(caseWithDateRangePeriod, 'shipment-999')).toBeNull();
    expect(resolveTransferAttempt(caseWithoutArtProgram, 'transfer-1')).toBeNull();
    expect(resolveHcgTest(null, 'hcg-1')).toBeNull();
    expect(resolveHcgTest({ hcgTests: {} }, 'hcg-1')).toBeNull();
    expect(resolveUltrasound(null, 'ultrasound-1')).toBeNull();
  });

  it('a second transfer attempt never overwrites or shadows the first (independent lookup by id)', () => {
    expect(resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-1').embryoCount).toBe(1);
    expect(resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-2').embryoCount).toBe(2);
  });

  it('enrichShipment attaches sourceClinic (partnerClinics) and destinationClinic (clinics), null-safe', () => {
    const shipment = resolveShipment(caseWithDateRangePeriod, 'shipment-1');
    const enriched = enrichShipment(shipment, parties);
    expect(enriched.sourceClinic).toBe(partnerClinic);
    expect(enriched.destinationClinic).toBe(clinic);
    expect(enrichShipment(null, parties)).toBeNull();
  });
});

// --- Formatters --------------------------------------------------------------------------------

describe('spec §6: ART formatters', () => {
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

  it('formatShipmentPeriod prefers startDate/endDate when present, falls back to the migrated text', () => {
    expect(formatShipmentPeriod({ startDate: '2026-01-01', endDate: '2026-02-01' }, 'uk')).toBe('01.01.2026 – 01.02.2026');
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

describe('spec §3/§6: enrichShipmentForTemplate/enrichTransferForTemplate/enrichHcgTestForTemplate/enrichUltrasoundForTemplate', () => {
  it('enrichShipmentForTemplate adds formatted date/period fields on top of the party-enriched shipment', () => {
    const shipment = enrichShipment(resolveShipment(caseWithDateRangePeriod, 'shipment-1'), parties);
    const enriched = enrichShipmentForTemplate(shipment);
    expect(enriched.ivfDateFormatted).toEqual({ uk: '17.08.2021', en: '17 August 2021' });
    expect(enriched.plannedPeriodFormatted.uk).toBe('01.01.2026 – 01.02.2026');
    expect(enriched.receivedDateFormatted.uk).toBe('27.08.2025');
    expect(enriched.sourceClinic).toBe(partnerClinic);
    expect(enrichShipmentForTemplate(null)).toBeNull();
  });

  it('enrichTransferForTemplate adds dateFormatted/embryoCountText/embryoStageLabel and nests the enriched shipment', () => {
    const transfer = resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-1');
    const shipment = enrichShipment(resolveShipment(caseWithDateRangePeriod, transfer.shipmentId), parties);
    const enriched = enrichTransferForTemplate(transfer, shipment);
    expect(enriched.dateFormatted.uk).toBe('18.09.2025');
    expect(enriched.embryoCountText.uk).toBe('один ембріон');
    expect(enriched.embryoStageLabel.uk.genitive).toBe('бластоцисти');
    expect(enriched.shipment.sourceClinic).toBe(partnerClinic);
    expect(enrichTransferForTemplate(null, shipment)).toBeNull();
  });

  it('enrichHcgTestForTemplate/enrichUltrasoundForTemplate add their own formatted fields, null-safe', () => {
    const transfer = resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-1');
    const hcgTest = enrichHcgTestForTemplate(resolveHcgTest(transfer, 'hcg-1'));
    expect(hcgTest.dateFormatted.uk).toBe('30.09.2025');
    expect(enrichHcgTestForTemplate(null)).toBeNull();

    const ultrasound = enrichUltrasoundForTemplate(resolveUltrasound(transfer, 'ultrasound-1'));
    expect(ultrasound.dateFormatted.uk).toBe('17.10.2025');
    expect(ultrasound.gestationalAgeText.uk).toBe('6–7 тижнів');
    expect(ultrasound.pregnancyTypeText.uk).toBe('одноплідна');
    expect(enrichUltrasoundForTemplate(null)).toBeNull();
  });
});

// --- Document contexts -------------------------------------------------------------------------

describe('spec §4: document contexts (embryoOwnershipStatement/geneticAffinityCertificate/racssClinicLetter/medicalServicesAgreement)', () => {
  it('embryoOwnershipStatement resolves shipment via shipmentId (startDate/endDate case)', () => {
    const context = buildEmbryoOwnershipStatementContext(caseWithDateRangePeriod, parties, caseWithDateRangePeriod.documents.embryoOwnershipStatement);
    expect(context.shipment.plannedPeriodFormatted.uk).toBe('01.01.2026 – 01.02.2026');
    expect(context.shipment.sourceClinic).toBe(partnerClinic);
    expect(context.shipment.destinationClinic).toBe(clinic);
  });

  it('embryoOwnershipStatement resolves shipment via shipmentId (migrated text case)', () => {
    const context = buildEmbryoOwnershipStatementContext(caseWithTextPeriod, parties, caseWithTextPeriod.documents.embryoOwnershipStatement);
    expect(context.shipment.plannedPeriodFormatted.uk).toBe('квітні – травні 2026 року');
    expect(context.shipment.plannedPeriodFormatted.en).toBe('April-May 2026');
  });

  it('spec §14: falls back to legacy ivfDate/shipmentPeriod fields when no shipmentId is set, never throwing', () => {
    const context = buildEmbryoOwnershipStatementContext(caseWithoutArtProgram, parties, caseWithoutArtProgram.documents.embryoOwnershipStatement);
    expect(context.shipment.ivfDateFormatted.uk).toBe('17.08.2021');
    expect(context.shipment.plannedPeriodFormatted.uk).toBe('квітні – травні 2026 року');
    expect(context.shipment.sourceClinic).toBeNull();
  });

  it('a case with neither a shipmentId nor legacy fields resolves shipment to null, never throwing', () => {
    const context = buildEmbryoOwnershipStatementContext({ id: 'bare-case' }, parties, undefined);
    expect(context.shipment).toBeNull();
  });

  it('geneticAffinityCertificate resolves transferAttempt/hcgTest/ultrasound by id and computes the print-only fallback fields', () => {
    const context = buildGeneticAffinityCertificateContext(
      caseWithDateRangePeriod,
      parties,
      caseWithDateRangePeriod.documents.geneticAffinityCertificate,
    );
    expect(context.transferAttempt.embryoCountText.uk).toBe('один ембріон');
    expect(context.transferAttempt.shipment.sourceClinic).toBe(partnerClinic);
    expect(context.hcgTest.dateFormatted.uk).toBe('30.09.2025');
    expect(context.ultrasound.gestationalAgeText.uk).toBe('6–7 тижнів');
    expect(context.issueDateOrBlank.uk).toBe('20.10.2025');
    expect(context.outgoingNumberOrBlank).toBe('42/1');
  });

  it('geneticAffinityCertificate falls back to print-only blanks (never persisted) when issueDate/outgoingNumber are unset', () => {
    const context = buildGeneticAffinityCertificateContext(caseWithDateRangePeriod, parties, { transferAttemptId: 'transfer-1' });
    expect(context.issueDateOrBlank.uk).toBe('__.__.____');
    expect(context.outgoingNumberOrBlank).toBe('______');
  });

  it('racssClinicLetter resolves its own transferAttempt/ultrasound independently of geneticAffinityCertificate', () => {
    const context = buildRacssClinicLetterContext(caseWithDateRangePeriod, parties, caseWithDateRangePeriod.documents.racssClinicLetter);
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

describe('spec §10: couple.marriage dateFormatted/certificateDateFormatted, old fields kept', () => {
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

// --- validateArtProgramReferences (spec §13/§15) -------------------------------------------------

describe('spec §13/§15: validateArtProgramReferences reports specific, actionable messages', () => {
  it('reports one message per broken reference, never a generic "field missing"', () => {
    const catalog = buildCatalog(caseWithBrokenReferences);
    const issues = validateArtProgramReferences(catalog, 'case-broken');
    expect(issues).toContain('Не знайдено доставлення ембріонів shipment-999.');
    expect(issues).toContain('Не знайдено спробу переносу transfer-999.');
    expect(issues).toContain('Не знайдено УЗД ultrasound-999 у переносі transfer-1.');
  });

  it('a broken hcgTestId/ultrasoundId under a broken transferAttemptId is only reported once, via the transfer message', () => {
    const catalog = buildCatalog(caseWithBrokenReferences);
    const issues = validateArtProgramReferences(catalog, 'case-broken');
    expect(issues.filter(issue => issue.includes('transfer-999')).length).toBe(1);
  });

  it('a fully-valid case reports no issues', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    expect(validateArtProgramReferences(catalog, 'case-daterange')).toEqual([]);
  });

  it('a missing case id resolves to no issues rather than throwing', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    expect(() => validateArtProgramReferences(catalog, 'does-not-exist')).not.toThrow();
    expect(validateArtProgramReferences(catalog, 'does-not-exist')).toEqual([]);
  });
});

// --- Dropdown option labels (spec §9) -------------------------------------------------------------

describe('spec §9: human-readable dropdown labels, never a raw id', () => {
  it('formats a shipment/transfer/hcgTest/ultrasound as the exact spec example shapes', () => {
    const shipment = resolveShipment(caseWithDateRangePeriod, 'shipment-1');
    expect(formatShipmentOptionLabel(shipment, parties)).toBe('Доставлення 27.08.2025 — Клініка Тестова');

    const transfer = resolveTransferAttempt(caseWithDateRangePeriod, 'transfer-1');
    expect(formatTransferOptionLabel(transfer)).toBe('Перенос 18.09.2025 — один ембріон');

    const hcgTest = resolveHcgTest(transfer, 'hcg-1');
    expect(formatHcgTestOptionLabel(hcgTest)).toBe('ХГЧ 30.09.2025 — позитивний');

    const ultrasound = resolveUltrasound(transfer, 'ultrasound-1');
    expect(formatUltrasoundOptionLabel(ultrasound)).toBe('УЗД 17.10.2025 — 1 плід, 6–7 тижнів');
  });

  it('every label helper is null-safe', () => {
    expect(formatShipmentOptionLabel(null, parties)).toBe('');
    expect(formatTransferOptionLabel(null)).toBe('');
    expect(formatHcgTestOptionLabel(null)).toBe('');
    expect(formatUltrasoundOptionLabel(null)).toBe('');
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
    expect(fillPlaceholders('{{case.artProgram.medicalIndication.diagnosis.uk}}', context, 'uk')).toBe('Тестовий діагноз');
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

  it('spec §8/§9: editing a shared transfer/ultrasound once is reflected simultaneously in geneticAffinityCertificate and racssClinicLetter', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const edited = deepMergeRecords(catalog.cases.find(item => item.id === 'case-daterange'), {
      artProgram: { transferAttempts: { 'transfer-1': { date: '2026-03-03' } } },
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

  it('a case with dangling reference ids resolves without throwing, and validateArtProgramReferences names the exact missing event', () => {
    const catalog = buildCatalog(caseWithBrokenReferences);
    const context = resolveCaseContext(catalog, 'case-broken');
    expect(() => fillPlaceholders('{{embryoOwnershipStatement.shipment.sourceClinic.name.uk}}', context, 'uk')).not.toThrow();
    expect(context.embryoOwnershipStatement.shipment).toBeNull();
    expect(validateArtProgramReferences(catalog, 'case-broken').length).toBeGreaterThan(0);
  });

  it('hCG/ultrasound are selected strictly by id, not array order - picking the second test/scan of a transfer resolves the right one', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange', undefined);
    // transfer-2 carries only hcg-2 (negative) - a document referencing it must never accidentally
    // resolve transfer-1's hcg-1 (positive) instead.
    const caseRecord = catalog.cases.find(item => item.id === 'case-daterange');
    const built = buildGeneticAffinityCertificateContext(caseRecord, catalog.parties, { transferAttemptId: 'transfer-2', hcgTestId: 'hcg-2' });
    expect(built.hcgTest.positive).toBe(false);
    expect(built.hcgTest.dateFormatted.uk).toBe('15.11.2025');
    expect(context).toBeTruthy(); // context built successfully above too
  });
});

// --- Export / stripDerivedFields (spec §11/§12) -------------------------------------------------

describe('spec §11/§12: ART-derived fields are never written back to Firebase', () => {
  it('DERIVED_CONTEXT_FIELD_KEYS lists every runtime-only ART field named in the spec', () => {
    ['plannedPeriodFormatted', 'ivfDateFormatted', 'receivedDateFormatted', 'certificateDateFormatted',
      'embryoCountText', 'embryoStageLabel', 'gestationalAgeText', 'pregnancyTypeText', 'issueDateOrBlank', 'outgoingNumberOrBlank']
      .forEach(key => expect(DERIVED_CONTEXT_FIELD_KEYS).toContain(key));
  });

  it('stripDerivedFields removes every derived key from a resolved geneticAffinityCertificate/embryoOwnershipStatement context', () => {
    const catalog = buildCatalog(caseWithDateRangePeriod);
    const context = resolveCaseContext(catalog, 'case-daterange');
    const stripped = stripDerivedFields({
      embryoOwnershipStatement: context.embryoOwnershipStatement,
      geneticAffinityCertificate: context.geneticAffinityCertificate,
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

// --- Import/export round trip stays additive (spec §12) ------------------------------------------

describe('spec §12: import/merge keeps embryoShipments/transferAttempts as maps and merges per-event', () => {
  it('parseDocumentsTechnicalInput + mergeDocumentsCatalog never converts embryoShipments/transferAttempts into arrays', () => {
    const currentCatalog = buildCatalog(caseWithDateRangePeriod);
    const pasted = parseDocumentsTechnicalInput(JSON.stringify({
      cases: { 'case-daterange': { id: 'case-daterange', artProgram: { transferAttempts: { 'transfer-1': { date: '2026-04-04' } } } } },
    }));
    const { catalog: merged } = mergeDocumentsCatalog(currentCatalog, pasted);
    const mergedCase = merged.cases.find(item => item.id === 'case-daterange');
    expect(Array.isArray(mergedCase.artProgram.embryoShipments)).toBe(false);
    expect(Array.isArray(mergedCase.artProgram.transferAttempts)).toBe(false);
    // The edit to transfer-1 landed...
    expect(mergedCase.artProgram.transferAttempts['transfer-1'].date).toBe('2026-04-04');
    // ...without wiping transfer-2 or shipment-1, which the incoming payload never mentioned.
    expect(mergedCase.artProgram.transferAttempts['transfer-2'].embryoCount).toBe(2);
    expect(mergedCase.artProgram.embryoShipments['shipment-1'].id).toBe('shipment-1');
  });

  it('a deep merge of one hcgTest field never replaces its sibling hcgTests/ultrasounds on the same transfer', () => {
    const currentCatalog = buildCatalog(caseWithDateRangePeriod);
    const currentCase = currentCatalog.cases.find(item => item.id === 'case-daterange');
    const merged = deepMergeRecords(currentCase, {
      artProgram: { transferAttempts: { 'transfer-1': { hcgTests: { 'hcg-1': { positive: false } } } } },
    });
    expect(merged.artProgram.transferAttempts['transfer-1'].hcgTests['hcg-1'].positive).toBe(false);
    expect(merged.artProgram.transferAttempts['transfer-1'].hcgTests['hcg-1'].date).toBe('2025-09-30');
    expect(merged.artProgram.transferAttempts['transfer-1'].ultrasounds['ultrasound-1'].fetusCount).toBe(1);
    expect(merged.artProgram.transferAttempts['transfer-2'].embryoCount).toBe(2);
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
