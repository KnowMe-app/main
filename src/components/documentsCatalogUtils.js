// Pure data logic for the Documents page (legal/client document generator). Everything here is
// UI-free so it can be unit-tested: parsing the paste-and-parse technical input, additively
// merging parsed records into the backend catalog, resolving a case's parties into a placeholder
// context, filling {{placeholder}} tokens, and normalizing the backend-persisted settings record
// (favourite formatting values + recently-used cases).

export const DOCUMENTS_PARTIES_PATH = 'documentsBuilder/parties';
export const DOCUMENTS_CASES_PATH = 'documentsBuilder/cases';
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

export const PARTY_COLLECTIONS = ['couples', 'surrogateMothers', 'representatives', 'clinics', 'partnerClinics', 'maternityHospitals', 'notaries'];

// mergeCollection derives an id prefix for un-identified incoming records by stripping a trailing
// 's' off the collection name; 'notaries' isn't a simple plural ('notarys' would be wrong), so it
// needs the explicit override.
const COLLECTION_ID_PREFIXES = { notaries: 'notary', partnerClinics: 'partner-clinic' };

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
  cases: [],
  parties: {
    couples: [], surrogateMothers: [], representatives: [], clinics: [], partnerClinics: [], maternityHospitals: [], notaries: [],
  },
  documents: [],
  clinicLogos: {},
});

// Backend stores every collection keyed by record id (so merges/deletes touch single children);
// this converts a raw snapshot (or a pasted array) back into ordered arrays for the UI. Cases live
// at their own top-level `documentsBuilder/cases` path (sibling of `parties`/`templates`), so their
// raw snapshot is passed in separately from the party collections.
export const normalizeDocumentsCatalog = (rawParties, rawTemplates, rawCases) => {
  const catalog = emptyDocumentsCatalog();
  PARTY_COLLECTIONS.forEach(collection => {
    catalog.parties[collection] = toRecordsWithIdFromKey(rawParties?.[collection]).filter(record => isPlainObject(record));
  });
  catalog.cases = toRecordsWithIdFromKey(rawCases).filter(record => isPlainObject(record)).map(normalizeCaseRecord);
  // Same read-time migration idea as normalizeCaseRecord, for templates: per-paragraph styles
  // are consolidated under each paragraph's single `style` key right at ingestion, so nothing
  // downstream ever has to branch on which shape a stored paragraph happens to carry.
  catalog.documents = toRecordsWithIdFromKey(rawTemplates).filter(record => isPlainObject(record)).map(consolidateTemplateStyles);
  // A clinic's own `logo` field, alongside its name/legalName/etc. - a clinic is shared across
  // many cases, so its logo was never really case-scoped to begin with.
  catalog.parties.clinics.forEach(clinic => {
    const entries = normalizeClinicLogoEntries(clinic.logo);
    if (entries.length) catalog.clinicLogos[String(clinic.id)] = entries;
  });
  return catalog;
};

// --- Technical input (paste-and-parse) ------------------------------------------------------

// Accepts three JSON shapes, so the exact file the backend exports (documentsBuilder/*) can be
// pasted or uploaded as-is, with no manual reshaping:
//   1. The full backend export: `{ cases: {...}, parties: { couples, ... }, templates: {...}, settings }`
//      - i.e. `documentsBuilder/{cases,parties,templates,settings}` dumped together, party
//      collections one level deeper under `parties`, cases and documents each keyed by id at
//      their own top level.
//   2. The older technical-paste shape: `{ data: {...party collections, cases...}, documents: [...] }`,
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
  // Cases live at the top level (`cases`), sibling to `parties`/`templates`; a bare paste without
  // the `parties` wrapper carries them at the same top level too.
  const casesSource = dataRoot.cases !== undefined ? dataRoot.cases : dataSource.cases;

  const incoming = emptyDocumentsCatalog();
  PARTY_COLLECTIONS.forEach(collection => {
    incoming.parties[collection] = toRecordsWithIdFromKey(dataSource[collection]).filter(record => isPlainObject(record));
  });
  incoming.cases = toRecordsWithIdFromKey(casesSource).filter(record => isPlainObject(record)).map(normalizeCaseRecord);
  // Pasted templates get the same style consolidation as normalizeDocumentsCatalog - a paragraph
  // row copied out of the backend (either shape) merges in with its full style intact.
  incoming.documents = toRecordsWithIdFromKey(templatesSource).filter(record => isPlainObject(record)).map(consolidateTemplateStyles);

  incoming.parties.clinics.forEach(clinic => {
    const entries = normalizeClinicLogoEntries(clinic.logo);
    if (entries.length) incoming.clinicLogos[String(clinic.id)] = entries;
  });

  const hasParties = PARTY_COLLECTIONS.some(collection => incoming.parties[collection].length > 0);
  const hasClinicLogos = Object.keys(incoming.clinicLogos).length > 0;
  if (!hasParties && incoming.documents.length === 0 && incoming.cases.length === 0 && !hasClinicLogos) {
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
  catalog.cases = mergeCollection(current?.cases || [], incoming?.cases || [], 'case', summary);
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

export const catalogCasesToBackend = catalog => (catalog.cases || []).reduce((byId, record) => {
  byId[record.id] = record;
  return byId;
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
  passport: {
    number: '', issuedBy: { uk: '', en: '' }, issueDate: '',
  },
  // `apostille` (legacy, freeform) is kept for whatever already reads it; `apostilleDate` is the
  // discrete date a signature block needs (spec batch 2026-07-24 §10) - a separate field, not a
  // rename, so no existing template silently loses its value.
  powerOfAttorney: {
    date: '', apostille: '', apostilleDate: '',
  },
});

// A clinic is either the foreign fertility clinic the intended parents came from, or the
// Ukrainian clinic actually performing the surrogacy procedure (spec batch 21 §1: the variable
// picker needs to offer these as two separate groups) - unset/legacy records default to
// 'ukrainian' since that's the common case pre-dating this field.
export const CLINIC_KINDS = ['foreign', 'ukrainian'];

export const createEmptyClinic = () => ({
  id: makeRecordId('clinic'),
  kind: 'ukrainian',
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

// A partner clinic is the foreign clinic embryos ship from - a distinct, deliberately simplified
// party type from the Ukrainian `clinics` collection (which performs the surrogacy program itself
// and carries a full legal/banking profile): no EDRPOU, license, director, bank details, or logo,
// just the name and address a static document needs to reference it by.
export const createEmptyPartnerClinic = () => ({
  id: makeRecordId('partner-clinic'),
  name: { uk: '', en: '' },
  address: { uk: '', en: '' },
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

// --- Case shape ------------------------------------------------------------------------------
// One case is one concrete combination of couple + clinic + surrogate mother + representative(s);
// changing the clinic or surrogate mother means creating a new case rather than mutating this one
// in place, so there is no active/replaced/from/to history to track inside a single case record.
// Every case in this Documents Builder is a surrogacy-program case - no `programType`/`program`
// field distinguishes cases from one another. Templates are static (configured once in
// `templates`); a document is always `static template + current case data + derived formatting
// context` - never a stored snapshot, version, or per-case override of resolved text.

// A fresh id for a brand-new case (Parties page "+ New case") - same generated shape as
// createChildRecord's id.
export const makeCaseId = () => makeRecordId('case');

// A freshly-created case carries only its id - `relations`/`childbirth`/`documents` are added
// only once the admin actually enters that data, never pre-populated with empty placeholder
// branches.
export const createEmptyCase = ({ caseId } = {}) => ({ id: caseId });

// A new child record for the childbirth.children editor - a stable generated id, never the array
// index, since children can be reordered/removed independently of any document that still
// references an earlier one by id.
export const createChildRecord = () => ({
  id: makeRecordId('child'),
  sex: '',
  birthDate: '',
  birthPlace: { uk: '', en: '' },
  medicalConclusion: { number: '', date: '' },
});

// Idempotent pass-through: a case record is used as-is (relations/childbirth/documents are all
// optional - missing branches are handled by the `?.` reads below, not backfilled here) so a case
// saved before a given field existed never crashes the UI, and re-saving it never recreates a
// branch nobody ever asked for.
export const normalizeCaseRecord = rawCase => (isPlainObject(rawCase) ? rawCase : {});

// Strips undefined/null/''-valued fields (and now-empty objects) out of a case form draft before
// it's written to Firebase, so saving a case that has no documents data yet never creates empty
// placeholder branches like `documents: { surrogacyAgreement: {} }`. Never applied to `templates` -
// blank lines/strings there can be a deliberate part of a document.
export const removeEmptyCaseValues = value => {
  if (Array.isArray(value)) return value.map(removeEmptyCaseValues);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, removeEmptyCaseValues(child)])
        .filter(([, child]) => {
          if (child === undefined || child === null || child === '') return false;
          if (Array.isArray(child)) return true;
          if (typeof child === 'object') return Object.keys(child).length > 0;
          return true;
        }),
    );
  }
  return value;
};

export const resolveCaseContext = (catalog, caseId, { childId } = {}) => {
  const rawCaseRecord = findById(catalog?.cases, caseId);
  if (!rawCaseRecord) return null;
  const caseRecord = normalizeCaseRecord(rawCaseRecord);
  const relations = isPlainObject(caseRecord.relations) ? caseRecord.relations : {};

  const couple = findById(catalog.parties.couples, relations.coupleId);
  const partners = toArray(couple?.partners);
  const wife = partners.find(partner => partner?.role === 'wife') || partners[0] || null;
  const husband = partners.find(partner => partner?.role === 'husband') || partners[1] || null;
  const representatives = toArray(relations.representativeIds)
    .map(id => findById(catalog.parties.representatives, id))
    .filter(Boolean);

  const childbirth = isPlainObject(caseRecord.childbirth) ? caseRecord.childbirth : {};
  const rawChildren = toArray(childbirth.children);
  // The first child is the default fallback for single-child documents - a caller generating a
  // document for a twin passes `childId` to pick a different one; `children` (every child,
  // gender-computed) is exposed alongside it so the UI can offer a selector.
  const selectedRawChild = childId ? rawChildren.find(item => String(item?.id) === String(childId)) : null;
  const rawChild = isPlainObject(selectedRawChild) ? selectedRawChild : (isPlainObject(rawChildren[0]) ? rawChildren[0] : {});
  const medicalConclusion = isPlainObject(rawChild.medicalConclusion) ? rawChild.medicalConclusion : {};

  const documents = isPlainObject(caseRecord.documents) ? caseRecord.documents : {};
  const surrogacyAgreement = isPlainObject(documents.surrogacyAgreement) ? documents.surrogacyAgreement : {};
  const rawBirthRegistration = isPlainObject(documents.birthRegistrationConsent) ? documents.birthRegistrationConsent : {};
  const statementDate = rawBirthRegistration.statementDate ?? '';
  const birthRegistration = {
    ...rawBirthRegistration,
    statementDateWords: {
      uk: formatUkrainianDateWords(statementDate),
      en: formatEnglishDateWords(statementDate),
    },
  };
  // The Ukrainian clinic (parties.clinics, relations.clinicId) runs the surrogacy program and signs
  // the documents; the partner clinic (parties.partnerClinics, relations.partnerClinicId) is the
  // separate foreign clinic embryos ship from - never the same collection, never a second "main"
  // clinic. Both are null-safe: an old case with no partnerClinicId simply resolves to null rather
  // than throwing, so a template referencing partnerClinic degrades to a visible warning instead of
  // a crash (see getUnresolvedVariablePaths/fillPlaceholders).
  const partnerClinic = relations.partnerClinicId
    ? findById(catalog.parties.partnerClinics, relations.partnerClinicId)
    : null;

  return {
    case: caseRecord,
    relations,
    couple,
    wife,
    husband,
    surrogateMother: findById(catalog.parties.surrogateMothers, relations.surrogateMotherId),
    clinic: findById(catalog.parties.clinics, relations.clinicId),
    partnerClinic,
    representative: representatives[0] || null,
    representatives,
    childbirth,
    children: rawChildren.map(buildChildContext),
    child: buildChildContext(rawChild),
    selectedChildId: rawChild?.id,
    medicalConclusion,
    maternityHospital: findById(catalog.parties.maternityHospitals, childbirth.maternityHospitalId),
    surrogacyAgreement,
    birthRegistration,
    notary: findById(catalog.parties.notaries, rawBirthRegistration.notaryId),
  };
};

// Legal statements show dates as DD.MM.YYYY (see the reference docx), while the JSON stores ISO.
export const formatDocumentDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
};

// Read/write compatibility for a date field that's supposed to be stored as ISO (`ivfDate`): a
// pre-prepared import may still carry the display form `DD.MM.YYYY` (spec §6) - this reads either
// shape and always resolves to ISO, so fillPlaceholders' own ISO -> DD.MM.YYYY formatting
// (formatDocumentDate) renders it correctly regardless of which shape happened to be stored. The
// case editor calls this again on every save (see CaseChildbirthTransactionEditor's ivfDate
// commit) so the backend is normalized to ISO from the next save onward; this is only a
// compatibility shim for what's already stored, never a second source of truth.
export const normalizeIsoDate = value => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (isIsoDate(trimmed)) return trimmed;
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  return trimmed;
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

// A passport number is stored compact ("ME680736"); every legal document that shows one wants a
// space between the two-letter series and the digits ("ME 680736"). One shared formatter, applied
// wherever a `...passport.number` path resolves (see resolvePlaceholderValue below), so no
// template has to hand-write "серія {{...}} № ..." and risk duplicating a series/number split the
// formatter already does (spec batch 2026-07-24 §10).
export const formatPassportNumber = value => {
  const trimmed = String(value || '').trim();
  const match = /^([A-Za-zА-Яа-яЄЇІЄїієЇ]{1,3})\s*(\d+)$/.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1].toUpperCase()} ${match[2]}`;
};

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
  const formatted = formatDocumentDate(value);
  return path.endsWith('passport.number') ? formatPassportNumber(formatted) : formatted;
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

// Every {{path}} referenced anywhere in a template (title, beforeTitle blocks, paragraphs, both
// languages) - regardless of whether it currently resolves. Used to scope non-blocking case
// completeness warnings (e.g. childbirth/birth-registration data) to only the documents actually
// checked for generation, instead of nagging about a birth that hasn't happened yet while
// generating an early-stage document like a surrogacy agreement that never references it.
export const getTemplateReferencedPaths = template => {
  const paths = new Set();
  const scan = value => findUnresolvedVariables(value).forEach(path => paths.add(path));
  scan(template?.title?.uk);
  scan(template?.title?.en);
  toArray(template?.beforeTitle).forEach(block => {
    scan(block?.uk);
    scan(block?.en);
  });
  toArray(template?.paragraphs).forEach(paragraph => {
    scan(paragraph?.uk);
    scan(paragraph?.en);
  });
  return [...paths];
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
  requirePresent(caseRecord.relations?.coupleId, 'case.relations.coupleId');
  requirePresent(caseRecord.relations?.clinicId, 'case.relations.clinicId');
  requirePresent(caseRecord.relations?.surrogateMotherId, 'case.relations.surrogateMotherId');
  if (!toArray(caseRecord.childbirth?.children).length) issues.push('case.childbirth.children');

  return issues;
};

// The birth-registration surrogate-consent statement's own checklist - missing hospital/notary
// lookups and malformed dates are reported the same way as a genuinely empty field.
export const validateBirthRegistrationCase = (catalog, caseId) => {
  const context = resolveCaseContext(catalog, caseId);
  if (!context) return ['case'];

  const issues = [];
  const isBlank = value => value === undefined || value === null || String(value).trim() === '';
  const requirePresent = (value, path) => {
    if (isBlank(value)) issues.push(path);
  };

  const {
    childbirth, child, medicalConclusion, surrogateMother, maternityHospital, birthRegistration, notary,
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

  requirePresent(birthRegistration.statementDate, 'case.documents.birthRegistrationConsent.statementDate');
  requirePresent(birthRegistration.notaryId, 'case.documents.birthRegistrationConsent.notaryId');
  if (!isBlank(birthRegistration.statementDate) && !isIsoDate(birthRegistration.statementDate)) {
    issues.push('case.documents.birthRegistrationConsent.statementDate (must be YYYY-MM-DD)');
  }
  if (!isBlank(birthRegistration.notaryId) && !notary) {
    issues.push('case.documents.birthRegistrationConsent.notaryId (no matching notary)');
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

// Auto-detection (above) can still be wrong for an edge case the admin spots visually; an
// explicit bold on the paragraph (true/false, under its consolidated `style` key or the legacy
// flat field - see getParagraphStyle) overrides it either way, undefined falls back to
// isSectionHeading. Bold is a whole-paragraph property (both languages together), matching how
// real section headings actually look in these bilingual documents.
export const isParagraphBold = paragraph => {
  const { bold } = getParagraphStyle(paragraph);
  if (bold !== undefined) return bold;
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

// Never backfills a missing translation from the other language (spec batch 21 §4: a paragraph/
// title with no `en` value must render empty, not silently show the `uk` text as if it were a
// translation) - a requested language that isn't on the record resolves to '', full stop.
const localizedText = (value, lang) => {
  if (isPlainObject(value)) return String(value[lang] ?? '');
  return String(value ?? '');
};

// A paragraph that starts with a variable - commonly a lowercase date-in-words - must still read
// as a proper sentence (spec batch 21 §7). Applied here, at render time, on the resolved output
// only - the stored template/override text is never rewritten. Idempotent (capitalizing an
// already-capitalized letter is a no-op), and skips past any leading bold/italic markers so
// `**сьогодні...` capitalizes "Сьогодні", not the marker itself.
const capitalizeFirstLetter = text => {
  const value = String(text || '');
  const match = /^(\*+)?([\s\S])([\s\S]*)$/.exec(value);
  if (!match) return value;
  const [, markers, firstChar, rest] = match;
  return `${markers || ''}${firstChar.toUpperCase()}${rest}`;
};

// --- beforeTitle blocks (batch 16 §14/§17) ---------------------------------------------------
// Free-standing text rendered between the letterhead logo and the title (e.g. "ЗА МІСЦЕМ ВИМОГИ",
// right-aligned and bold) - never merged into `paragraphs`, so it always renders in that fixed
// logo -> beforeTitle -> title -> paragraphs order regardless of how the body is edited.
const ALLOWED_BLOCK_ALIGNMENTS = ['left', 'right', 'center', 'justify'];

export const normalizeBlockAlign = align => (ALLOWED_BLOCK_ALIGNMENTS.includes(align) ? align : 'left');

// A block's width as a percentage of its column (spec batch 21 §8: the applicant/signatory data
// block under "ЗА МІСЦЕМ ВИМОГИ" is a half-page-right layout rule - defaults to 50, i.e. half the
// page, pushed against whichever margin `align` names). Never below 10 (unreadably narrow) or
// above 100 (full width).
export const DEFAULT_BLOCK_WIDTH_PERCENT = 50;
export const normalizeBlockWidth = width => clampNumber(width, 10, 100, DEFAULT_BLOCK_WIDTH_PERCENT);

// --- Consolidated per-paragraph styles (batch 2026-07-23 B §1.1) -----------------------------
// Everything visual one paragraph (or beforeTitle block) carries lives together under its single
// `style` key on the backend record: `{ fontSize?, indentCm?, align?, bold?, width? }` - only the
// keys the admin actually set, so a paragraph without a key inherits the document default and
// nothing redundant is stored. One key for all of it means a whole paragraph row copied on the
// backend and pasted into another document brings every style with it, and a parser never has to
// hunt for scattered flat fields. Legacy records stored the same values flat on the record
// (bold/align/indentCm/width) - those are still read (a `style` entry wins per field), and every
// write path re-consolidates them under `style` via withParagraphStyle.
export const PARAGRAPH_STYLE_KEYS = ['fontSize', 'indentCm', 'align', 'bold', 'width'];

// Per-field validation, shared by reads and writes: an invalid/cleared value normalizes to
// undefined (= the key is absent, the paragraph inherits), never to a silently-substituted
// default that would then be persisted as if the admin had set it.
const normalizeStyleValue = (key, value) => {
  if (value === undefined || value === null) return undefined;
  switch (key) {
    case 'fontSize': return clampNumber(value, 6, 32, undefined);
    case 'indentCm': return clampNumber(value, 0, 5, undefined);
    case 'align': return ALLOWED_BLOCK_ALIGNMENTS.includes(value) ? value : undefined;
    case 'bold': return Boolean(value);
    case 'width': return clampNumber(value, 10, 100, undefined);
    default: return undefined;
  }
};

// The normalized sparse style of a paragraph/beforeTitle block, whichever shape the record is in.
export const getParagraphStyle = record => {
  const consolidated = isPlainObject(record?.style) ? record.style : {};
  const style = {};
  PARAGRAPH_STYLE_KEYS.forEach(key => {
    const raw = consolidated[key] !== undefined ? consolidated[key] : record?.[key];
    const value = normalizeStyleValue(key, raw);
    if (value !== undefined) style[key] = value;
  });
  return style;
};

// The record with `partial` merged into its consolidated style: a null/undefined value clears
// that key (the paragraph inherits the document default again), an empty result drops the `style`
// key entirely, and any legacy flat style fields are stripped - so from the first write onward
// the consolidated key is the record's single style source of truth.
export const withParagraphStyle = (record, partial = {}) => {
  const style = getParagraphStyle(record);
  Object.keys(partial || {}).forEach(key => {
    if (!PARAGRAPH_STYLE_KEYS.includes(key)) return;
    const value = normalizeStyleValue(key, partial[key]);
    if (value === undefined) delete style[key];
    else style[key] = value;
  });
  const rest = { ...record };
  delete rest.style;
  PARAGRAPH_STYLE_KEYS.forEach(key => {
    delete rest[key];
  });
  return Object.keys(style).length ? { ...rest, style } : rest;
};

// One alignment button per paragraph toolbar, MS Word logic (batch 2026-07-23 B §1.5): each
// click cycles to the next state, and Justify is in the cycle because the Заява's body/notary
// blocks are justified per the notarial standard - without it one click would make justify
// unreachable. The effective alignment (what the button's icon shows and what a never-clicked
// paragraph renders with) is the stored override or the paragraph's type default: flush-left for
// a bold/heading paragraph, justified body text otherwise - exactly what the renderers do.
export const PARAGRAPH_ALIGN_CYCLE = ['left', 'center', 'right', 'justify'];

export const getEffectiveParagraphAlign = record => getParagraphStyle(record).align
  ?? (isParagraphBold(record) ? 'left' : 'justify');

export const nextParagraphAlign = align => {
  const index = PARAGRAPH_ALIGN_CYCLE.indexOf(align);
  return PARAGRAPH_ALIGN_CYCLE[(index + 1) % PARAGRAPH_ALIGN_CYCLE.length];
};

// Scope-addressed style access, mirroring getTemplateScopeText/withTemplateScopeText: the same
// alignment/formatting controls serve the title, a beforeTitle block, and a body paragraph
// through one pair of helpers (batch 2026-07-23 C §2: the title is an ordinary paragraph with the
// standard toolbar, so TITLE_SCOPE resolves to the `title` record and its consolidated `style`).
export const getTemplateScopeRecord = (template, scope) => {
  if (scope === TITLE_SCOPE) return isPlainObject(template?.title) ? template.title : null;
  const beforeTitleMatch = /^beforeTitle:(\d+)$/.exec(scope);
  if (beforeTitleMatch) return toArray(template?.beforeTitle)[Number(beforeTitleMatch[1])] || null;
  const paragraphMatch = /^p:(\d+)$/.exec(scope);
  if (paragraphMatch) return toArray(template?.paragraphs)[Number(paragraphMatch[1])] || null;
  return null;
};

// The title's effective alignment defaults to Center (batch 2026-07-23 C §2: an ordinary centered
// paragraph), unlike body paragraphs whose default comes from their bold/heading status - an
// explicit `style.align` set with the alignment button still wins, exactly like any paragraph.
export const getEffectiveTitleAlign = titleRecord => getParagraphStyle(titleRecord).align ?? 'center';

export const withTemplateScopeStyle = (template, scope, partialStyle) => {
  if (scope === TITLE_SCOPE) {
    return { ...template, title: withParagraphStyle(isPlainObject(template?.title) ? template.title : {}, partialStyle) };
  }
  const beforeTitleMatch = /^beforeTitle:(\d+)$/.exec(scope);
  if (beforeTitleMatch) {
    const index = Number(beforeTitleMatch[1]);
    return {
      ...template,
      beforeTitle: toArray(template?.beforeTitle).map((block, i) => (i === index ? withParagraphStyle(block, partialStyle) : block)),
    };
  }
  const paragraphMatch = /^p:(\d+)$/.exec(scope);
  if (paragraphMatch) {
    const index = Number(paragraphMatch[1]);
    return {
      ...template,
      paragraphs: toArray(template?.paragraphs).map((paragraph, i) => (i === index ? withParagraphStyle(paragraph, partialStyle) : paragraph)),
    };
  }
  return template;
};

// Read-time migration for one template (idempotent, same spirit as normalizeCaseRecord): every
// paragraph and beforeTitle block re-expressed with its styles consolidated under `style`, so the
// next persist writes the new shape without a separate migration pass.
export const consolidateTemplateStyles = template => {
  if (!isPlainObject(template)) return template;
  const next = { ...template };
  if (template.paragraphs !== undefined) {
    next.paragraphs = toArray(template.paragraphs).map(paragraph => (isPlainObject(paragraph) ? withParagraphStyle(paragraph) : paragraph));
  }
  if (template.beforeTitle !== undefined) {
    next.beforeTitle = toArray(template.beforeTitle).map(block => (isPlainObject(block) ? withParagraphStyle(block) : block));
  }
  return next;
};

// The addressee/signer block's left offset (notarial layout standard): the whole beforeTitle
// group renders as one strip from this offset to the right margin, in both the PDF and Word
// exports. Stored per document as a single number - percent of the text width, so the same value
// holds whatever margins the Format panel sets. The default matches the notarial reference file:
// 8.5 cm of the standard 18.0 cm text width (the 4820-twip empty column of its layout table).
export const DEFAULT_SIGNER_BLOCK_OFFSET_PERCENT = 47.2;
export const SIGNER_BLOCK_OFFSET_MIN_PERCENT = 30;
export const SIGNER_BLOCK_OFFSET_MAX_PERCENT = 65;
export const normalizeSignerBlockOffsetPercent = value => clampNumber(
  value,
  SIGNER_BLOCK_OFFSET_MIN_PERCENT,
  SIGNER_BLOCK_OFFSET_MAX_PERCENT,
  DEFAULT_SIGNER_BLOCK_OFFSET_PERCENT,
);

// `align` stays sparse here (undefined = never set): the signer-strip renderers fall back to
// their own notarial default (bold caption flush-left, regular data justified), so only an
// explicitly aligned block - stored or set with the alignment button (§1.5) - deviates from it.
const resolveBeforeTitleBlocks = (template, context) => toArray(template?.beforeTitle).map(block => {
  const style = getParagraphStyle(block);
  return {
    align: style.align,
    bold: Boolean(style.bold),
    width: normalizeBlockWidth(style.width),
    fontSize: style.fontSize,
    uk: fillPlaceholders(localizedText(block, 'uk'), context, 'uk'),
    en: fillPlaceholders(localizedText(block, 'en'), context, 'en'),
  };
});

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
// with every placeholder already substituted from the case context. Logo/logo-long paragraphs are
// never text-substituted - they stay tagged for the renderer to draw a graphical block instead.
// The template's letterhead logo (`logo`, below) always renders before the title - see
// getTemplateLogoType. Every render re-substitutes the template against the case's current data -
// nothing generated is ever stored back onto the case or the template.
export const buildGeneratedDocument = (template, context) => {
  const logo = getTemplateLogoType(template);
  // A legacy template embeds its logo as the first paragraph instead of the dedicated `logo`
  // field; once getTemplateLogoType has picked it up for the before-the-title block, that same
  // paragraph must not also render a second time in its old body position. It's tagged
  // 'logo-consumed' (a no-op for the renderer) rather than dropped from the array, so paragraph
  // indices stay stable.
  const hasDedicatedLogoField = Boolean(String(template?.logo || '').trim());
  const languages = resolveDocLanguages(template);
  return {
    id: template.id,
    allowPageBreaks: Boolean(template.allowPageBreaks),
    logo,
    languages,
    columns: resolveDocColumns(template, languages),
    beforeTitle: resolveBeforeTitleBlocks(template, context),
    beforeTitleOffsetPercent: normalizeSignerBlockOffsetPercent(template?.beforeTitleOffsetPercent),
    // The title is an ordinary centered paragraph: its own consolidated `style` resolves here the
    // same way a body paragraph's does - sparse, undefined = inherit the document default
    // (centered, titleFontSize). A template whose title was deleted simply resolves to empty
    // strings; the renderers skip an all-blank title block entirely.
    title: {
      uk: fillPlaceholders(localizedText(template.title, 'uk'), context, 'uk'),
      en: fillPlaceholders(localizedText(template.title, 'en'), context, 'en'),
      align: getParagraphStyle(template.title).align,
      fontSize: getParagraphStyle(template.title).fontSize,
    },
    paragraphs: toArray(template.paragraphs).map((paragraph, index) => {
      const type = getParagraphType(paragraph);
      if (index === 0 && type !== 'text' && !hasDedicatedLogoField) {
        return { type: 'logo-consumed', uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      if (type !== 'text') {
        return { type, uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      // Every visual override of this paragraph comes from its one consolidated `style` key (or
      // the legacy flat fields, see getParagraphStyle) - resolved here into flat fields for the
      // renderers. An absent key means "inherit the document's own formatting" (fontSize /
      // firstLineIndentCm / default alignment).
      const style = getParagraphStyle(paragraph);
      return {
        type,
        bold: style.bold,
        align: style.align,
        indentCm: style.indentCm,
        fontSize: style.fontSize,
        uk: capitalizeFirstLetter(fillPlaceholders(localizedText(paragraph, 'uk'), context, 'uk')),
        en: capitalizeFirstLetter(fillPlaceholders(localizedText(paragraph, 'en'), context, 'en')),
      };
    }),
  };
};

// --- Case selector --------------------------------------------------------------------------

export const buildCaseLabel = (catalog, caseRecord) => {
  if (!caseRecord) return '';
  const relations = normalizeCaseRecord(caseRecord).relations || {};
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

// Which cases currently point at a given party record (Parties page delete confirmation) - deletes
// are never blocked on this, only clearly labeled; the reference is severed, the other record (the
// case) is never touched.
export const findPartyReferences = (catalog, collection, id) => {
  const targetId = String(id);
  const referencingCases = (catalog?.cases || []).filter(rawCase => {
    const caseRecord = normalizeCaseRecord(rawCase);
    const relations = caseRecord.relations || {};
    switch (collection) {
      case 'couples': return String(relations.coupleId) === targetId;
      case 'clinics': return String(relations.clinicId) === targetId;
      case 'partnerClinics': return String(relations.partnerClinicId) === targetId;
      case 'surrogateMothers': return String(relations.surrogateMotherId) === targetId;
      case 'representatives': return toArray(relations.representativeIds).some(repId => String(repId) === targetId);
      case 'maternityHospitals': return String(caseRecord.childbirth?.maternityHospitalId) === targetId;
      case 'notaries': return String(caseRecord.documents?.birthRegistrationConsent?.notaryId) === targetId;
      default: return false;
    }
  });

  return referencingCases.map(caseRecord => `case "${buildCaseLabel(catalog, caseRecord) || caseRecord.id}"`);
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
      .filter(key => key !== 'id' && key !== 'kind')
      .flatMap(key => collectContextLeafPaths(value[key], prefix ? `${prefix}.${key}` : key));
  }
  return [];
};

// One group per role (spec batch 21 §1: "split the couple into its natural roles rather than one
// combined block" - extend similarly as new party types are added, never regroup by "couple").
// Each root is a top-level key already exposed by resolveCaseContext; `predicate` (when present)
// filters the group in/out of a given context instead of picking a root - used to split the single
// `clinic` root into its two kinds (see CLINIC_KINDS) without needing two separate context keys.
export const VARIABLE_PICKER_GROUPS = [
  { label: 'Чоловік', roots: ['husband'] },
  { label: 'Дружина', roots: ['wife'] },
  { label: 'Спільне', roots: ['couple', 'surrogacyAgreement'] },
  { label: 'Сурогатна мати', roots: ['surrogateMother'] },
  { label: 'Довірена особа', roots: ['representative'] },
  { label: 'Клініка — іноземна', roots: ['clinic'], predicate: context => context?.clinic?.kind === 'foreign' },
  { label: 'Клініка — українська', roots: ['clinic'], predicate: context => context?.clinic?.kind !== 'foreign' },
  // Distinct from the `clinic` groups above: the partner clinic (parties.partnerClinics) is never
  // the case's own `clinic` record under a different kind - it's the separate foreign clinic
  // embryos ship from (spec: embryo-ownership-statement document). Shown whenever one is selected
  // on the case; a case without a partnerClinicId simply doesn't offer this group.
  { label: 'Клініка-партнер', roots: ['partnerClinic'], predicate: context => Boolean(context?.partnerClinic) },
];

// Builds the picker's grouped leaf list from a resolved case context (or any similarly-shaped
// object, e.g. an example record when no case is selected yet). A group with a predicate that
// evaluates false for this context (e.g. the clinic kind that isn't this case's clinic) is
// dropped entirely rather than shown empty.
export const buildVariablePickerGroups = context => VARIABLE_PICKER_GROUPS
  .filter(group => !group.predicate || group.predicate(context))
  .map(group => ({
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

// Defaults mirror the notarial layout standard measured from the reference statements docx:
// Times New Roman 12 pt everywhere (the title is the same size as the body), single line spacing,
// zero after-paragraph spacing (blocks are separated only by explicit empty lines), a 1.5 cm
// first-line indent on body paragraphs, and A4 with 2.0 (top) / 1.5 / 1.0 (bottom) / 1.5 cm
// margins - an 18.0 cm text width. The clinic logo stays ~5.5 cm wide, centered above the title.
export const DEFAULT_DOC_FORMATTING = {
  fontSize: 12,
  titleFontSize: 12,
  lineSpacing: 1,
  paragraphSpacing: 0,
  firstLineIndentCm: 1.5,
  marginTopCm: 2,
  marginRightCm: 1.5,
  marginBottomCm: 1,
  marginLeftCm: 1.5,
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
