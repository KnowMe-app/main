// Pure data logic for the Documents page (legal/client document generator). Everything here is
// UI-free so it can be unit-tested: parsing the paste-and-parse technical input, additively
// merging parsed records into the backend catalog, resolving a case's parties into a placeholder
// context, filling {{placeholder}} tokens, and normalizing the backend-persisted settings record
// (favourite formatting values + recently-used cases).

export const DOCUMENTS_PARTIES_PATH = 'documentsBuilder/parties';
export const DOCUMENTS_TEMPLATES_PATH = 'documentsBuilder/templates';
export const DOCUMENTS_SETTINGS_PATH = 'documentsBuilder/settings';

// Clinic-logo paths (batch 17 §1/§2: normalized under the clinic record itself, not a sibling
// `cases.clinics` node - a clinic is shared across many cases, so its logo was never really
// case-scoped). The Storage folder holds the image files themselves (and is listed directly as
// the source of truth for which variants exist); the Realtime Database node at the same path holds
// the per-variant layout assignments as `{ file, layout }` entries (legacy nodes stored bare
// filenames - both shapes are normalized by normalizeClinicLogoEntries). Writing here writes
// exactly the clinic record's own `logo` field, leaving every other clinic field untouched.
export const clinicLogoDbPath = clinicId => `${DOCUMENTS_PARTIES_PATH}/clinics/${clinicId}/logo`;
export const clinicLogoStorageFolder = clinicId => `${DOCUMENTS_PARTIES_PATH}/clinics/${clinicId}/logo`;
export const clinicLogoStorageFilePath = (clinicId, fileName) => `${clinicLogoStorageFolder(clinicId)}/${fileName}`;

// Pre-batch-17 Storage location - kept only as a temporary read fallback while older clinics still
// have their files there (spec §8); never written to again. Delete once every clinic's logo has
// been re-uploaded under the new path above.
export const legacyClinicLogoStorageFolder = clinicId => `${DOCUMENTS_PARTIES_PATH}/cases/clinics/${clinicId}/logo`;
export const legacyClinicLogoStorageFilePath = (clinicId, fileName) => `${legacyClinicLogoStorageFolder(clinicId)}/${fileName}`;

export const PARTY_COLLECTIONS = ['couples', 'surrogateMothers', 'representatives', 'clinics', 'cases', 'maternityHospitals', 'notaries', 'transactions'];

// mergeCollection derives an id prefix for un-identified incoming records by stripping a trailing
// 's' off the collection name; 'notaries' isn't a simple plural ('notarys' would be wrong), so it
// needs the explicit override.
const COLLECTION_ID_PREFIXES = { notaries: 'notary' };

export const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Firebase RTDB silently turns a JS array into a plain `{"0": ..., "2": ...}` object once it has
// ever been written with a gap (e.g. a record removed by key rather than re-set as a dense array),
// so any array read back from the backend has to tolerate that shape - never assume `.val()` gives
// back a real Array just because it was one when last saved.
export const toArray = value => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (isPlainObject(value)) return Object.values(value).filter(Boolean);
  return [];
};

const makeRecordId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Every collection is stored keyed by record id (catalogPartiesToBackend/catalogTemplatesToBackend
// duplicate that id inside the record too, e.g. `cases/case-1/id: "case-1"`) - a hand-written
// technical-input paste, or a partial edit straight in the Firebase console, can easily carry a
// record under its correct key but without that inner `id` field, relying on the key alone. Plain
// toArray (Object.values) would silently drop that key, and mergeCollection would then treat the
// record as brand new (no `id` to match against an existing one) instead of updating case-1/etc in
// place - this recovers the key as a fallback `id` first, never overriding one the record already has.
const toRecordsWithIdFromKey = raw => {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  if (!isPlainObject(raw)) return [];
  return Object.entries(raw)
    .filter(([, record]) => Boolean(record))
    .map(([key, record]) => (isPlainObject(record) && record.id === undefined ? { ...record, id: key } : record));
};

// --- Clinic logo variants --------------------------------------------------------------------

// The column mode selected at the top of the page is the flag that decides which logo variant is
// used (spec: batch 10): each variant carries one of these assignments, or '' when unassigned.
export const LOGO_LAYOUT_TAGS = ['2col', '1col'];

const normalizeLogoLayoutTag = value => (LOGO_LAYOUT_TAGS.includes(value) ? value : '');

// The DB logo node stores one entry per uploaded variant. Current shape is `{ file, layout }`;
// legacy nodes stored bare filenames, which normalize to unassigned entries.
export const normalizeClinicLogoEntries = raw => toArray(raw)
  .map(entry => {
    if (typeof entry === 'string') return entry ? { file: entry, layout: '' } : null;
    if (isPlainObject(entry) && entry.file) {
      return { file: String(entry.file), layout: normalizeLogoLayoutTag(entry.layout) };
    }
    return null;
  })
  .filter(Boolean);

// One tap on a variant's layout tag: assign that column mode to the variant, moving the
// assignment off any other variant that held it (at most one variant per layout); tapping the
// already-active tag unassigns. Works on both DB entries ({ file }) and the page's loaded
// variants ({ fileName }).
export const applyLogoLayoutAssignment = (variants, fileName, layoutTag) => {
  const tag = normalizeLogoLayoutTag(layoutTag);
  if (!tag) return [...(variants || [])];
  return (variants || []).map(variant => {
    const name = variant.file ?? variant.fileName;
    if (name === fileName) return { ...variant, layout: variant.layout === tag ? '' : tag };
    return variant.layout === tag ? { ...variant, layout: '' } : variant;
  });
};

// Firebase persistence shape of the DB logo node: one entry per variant, the layout key present
// only while assigned (Realtime Database has no use for the '' placeholder).
export const clinicLogoEntriesToBackend = variants => (variants || [])
  .map(variant => {
    const file = String(variant.file ?? variant.fileName ?? '');
    if (!file) return null;
    return variant.layout ? { file, layout: variant.layout } : { file };
  })
  .filter(Boolean);

// --- Catalog -------------------------------------------------------------------------------

export const emptyDocumentsCatalog = () => ({
  parties: {
    couples: [], surrogateMothers: [], representatives: [], clinics: [], cases: [], maternityHospitals: [], notaries: [], transactions: [],
  },
  documents: [],
  clinicLogos: {},
});

// Backend stores every collection keyed by record id (so merges/deletes touch single children);
// this converts a raw snapshot (or a pasted array) back into ordered arrays for the UI.
export const normalizeDocumentsCatalog = (rawParties, rawTemplates) => {
  const catalog = emptyDocumentsCatalog();
  PARTY_COLLECTIONS.forEach(collection => {
    let rawCollection = rawParties?.[collection];
    // `parties/cases/clinics` was the pre-batch-17 clinic-logo file-name store, not a case record -
    // it must never leak into the cases list, even though the canonical logo location has since
    // moved onto the clinic record itself (see clinicLogoDbPath).
    if (collection === 'cases' && isPlainObject(rawCollection)) {
      const { clinics: _clinicLogos, ...caseRecords } = rawCollection;
      rawCollection = caseRecords;
    }
    catalog.parties[collection] = toRecordsWithIdFromKey(rawCollection).filter(record => isPlainObject(record));
    // Batch 18: every case is migrated to the new relations/program/childbirth/registrations/
    // documents shape right at ingestion, so nothing downstream ever has to branch on which shape
    // a given case record happens to carry.
    if (collection === 'cases') catalog.parties.cases = catalog.parties.cases.map(normalizeCaseRecord);
  });
  catalog.documents = toRecordsWithIdFromKey(rawTemplates).filter(record => isPlainObject(record));
  // Primary (batch 17 §1/§2): a clinic's own `logo` field, alongside its name/legalName/etc. - a
  // clinic is shared across many cases, so its logo was never really case-scoped to begin with.
  catalog.parties.clinics.forEach(clinic => {
    const entries = normalizeClinicLogoEntries(clinic.logo);
    if (entries.length) catalog.clinicLogos[String(clinic.id)] = entries;
  });
  // Legacy fallback (spec §8): pre-batch-17 exports kept the layout assignments on a sibling
  // `parties/cases/clinics` node instead - only consulted for a clinic that doesn't already have
  // its own `logo` field, so the new shape always wins once a clinic has been migrated.
  const rawClinicLogos = rawParties?.cases?.clinics;
  if (isPlainObject(rawClinicLogos)) {
    Object.entries(rawClinicLogos).forEach(([clinicId, node]) => {
      if (catalog.clinicLogos[clinicId]) return;
      const entries = normalizeClinicLogoEntries(node?.logo);
      if (entries.length) catalog.clinicLogos[clinicId] = entries;
    });
  }
  return catalog;
};

// --- Technical input (paste-and-parse) ------------------------------------------------------

// Accepts three JSON shapes, so the exact file the backend exports (documentsBuilder/*) can be
// pasted or uploaded as-is, with no manual reshaping:
//   1. The full backend export: `{ parties: { couples, cases, ... }, templates: {...}, settings }`
//      - i.e. `documentsBuilder/{parties,templates,settings}` dumped together, party collections
//      one level deeper under `parties`, documents keyed by id under `templates`.
//   2. The older technical-paste shape: `{ data: {...party collections...}, documents: [...] }`,
//      or top-level party collections without the `data` wrapper.
//   3. Any partial mix of the two - `{ documents: [...] }` alone, `{ parties: {...} }` alone, etc.
export const parseDocumentsTechnicalInput = rawText => {
  const text = String(rawText || '')
    .trim()
    // Tolerate the JSON arriving wrapped in a markdown code fence.
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!text) throw new Error('Paste the documents JSON first.');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error('Invalid JSON: the pasted text could not be parsed.');
  }
  if (!isPlainObject(parsed)) throw new Error('Invalid JSON: expected an object at the top level.');

  const dataRoot = isPlainObject(parsed.data) ? parsed.data : parsed;
  // Full export shape: party collections live under `parties`, not at the root.
  const dataSource = isPlainObject(dataRoot.parties) ? dataRoot.parties : dataRoot;
  // Full export shape names the document templates `templates` (an id-keyed dict, top-level,
  // same as `parties`); the older technical-paste shape calls the same thing `documents` (an
  // array, also top-level) - both normalize the same way via toArray.
  const templatesSource = parsed.templates !== undefined ? parsed.templates : parsed.documents;

  const incoming = emptyDocumentsCatalog();
  // Legacy (pre-batch-17) shape: `parties.cases.clinics` mirrored the clinic-logo layout
  // assignments separately from the clinic record - it is not a case record, so it's carried aside
  // here instead of being imported as a generated case; kept only as a fallback below.
  let legacyClinicLogoNode = null;
  PARTY_COLLECTIONS.forEach(collection => {
    let rawCollection = dataSource[collection];
    if (collection === 'cases' && isPlainObject(rawCollection)) {
      const { clinics: clinicLogoNode, ...caseRecords } = rawCollection;
      rawCollection = caseRecords;
      if (isPlainObject(clinicLogoNode)) legacyClinicLogoNode = clinicLogoNode;
    }
    incoming.parties[collection] = toRecordsWithIdFromKey(rawCollection).filter(record => isPlainObject(record));
    // Batch 18: migrate every pasted case to the new relations/program/childbirth/registrations/
    // documents shape right away, same as normalizeDocumentsCatalog.
    if (collection === 'cases') incoming.parties.cases = incoming.parties.cases.map(normalizeCaseRecord);
  });
  incoming.documents = toRecordsWithIdFromKey(templatesSource).filter(record => isPlainObject(record));

  // Primary (batch 17 §1/§2): each clinic's own `logo` field.
  incoming.parties.clinics.forEach(clinic => {
    const entries = normalizeClinicLogoEntries(clinic.logo);
    if (entries.length) incoming.clinicLogos[String(clinic.id)] = entries;
  });
  // Legacy fallback (spec §8): only for a clinic not already covered by its own `logo` field above.
  if (isPlainObject(legacyClinicLogoNode)) {
    Object.entries(legacyClinicLogoNode).forEach(([clinicId, node]) => {
      if (incoming.clinicLogos[clinicId]) return;
      const entries = normalizeClinicLogoEntries(node?.logo);
      if (entries.length) incoming.clinicLogos[clinicId] = entries;
    });
  }

  const hasParties = PARTY_COLLECTIONS.some(collection => incoming.parties[collection].length > 0);
  const hasClinicLogos = Object.keys(incoming.clinicLogos).length > 0;
  if (!hasParties && incoming.documents.length === 0 && !hasClinicLogos) {
    throw new Error('No parties or documents found in the pasted JSON.');
  }
  return incoming;
};

// Additive deep merge: objects merge recursively, arrays and scalars are replaced only when the
// incoming side actually provides a value - `null`/`undefined`/`''` never wipe existing data.
// Unknown keys are kept as-is on both sides, which is what lets records carry arbitrary extra
// key/value pairs without a schema migration.
export const deepMergeRecords = (base, incoming) => {
  if (incoming === undefined || incoming === null) return base;
  if (isPlainObject(base) && isPlainObject(incoming)) {
    const merged = { ...base };
    Object.keys(incoming).forEach(key => {
      merged[key] = deepMergeRecords(base[key], incoming[key]);
    });
    return merged;
  }
  if (typeof incoming === 'string' && incoming.trim() === '' && base !== undefined && base !== null && base !== '') {
    return base;
  }
  if (Array.isArray(incoming) && incoming.length === 0 && Array.isArray(base) && base.length > 0) {
    return base;
  }
  return incoming;
};

const mergeCollection = (existing, incoming, idPrefix, summary) => {
  const merged = [...existing];
  const indexById = new Map(merged.map((record, index) => [String(record.id), index]));
  incoming.forEach(record => {
    const id = record.id ? String(record.id) : makeRecordId(idPrefix);
    const withId = { ...record, id };
    if (indexById.has(id)) {
      merged[indexById.get(id)] = deepMergeRecords(merged[indexById.get(id)], withId);
      summary.updated += 1;
    } else {
      indexById.set(id, merged.length);
      merged.push(withId);
      summary.added += 1;
    }
  });
  return merged;
};


export const resolveMergedRecordsForPersistence = (currentRecords, mergedRecords, incomingRecords) => {
  const existingIds = new Set((currentRecords || []).map(record => String(record?.id)));
  const usedMergedIndexes = new Set();

  return (incomingRecords || []).map(incomingRecord => {
    const hasIncomingId = Boolean(incomingRecord?.id);
    const incomingId = String(incomingRecord?.id);
    const mergedIndex = (mergedRecords || []).findIndex((mergedRecord, index) => {
      if (usedMergedIndexes.has(index)) return false;
      if (hasIncomingId) return String(mergedRecord?.id) === incomingId;
      return mergedRecord?.id && !existingIds.has(String(mergedRecord.id));
    });

    if (mergedIndex === -1) return incomingRecord;
    usedMergedIndexes.add(mergedIndex);
    return mergedRecords[mergedIndex];
  });
};

// Never destructive: existing records survive untouched unless the incoming payload updates them
// by id, and even then only field-by-field (see deepMergeRecords).
export const mergeDocumentsCatalog = (current, incoming) => {
  const summary = { added: 0, updated: 0 };
  const catalog = emptyDocumentsCatalog();
  PARTY_COLLECTIONS.forEach(collection => {
    catalog.parties[collection] = mergeCollection(
      current?.parties?.[collection] || [],
      incoming?.parties?.[collection] || [],
      COLLECTION_ID_PREFIXES[collection] || collection.replace(/s$/, ''),
      summary,
    );
  });
  catalog.documents = mergeCollection(current?.documents || [], incoming?.documents || [], 'document', summary);
  // Clinic-logo layout assignments are a per-clinic snapshot (not per-field records), so an
  // incoming clinic's list simply replaces the existing one for that clinic id; every other
  // clinic's assignments are kept untouched.
  catalog.clinicLogos = { ...(current?.clinicLogos || {}), ...(incoming?.clinicLogos || {}) };
  return { catalog, summary };
};

// Firebase persistence shape: each collection keyed by id.
export const catalogPartiesToBackend = catalog => PARTY_COLLECTIONS.reduce((acc, collection) => {
  acc[collection] = (catalog.parties[collection] || []).reduce((byId, record) => {
    byId[record.id] = record;
    return byId;
  }, {});
  return acc;
}, {});

export const catalogTemplatesToBackend = catalog => (catalog.documents || []).reduce((byId, record) => {
  byId[record.id] = record;
  return byId;
}, {});

// --- Case context + placeholders ------------------------------------------------------------

const findById = (records, id) => (records || []).find(record => String(record?.id) === String(id)) || null;

// --- Birth-registration surrogate-consent document (batch 16 §6) --------------------------------
// Everything below is derived, not stored: the JSON only ever carries the bare `sex` enum
// (female/male) and ISO dates - every Ukrainian grammatical form (дівчинки/хлопчика, народженої
// мною/народженого мною, яка народилась/який народився...) is computed here so the backend record
// never has to carry hand-typed inflected strings that could drift out of agreement with `sex`.
export const getChildGenderForms = sex => {
  if (sex === 'female') {
    return {
      uk: {
        label: 'дівчинка',
        childNominative: 'дівчинка',
        childGenitive: 'дівчинки',
        childAccusative: 'дівчинку',
        bornByMe: 'народженої мною',
        whichWasBorn: 'яка народилась',
        born: 'народилась',
        pronoun: 'вона',
        pronounGenitive: 'її',
      },
      en: {
        label: 'girl',
        childNominative: 'girl',
        childGenitive: 'girl',
        bornByMe: 'born by me',
        whichWasBorn: 'who was born',
        pronoun: 'she',
        pronounGenitive: 'her',
      },
    };
  }
  if (sex === 'male') {
    return {
      uk: {
        label: 'хлопчик',
        childNominative: 'хлопчик',
        childGenitive: 'хлопчика',
        childAccusative: 'хлопчика',
        bornByMe: 'народженого мною',
        whichWasBorn: 'який народився',
        born: 'народився',
        pronoun: 'він',
        pronounGenitive: 'його',
      },
      en: {
        label: 'boy',
        childNominative: 'boy',
        childGenitive: 'boy',
        bornByMe: 'born by me',
        whichWasBorn: 'who was born',
        pronoun: 'he',
        pronounGenitive: 'his',
      },
    };
  }
  return {
    uk: {
      label: '', childNominative: '', childGenitive: '', childAccusative: '', bornByMe: '', whichWasBorn: '', born: '', pronoun: '', pronounGenitive: '',
    },
    en: {
      label: '', childNominative: '', childGenitive: '', bornByMe: '', whichWasBorn: '', pronoun: '', pronounGenitive: '',
    },
  };
};

export const buildChildContext = (childData = {}) => ({
  ...childData,
  gender: getChildGenderForms(childData?.sex),
});

// --- Ukrainian/English "date in words" (batch 16 §12) -------------------------------------------
// Legal statements spell the signature date out in words (spec: "вісімнадцятого травня дві тисячі
// двадцять шостого року"), not as digits - this is a fully generic day/month/year -> words
// converter, not a lookup table for one date, so it has to actually do Ukrainian ordinal-genitive
// numeral grammar rather than special-case 18/05/2026.
export const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());

const UK_ONES_ORDINAL_GENITIVE = {
  1: 'першого', 2: 'другого', 3: 'третього', 4: 'четвертого', 5: "п'ятого", 6: 'шостого', 7: 'сьомого', 8: 'восьмого', 9: "дев'ятого",
};
const UK_TEENS_ORDINAL_GENITIVE = {
  10: 'десятого', 11: 'одинадцятого', 12: 'дванадцятого', 13: 'тринадцятого', 14: 'чотирнадцятого', 15: "п'ятнадцятого", 16: 'шістнадцятого', 17: 'сімнадцятого', 18: 'вісімнадцятого', 19: "дев'ятнадцятого",
};
const UK_TENS_ORDINAL_GENITIVE = {
  1: 'десятого', 2: 'двадцятого', 3: 'тридцятого', 4: 'сорокового', 5: "п'ятдесятого", 6: 'шістдесятого', 7: 'сімдесятого', 8: 'вісімдесятого', 9: "дев'яностого",
};
const UK_TENS_CARDINAL = {
  2: 'двадцять', 3: 'тридцять', 4: 'сорок', 5: "п'ятдесят", 6: 'шістдесят', 7: 'сімдесят', 8: 'вісімдесят', 9: "дев'яносто",
};
const UK_HUNDREDS_CARDINAL = {
  1: 'сто', 2: 'двісті', 3: 'триста', 4: 'чотириста', 5: "п'ятсот", 6: 'шістсот', 7: 'сімсот', 8: 'вісімсот', 9: "дев'ятсот",
};
const UK_HUNDREDS_ORDINAL_GENITIVE = {
  1: 'сотого', 2: 'двохсотого', 3: 'трьохсотого', 4: 'чотирьохсотого', 5: "п'ятисотого", 6: 'шестисотого', 7: 'семисотого', 8: 'восьмисотого', 9: "дев'ятисотого",
};
const UK_THOUSANDS_CARDINAL = {
  1: 'тисяча', 2: 'дві тисячі', 3: 'три тисячі', 4: 'чотири тисячі', 5: "п'ять тисяч", 6: 'шість тисяч', 7: 'сім тисяч', 8: 'вісім тисяч', 9: "дев'ять тисяч",
};
const UK_EXACT_THOUSAND_ORDINAL_GENITIVE = {
  1: 'тисячного', 2: 'двохтисячного', 3: 'трьохтисячного', 4: 'чотиритисячного', 5: "п'ятитисячного", 6: 'шеститисячного', 7: 'семитисячного', 8: 'восьмитисячного', 9: "дев'ятитисячного",
};

export const UK_MONTHS_GENITIVE = {
  1: 'січня', 2: 'лютого', 3: 'березня', 4: 'квітня', 5: 'травня', 6: 'червня', 7: 'липня', 8: 'серпня', 9: 'вересня', 10: 'жовтня', 11: 'листопада', 12: 'грудня',
};

// A day-of-month (1-31) in ordinal genitive form - the same ones-place words double as the last
// word of a year (see yearToGenitiveWords), since "шостого" means "the sixth" regardless of
// whether it's completing a day or a year.
const dayToGenitiveWords = day => {
  if (day <= 9) return UK_ONES_ORDINAL_GENITIVE[day];
  if (day <= 19) return UK_TEENS_ORDINAL_GENITIVE[day];
  if (day % 10 === 0) return UK_TENS_ORDINAL_GENITIVE[Math.floor(day / 10)];
  return `${UK_TENS_CARDINAL[Math.floor(day / 10)]} ${UK_ONES_ORDINAL_GENITIVE[day % 10]}`;
};

// A 0-999 remainder in words, where only the last (rightmost) nonzero group is ordinal-genitive and
// everything before it is a plain cardinal numeral - e.g. 993 -> "дев'ятсот дев'яносто третього"
// (cardinal hundred + cardinal tens + ordinal ones), 900 -> "дев'ятисотого" (ordinal hundred alone).
const threeDigitToGenitiveWords = n => {
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const tensOnes = n % 100;
  if (tensOnes === 0) return UK_HUNDREDS_ORDINAL_GENITIVE[hundreds];
  const words = hundreds ? [UK_HUNDREDS_CARDINAL[hundreds]] : [];
  if (tensOnes >= 10 && tensOnes <= 19) {
    words.push(UK_TEENS_ORDINAL_GENITIVE[tensOnes]);
  } else {
    const tens = Math.floor(tensOnes / 10);
    const ones = tensOnes % 10;
    if (ones === 0) {
      words.push(UK_TENS_ORDINAL_GENITIVE[tens]);
    } else {
      if (tens) words.push(UK_TENS_CARDINAL[tens]);
      words.push(UK_ONES_ORDINAL_GENITIVE[ones]);
    }
  }
  return words.join(' ');
};

const yearToGenitiveWords = year => {
  const thousands = Math.floor(year / 1000);
  const remainder = year % 1000;
  if (!thousands) return threeDigitToGenitiveWords(remainder);
  if (!remainder) return UK_EXACT_THOUSAND_ORDINAL_GENITIVE[thousands];
  return `${UK_THOUSANDS_CARDINAL[thousands]} ${threeDigitToGenitiveWords(remainder)}`;
};

// Generic for any ISO date, not just the reference statement's 2026-05-18 (spec: "Функцію потрібно
// зробити універсальною").
export const formatUkrainianDateWords = value => {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = String(value).trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${dayToGenitiveWords(day)} ${UK_MONTHS_GENITIVE[month]} ${yearToGenitiveWords(year)} року`;
};

const EN_MONTHS = {
  1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December',
};
const EN_DAY_ORDINALS = {
  1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth', 14: 'fourteenth', 15: 'fifteenth', 16: 'sixteenth', 17: 'seventeenth', 18: 'eighteenth', 19: 'nineteenth', 20: 'twentieth', 21: 'twenty-first', 22: 'twenty-second', 23: 'twenty-third', 24: 'twenty-fourth', 25: 'twenty-fifth', 26: 'twenty-sixth', 27: 'twenty-seventh', 28: 'twenty-eighth', 29: 'twenty-ninth', 30: 'thirtieth', 31: 'thirty-first',
};

export const formatEnglishDateWords = value => {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = String(value).trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${EN_DAY_ORDINALS[day]} of ${EN_MONTHS[month]}, ${year}`;
};

// --- Party record shapes (Parties page, batch 19 §1) --------------------------------------------
// Canonical "blank record" for each party collection - the shape a freshly-added record starts
// from, matching exactly what resolveCaseContext/fillPlaceholders already expect to find (spec
// §9/§10/§3/§5 fixtures in documentsCatalogUtils.test.js), so a record created here never needs a
// follow-up migration the way legacy pasted data sometimes does.

export const createEmptyPartner = ({ role = '' } = {}) => ({
  id: makeRecordId('partner'),
  role,
  name: { uk: { nominative: '', genitive: '' }, en: '' },
  birthDate: '',
  citizenship: { uk: '', en: '' },
  passport: { number: '', issuedBy: { uk: '', en: '' }, issueDate: '' },
});

export const createEmptyCouple = () => ({
  id: makeRecordId('couple'),
  partners: [createEmptyPartner({ role: 'wife' }), createEmptyPartner({ role: 'husband' })],
  marriage: { certificateNumber: '', certificateDate: '' },
  address: { uk: '', en: '' },
});

export const createEmptySurrogateMother = () => ({
  id: makeRecordId('surrogate-mother'),
  name: { uk: { nominative: '', genitive: '' }, en: '' },
  birthDate: '',
  passport: { number: '', issueDate: '' },
  taxId: '',
  address: { uk: '', en: '' },
});

export const createEmptyRepresentative = () => ({
  id: makeRecordId('representative'),
  name: { uk: { nominative: '', genitive: '' }, en: '' },
  passport: { number: '' },
  powerOfAttorney: { date: '', apostille: '' },
});

export const createEmptyClinic = () => ({
  id: makeRecordId('clinic'),
  name: { uk: '', en: '' },
  legalName: { uk: '', en: '' },
  medicalCenterName: { uk: '', en: '' },
  address: { uk: '', en: '' },
  phone: '',
  email: '',
  edrpou: '',
  taxId: '',
  vatCertificateNumber: '',
  bank: {
    account: '', mfo: '', name: { uk: '', en: '' }, address: { uk: '', en: '' },
  },
  license: { number: '', date: '', issuedBy: { uk: '', en: '' } },
  medicalDirector: {
    name: { uk: { nominative: '', genitive: '', short: '' }, en: { full: '', short: '' } },
    authority: { type: { uk: '', en: '' }, number: '', date: '' },
  },
});

export const createEmptyMaternityHospital = () => ({
  id: makeRecordId('maternity-hospital'),
  name: { uk: '', en: '' },
  shortName: { uk: '', en: '' },
  edrpou: '',
  address: { uk: '', en: '' },
});

export const createEmptyNotary = () => ({
  id: makeRecordId('notary'),
  name: {
    uk: {
      nominative: '', genitive: '', short: '', instrumental: '',
    },
    en: { full: '', short: '' },
  },
  title: { uk: '', en: '' },
  city: { uk: '', en: '' },
});

// --- Case shape (batch 18) --------------------------------------------------------------------
// One case is one concrete combination of couple + clinic + surrogate mother + representative(s)
// (spec: "один case — це одна конкретна комбінація"); changing the clinic or surrogate mother means
// creating a new case rather than mutating this one in place, so there is no active/replaced/from/to
// history to track inside a single case record.

// A fresh id for a brand-new case (Parties page "+ New case") - same generated shape as
// makeTransactionId/createChildRecord's id.
export const makeCaseId = () => makeRecordId('case');

// A freshly-created case: every relation blank, ready for the admin to pick a couple/clinic/
// surrogate mother/representatives - never pre-filled from another case (spec §14: no auto-copy).
export const createEmptyCase = ({ caseId, programId = '' } = {}) => ({
  id: caseId,
  programId,
  relations: {
    coupleId: '', clinicId: '', surrogateMotherId: '', representativeIds: [],
  },
  program: {
    type: 'surrogacy',
    agreement: { number: { uk: '', en: '' }, date: '' },
  },
  childbirth: { maternityHospitalId: '', children: [] },
  // batch 19: the case only ever stores a transactionId - the actual notary/statementDate/
  // registryNumber live on parties.transactions[transactionId] (see createTransaction).
  registrations: { birth: { transactionId: '' } },
  documents: { overrides: {} },
});

// A new child record for the childbirth.children editor (spec §13) - a stable generated id, never
// the array index, since children can be reordered/removed independently of any document that
// still references an earlier one by id.
export const createChildRecord = () => ({
  id: makeRecordId('child'),
  sex: '',
  birthDate: '',
  birthPlace: { uk: '', en: '' },
  medicalConclusion: { number: '', date: '' },
});

// Migrates a pre-batch-18 case record (coupleId/clinicId/surrogateMotherId/representativeIds at the
// top level, surrogacyAgreement, birthRegistration.{child,medicalConclusion.maternityHospitalId,
// statementDate,notaryId}, docOverrides) onto the new shape - spec §16: a temporary read-time
// normalizer, but once normalized the legacy top-level fields are dropped rather than carried
// forward, so re-saving a migrated case never recreates them (spec: "не записувати назад старі
// поля"). Idempotent: a case that already has `relations`/`program`/`childbirth`/`registrations`/
// `documents` passes through those as-is.
export const normalizeCaseRecord = (rawCase = {}) => {
  const {
    coupleId, clinicId, surrogateMotherId, representativeIds,
    surrogacyAgreement, birthRegistration: legacyBirthRegistration, docOverrides,
    ...rest
  } = isPlainObject(rawCase) ? rawCase : {};

  const relations = isPlainObject(rest.relations) ? rest.relations : {
    coupleId: coupleId ?? '',
    clinicId: clinicId ?? '',
    surrogateMotherId: surrogateMotherId ?? '',
    representativeIds: Array.isArray(representativeIds) ? representativeIds : [],
  };

  const program = isPlainObject(rest.program) ? rest.program : {
    type: 'surrogacy',
    agreement: isPlainObject(surrogacyAgreement) ? surrogacyAgreement : { number: { uk: '', en: '' }, date: '' },
  };

  const legacyChild = isPlainObject(legacyBirthRegistration?.child) ? legacyBirthRegistration.child : null;
  const legacyMedicalConclusion = isPlainObject(legacyBirthRegistration?.medicalConclusion) ? legacyBirthRegistration.medicalConclusion : {};
  const childbirth = isPlainObject(rest.childbirth) ? rest.childbirth : {
    maternityHospitalId: legacyMedicalConclusion.maternityHospitalId ?? '',
    // maternityHospitalId moved up onto childbirth itself (shared by every child of one birth
    // event) - never duplicated back onto the per-child medicalConclusion.
    children: legacyChild ? [{
      id: makeRecordId('child'),
      ...legacyChild,
      medicalConclusion: { number: legacyMedicalConclusion.number ?? '', date: legacyMedicalConclusion.date ?? '' },
    }] : [],
  };

  const registrations = isPlainObject(rest.registrations) ? rest.registrations : {
    birth: {
      statementDate: legacyBirthRegistration?.statementDate ?? '',
      notaryId: legacyBirthRegistration?.notaryId ?? '',
    },
  };

  const documents = isPlainObject(rest.documents) ? rest.documents : {
    overrides: isPlainObject(docOverrides) ? docOverrides : {},
  };

  return {
    ...rest, relations, program, childbirth, registrations, documents,
  };
};

// --- Transactions (batch 19) -------------------------------------------------------------------
// A transaction is one concrete combination of couple + surrogate mother + notary for a specific
// legal act (e.g. the birth-registration surrogate-consent statement) - decoupled from the case's
// current `relations` so a signed document keeps pointing at exactly who signed it even if the
// case's relations were ever revisited later. The case only ever stores the transactionId; the
// notary's own name/title/city live solely in `parties.notaries[notaryId]`, never copied in.

// A fresh id for a brand-new transaction record (the case editor form needs one the first time it
// saves the Transaction section, since createTransaction itself takes the id rather than making
// one - same generated shape as createChildRecord's id).
export const makeTransactionId = () => makeRecordId('transaction');

export const createTransaction = ({
  transactionId, caseId, type, coupleId, surrogateMotherId, notaryId, statementDate = '', registryNumber = '',
}) => ({
  id: transactionId,
  type,
  caseId,
  coupleId,
  surrogateMotherId,
  notaryId,
  statementDate,
  registryNumber,
});

// `transactionType` guards against a stale/mistyped transactionId pointing at a transaction of a
// different kind - resolves to null exactly like a missing transaction rather than silently
// returning mismatched data.
export const resolveTransaction = (catalog, caseRecord, transactionType) => {
  const transactionId = caseRecord?.registrations?.birth?.transactionId;
  const transaction = findById(catalog?.parties?.transactions, transactionId);
  if (!transaction) return null;
  if (transactionType && transaction.type !== transactionType) return null;
  return transaction;
};

// Deleting a transaction (spec §14) never touches the couple/surrogate mother/notary records it
// referenced - only the transaction itself and the transactionId reference(s) pointing at it.
export const removeTransactionReferences = (catalog, transactionId) => ({
  ...catalog,
  parties: {
    ...catalog.parties,
    transactions: (catalog.parties.transactions || []).filter(item => String(item.id) !== String(transactionId)),
    cases: (catalog.parties.cases || []).map(caseRecord => {
      if (String(caseRecord.registrations?.birth?.transactionId) !== String(transactionId)) return caseRecord;
      const { transactionId: _removed, ...restBirth } = caseRecord.registrations.birth;
      return { ...caseRecord, registrations: { ...caseRecord.registrations, birth: restBirth } };
    }),
  },
});

// One case is one concrete relations combination (spec batch 18 §10); a case picked by programId
// alone would be ambiguous (several cases can share a programId - see createEmptyCase) - the
// currently-selected case is whatever the caller/UI passed as caseId, never an "active" flag.
export const BIRTH_REGISTRATION_TRANSACTION_TYPE = 'birth-registration-surrogate-consent';

export const resolveCaseContext = (catalog, caseId, { childId } = {}) => {
  const rawCaseRecord = findById(catalog?.parties?.cases, caseId);
  if (!rawCaseRecord) return null;
  // Defensively re-normalized here too (idempotent) - a case can reach this function without
  // having passed through normalizeDocumentsCatalog/parseDocumentsTechnicalInput first (e.g. a
  // freshly created or duplicated case still held only in local UI state).
  const caseRecord = normalizeCaseRecord(rawCaseRecord);
  const relations = caseRecord.relations;

  const transaction = resolveTransaction(catalog, caseRecord, BIRTH_REGISTRATION_TRANSACTION_TYPE);
  // A document tied to a specific transaction must use exactly that transaction's own couple/
  // surrogate mother (spec §5: "не брати пару, СМ ... безпосередньо з інших блоків кейса"), never
  // silently the case's current relations - but a case that hasn't reached that stage yet (no
  // transaction created) still needs relations.coupleId/surrogateMotherId to resolve wife/husband/
  // surrogateMother for every other document.
  const coupleId = transaction?.coupleId || relations.coupleId;
  const surrogateMotherId = transaction?.surrogateMotherId || relations.surrogateMotherId;

  const couple = findById(catalog.parties.couples, coupleId);
  const partners = toArray(couple?.partners);
  const wife = partners.find(partner => partner?.role === 'wife') || partners[0] || null;
  const husband = partners.find(partner => partner?.role === 'husband') || partners[1] || null;
  const representatives = toArray(relations.representativeIds)
    .map(id => findById(catalog.parties.representatives, id))
    .filter(Boolean);

  const childbirth = isPlainObject(caseRecord.childbirth) ? caseRecord.childbirth : {};
  const rawChildren = toArray(childbirth.children);
  // The first child is the default fallback for single-child documents (spec §4: "не прив'язувати
  // систему назавжди лише до children[0]") - a caller generating a document for a twin passes
  // `childId` to pick a different one; `children` (every child, gender-computed) is exposed
  // alongside it so the UI can offer a selector.
  const selectedRawChild = childId ? rawChildren.find(item => String(item?.id) === String(childId)) : null;
  const rawChild = isPlainObject(selectedRawChild) ? selectedRawChild : (isPlainObject(rawChildren[0]) ? rawChildren[0] : {});
  const medicalConclusion = isPlainObject(rawChild.medicalConclusion) ? rawChild.medicalConclusion : {};

  const rawBirth = isPlainObject(caseRecord.registrations?.birth) ? caseRecord.registrations.birth : {};
  // Pre-batch-19 cases kept statementDate/notaryId directly on registrations.birth instead of
  // pointing at a transaction - consulted only when there is no transaction yet, so a case that
  // hasn't been migrated still resolves exactly as it did before (spec §16 is the rule for
  // newly-authored data, not a forced rewrite of every existing case).
  const statementDate = transaction?.statementDate ?? rawBirth.statementDate ?? '';
  const notaryId = transaction?.notaryId ?? rawBirth.notaryId;
  const birthRegistration = {
    transactionId: rawBirth.transactionId,
    statementDate,
    registryNumber: transaction?.registryNumber ?? '',
    statementDateWords: {
      uk: formatUkrainianDateWords(statementDate),
      en: formatEnglishDateWords(statementDate),
    },
  };
  // `{{transaction.statementDateWords.uk/en}}` (spec batch 18 §3) needs the words form directly on
  // the transaction itself, not only on the `birthRegistration` legacy-named alias above - derived
  // here rather than stored, same as every other date-in-words field.
  const transactionContext = transaction ? {
    ...transaction,
    statementDateWords: {
      uk: formatUkrainianDateWords(transaction.statementDate),
      en: formatEnglishDateWords(transaction.statementDate),
    },
  } : null;

  return {
    case: caseRecord,
    programId: caseRecord.programId ?? '',
    relations,
    program: isPlainObject(caseRecord.program) ? caseRecord.program : {},
    transaction: transactionContext,
    couple,
    wife,
    husband,
    surrogateMother: findById(catalog.parties.surrogateMothers, surrogateMotherId),
    clinic: findById(catalog.parties.clinics, relations.clinicId),
    representative: representatives[0] || null,
    representatives,
    childbirth,
    children: rawChildren.map(buildChildContext),
    child: buildChildContext(rawChild),
    selectedChildId: rawChild?.id,
    medicalConclusion,
    maternityHospital: findById(catalog.parties.maternityHospitals, childbirth.maternityHospitalId),
    birthRegistration,
    notary: findById(catalog.parties.notaries, notaryId),
  };
};

// Legal statements show dates as DD.MM.YYYY (see the reference docx), while the JSON stores ISO.
export const formatDocumentDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
};

export const MISSING_VALUE_PLACEHOLDER = '__________';

// Every {{...}} token in a template, e.g. {{wife.name.uk.nominative}}, {{logo}}, {{logo-long}}.
// Deliberately permissive (any run of non-brace characters) so it also matches the two special
// graphical tokens, which are not dotted paths.
export const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;

// Generic arbitrary-depth path walker - no assumption about how many levels a variable has
// (spec: `clinic.medicalDirector.name.uk.genitive` must resolve exactly like a two-level path).
export const getValueByPath = (source, path) => String(path).split('.').reduce((value, key) => {
  if (value === null || value === undefined) return undefined;
  return value[key];
}, source);

const resolvePlaceholderValue = (context, path, lang) => {
  let value = getValueByPath(context, path);
  // A path that stops at a bilingual node ({uk, en}) resolves to the requested language; one that
  // stops at a cased-name node resolves to the nominative form. These fallbacks only kick in when
  // the path itself didn't already walk all the way down to a leaf.
  if (isPlainObject(value)) {
    if (value[lang] !== undefined) value = value[lang];
    else if (value.uk !== undefined) value = value.uk;
  }
  if (isPlainObject(value) && value.nominative !== undefined) value = value.nominative;
  if (value === undefined || value === null || isPlainObject(value) || Array.isArray(value)) return undefined;
  return formatDocumentDate(value);
};

// Missing data renders as a fill-in-by-hand blank, matching how the reference statements leave
// unknown values (dates, counts) as underscores - never as a leaked {{token}} or the literal
// strings "undefined"/"null". Unlike the bare {{token}} left in editor/template mode, this is the
// resolved-for-export text; findUnresolvedVariables (below) is how callers warn about the same
// paths before a final export.
export const fillPlaceholders = (text, context, lang = 'uk') => String(text || '').replace(
  PLACEHOLDER_PATTERN,
  (token, rawPath) => {
    const path = rawPath.trim();
    if (path === 'logo' || path === 'logo-long') return token;
    const value = context ? resolvePlaceholderValue(context, path, lang) : undefined;
    const output = value === undefined || String(value).trim() === '' ? MISSING_VALUE_PLACEHOLDER : String(value);
    return output;
  },
);

// Spec-shaped helper kept alongside fillPlaceholders: a minimal resolver that only substitutes
// values it can find and otherwise leaves the token untouched (used by the template/editor view,
// where an unresolved {{path}} should stay visible rather than blank out).
export const resolveTemplateText = (text, context) => {
  if (typeof text !== 'string') return '';
  return text.replace(PLACEHOLDER_PATTERN, (match, rawPath) => {
    const path = rawPath.trim();
    if (path === 'logo' || path === 'logo-long') return match;
    const value = context ? getValueByPath(context, path) : undefined;
    if (value === null || value === undefined) return match;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return match;
  });
};

// Every path referenced by a piece of template text, excluding the two graphical tokens (spec
// §15: logo/logo-long must never show up in an "unresolved variables" list).
export const findUnresolvedVariables = text => [...String(text || '').matchAll(PLACEHOLDER_PATTERN)]
  .map(match => match[1].trim())
  .filter(path => path !== 'logo' && path !== 'logo-long');

// Paths from findUnresolvedVariables that actually fail to resolve against the given context -
// what the pre-export warning is built from.
export const getUnresolvedVariablePaths = (text, context, lang = 'uk') => findUnresolvedVariables(text)
  .filter(path => resolvePlaceholderValue(context, path, lang) === undefined);

// Scans every uk/en title + paragraph of a template and returns the sorted, de-duplicated list of
// variable paths that won't resolve against the given context. Used before a final PDF/DOCX
// export to show a confirmation instead of silently shipping blanks.
export const validateDocumentTemplate = (template, context) => {
  const missing = new Set();
  const scan = (value, lang) => getUnresolvedVariablePaths(value, context, lang).forEach(path => missing.add(path));
  ['uk', 'en'].forEach(lang => scan(template?.title?.[lang], lang));
  toArray(template?.beforeTitle).forEach(block => {
    ['uk', 'en'].forEach(lang => scan(block?.[lang], lang));
  });
  toArray(template?.paragraphs).forEach(paragraph => {
    ['uk', 'en'].forEach(lang => scan(paragraph?.[lang], lang));
  });
  return [...missing].sort();
};

// --- Case completeness checklists (batch 18 §18) --------------------------------------------
// Non-blocking checklists shown before saving/exporting rather than enforced while editing -
// missing data is reported the same way as a genuinely empty field, never as a thrown error.

// The base checklist any case should satisfy, independent of which documents it's used for.
export const validateCaseRecord = rawCaseRecord => {
  const caseRecord = normalizeCaseRecord(rawCaseRecord);
  const issues = [];
  const isBlank = value => value === undefined || value === null || String(value).trim() === '';
  const requirePresent = (value, path) => {
    if (isBlank(value)) issues.push(path);
  };

  requirePresent(caseRecord.id, 'case.id');
  requirePresent(caseRecord.programId, 'case.programId');
  requirePresent(caseRecord.relations?.coupleId, 'case.relations.coupleId');
  requirePresent(caseRecord.relations?.clinicId, 'case.relations.clinicId');
  requirePresent(caseRecord.relations?.surrogateMotherId, 'case.relations.surrogateMotherId');
  requirePresent(caseRecord.program?.type, 'case.program.type');
  if (!toArray(caseRecord.childbirth?.children).length) issues.push('case.childbirth.children');
  // batch 19: registrations.birth normally carries only transactionId; the direct
  // statementDate/notaryId fields are consulted too so a not-yet-migrated case isn't flagged.
  if (isBlank(caseRecord.registrations?.birth?.transactionId)
    && isBlank(caseRecord.registrations?.birth?.statementDate)
    && isBlank(caseRecord.registrations?.birth?.notaryId)) {
    issues.push('case.registrations.birth');
  }

  return issues;
};

// A transaction's own checklist (spec batch 19 §17): couple/surrogate mother/notary presence AND
// existence, plus a statement date - registryNumber may stay blank (it's fine to fill in by hand
// after the document is signed).
export const validateTransaction = (catalog, transactionId) => {
  const transaction = findById(catalog?.parties?.transactions, transactionId);
  if (!transaction) return ['transaction'];

  const issues = [];
  const isBlank = value => value === undefined || value === null || String(value).trim() === '';
  const requirePresent = (value, path) => {
    if (isBlank(value)) issues.push(path);
  };

  requirePresent(transaction.id, 'transaction.id');
  requirePresent(transaction.type, 'transaction.type');
  requirePresent(transaction.coupleId, 'transaction.coupleId');
  requirePresent(transaction.surrogateMotherId, 'transaction.surrogateMotherId');
  requirePresent(transaction.notaryId, 'transaction.notaryId');
  requirePresent(transaction.statementDate, 'transaction.statementDate');

  if (!isBlank(transaction.coupleId) && !findById(catalog?.parties?.couples, transaction.coupleId)) {
    issues.push('transaction.coupleId (no matching couple)');
  }
  if (!isBlank(transaction.surrogateMotherId) && !findById(catalog?.parties?.surrogateMothers, transaction.surrogateMotherId)) {
    issues.push('transaction.surrogateMotherId (no matching surrogate mother)');
  }
  if (!isBlank(transaction.notaryId) && !findById(catalog?.parties?.notaries, transaction.notaryId)) {
    issues.push('transaction.notaryId (no matching notary)');
  }
  if (!isBlank(transaction.statementDate) && !isIsoDate(transaction.statementDate)) {
    issues.push('transaction.statementDate (must be YYYY-MM-DD)');
  }

  return issues;
};

// The birth-registration surrogate-consent statement's own checklist (spec batch 16 §20; field
// locations updated for the batch 18 case shape, then again for the batch 19 transaction) -
// missing hospital/notary/transaction lookups and malformed dates are reported the same way as a
// genuinely empty field.
export const validateBirthRegistrationCase = (catalog, caseId) => {
  const context = resolveCaseContext(catalog, caseId);
  if (!context) return ['case'];

  const issues = [];
  const isBlank = value => value === undefined || value === null || String(value).trim() === '';
  const requirePresent = (value, path) => {
    if (isBlank(value)) issues.push(path);
  };

  const {
    childbirth, child, medicalConclusion, surrogateMother, maternityHospital,
  } = context;

  requirePresent(childbirth.maternityHospitalId, 'case.childbirth.maternityHospitalId');
  requirePresent(child.sex, 'case.childbirth.children[0].sex');
  requirePresent(child.birthDate, 'case.childbirth.children[0].birthDate');
  requirePresent(child.birthPlace?.uk, 'case.childbirth.children[0].birthPlace.uk');
  requirePresent(medicalConclusion.number, 'case.childbirth.children[0].medicalConclusion.number');
  requirePresent(medicalConclusion.date, 'case.childbirth.children[0].medicalConclusion.date');
  requirePresent(surrogateMother?.taxId, 'surrogateMother.taxId');
  requirePresent(surrogateMother?.address?.uk, 'surrogateMother.address.uk');

  if (!isBlank(child.sex) && child.sex !== 'female' && child.sex !== 'male') {
    issues.push('case.childbirth.children[0].sex (must be "female" or "male")');
  }
  if (!isBlank(child.birthDate) && !isIsoDate(child.birthDate)) {
    issues.push('case.childbirth.children[0].birthDate (must be YYYY-MM-DD)');
  }
  if (!isBlank(medicalConclusion.date) && !isIsoDate(medicalConclusion.date)) {
    issues.push('case.childbirth.children[0].medicalConclusion.date (must be YYYY-MM-DD)');
  }
  if (!isBlank(childbirth.maternityHospitalId) && !maternityHospital) {
    issues.push('case.childbirth.maternityHospitalId (no matching maternity hospital)');
  }

  const rawBirth = context.case.registrations?.birth || {};
  if (rawBirth.transactionId) {
    const linkedTransaction = findById(catalog?.parties?.transactions, rawBirth.transactionId);
    if (linkedTransaction && linkedTransaction.type !== BIRTH_REGISTRATION_TRANSACTION_TYPE) {
      // A transactionId can point at a transaction of a different document type (spec §3: "Find the
      // transaction with type: 'birth-registration-surrogate-consent'") - resolveCaseContext already
      // treats this as no transaction at all (context.transaction is null), so flagging it here keeps
      // this checklist from passing while every `transaction.*`/`notary.*` template variable is
      // actually unresolved.
      issues.push('case.registrations.birth.transactionId (transaction is not a birth-registration-surrogate-consent)');
    } else {
      // The transaction is the source of truth (spec §17) - couple/surrogate mother/notary presence
      // and existence are validated there, scoped to `transaction.*` paths.
      issues.push(...validateTransaction(catalog, rawBirth.transactionId));
    }
  } else if (!isBlank(rawBirth.statementDate) || !isBlank(rawBirth.notaryId)) {
    // Pre-batch-19 case still using the direct registrations.birth.{statementDate,notaryId} shape.
    requirePresent(rawBirth.statementDate, 'case.registrations.birth.statementDate');
    requirePresent(rawBirth.notaryId, 'case.registrations.birth.notaryId');
    if (!isBlank(rawBirth.statementDate) && !isIsoDate(rawBirth.statementDate)) {
      issues.push('case.registrations.birth.statementDate (must be YYYY-MM-DD)');
    }
    if (!isBlank(rawBirth.notaryId) && !context.notary) {
      issues.push('case.registrations.birth.notaryId (no matching notary)');
    }
  } else {
    issues.push('case.registrations.birth.transactionId');
  }

  return issues;
};

// --- Special paragraph types (logo blocks) + section headings ------------------------------

// A paragraph whose only content (in either language) is a graphical token is not text - it's a
// place to draw the clinic logo, and must never be run through fillPlaceholders/resolveTemplateText.
export const getParagraphType = paragraph => {
  const uk = String(paragraph?.uk || '').trim();
  const en = String(paragraph?.en || '').trim();
  if (uk === '{{logo-long}}' || en === '{{logo-long}}') return 'logo-long';
  if (uk === '{{logo}}' || en === '{{logo}}') return 'logo';
  return 'text';
};

// {{logo}} duplicates a compact, single-column-wide logo above each language column (tagged
// '1col' - sized for one column); {{logo-long}} is one shared full-width logo spanning both
// columns (tagged '2col'). `clinicAssets` accepts either the raw `{ logo: [...] }` shape or the
// flat variants array directly (both appear in this codebase).
export const getClinicLogo = (clinicAssets, variant) => {
  const variants = Array.isArray(clinicAssets) ? clinicAssets : clinicAssets?.logo;
  const expectedLayout = variant === 'logo-long' ? '2col' : '1col';
  return toArray(variants).find(item => item?.layout === expectedLayout) ?? null;
};

// A template's letterhead logo - rendered once, before the title, never as a body paragraph.
// The current export shape carries it as a dedicated `template.logo` string field ("{{logo}}" /
// "{{logo-long}}"), sitting next to `title`/`paragraphs` specifically so it's positioned ahead of
// the title. Older exports embedded the same token as the first paragraph instead; that shape is
// still recognized so previously-saved templates keep rendering their logo correctly.
export const getTemplateLogoType = template => {
  const field = String(template?.logo || '').trim();
  if (field === '{{logo-long}}') return 'logo-long';
  if (field === '{{logo}}') return 'logo';
  if (field) return null; // an unrecognized `logo` value is not a graphical token - ignore it
  const legacyLeadingType = getParagraphType(toArray(template?.paragraphs)[0]);
  return legacyLeadingType === 'text' ? null : legacyLeadingType;
};

// Short numbered section titles ("1. Предмет Договору") are bolded; numbered clauses of any
// length ("5.4. Клініка надає...", "1.1. Клініка зобов'язується...") are never bolded, even when
// short - only a single top-level number qualifies (no sub-level ".N" group after the first dot),
// which is what actually distinguishes a section title from clause body text in these contracts.
const SECTION_HEADING_PATTERN = /^\d+\.\s+\S+/;
const SECTION_HEADING_MAX_LENGTH = 120;

export const isSectionHeading = text => {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > SECTION_HEADING_MAX_LENGTH) return false;
  return SECTION_HEADING_PATTERN.test(trimmed);
};

// Auto-detection (above) can still be wrong for an edge case the admin spots visually; `bold` on
// the paragraph itself (true/false) explicitly overrides it either way, undefined falls back to
// isSectionHeading. Bold is a whole-paragraph property (both languages together), matching how
// real section headings actually look in these bilingual documents.
export const isParagraphBold = paragraph => {
  if (paragraph?.bold === true) return true;
  if (paragraph?.bold === false) return false;
  return isSectionHeading(paragraph?.uk) || isSectionHeading(paragraph?.en);
};

// A paragraph long enough that forcing it to stay on one page (break-inside: avoid / wrap=false)
// would fight natural pagination - only relevant once the template opts into page breaks at all.
const LONG_PARAGRAPH_CHAR_THRESHOLD = 1200;

export const allowsParagraphInternalBreak = (paragraph, allowPageBreaks) => {
  if (!allowPageBreaks) return false;
  const longest = Math.max(String(paragraph?.uk || '').length, String(paragraph?.en || '').length);
  return longest > LONG_PARAGRAPH_CHAR_THRESHOLD;
};

const localizedText = (value, lang) => {
  if (isPlainObject(value)) return String(value[lang] ?? value.uk ?? value.en ?? '');
  return String(value ?? '');
};

// Data-mode edits (spec: the "pencil" Data mode) are stored per case as sparse overrides of the
// resolved text: `case.docOverrides[docId] = { title: {uk,en}, paragraphs: { [index]: {uk,en} } }`.
// Firebase may hand dense numeric-keyed nodes back as arrays, so both shapes are accepted.
const overrideAt = (overrides, index) => {
  if (Array.isArray(overrides)) return overrides[index];
  if (isPlainObject(overrides)) return overrides[index] ?? overrides[String(index)];
  return undefined;
};

const overriddenText = (override, langKey, fallback) => (
  typeof override?.[langKey] === 'string' ? override[langKey] : fallback
);

// --- beforeTitle blocks (batch 16 §14/§17) ---------------------------------------------------
// Free-standing text rendered between the letterhead logo and the title (e.g. "ЗА МІСЦЕМ ВИМОГИ",
// right-aligned and bold) - never merged into `paragraphs`, so it always renders in that fixed
// logo -> beforeTitle -> title -> paragraphs order regardless of how the body is edited.
const ALLOWED_BLOCK_ALIGNMENTS = ['left', 'right', 'center', 'justify'];

export const normalizeBlockAlign = align => (ALLOWED_BLOCK_ALIGNMENTS.includes(align) ? align : 'left');

const resolveBeforeTitleBlocks = (template, context) => toArray(template?.beforeTitle).map(block => ({
  align: normalizeBlockAlign(block?.align),
  bold: Boolean(block?.bold),
  uk: fillPlaceholders(localizedText(block, 'uk'), context, 'uk'),
  en: fillPlaceholders(localizedText(block, 'en'), context, 'en'),
}));

// --- Template-level languages/columns (batch 16 §15/§16) -------------------------------------
// A template can pin its own language set + column count (e.g. `languages: ["uk"], columns: 1` for
// a currently-Ukrainian-only statement) instead of following whatever layout the admin has picked
// for the export batch as a whole. `null` here means "the template doesn't opt in" - the renderers
// fall back to the page-wide layout selector unchanged, so every template saved before this existed
// keeps rendering exactly as it did (spec: "Для старих шаблонів... стара поведінка").
const resolveDocLanguages = template => {
  const languages = toArray(template?.languages).map(String).filter(lang => lang === 'uk' || lang === 'en');
  return languages.length ? languages : null;
};

const resolveDocColumns = (template, languages) => {
  if (!languages) return null;
  return template?.columns === 1 || template?.columns === 2 ? template.columns : (languages.length === 1 ? 1 : 2);
};

// A custom paragraph can be inserted (or removed) at any position in a template (spec: "кастомний
// абзац в будь-якому місці документу"). Because per-case data-mode overrides key into a template's
// paragraphs by array index, a structural edit like that must reindex every existing override so
// it keeps pointing at the same paragraph it always did - never silently drift onto the paragraph
// that happens to now sit at that index. `delta` is +1 for an insertion, -1 for a removal; the
// override entry that sat exactly at a removed index is dropped along with that paragraph.
export const shiftDocOverrideParagraphIndices = (docOverride, atIndex, delta) => {
  if (!isPlainObject(docOverride) || !docOverride.paragraphs) return docOverride;
  const entries = Array.isArray(docOverride.paragraphs)
    ? docOverride.paragraphs.map((value, index) => [index, value]).filter(([, value]) => value !== undefined)
    : Object.entries(docOverride.paragraphs).map(([key, value]) => [Number(key), value]);
  const nextParagraphs = {};
  entries.forEach(([index, value]) => {
    if (delta < 0 && index === atIndex) return;
    nextParagraphs[index >= atIndex ? index + delta : index] = value;
  });
  return { ...docOverride, paragraphs: nextParagraphs };
};

// A row-editing "scope" identifies one editable raw-text slot on a template - the shared title,
// one beforeTitle block, or one paragraph - so the Bold/Italic/Insert-variable toolbar can share
// one pair of read/write helpers across all of them instead of one bespoke pair per element (spec:
// "єдиний формат, як параграфи" - unify Logo/Title/Before title editing with the paragraph rows).
export const TITLE_SCOPE = 'title';
export const beforeTitleScope = index => `beforeTitle:${index}`;
export const paragraphScope = index => `p:${index}`;

export const getTemplateScopeText = (template, scope, langKey) => {
  if (scope === TITLE_SCOPE) return template?.title?.[langKey] || '';
  const beforeTitleMatch = /^beforeTitle:(\d+)$/.exec(scope);
  if (beforeTitleMatch) return template?.beforeTitle?.[Number(beforeTitleMatch[1])]?.[langKey] || '';
  const paragraphMatch = /^p:(\d+)$/.exec(scope);
  if (paragraphMatch) return template?.paragraphs?.[Number(paragraphMatch[1])]?.[langKey] || '';
  return '';
};

export const withTemplateScopeText = (template, scope, langKey, value) => {
  if (scope === TITLE_SCOPE) {
    return { ...template, title: { ...(template.title || {}), [langKey]: value } };
  }
  const beforeTitleMatch = /^beforeTitle:(\d+)$/.exec(scope);
  if (beforeTitleMatch) {
    const index = Number(beforeTitleMatch[1]);
    return {
      ...template,
      beforeTitle: (template.beforeTitle || []).map((block, i) => (i === index ? { ...block, [langKey]: value } : block)),
    };
  }
  const paragraphMatch = /^p:(\d+)$/.exec(scope);
  if (paragraphMatch) {
    const index = Number(paragraphMatch[1]);
    return {
      ...template,
      paragraphs: (template.paragraphs || []).map((paragraph, i) => (i === index ? { ...paragraph, [langKey]: value } : paragraph)),
    };
  }
  return template;
};

// One generated document, ready for the PDF/DOCX renderers: bilingual title + paragraph pairs
// with every placeholder already substituted from the case context, then any per-case data-mode
// overrides applied on top. Logo/logo-long paragraphs are never text-substituted or overridden -
// they stay tagged for the renderer to draw a graphical block instead (spec §5-§7). The template's
// letterhead logo (`logo`, below) always renders before the title - see getTemplateLogoType.
export const buildGeneratedDocument = (template, context, docOverride = null) => {
  const override = isPlainObject(docOverride) ? docOverride : {};
  const logo = getTemplateLogoType(template);
  // A legacy template embeds its logo as the first paragraph instead of the dedicated `logo`
  // field; once getTemplateLogoType has picked it up for the before-the-title block, that same
  // paragraph must not also render a second time in its old body position. It's tagged
  // 'logo-consumed' (a no-op for the renderer) rather than dropped from the array, so paragraph
  // indices stay stable for per-case data-mode overrides (docOverrides[docId].paragraphs[index]).
  const hasDedicatedLogoField = Boolean(String(template?.logo || '').trim());
  const languages = resolveDocLanguages(template);
  return {
    id: template.id,
    allowPageBreaks: Boolean(template.allowPageBreaks),
    logo,
    languages,
    columns: resolveDocColumns(template, languages),
    beforeTitle: resolveBeforeTitleBlocks(template, context),
    title: {
      uk: overriddenText(override.title, 'uk', fillPlaceholders(localizedText(template.title, 'uk'), context, 'uk')),
      en: overriddenText(override.title, 'en', fillPlaceholders(localizedText(template.title, 'en'), context, 'en')),
    },
    paragraphs: toArray(template.paragraphs).map((paragraph, index) => {
      const type = getParagraphType(paragraph);
      if (index === 0 && type !== 'text' && !hasDedicatedLogoField) {
        return { type: 'logo-consumed', uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      if (type !== 'text') {
        return { type, uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      const paragraphOverride = overrideAt(override.paragraphs, index);
      return {
        type,
        bold: paragraph?.bold,
        align: paragraph?.align !== undefined ? normalizeBlockAlign(paragraph.align) : undefined,
        uk: overriddenText(paragraphOverride, 'uk', fillPlaceholders(localizedText(paragraph, 'uk'), context, 'uk')),
        en: overriddenText(paragraphOverride, 'en', fillPlaceholders(localizedText(paragraph, 'en'), context, 'en')),
      };
    }),
  };
};

// Drops override entries that match the resolved template text again, so the backend only keeps
// real deviations. Returns null when nothing is left (the node can then be deleted).
export const pruneDocOverride = (docOverride, baselineDoc) => {
  if (!isPlainObject(docOverride) || !baselineDoc) return null;
  const pruned = {};
  const title = {};
  ['uk', 'en'].forEach(langKey => {
    const value = docOverride.title?.[langKey];
    if (typeof value === 'string' && value !== baselineDoc.title?.[langKey]) title[langKey] = value;
  });
  if (Object.keys(title).length) pruned.title = title;
  const paragraphs = {};
  (baselineDoc.paragraphs || []).forEach((baseline, index) => {
    const paragraphOverride = overrideAt(docOverride.paragraphs, index);
    const entry = {};
    ['uk', 'en'].forEach(langKey => {
      const value = paragraphOverride?.[langKey];
      if (typeof value === 'string' && value !== baseline?.[langKey]) entry[langKey] = value;
    });
    if (Object.keys(entry).length) paragraphs[index] = entry;
  });
  if (Object.keys(paragraphs).length) pruned.paragraphs = paragraphs;
  return Object.keys(pruned).length ? pruned : null;
};

// --- Case selector --------------------------------------------------------------------------

export const buildCaseLabel = (catalog, caseRecord) => {
  if (!caseRecord) return '';
  const relations = normalizeCaseRecord(caseRecord).relations;
  const couple = findById(catalog?.parties?.couples, relations.coupleId);
  const partners = toArray(couple?.partners);
  const coupleNames = partners
    .map(partner => localizedText(partner?.name, 'en') || localizedText(partner?.name?.uk, 'uk'))
    .filter(Boolean)
    .join(' & ');
  const surrogate = findById(catalog?.parties?.surrogateMothers, relations.surrogateMotherId);
  const surrogateName = localizedText(surrogate?.name, 'en');
  const parts = [coupleNames, surrogateName ? `SM ${surrogateName}` : ''].filter(Boolean);
  return parts.join(' — ') || String(caseRecord.id);
};

// Which cases/transactions currently point at a given party record (Parties page delete
// confirmation, spec: "If a record is referenced by a case, the confirmation must say so") -
// deletes are never blocked on this, only clearly labeled, same "sever the reference, never touch
// the other record" spirit as removeTransactionReferences.
export const findPartyReferences = (catalog, collection, id) => {
  const targetId = String(id);
  const referencingCases = (catalog?.parties?.cases || []).filter(rawCase => {
    const caseRecord = normalizeCaseRecord(rawCase);
    const relations = caseRecord.relations || {};
    switch (collection) {
      case 'couples': return String(relations.coupleId) === targetId;
      case 'clinics': return String(relations.clinicId) === targetId;
      case 'surrogateMothers': return String(relations.surrogateMotherId) === targetId;
      case 'representatives': return toArray(relations.representativeIds).some(repId => String(repId) === targetId);
      case 'maternityHospitals': return String(caseRecord.childbirth?.maternityHospitalId) === targetId;
      default: return false;
    }
  });

  const referencingTransactions = ['couples', 'surrogateMothers', 'notaries'].includes(collection)
    ? (catalog?.parties?.transactions || []).filter(transaction => {
      if (collection === 'couples') return String(transaction.coupleId) === targetId;
      if (collection === 'surrogateMothers') return String(transaction.surrogateMotherId) === targetId;
      return String(transaction.notaryId) === targetId;
    })
    : [];

  return [
    ...referencingCases.map(caseRecord => `case "${buildCaseLabel(catalog, caseRecord) || caseRecord.id}"`),
    ...referencingTransactions.map(transaction => `transaction "${transaction.id}"`),
  ];
};

// --- Insert-variable picker (spec: "модальне вікно в якому можна обрати змінні") --------------
// Generic arbitrary-depth leaf walker (same spirit as getValueByPath, run in reverse): turns a
// resolved case-context object into a flat list of {path, value} pairs, one per string/number/
// boolean leaf - `path` is the exact dotted placeholder path ("wife.name.uk.nominative"), `value`
// is that leaf's resolved final-format text, so the picker can show real recognizable data instead
// of a technical path (spec: "дані відображай в фінальному форматі"). Arrays are skipped - a
// placeholder always addresses one scalar, never a list (partners, clinic.logo, etc).
export const collectContextLeafPaths = (value, prefix = '') => {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return value.trim() ? [{ path: prefix, value }] : [];
  if (typeof value === 'number' || typeof value === 'boolean') return [{ path: prefix, value: String(value) }];
  if (Array.isArray(value)) return [];
  if (typeof value === 'object') {
    return Object.keys(value)
      .filter(key => key !== 'id')
      .flatMap(key => collectContextLeafPaths(value[key], prefix ? `${prefix}.${key}` : key));
  }
  return [];
};

// The 4 blocks the picker groups variables into (spec: "данні по парі (чоловік, дружина,
// спільні), дані по СМ, дані по довіреній особі, дані по клініці" - one Клініка block, not split
// by language). Each root is a top-level key already exposed by resolveCaseContext.
export const VARIABLE_PICKER_GROUPS = [
  { label: 'Пара', roots: ['wife', 'husband', 'couple'] },
  { label: 'Сурогатна мати', roots: ['surrogateMother'] },
  { label: 'Довірена особа', roots: ['representative'] },
  { label: 'Клініка', roots: ['clinic'] },
];

// Builds the picker's grouped leaf list from a resolved case context (or any similarly-shaped
// object, e.g. an example record when no case is selected yet).
export const buildVariablePickerGroups = context => VARIABLE_PICKER_GROUPS.map(group => ({
  label: group.label,
  items: group.roots.flatMap(root => collectContextLeafPaths(context?.[root], root)),
}));

// Generic "most recently used first" ordering + upsert, shared by the case selector (spec §5) and
// the Documents list (most recently downloaded templates float to the top): whatever isn't in the
// recent list yet keeps its original catalog order, appended after every recent record.
export const orderRecordsByRecentIds = (records, recentIds) => {
  const recent = toArray(recentIds).map(String);
  const rank = id => {
    const index = recent.indexOf(String(id));
    return index === -1 ? recent.length : index;
  };
  return [...(records || [])].sort((a, b) => rank(a.id) - rank(b.id));
};

export const upsertRecentId = (recentIds, id) => {
  if (!id) return toArray(recentIds).map(String);
  const strId = String(id);
  return [strId, ...toArray(recentIds).map(String).filter(existing => existing !== strId)].slice(0, 20);
};

export const orderCasesByRecent = (cases, recentCaseIds) => orderRecordsByRecentIds(cases, recentCaseIds);

export const upsertRecentCaseId = (recentCaseIds, caseId) => upsertRecentId(recentCaseIds, caseId);

// --- Inline text formatting (bold/italic on a selected fragment, batch 13 §1) ----------------
// Storage convention: `**` toggles bold and a lone `*` toggles italic, scanned left-to-right as
// independent on/off flags (not matched pairs like Markdown) - simple to parse, trivial to
// hand-edit in Template mode, and carries through unambiguously to both the PDF and DOCX runs.
// Italic used to be a bare `_`, but real document text is full of underscore runs used as blank
// fill-in lines ("«___»_______ 2026 р."), and every one of those was silently being parsed as an
// italic toggle - eating the underscores themselves in Data mode's de-markup'd view. `*` doesn't
// collide with real prose the same way.

const BOLD_MARKER = '**';
const ITALIC_MARKER = '*';

// Raw markup string -> ordered runs of { text, bold, italic }. Every character belongs to exactly
// one run; consecutive runs never share the same bold/italic pair (kept minimal for serialization).
export const parseFormattedRuns = text => {
  const str = String(text || '');
  const runs = [];
  let bold = false;
  let italic = false;
  let buffer = '';
  const flush = () => {
    if (buffer) runs.push({ text: buffer, bold, italic });
    buffer = '';
  };
  for (let i = 0; i < str.length; i += 1) {
    if (str[i] === '*' && str[i + 1] === '*') {
      flush();
      bold = !bold;
      i += 1;
      continue;
    }
    if (str[i] === '*') {
      flush();
      italic = !italic;
      continue;
    }
    buffer += str[i];
  }
  flush();
  return runs;
};

// Runs -> raw markup string. Emits a toggle marker only where the flag actually changes between
// consecutive runs (and closes whatever is still open at the end) - the inverse of
// parseFormattedRuns. Markers are closed in the reverse of the order they were opened (like
// properly-nested Markdown/HTML) purely for readability of the hand-edited Template-mode source -
// parseFormattedRuns itself doesn't care about nesting order, since `**`/`_` are independent toggles.
export const serializeFormattedRuns = runs => {
  let out = '';
  let bold = false;
  let italic = false;
  const openOrder = [];
  (runs || []).forEach(run => {
    const nextBold = Boolean(run.bold);
    const nextItalic = Boolean(run.italic);
    for (let i = openOrder.length - 1; i >= 0; i -= 1) {
      const marker = openOrder[i];
      if (marker === 'bold' && bold && !nextBold) {
        out += BOLD_MARKER;
        bold = false;
        openOrder.splice(i, 1);
      } else if (marker === 'italic' && italic && !nextItalic) {
        out += ITALIC_MARKER;
        italic = false;
        openOrder.splice(i, 1);
      }
    }
    if (nextBold && !bold) {
      out += BOLD_MARKER;
      bold = true;
      openOrder.push('bold');
    }
    if (nextItalic && !italic) {
      out += ITALIC_MARKER;
      italic = true;
      openOrder.push('italic');
    }
    out += run.text;
  });
  for (let i = openOrder.length - 1; i >= 0; i -= 1) {
    out += openOrder[i] === 'bold' ? BOLD_MARKER : ITALIC_MARKER;
  }
  return out;
};

// The text an admin actually reads/types in Data mode - the same string with every formatting
// marker stripped out (Template mode shows the raw markup instead, spec §2).
export const plainTextOf = text => parseFormattedRuns(text).map(run => run.text).join('');

const withPlainOffsets = runs => {
  let pos = 0;
  return runs.map(run => {
    const start = pos;
    pos += run.text.length;
    return { ...run, start, end: pos };
  });
};

// Splits runs so that every cut offset (a plain-text position) lands exactly on a run boundary -
// the shared step both toggleInlineFormat and applyPlainTextEdit need before they can act on an
// arbitrary sub-range without disturbing formatting outside it.
const splitRunsAtCuts = (runsWithOffsets, cuts) => {
  const sortedCuts = [...new Set(cuts)].sort((a, b) => a - b);
  const result = [];
  runsWithOffsets.forEach(run => {
    const localCuts = sortedCuts.filter(cut => cut > run.start && cut < run.end);
    if (!localCuts.length) {
      result.push(run);
      return;
    }
    let offset = run.start;
    [...localCuts, run.end].forEach(cut => {
      result.push({
        text: run.text.slice(offset - run.start, cut - run.start),
        bold: run.bold,
        italic: run.italic,
        start: offset,
        end: cut,
      });
      offset = cut;
    });
  });
  return result;
};

const mergeAdjacentRuns = runs => runs.reduce((merged, run) => {
  if (!run.text) return merged;
  const last = merged[merged.length - 1];
  if (last && last.bold === run.bold && last.italic === run.italic) last.text += run.text;
  else merged.push({ text: run.text, bold: run.bold, italic: run.italic });
  return merged;
}, []);

// MS Word toggle behavior: if every run inside [plainStart, plainEnd) already carries `attr`, the
// whole selection loses it; otherwise the whole selection gains it (a partially-bold selection
// becomes fully bold on the first press, matching Word rather than "toggle each run individually").
export const toggleInlineFormat = (text, plainStart, plainEnd, attr) => {
  if (!(plainEnd > plainStart)) return String(text || '');
  const runs = withPlainOffsets(parseFormattedRuns(text));
  const split = splitRunsAtCuts(runs, [plainStart, plainEnd]);
  const within = run => run.start >= plainStart && run.end <= plainEnd && run.end > run.start;
  const selected = split.filter(within);
  const allActive = selected.length > 0 && selected.every(run => run[attr]);
  const next = split.map(run => (within(run) ? { ...run, [attr]: !allActive } : run));
  return serializeFormattedRuns(mergeAdjacentRuns(next));
};

// Bold/Italic in Template mode (raw markup, including beforeTitle/title/paragraphs alike) acts
// directly on raw-text offsets - the field already shows the markers, so there is no plain/raw
// translation to do (unlike toggleInlineFormat, which works from a de-markup'd Data-mode field).
// Toggle, not just wrap: selecting exactly the marked-up text (markers just outside the selection)
// strips those markers instead of nesting a second pair around them.
export const toggleRawInlineMarker = (text, start, end, attr) => {
  const raw = String(text || '');
  if (!(end > start)) return raw;
  const marker = attr === 'bold' ? BOLD_MARKER : ITALIC_MARKER;
  const before = raw.slice(0, start);
  const inner = raw.slice(start, end);
  const after = raw.slice(end);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return before.slice(0, -marker.length) + inner + after.slice(marker.length);
  }
  return `${before}${marker}${inner}${marker}${after}`;
};

// Applies a plain-text edit (whatever the admin just typed/pasted/deleted in the de-markup'd Data
// mode field) back onto the raw markup string. Diffs old vs new plain text down to the single
// changed region (the normal case for a live textarea onChange), then splices that same region
// into the raw text - inserted text inherits the formatting of whatever precedes the caret, like
// every mainstream text editor.
export const applyPlainTextEdit = (rawText, newPlainValue) => {
  const raw = String(rawText || '');
  const oldPlain = plainTextOf(raw);
  const nextPlain = String(newPlainValue || '');
  if (oldPlain === nextPlain) return raw;
  const maxCommonStart = Math.min(oldPlain.length, nextPlain.length);
  let start = 0;
  while (start < maxCommonStart && oldPlain[start] === nextPlain[start]) start += 1;
  let oldEnd = oldPlain.length;
  let newEnd = nextPlain.length;
  while (oldEnd > start && newEnd > start && oldPlain[oldEnd - 1] === nextPlain[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  const inserted = nextPlain.slice(start, newEnd);
  const runs = withPlainOffsets(parseFormattedRuns(raw));
  const split = splitRunsAtCuts(runs, [start, oldEnd]);
  const before = split.filter(run => run.end <= start);
  const removed = split.filter(run => run.start >= start && run.end <= oldEnd);
  const after = split.filter(run => run.start >= oldEnd);
  const inheritFrom = before[before.length - 1] || removed[0] || after[0];
  const insertedRun = inserted
    ? [{ text: inserted, bold: Boolean(inheritFrom?.bold), italic: Boolean(inheritFrom?.italic) }]
    : [];
  return serializeFormattedRuns(mergeAdjacentRuns([...before, ...insertedRun, ...after]));
};

// --- Layouts + formatting settings ----------------------------------------------------------

// Bilingual is always 2 columns (UA | EN side by side); a single language can render as either 1
// flowing column or 2 newspaper-style columns of the same language (spec §4).
export const DOCUMENT_LAYOUTS = [
  { id: 'two-column', label: 'UA + EN · 2 columns' },
  { id: 'one-column-uk', label: 'UA · 1 column' },
  { id: 'one-column-en', label: 'EN · 1 column' },
  { id: 'two-column-uk', label: 'UA · 2 columns' },
  { id: 'two-column-en', label: 'EN · 2 columns' },
];

export const isBilingualLayout = layout => layout === 'two-column';

export const isSingleLanguageTwoColumnLayout = layout => layout === 'two-column-uk' || layout === 'two-column-en';

export const getLayoutColumnCount = layout => (isBilingualLayout(layout) || isSingleLanguageTwoColumnLayout(layout) ? 2 : 1);

// Which language a single-language layout (1 or 2 columns) renders - meaningless for the bilingual
// layout, which always shows both.
export const getLayoutLang = layout => (layout === 'one-column-en' || layout === 'two-column-en' ? 'en' : 'uk');

// A document whose template pinned its own `languages`/`columns` (batch 16 §15/§16) renders with
// that layout regardless of the page-wide selector - e.g. `languages: ["uk"], columns: 1` always
// renders one full-width UA column, even while the admin has "UA + EN" selected for the rest of the
// batch. A template that never set `languages` (doc.languages is null) simply defers to whatever
// layout the page/export call passes in, so every pre-existing template is unaffected.
export const getEffectiveDocLayout = (doc, fallbackLayout) => {
  if (!doc?.languages?.length) return fallbackLayout;
  const [firstLang] = doc.languages;
  if (doc.languages.length > 1) return 'two-column';
  const lang = firstLang === 'en' ? 'en' : 'uk';
  return doc.columns === 2 ? `two-column-${lang}` : `one-column-${lang}`;
};

// Rough per-page-per-column character capacity for the single-language 2-column layout's manual
// pagination (splitParagraphsIntoPages below). react-pdf has no native multi-column text flow: a
// flex row's two columns can't independently continue onto a shared next page, so once a page's
// content is taller than the page, the shorter column just ends while the taller one keeps going
// alone onto the next physical page - a whole extra page with one empty-looking column. Chunking
// paragraphs into page-sized groups up front (each safely under one page's two-column capacity)
// avoids that - PROVIDED the estimate stays conservative: word-wrapped justified text never packs
// as tightly as a bare characters-per-line division assumes (wrapping only ever breaks at a word
// boundary, so most lines end short of the full column width), and if a page-group is even
// slightly over-budget, react-pdf's own automatic overflow just continues that page onto an extra
// physical page (see DocumentsPdfDocument's renderSingleLanguagePages - it's one <Page> per
// document with manual `break`s, so an extra page here still gets correctly numbered rather than
// duplicating the page before it) - an occasional under-filled or overflowing page is a much
// cheaper mistake now than it used to be, since it can no longer desync the page numbering. That's
// what SAFETY_FACTOR trades against: too low and pages look conspicuously half-empty (the original
// complaint), too high and more pages need that graceful-overflow fallback. 0.92 was picked by
// rendering a real multi-page contract (numbered clauses, the actual density this layout is used
// for) at several factors and comparing page fullness against overflow risk.
const AVG_CHAR_WIDTH_EM = 0.5;
const SAFETY_FACTOR = 0.92;

export const estimateCharsPerLine = ({ columnWidthPt, fontSize }) => Math.max(1, Math.floor(columnWidthPt / (fontSize * AVG_CHAR_WIDTH_EM)));

export const estimateColumnPageCapacity = ({ columnWidthPt, pageContentHeightPt, fontSize, lineSpacing }) => {
  const charsPerLine = estimateCharsPerLine({ columnWidthPt, fontSize });
  const lineHeightPt = fontSize * lineSpacing;
  const linesPerColumn = Math.max(1, Math.floor(pageContentHeightPt / lineHeightPt));
  return Math.max(1, Math.floor(charsPerLine * linesPerColumn * SAFETY_FACTOR));
};

// Approximates a paragraph's rendered vertical cost as an equivalent character count. Plain
// wrapped text costs its own length, but a paragraph authored with embedded newlines (e.g.
// dash-prefixed sub-items as manual line breaks within one paragraph, rather than separate
// paragraph entries) forces a hard line break regardless of how much of the line width the text
// before it actually used - counting raw characters alone badly underestimates how tall these
// paragraphs render, which was throwing off both the page-capacity chunking and the column
// balance below for real contract text full of numbered/bulleted sub-clauses. charsPerLine (when
// known) costs each newline-delimited segment by its own real line count instead; omitted, this
// falls back to plain character length (the original, newline-blind behavior).
export const estimateParagraphChars = (paragraph, lang, charsPerLine = Infinity) => {
  if (paragraph?.type && paragraph.type !== 'text') return 0;
  const text = String(paragraph?.[lang] || '');
  if (!Number.isFinite(charsPerLine) || charsPerLine <= 0) return text.length;
  const lines = text.split('\n').reduce((sum, segment) => sum + Math.max(1, Math.ceil(segment.length / charsPerLine)), 0);
  return lines * charsPerLine;
};

// Splits one document's paragraphs into two newspaper-style columns for the single-language
// 2-column layout: whole paragraphs (never split mid-paragraph, same atomic-block granularity the
// bilingual layout already uses) are handed to the left column until it holds roughly half the
// total estimated cost of `lang` (see estimateParagraphChars), the rest goes to the right column.
export const splitParagraphsIntoColumns = (paragraphs, lang, charsPerLine = Infinity) => {
  const items = paragraphs || [];
  const lengthOf = paragraph => estimateParagraphChars(paragraph, lang, charsPerLine);
  const totalLength = items.reduce((sum, paragraph) => sum + lengthOf(paragraph), 0);
  const target = totalLength / 2;
  let running = 0;
  let splitIndex = items.length;
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0 && running >= target) {
      splitIndex = index;
      break;
    }
    running += lengthOf(items[index]);
  }
  return [items.slice(0, splitIndex), items.slice(splitIndex)];
};

// Groups paragraphs into page-sized chunks: each chunk's combined estimated character count stays
// within one page's two-column capacity (columnCharCapacity is per column; a page holds two), so
// every chunk can safely render as its own page with a same-page-only left/right split (see
// splitParagraphsIntoColumns) instead of letting one column spill onto the next physical page while
// its sibling sits empty.
export const splitParagraphsIntoPages = (paragraphs, lang, columnCharCapacity, charsPerLine = Infinity) => {
  const perPageCapacity = Math.max(1, columnCharCapacity) * 2;
  const pages = [];
  let current = [];
  let currentChars = 0;
  (paragraphs || []).forEach(paragraph => {
    const chars = estimateParagraphChars(paragraph, lang, charsPerLine);
    if (current.length && currentChars + chars > perPageCapacity) {
      pages.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(paragraph);
    currentChars += chars;
  });
  if (current.length) pages.push(current);
  return pages.length ? pages : [[]];
};

// A clinic can keep several logo file variants (spec §7): a compact one for the shared logo
// above the two-column layout and a long full-width one for the one-column layouts. The column
// mode selected at the top of the page is the flag that picks the variant: the one explicitly
// assigned '2col' or '1col' (see applyLogoLayoutAssignment). If the mode's assigned variant is
// missing, the variant assigned to the other layout is the fallback - generation never fails
// over a logo. Unassigned variants are not used, except when no variant is assigned at all
// (single legacy upload, freshly uploaded files): then the pre-assignment aspect-ratio heuristic
// keeps picking - squarest for two columns, widest for one column.
export const pickLogoVariantForLayout = (logoVariants, layout) => {
  const variants = (logoVariants || []).filter(variant => variant && variant.dataUrl);
  if (!variants.length) return null;
  const desiredTag = layout === 'two-column' ? '2col' : '1col';
  const otherTag = desiredTag === '2col' ? '1col' : '2col';
  const assignedTo = tag => variants.find(variant => variant.layout === tag) || null;
  const assigned = assignedTo(desiredTag) || assignedTo(otherTag);
  if (assigned) return assigned;
  const aspectRatio = variant => (variant.width > 0 && variant.height > 0 ? variant.width / variant.height : 1);
  return variants.reduce((best, variant) => {
    if (!best) return variant;
    const preferWide = layout !== 'two-column';
    const bestRatio = aspectRatio(best);
    const ratio = aspectRatio(variant);
    const isBetter = preferWide ? ratio > bestRatio : Math.abs(ratio - 1) < Math.abs(bestRatio - 1);
    return isBetter ? variant : best;
  }, null);
};

// Defaults mirror the reference statements docx: Times ~10pt body / 11pt bold titles,
// single line spacing, zero after-paragraph spacing, A4 with 1.2/1.5/1.2/2.0 cm margins and a
// ~5.5 cm wide clinic logo centered above the title.
export const DEFAULT_DOC_FORMATTING = {
  fontSize: 10,
  titleFontSize: 11,
  lineSpacing: 1,
  paragraphSpacing: 0,
  firstLineIndentCm: 0,
  marginTopCm: 1.2,
  marginRightCm: 1.5,
  marginBottomCm: 1.2,
  marginLeftCm: 2,
  columnGapCm: 0.5,
  logoWidthMm: 55,
  showLogo: true,
  headerText: '',
  footerText: '',
  showPageNumbers: true,
  // Off by default (spec §3): a thin vertical rule between the two columns, drawn only while a
  // 2-column layout (bilingual or single-language) is actually active.
  columnDivider: false,
};

const clampNumber = (value, min, max, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

export const normalizeDocFormatting = raw => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    fontSize: clampNumber(source.fontSize, 6, 24, DEFAULT_DOC_FORMATTING.fontSize),
    titleFontSize: clampNumber(source.titleFontSize, 6, 32, DEFAULT_DOC_FORMATTING.titleFontSize),
    lineSpacing: clampNumber(source.lineSpacing, 0.8, 3, DEFAULT_DOC_FORMATTING.lineSpacing),
    paragraphSpacing: clampNumber(source.paragraphSpacing, 0, 36, DEFAULT_DOC_FORMATTING.paragraphSpacing),
    firstLineIndentCm: clampNumber(source.firstLineIndentCm, 0, 5, DEFAULT_DOC_FORMATTING.firstLineIndentCm),
    marginTopCm: clampNumber(source.marginTopCm, 0.5, 6, DEFAULT_DOC_FORMATTING.marginTopCm),
    marginRightCm: clampNumber(source.marginRightCm, 0.5, 6, DEFAULT_DOC_FORMATTING.marginRightCm),
    marginBottomCm: clampNumber(source.marginBottomCm, 0.5, 6, DEFAULT_DOC_FORMATTING.marginBottomCm),
    marginLeftCm: clampNumber(source.marginLeftCm, 0.5, 6, DEFAULT_DOC_FORMATTING.marginLeftCm),
    columnGapCm: clampNumber(source.columnGapCm, 0, 3, DEFAULT_DOC_FORMATTING.columnGapCm),
    logoWidthMm: clampNumber(source.logoWidthMm, 10, 180, DEFAULT_DOC_FORMATTING.logoWidthMm),
    showLogo: source.showLogo === undefined ? DEFAULT_DOC_FORMATTING.showLogo : Boolean(source.showLogo),
    headerText: String(source.headerText ?? DEFAULT_DOC_FORMATTING.headerText),
    footerText: String(source.footerText ?? DEFAULT_DOC_FORMATTING.footerText),
    showPageNumbers: source.showPageNumbers === undefined
      ? DEFAULT_DOC_FORMATTING.showPageNumbers
      : Boolean(source.showPageNumbers),
    columnDivider: source.columnDivider === undefined
      ? DEFAULT_DOC_FORMATTING.columnDivider
      : Boolean(source.columnDivider),
  };
};

// --- Per-document format overrides (spec §5) ------------------------------------------------
// A document's technical `format` field stores only the values that deviate from the reference
// (default/favourite) formatting - an empty/absent field means "use the defaults as-is". Merging
// is a flat shallow overlay since every DEFAULT_DOC_FORMATTING key is itself a scalar.

// The formatting a document actually renders with: the shared reference settings with that
// document's own overrides layered on top, then re-clamped/validated the same way any formatting
// value is.
export const resolveEffectiveDocFormatting = (referenceFormatting, docFormatOverride) => normalizeDocFormatting({
  ...referenceFormatting,
  ...(isPlainObject(docFormatOverride) ? docFormatOverride : {}),
});

// What actually gets written into a document's `format` field: only the keys where the working
// value differs from the reference - if admin dials a field back to match the reference exactly,
// it drops out of the overrides instead of persisting a redundant copy (spec §5).
export const diffDocFormattingOverrides = (referenceFormatting, workingFormatting) => {
  const reference = normalizeDocFormatting(referenceFormatting);
  const working = normalizeDocFormatting(workingFormatting);
  const overrides = {};
  Object.keys(DEFAULT_DOC_FORMATTING).forEach(key => {
    if (working[key] !== reference[key]) overrides[key] = working[key];
  });
  return overrides;
};

// The backend settings record stores formatting values, the recently-used case order, and the
// recently-downloaded document template order (spec: "самі популярні документи мають бути вгорі").
// Clinic logos are resolved from Storage at render time, not stored as URLs/data URLs here.
export const normalizeDocumentsSettings = raw => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    formatting: normalizeDocFormatting(source.formatting),
    clinicLogo: null,
    recentCaseIds: toArray(source.recentCaseIds).map(String),
    recentDocIds: toArray(source.recentDocIds).map(String),
  };
};

// --- File naming ----------------------------------------------------------------------------

const slugifyFileNamePart = value => String(value || '')
  .replace(/[^\p{L}\p{N}]+/gu, '_')
  .replace(/^_+|_+$/g, '');

// Every selected document downloads as its own file (spec: "всі обрані документи ... мають бути
// окремими файлами") - `doc` (a single generated document, when provided) adds its own title to
// the name so a batch download doesn't produce several identically-named files.
export const buildDocumentsFileName = (catalog, caseRecord, layout, extension, doc = null) => {
  const label = slugifyFileNamePart(buildCaseLabel(catalog, caseRecord)).slice(0, 60) || 'Case';
  const docLabel = doc ? slugifyFileNamePart(doc.title?.uk || doc.title?.en || doc.id).slice(0, 60) : '';
  const langTag = isBilingualLayout(layout) ? 'UA-EN' : (getLayoutLang(layout) === 'en' ? 'EN' : 'UA');
  const today = new Date();
  const ymd = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const parts = ['Documents', label, docLabel, langTag, ymd].filter(Boolean);
  return `${parts.join('_')}.${extension}`;
};
