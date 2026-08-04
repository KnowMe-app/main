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

export const PARTY_COLLECTIONS = ['couples', 'surrogateMothers', 'representatives', 'clinics', 'maternityHospitals', 'notaries'];

// mergeCollection derives an id prefix for un-identified incoming records by stripping a trailing
// 's' off the collection name; 'notaries' isn't a simple plural ('notarys' would be wrong), so it
// needs the explicit override.
const COLLECTION_ID_PREFIXES = { notaries: 'notary' };

export const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The Firebase RTDB client rejects `set()`/`update()` outright (a synchronous throw, before any
// network round-trip) the instant the value tree contains a bare `undefined` anywhere - and a
// handful of edit paths genuinely produce one (e.g. a formatting toggle that spreads
// `{ ...block, runs: undefined }` to clear the other shape's field instead of deleting the key).
// That single stray `undefined`, buried several levels deep in a whole-template write, used to
// surface as the same unexplained "Could not save the paragraph edits" no matter what the admin
// had actually just typed. Stripping it here, right before every write, means an edit that
// otherwise produces perfectly good content is never rejected over a bookkeeping artifact the
// admin had no way to see or work around.
export const stripUndefinedDeep = value => {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep);
  if (isPlainObject(value)) {
    const next = {};
    Object.keys(value).forEach(key => {
      if (value[key] === undefined) return;
      next[key] = stripUndefinedDeep(value[key]);
    });
    return next;
  }
  return value;
};

// Turns a raw save-path Error into a specific, actionable toast message instead of one generic
// "Could not save..." string that gave no indication of what actually failed (validation? size
// limit? network? malformed markup from a pasted link?) - named causes an admin can actually act
// on (retry, reconnect, shorten the text) instead of a dead end. `fallback` is the call site's own
// still-specific-to-the-action message, used only once none of these known failure shapes match,
// so an unclassified rejection still reads as "the alignment change" or "the paragraph edits"
// rather than being swallowed into one page-wide generic string.
export const describeDocumentSaveError = (error, fallback) => {
  const message = String(error?.message || error?.code || error || '');
  if (/contains undefined in property/i.test(message)) {
    return 'Could not save: the edit left behind an empty value the backend rejects - please retry it.';
  }
  if (/PERMISSION_DENIED/i.test(message)) {
    return 'Could not save: you do not have permission to edit this document.';
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'Could not save: you are offline - reconnect and try again.';
  }
  if (/network|fetch|timed? ?out|ECONNRESET|ENOTFOUND|disconnect/i.test(message)) {
    return 'Could not save: network error while saving - please retry.';
  }
  if (/too large|exceeds|maximum|max.{0,12}size|16777216|too big/i.test(message)) {
    return 'Could not save: this content exceeds the size limit - please shorten it.';
  }
  return fallback || 'Could not save the edit.';
};

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
    couples: [], surrogateMothers: [], representatives: [], clinics: [], maternityHospitals: [], notaries: [],
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
  // v5 stored shipment-origin clinics in a separate `partnerClinics` collection. Cases are
  // migrated to sourceClinicId on read, so bring those records into the unified v6 collection at
  // the same boundary. Current `clinics` records are applied last and therefore win on conflicts,
  // while any useful legacy-only fields are retained by the normal additive merge semantics.
  catalog.parties.clinics = mergeCollection(
    toRecordsWithIdFromKey(rawParties?.partnerClinics).filter(record => isPlainObject(record)),
    catalog.parties.clinics,
    'clinic',
    { added: 0, updated: 0 },
  );
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
  incoming.parties.clinics = mergeCollection(
    toRecordsWithIdFromKey(dataSource.partnerClinics).filter(record => isPlainObject(record)),
    incoming.parties.clinics,
    'clinic',
    { added: 0, updated: 0 },
  );
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

// One atomic RTDB multi-location update permanently folds v5 source-clinic records into the v6
// collection. Keeping this patch builder beside the catalog merge logic lets every page that reads
// the shared parties tree reuse exactly the same migration, and the null entries ensure a deleted
// clinic cannot reappear from its old path on the next load.
export const buildLegacyPartnerClinicsMigrationPatch = rawParties => {
  if (!isPlainObject(rawParties?.partnerClinics)) return {};
  const currentClinics = isPlainObject(rawParties.clinics) ? rawParties.clinics : {};
  const patch = {};
  Object.entries(rawParties.partnerClinics).forEach(([legacyKey, legacyRecord]) => {
    if (!isPlainObject(legacyRecord)) return;
    const id = String(legacyRecord.id || legacyKey);
    const currentRecord = isPlainObject(currentClinics[id]) ? currentClinics[id] : {};
    patch[`clinics/${id}`] = stripUndefinedDeep(deepMergeRecords({ ...legacyRecord, id }, currentRecord));
    patch[`partnerClinics/${legacyKey}`] = null;
  });
  return patch;
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

// Every key that only ever belongs in a runtime template context (short names, spelled-out/long
// dates) and must never reach Firebase or a JSON export (spec §1/§11/§13). Kept as one shared
// list so an export/serialization path can never drift from what the context builder actually
// treats as derived.
export const DERIVED_CONTEXT_FIELD_KEYS = [
  'short', 'shortName', 'dateWords', 'dateFormatted', 'statementDateWords', 'statementDateFormatted', 'dateDisplay', 'numberEn', 'wordsAfterArticle',
  // ART program document contexts (spec §4/§6/§12) - computed fresh from case.artProgram on every
  // resolveCaseContext call, never written back to Firebase.
  'plannedPeriodFormatted', 'receivedDateFormatted', 'certificateDateFormatted',
  'embryoCountText', 'embryoStageLabel', 'gestationalAgeText', 'pregnancyTypeText', 'issueDateOrBlank', 'outgoingNumberOrBlank',
  'oocyteSourceDisplay', 'spermSourceDisplay',
];

// Recursively strips every DERIVED_CONTEXT_FIELD_KEYS key out of a value before it's serialized
// for export (spec §11: "Перед серіалізацією рекурсивно виключати похідні runtime-поля"). Source
// data (catalog.cases/parties/documents straight from Firebase) never carries these keys in the
// first place - this is a defensive final pass for whatever actually gets serialized, so an
// export path can never accidentally leak an enrichment copy's derived fields even if one was
// passed in by mistake. Never mutates its input.
export const stripDerivedFields = value => {
  if (Array.isArray(value)) return value.map(stripDerivedFields);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !DERIVED_CONTEXT_FIELD_KEYS.includes(key))
        .map(([key, child]) => [key, stripDerivedFields(child)]),
    );
  }
  return value;
};

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

// --- Shared date-context builder (spec 2026-07-24 follow-up §4/§12) --------------------------
// One generic pair of "date in words" / "date, long form" formatters, reused by every document
// that needs a spelled-out signature date (surrogacyAgreement.dateWords,
// maritalStatusDeclaration.statementDateWords/.statementDateFormatted, and - via
// withDerivedDateFields below - birthRegistration.statementDateWords) instead of one bespoke
// formatter per document. `formatDateWordsUk` is the same generic Ukrainian day/month/year ->
// words converter as formatUkrainianDateWords (kept as a separate export only for symmetry with
// its English counterpart's name).
export const formatDateWordsUk = formatUkrainianDateWords;

// English number (0-9999) in plain cardinal words - "two thousand twenty-five" for 2025, not the
// colloquial paired-year reading ("twenty twenty-five") - a real generic number-to-words
// converter, not a lookup table for one date.
const EN_ONES_CARDINAL = {
  1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
};
const EN_TEENS_CARDINAL = {
  10: 'ten', 11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen', 15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen', 19: 'nineteen',
};
const EN_TENS_CARDINAL = {
  2: 'twenty', 3: 'thirty', 4: 'forty', 5: 'fifty', 6: 'sixty', 7: 'seventy', 8: 'eighty', 9: 'ninety',
};

const threeDigitToEnglishCardinalWords = n => {
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const parts = [];
  if (hundreds) parts.push(`${EN_ONES_CARDINAL[hundreds]} hundred`);
  if (remainder) {
    if (remainder < 10) parts.push(EN_ONES_CARDINAL[remainder]);
    else if (remainder < 20) parts.push(EN_TEENS_CARDINAL[remainder]);
    else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones ? `${EN_TENS_CARDINAL[tens]}-${EN_ONES_CARDINAL[ones]}` : EN_TENS_CARDINAL[tens]);
    }
  }
  return parts.join(' ');
};

const yearToEnglishCardinalWords = year => {
  const thousands = Math.floor(year / 1000);
  const remainder = year % 1000;
  const parts = [];
  if (thousands) parts.push(`${EN_ONES_CARDINAL[thousands]} thousand`);
  if (remainder) parts.push(threeDigitToEnglishCardinalWords(remainder));
  return parts.join(' ');
};

const capitalizeWord = word => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : word);

// A spelled-out English date used by legal statements (e.g. "Fifth of September two thousand
// twenty-five") - distinct from formatEnglishDateWords (used by the RATS birth-registration
// statement, "eighteenth of May, 2026", kept unchanged for backward compatibility).
export const formatDateWordsEn = value => {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = String(value).trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${capitalizeWord(EN_DAY_ORDINALS[day])} of ${EN_MONTHS[month]} ${yearToEnglishCardinalWords(year)}`;
};

// "DD MMMM YYYY року" / "DD Month YYYY" - the long (numeric day, spelled-out month) date form
// legal statements show alongside the fully spelled-out one (spec: maritalStatusDeclaration /
// surrogacyAgreement dates).
export const formatDateLongUk = value => {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = String(value).trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(day).padStart(2, '0')} ${UK_MONTHS_GENITIVE[month]} ${year} року`;
};

export const formatDateLongEn = value => {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = String(value).trim().split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${String(day).padStart(2, '0')} ${EN_MONTHS[month]} ${year}`;
};

// Shared date-context builder (spec §4/§12: "винести у спільний date-context builder... не
// дублювати логіку окремо для кожного документа"): augments a case document sub-record (e.g.
// `case.documents.surrogacyAgreement`) with its derived spelled-out/long date fields, computed
// from one caller-named ISO date field - never mutates the source, never persisted back to
// Firebase (see buildGeneratedDocument/resolveCaseContext - the result only ever lives in the
// in-memory template context). `wordsUk`/`wordsEn` are overridable so a pre-existing document
// (birthRegistration) can keep its own already-shipped English wording while every new document
// gets the shared default.
// `longUk`/`longEn` default to the spelled-out-month long form (formatDateLongUk/En, e.g. "05
// вересня 2025 року") - overridable so a document that instead wants the plain numeric DD.MM.YYYY
// form (surrogacyAgreement/surrogacyAgreementAppendix1's `dateFormatted`, spec §5: "від
// {{surrogacyAgreement.dateFormatted.uk}} р.") can pass formatDocumentDate instead.
const withDerivedDateFields = (raw, {
  dateField, wordsKey, longKey, wordsUk = formatDateWordsUk, wordsEn = formatDateWordsEn, longUk = formatDateLongUk, longEn = formatDateLongEn,
}) => {
  const source = isPlainObject(raw) ? raw : {};
  const value = source[dateField] ?? '';
  const next = { ...source };
  if (wordsKey) next[wordsKey] = { uk: wordsUk(value), en: wordsEn(value) };
  if (longKey) next[longKey] = { uk: longUk(value), en: longEn(value) };
  return next;
};

// --- Short names + runtime name enrichment (spec §5/§13) --------------------------------------
// A person's short display name ("Алексашина Ю.Б." / "L.V. Davyd") is always computed from the
// full name at template-context build time, never stored - the JSON only ever carries the full
// name (`name.uk.nominative`, `name.en.full`). Whitespace-tolerant, never throws: a missing or
// malformed name simply resolves to ''.
export const formatShortNameUk = fullName => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return '';
  const [surname, ...rest] = parts;
  const initials = rest.map(part => `${part[0].toUpperCase()}.`).join('');
  return `${surname} ${initials}`;
};

// English short form reverses the order (initials first): the source full name still carries the
// surname first ("Davyd Liliia Volodymyrivna"), same as the Ukrainian nominative - only the
// rendered short form's word order differs ("L.V. Davyd").
export const formatShortNameEn = fullName => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return '';
  const [surname, ...rest] = parts;
  const initials = rest.map(part => `${part[0].toUpperCase()}.`).join('');
  return `${initials} ${surname}`;
};

// Adds a `short` field alongside whatever a person's `name` node already carries - `uk.short`
// whenever `uk.nominative` is a real string, `en.short` only when `en` is itself an object
// carrying `.full` (spec §5: a `name.en` stored as a plain string, e.g. the notary/wife/husband
// shape `{ en: "Aleksashyna..." }`, is never restructured into an object - templates already read
// it directly as `{{notary.name.en}}`). Never mutates the source object.
export const enrichNameWithDerivedFields = name => {
  if (!isPlainObject(name)) return name;
  const result = { ...name };
  const ukNominative = name.uk?.nominative;
  if (isPlainObject(name.uk) && ukNominative) {
    result.uk = { ...name.uk, short: formatShortNameUk(ukNominative) };
  }
  const enFull = typeof name.en?.full === 'string' ? name.en.full : null;
  if (isPlainObject(name.en) && enFull) {
    result.en = { ...name.en, short: formatShortNameEn(enFull) };
  }
  return result;
};

// Same enrichment, applied to a whole person/party record's `name` field - used for every
// name-carrying context entity (wife/husband/surrogateMother/representative/notary, and the
// clinic's medicalDirector) so `{{x.name.uk.short}}`/`{{x.name.en.short}}` always resolve without
// a stored `short` field ever existing in Firebase. Null-safe: a record with no `name` (or no
// record at all) passes through unchanged.
const enrichPersonName = person => {
  if (!isPlainObject(person) || !person.name) return person;
  return { ...person, name: enrichNameWithDerivedFields(person.name) };
};

// The maternity hospital's display name used to read a stored `shortName` field (spec §6: no
// longer created or persisted) - this is the safe replacement: the full bilingual name, uk
// preferred, falling back to en, never an automatic legal-name abbreviation (that algorithm is
// for personal names, not organizations). `name.uk`/`name.en` can be stored either as a plain
// string (createEmptyMaternityHospital's shape) or as a `{nominative, genitive, ...}` object (the
// same grammatical-forms shape every other party's name uses) - never assume one over the other,
// or a real record on the shape this function doesn't expect renders a raw object as a React
// child (a hard crash, not just a blank field) wherever this string is displayed.
export const getMaternityHospitalDisplayName = maternityHospital => {
  const { uk, en } = maternityHospital?.name || {};
  if (typeof uk === 'string' && uk) return uk;
  if (isPlainObject(uk) && (uk.nominative || uk.short)) return uk.nominative || uk.short;
  if (typeof en === 'string' && en) return en;
  if (isPlainObject(en) && (en.full || en.short)) return en.full || en.short;
  return '';
};

// Collapsed-row/card display text for a party record - shared between PartiesPage's own directory
// rows and any other surface that needs the same "what do we call this record" logic (batch 28's
// case-editor relation cards, in particular), so the two never drift apart.
export const nameFormOf = value => {
  if (isPlainObject(value)) {
    if (typeof value.uk === 'string' && value.uk) return value.uk;
    if (isPlainObject(value.uk)) return value.uk.nominative || value.uk.short || '';
    if (typeof value.en === 'string' && value.en) return value.en;
    if (isPlainObject(value.en)) return value.en.full || value.en.short || '';
    return '';
  }
  return value || '';
};

export const partyDisplayName = record => nameFormOf(record?.name) || record?.id;
export const maternityDisplayName = record => getMaternityHospitalDisplayName(record) || record?.id;
export const coupleDisplayName = record => {
  const names = toArray(record?.partners).map(partner => nameFormOf(partner?.name)).filter(Boolean);
  return names.length ? names.join(' & ') : record?.id;
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
  // `type`/`countryCode` (e.g. genetic-affinity-certificate's "паспорт: тип: ..., Код країни: ...")
  // sit alongside the existing number/issuedBy/issueDate fields - optional, blank by default, never
  // required by any other template that only ever read `passport.number`.
  passport: {
    type: '', countryCode: '', number: '', issuedBy: { uk: '', en: '' }, issueDate: '',
  },
});

export const createEmptyCouple = () => ({
  id: makeRecordId('couple'),
  partners: [createEmptyPartner({ role: 'wife' }), createEmptyPartner({ role: 'husband' })],
  // `date` (the marriage itself) is distinct from `certificateDate` (when the certificate was
  // issued) - enrichCoupleMarriage above already reads both separately. `certificateType`/
  // `certificateIssuedBy` are the newer bilingual fields that comment already anticipated; blank by
  // default so older couples keep working unchanged until an admin fills them in.
  marriage: {
    date: '',
    certificateType: { uk: '', en: '' },
    certificateNumber: '',
    certificateIssuedBy: { uk: '', en: '' },
    certificateDate: '',
  },
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

// Batch 33: a representative is a person, full stop - power of attorney (date + apostille date)
// is a fact of the *case* that engages them (relations.representativePowerOfAttorney on the case,
// edited in CaseEditor), never stored here. Without that split, a new POA meant a whole new
// duplicate person record (same name, different dates), which is exactly what filled the picker
// with lookalike entries. resolveCaseContext/buildDraftFromCase still read a legacy
// `record.powerOfAttorney` off pre-migration records as a fallback - see the migration script
// (scripts/migrateRepresentativePowerOfAttorney.js) that moves that data onto cases and dedupes
// the person records.
export const createEmptyRepresentative = () => ({
  id: makeRecordId('representative'),
  name: { uk: { nominative: '', genitive: '' }, en: '' },
  // Needed by the surrogacy-agreement template (`{{representative.birthDate}}`,
  // `{{representative.address.uk}}`) - a representative acting as attorney-in-fact is named
  // there by birth date and registered address, same as any other signatory.
  birthDate: '',
  address: { uk: '', en: '' },
  passport: {
    number: '', issuedBy: { uk: '', en: '' }, issueDate: '',
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
  // `name.uk`/`legalName.uk`/`medicalCenterName.uk` carry their grammatical forms directly as
  // siblings of `nominative` (`{{clinic.name.uk.accusative}}`, `{{clinic.name.uk.nominative}}` -
  // real templates read these paths straight off the clinic, never through a separate
  // nameLocative-style field) - genitive/accusative are optional, blank until an admin fills them
  // in, never required by a template that only ever reads `.nominative`.
  name: { uk: { nominative: '', genitive: '', accusative: '' }, en: '' },
  // v6 (spec §1): every clinic - Ukrainian or foreign - lives in this one collection now, so
  // `country` (blank/optional, like every other field here) is part of the shared shape rather
  // than a separate simplified partner-clinic record. A foreign clinic (e.g. the shipment's own
  // sourceClinic) typically only ever fills in name/country/address - never required to also carry
  // legalName/edrpou/bank/license/medicalDirector below.
  country: { code: '', uk: { nominative: '', genitive: '' }, en: '' },
  legalName: { uk: { nominative: '' }, en: '' },
  medicalCenterName: { uk: { nominative: '' }, en: '' },
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
    // `uk.short`/`en.short` are never stored (spec §5/§13) - computed at template-context build
    // time by enrichNameWithDerivedFields, from `uk.nominative`/`en.full` below.
    name: { uk: { nominative: '', genitive: '' }, en: { full: '' } },
    authority: { type: { uk: '', en: '' }, number: '', date: '' },
  },
});

// `shortName` is never stored (spec §6) - use getMaternityHospitalDisplayName wherever the UI
// used to read `maternityHospital.shortName.uk`. `name.uk` carries its nominative form as an
// object sibling (`{{maternityHospital.name.uk}}` resolves it via the generic nominative fallback
// in fillPlaceholders), same shape every other party's name uses - never a plain string.
export const createEmptyMaternityHospital = () => ({
  id: makeRecordId('maternity-hospital'),
  name: { uk: { nominative: '' }, en: '' },
  edrpou: '',
  address: { uk: '', en: '' },
});

// `uk.short`/`en.short` are never stored (spec §5/§13) - computed at template-context build time
// by enrichNameWithDerivedFields. `uk.instrumental` (a one-off grammatical case for a single past
// document) is exactly the kind of workaround field spec §13 forbids adding.
export const createEmptyNotary = () => ({
  id: makeRecordId('notary'),
  name: {
    uk: { nominative: '', genitive: '' },
    en: { full: '' },
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

// --- v6 migration (spec §1-§9: unified `parties.clinics`, single relations.clinicId/
// embryoShipment.sourceClinicId, artProgram.ivf.date, flat geneticMaterial.oocyte/sperm) ---------
// The one migration boundary: every legacy shape this app has ever stored a case under is read
// here, exactly once per load, and nowhere else - resolveShipment/resolveTransferAttempt/etc. only
// ever read the canonical v6 paths. Pure and idempotent: migrating an already-v6 case changes
// nothing (verified by tests), so running it again on the same data is always safe.

export const CURRENT_SCHEMA_VERSION = 6;

const omitKeys = (value, keys) => {
  if (!isPlainObject(value)) return value;
  const next = { ...value };
  keys.forEach(key => { delete next[key]; });
  return next;
};

// Fields that only ever belonged in a runtime template context, or a tri-state boolean the v5+
// model replaces with "the object exists" (spec §1.5/§1.9) - stripped from whatever storage shape
// migrateCaseToV6 finds them in, never manufactured if absent.
const LEGACY_STORED_FIELD_KEYS = ['positive', 'pregnancyConfirmed', 'confirmedPregnancy', 'short', 'shortName', 'initials', 'dateWords', 'dateFormatted'];

const stripLegacyStoredFields = value => omitKeys(value, LEGACY_STORED_FIELD_KEYS);

export const emptyMigrationReport = () => ({
  changed: false,
  missingRelations: [],
  brokenReferences: [],
  ambiguities: [],
  unmigratable: [],
});

// A shipment's plannedPeriod carries either the v6 start/end pair or the old startDate/endDate
// pair (never both) - the migrated text-only shape (spec §6 fallback) passes through unchanged.
const migratePlannedPeriod = period => {
  if (!isPlainObject(period)) return { period: undefined, changed: false };
  if (period.start !== undefined || period.end !== undefined) {
    return { period: omitKeys(period, ['startDate', 'endDate']), changed: false };
  }
  if (period.startDate !== undefined || period.endDate !== undefined) {
    return { period: { ...omitKeys(period, ['startDate', 'endDate']), start: period.startDate, end: period.endDate }, changed: true };
  }
  return { period, changed: false };
};

// A shipment's own clinic-of-origin (spec §3/§4): v6 keeps `sourceClinicId` directly on the
// shipment (never resolved from a `relations.partnerClinicId`/separate `parties.partnerClinics`
// collection any more) - `ivfDate` (spec §5) and `sentDate` (spec §7, dropped entirely) never
// belong here either. `legacySourceClinicId` is the case's own now-retired
// `relations.partnerClinicId`, read once by the caller and passed in only as a fallback for a
// shipment that doesn't already carry its own sourceClinicId.
const migrateShipmentToV6 = (shipment, legacySourceClinicId, report) => {
  const next = stripLegacyStoredFields(omitKeys(shipment, ['id', 'destinationClinicId', 'ivfDate', 'sentDate', 'plannedPeriod']));
  if (shipment.destinationClinicId !== undefined || shipment.sentDate !== undefined) report.changed = true;

  const { period, changed: periodChanged } = migratePlannedPeriod(shipment.plannedPeriod);
  if (period !== undefined) next.plannedPeriod = period;
  if (periodChanged) report.changed = true;

  if (!next.sourceClinicId && legacySourceClinicId) {
    next.sourceClinicId = legacySourceClinicId;
    report.changed = true;
  }

  return next;
};

// Picks the case's one embryo shipment out of every shape this codebase has ever stored it under -
// the current one (case.artProgram.embryoShipment), the previous one (case.relations.shipment,
// batch 26 §5), or the oldest id-map shape (case.artProgram.embryoShipments, addressed by a
// shipmentId on the transfer attempt or on embryoOwnershipStatement) - and recovers the case's
// clinic relations from an old inline shipment's own destinationClinicId, or the case's own
// (now-retired) relations.partnerClinicId, when the shipment doesn't already carry its own
// sourceClinicId (spec §4.1). Never merges two different shipments: several candidates with no
// way to prefer one is reported as an ambiguity, not guessed.
const migrateEmbryoShipment = (rawCase, report) => {
  const artProgram = isPlainObject(rawCase.artProgram) ? rawCase.artProgram : {};
  const legacySourceClinicId = rawCase.relations?.partnerClinicId;

  if (isPlainObject(artProgram.embryoShipment)) {
    const shipment = artProgram.embryoShipment;
    return {
      shipment: migrateShipmentToV6(shipment, legacySourceClinicId, report),
      ivfDate: shipment.ivfDate,
      relationsPatch: {},
    };
  }

  const inline = isPlainObject(rawCase.relations?.shipment) ? rawCase.relations.shipment : null;
  const legacyMap = isPlainObject(artProgram.embryoShipments) ? artProgram.embryoShipments : null;
  const legacyShipmentId = artProgram.transferAttempt?.shipmentId || rawCase.documents?.embryoOwnershipStatement?.shipmentId;

  let candidate = null;
  if (inline) {
    candidate = inline;
  } else if (legacyMap) {
    const entries = Object.entries(legacyMap);
    if (legacyShipmentId && legacyMap[legacyShipmentId]) candidate = legacyMap[legacyShipmentId];
    else if (entries.length === 1) [, candidate] = entries[0];
    else if (entries.length > 1) {
      report.ambiguities.push('artProgram.embryoShipments: multiple shipments with no shipmentId reference to disambiguate - none migrated, needs manual repair.');
      return { shipment: null, ivfDate: undefined, relationsPatch: {} };
    }
  }
  if (!candidate) return { shipment: null, ivfDate: undefined, relationsPatch: {} };

  const relationsPatch = {};
  if (candidate.destinationClinicId && !rawCase.relations?.clinicId && !rawCase.relations?.ukrainianClinicId) {
    relationsPatch.clinicId = candidate.destinationClinicId;
  }

  report.changed = true;
  return {
    shipment: migrateShipmentToV6(candidate, candidate.sourceClinicId || legacySourceClinicId, report),
    ivfDate: candidate.ivfDate,
    relationsPatch,
  };
};

// Migrates the transfer attempt's hCG tests/ultrasounds from the old id-keyed map shape to the v5
// singleton (spec §4.3): the one referenced by the genetic-affinity certificate's (or, for the
// ultrasound, also the RACSS clinic letter's) old id if present, otherwise the map's only entry,
// otherwise - with several entries and no id to choose by - report an ambiguity and migrate none of
// them rather than guessing.
const migrateTransferAttempt = (rawCase, report) => {
  const artProgram = isPlainObject(rawCase.artProgram) ? rawCase.artProgram : {};
  const transferAttempt = isPlainObject(artProgram.transferAttempt) ? artProgram.transferAttempt : null;
  if (!transferAttempt) return null;

  const documents = isPlainObject(rawCase.documents) ? rawCase.documents : {};
  const certificate = isPlainObject(documents.geneticAffinityCertificate) ? documents.geneticAffinityCertificate : {};
  const letter = isPlainObject(documents.racssClinicLetter) ? documents.racssClinicLetter : {};

  const pickSingleton = (already, map, referencedId, label) => {
    if (isPlainObject(already)) return already;
    if (!isPlainObject(map)) return null;
    const entries = Object.entries(map);
    if (referencedId && map[referencedId]) {
      report.changed = true;
      return map[referencedId];
    }
    if (entries.length === 1) {
      report.changed = true;
      return entries[0][1];
    }
    if (entries.length > 1) {
      report.ambiguities.push(`artProgram.transferAttempt.${label}: multiple entries with no id reference to disambiguate - none migrated, needs manual repair.`);
    }
    return null;
  };

  const hcgTest = pickSingleton(transferAttempt.hcgTest, transferAttempt.hcgTests, certificate.hcgTestId, 'hcgTests');
  const ultrasound = pickSingleton(transferAttempt.ultrasound, transferAttempt.ultrasounds, certificate.ultrasoundId || letter.ultrasoundId, 'ultrasounds');

  const migrated = stripLegacyStoredFields(omitKeys(transferAttempt, ['id', 'shipmentId', 'hcgTests', 'ultrasounds', 'hcgTest', 'ultrasound']));
  if (hcgTest) migrated.hcgTest = stripLegacyStoredFields(omitKeys(hcgTest, ['id']));
  if (ultrasound) migrated.ultrasound = stripLegacyStoredFields(omitKeys(ultrasound, ['id']));
  return migrated;
};

// Migrates diagnosis/genetic-material-source fields (spec §4.4/§6): the old `medicalIndication.
// diagnosis` wrapper, and every genetic-material-source shape this app has stored - the ancient
// `geneticMaterial.oocyteSourcePartnerRole`/`spermSourcePartnerRole`, and the v5 scalar
// `artProgram.oocyteSource`/`spermSource` - both mapped straight to the flat v6
// `geneticMaterial.oocyte`/`geneticMaterial.sperm` scalars (never a nested `{ source }` wrapper).
// A legacy 'donor' selection with no code ever recorded anywhere (the old UI never had a
// donor-code input) can't be safely turned into the scalar donor code the field is supposed to
// hold - reported as unmigratable instead of guessed/invented.
const migrateMedicalData = (rawCase, report) => {
  const artProgram = isPlainObject(rawCase.artProgram) ? rawCase.artProgram : {};
  const result = {};

  if (isPlainObject(artProgram.medicalIndications)) {
    result.medicalIndications = artProgram.medicalIndications;
  } else if (isPlainObject(artProgram.medicalIndication?.diagnosis)) {
    result.medicalIndications = artProgram.medicalIndication.diagnosis;
    report.changed = true;
  }

  const legacyGeneticMaterial = isPlainObject(artProgram.geneticMaterial) ? artProgram.geneticMaterial : null;
  const migrateSource = (already, legacyValue, legacyRole, label) => {
    if (already !== undefined) return already;
    if (legacyValue !== undefined) {
      report.changed = true;
      return legacyValue;
    }
    if (!legacyRole) return undefined;
    if (legacyRole === 'donor') {
      report.unmigratable.push(`artProgram.geneticMaterial.${label}: was set to a donor with no donor code recorded - re-enter the donor code directly.`);
      return undefined;
    }
    report.changed = true;
    return legacyRole;
  };
  const oocyte = migrateSource(legacyGeneticMaterial?.oocyte, artProgram.oocyteSource, legacyGeneticMaterial?.oocyteSourcePartnerRole, 'oocyteSourcePartnerRole');
  const sperm = migrateSource(legacyGeneticMaterial?.sperm, artProgram.spermSource, legacyGeneticMaterial?.spermSourcePartnerRole, 'spermSourcePartnerRole');
  if (oocyte !== undefined || sperm !== undefined) {
    result.geneticMaterial = {};
    if (oocyte !== undefined) result.geneticMaterial.oocyte = oocyte;
    if (sperm !== undefined) result.geneticMaterial.sperm = sperm;
  }

  if (isPlainObject(artProgram.medicalTeam)) result.medicalTeam = artProgram.medicalTeam;

  return result;
};

// One case record, migrated to the v6 shape (spec §1-§9) - idempotent (re-running on an
// already-v6 case returns `report.changed: false` and the same data), never guesses missing/
// ambiguous data (reports it instead, spec §4.7). The ancient pre-v5 `relations.clinicId` already
// meant exactly what v6's `relations.clinicId` means again (v5 was the one detour that renamed it
// to `ukrainianClinicId` to make room for a separate `partnerClinicId`) - so it's left untouched
// here, and only the v5 name gets renamed back.
export const migrateCaseToV6 = rawCase => {
  const report = emptyMigrationReport();
  if (!isPlainObject(rawCase)) return { case: {}, report };

  const relations = isPlainObject(rawCase.relations) ? { ...rawCase.relations } : {};
  if (relations.ukrainianClinicId && !relations.clinicId) {
    relations.clinicId = relations.ukrainianClinicId;
    report.changed = true;
  }
  if (relations.ukrainianClinicId !== undefined) { delete relations.ukrainianClinicId; report.changed = true; }
  if (relations.partnerClinicId !== undefined) { delete relations.partnerClinicId; report.changed = true; }
  delete relations.shipment;

  const { shipment, ivfDate, relationsPatch } = migrateEmbryoShipment(rawCase, report);
  Object.entries(relationsPatch).forEach(([key, value]) => { relations[key] = value; });

  if (!relations.clinicId) report.missingRelations.push('relations.clinicId');
  if (!relations.coupleId) report.missingRelations.push('relations.coupleId');
  if (!relations.surrogateMotherId) report.missingRelations.push('relations.surrogateMotherId');

  const medical = migrateMedicalData(rawCase, report);
  const transferAttempt = migrateTransferAttempt(rawCase, report);

  const rawArtProgram = isPlainObject(rawCase.artProgram) ? rawCase.artProgram : {};
  let ivf;
  if (isPlainObject(rawArtProgram.ivf) && rawArtProgram.ivf.date !== undefined) {
    ivf = rawArtProgram.ivf;
  } else if (ivfDate !== undefined) {
    ivf = { date: ivfDate };
    report.changed = true;
  }

  const artProgram = {
    ...medical,
    ...(transferAttempt ? { transferAttempt } : {}),
    // A shipment whose only stored content was ivfDate (now split out to artProgram.ivf above)
    // migrates to an empty object - never persisted as `embryoShipment: {}`.
    ...(shipment && Object.keys(shipment).length ? { embryoShipment: shipment } : {}),
    ...(ivf ? { ivf } : {}),
  };

  const documents = isPlainObject(rawCase.documents) ? { ...rawCase.documents } : {};
  ['geneticAffinityCertificate', 'racssClinicLetter', 'embryoOwnershipStatement'].forEach(key => {
    if (!isPlainObject(documents[key])) return;
    const before = documents[key];
    const after = stripLegacyStoredFields(omitKeys(before, ['hcgTestId', 'ultrasoundId', 'shipmentId']));
    if (Object.keys(before).length !== Object.keys(after).length) report.changed = true;
    documents[key] = after;
  });

  const migratedCase = { ...rawCase, relations, documents };
  if (Object.keys(artProgram).length) migratedCase.artProgram = artProgram;
  else delete migratedCase.artProgram;

  return { case: migratedCase, report };
};

// Runs migrateCaseToV6 across every case in a raw `cases` snapshot and aggregates the per-case
// reports into the one migration report spec §4.7 wants - migratedCaseIds (any case that actually
// changed shape), and missingRelations/ambiguities/unmigratable keyed by case id so nothing is lost
// even when several cases have issues.
export const migrateCasesToV6 = rawCases => {
  const records = toRecordsWithIdFromKey(rawCases).filter(isPlainObject);
  const cases = [];
  const report = {
    migratedCaseIds: [], missingRelations: {}, ambiguities: {}, unmigratable: {},
  };
  records.forEach(rawCase => {
    const { case: migratedCase, report: caseReport } = migrateCaseToV6(rawCase);
    cases.push(migratedCase);
    const caseId = migratedCase.id ?? rawCase.id;
    if (caseReport.changed) report.migratedCaseIds.push(caseId);
    if (caseReport.missingRelations.length) report.missingRelations[caseId] = caseReport.missingRelations;
    if (caseReport.ambiguities.length) report.ambiguities[caseId] = caseReport.ambiguities;
    if (caseReport.unmigratable.length) report.unmigratable[caseId] = caseReport.unmigratable;
  });
  return { cases, report };
};

// spec §2.2: validates the loaded settings record's schema marker. This app's Documents Builder
// storage is 4 sibling RTDB paths (parties/cases/templates/settings), not one combined root object,
// so the marker lives on `documentsBuilder/settings.schemaVersion` - the one path every load already
// reads (see normalizeDocumentsSettings, which always stamps the current version going forward).
// `cases` migrate unconditionally and idempotently regardless of this marker (migrateCaseToV6 above
// is cheap and safe to re-run) - this validator is for a caller that wants to tell a pre-v6 record
// apart from one already on the current schema (e.g. to warn an admin migration hasn't run yet).
export const isDocumentsSchemaV6 = rawSettings => isPlainObject(rawSettings) && rawSettings.schemaVersion === CURRENT_SCHEMA_VERSION;

// Every case record passes through the migration boundary above exactly once, here - nothing
// downstream (resolveShipment, resolveCaseContext, the case editors) ever branches on a legacy
// shape again. Re-normalizing an already-v6 case changes nothing (migrateCaseToV6 is idempotent).
export const normalizeCaseRecord = rawCase => (isPlainObject(rawCase) ? migrateCaseToV6(rawCase).case : {});

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

// One row per case-document sub-record that carries a derived spelled-out/long-form date - the
// single source of truth for which ISO field on `case.documents.<key>` drives its derived
// words/long-form fields and what those derived fields are called, so a new such document is one
// table row instead of a new hand-written withDerivedDateFields call (spec: "логічно винести поля
// нотаріус, дата"). `contextKey` is the property name it's exposed under on the resolved context -
// every entry's matches its storage key except `birthRegistrationConsent`, exposed as
// `birthRegistration` for historical reasons (that name predates this table). `wordsEn` is
// overridable so a pre-existing document can keep its own already-shipped English wording
// (birthRegistration's formatEnglishDateWords, "eighteenth of May, 2026") while every new document
// gets the shared default (formatDateWordsEn).
const DOCUMENT_DATE_CONFIG = {
  birthRegistrationConsent: {
    contextKey: 'birthRegistration', dateField: 'statementDate', wordsKey: 'statementDateWords', wordsEn: formatEnglishDateWords,
  },
  // `dateFormatted` here is the plain numeric DD.MM.YYYY form (formatDocumentDate), not the
  // spelled-out-month long form maritalStatusDeclaration/legalServicesDisclaimer use for their
  // `statementDateFormatted` - spec §5: "від {{surrogacyAgreement.dateFormatted.uk}} р." expects
  // "05.09.2025", not "05 вересня 2025 року". Wrapped in an arrow so the reference to
  // formatDocumentDate (defined further down this file) is only resolved at call time, not at this
  // object's construction time.
  surrogacyAgreement: {
    contextKey: 'surrogacyAgreement',
    dateField: 'date',
    wordsKey: 'dateWords',
    longKey: 'dateFormatted',
    longUk: value => formatDocumentDate(value),
    longEn: value => formatDocumentDate(value),
  },
  maritalStatusDeclaration: {
    contextKey: 'maritalStatusDeclaration', dateField: 'statementDate', wordsKey: 'statementDateWords', longKey: 'statementDateFormatted',
  },
  legalServicesDisclaimer: {
    contextKey: 'legalServicesDisclaimer', dateField: 'statementDate', wordsKey: 'statementDateWords', longKey: 'statementDateFormatted',
  },
  surrogacyAgreementAppendix1: {
    contextKey: 'surrogacyAgreementAppendix1',
    dateField: 'date',
    wordsKey: 'dateWords',
    longKey: 'dateFormatted',
    longUk: value => formatDocumentDate(value),
    longEn: value => formatDocumentDate(value),
  },
};

// Which case-document sub-record supplies the notary for a given template (spec §8): a case can
// use a different notary for each document it produces (each of the documents below carries its
// own `notaryId`), so there is no single case-wide "the" notary. `usesNotary: false` means the
// template never resolves a notary from its own document data at all (surrogacy-program-rules has
// no document data of its own; surrogacy-agreement-appendix-1 isn't itself notarized - it's an
// unnotarized addendum to the already-notarized surrogacy agreement). Exported so other call sites
// (validators, tests) share the same map instead of re-deriving it.
export const TEMPLATE_DOCUMENT_CONFIG = {
  'birth-registration-surrogate-consent': { documentKey: 'birthRegistrationConsent', usesNotary: true },
  'surrogate-unmarried-declaration': { documentKey: 'maritalStatusDeclaration', usesNotary: true },
  'surrogacy-agreement': { documentKey: 'surrogacyAgreement', usesNotary: true },
  'surrogacy-program-rules': { documentKey: null, usesNotary: false },
  'legal-services-disclaimer-statement': { documentKey: 'legalServicesDisclaimer', usesNotary: true },
  'surrogacy-agreement-appendix-1': { documentKey: 'surrogacyAgreementAppendix1', usesNotary: false },
};

// The `documentKey`/`usesNotary` resolveCaseContext falls back to when `templateId` is omitted -
// every pre-existing call site that only ever needed the birth-registration statement's notary,
// so nothing that already calls resolveCaseContext without a templateId changes behavior.
const DEFAULT_NOTARY_TEMPLATE_CONFIG = { documentKey: 'birthRegistrationConsent', usesNotary: true };

// --- ART program (case.artProgram) - resolvers, formatters, document contexts ----------------
// v6 (spec §1-§7): the medical facts of a case's fertility program live once at `case.artProgram`
// - `medicalIndications`, flat `geneticMaterial.oocyte`/`geneticMaterial.sperm`, the standalone
// `ivf.date`, the one embryo shipment (`artProgram.embryoShipment`, carrying its own
// `sourceClinicId`), and the one relevant transfer attempt (`artProgram.transferAttempt`, itself
// carrying at most one nested `hcgTest`/`ultrasound`). None of these carry an id, live in an
// array, or are keyed by id in a map - a case has at most one of each, full stop. Every document
// that references one of these events (embryoOwnershipStatement, geneticAffinityCertificate,
// racssClinicLetter) resolves the case's singleton directly - there is nothing left to select by
// id, so editing an event once (e.g. the transfer date) is instantly reflected in every document
// that references it, since none of them ever copy the fact.
//
// Legacy shapes (relations.shipment, artProgram.embryoShipments/hcgTests/ultrasounds id-maps,
// artProgram.geneticMaterial.*PartnerRole, artProgram.medicalIndication.diagnosis, the v5 scalar
// oocyteSource/spermSource, relations.ukrainianClinicId/partnerClinicId, and any
// hcgTestId/ultrasoundId/shipmentId document pointer) are read exactly once, at the single
// migration boundary (migrateCaseToV6, called from normalizeCaseRecord on every load) - nothing
// below this point ever branches on an old shape again.

export const resolveShipment = caseData => caseData?.artProgram?.embryoShipment ?? null;

export const resolveTransferAttempt = caseData => caseData?.artProgram?.transferAttempt ?? null;

// Singleton - existence alone means "the case's one shipment's one relevant test/scan" (spec §1.5),
// nothing left to pick by id.
export const resolveHcgTest = transferAttempt => transferAttempt?.hcgTest ?? null;

export const resolveUltrasound = transferAttempt => transferAttempt?.ultrasound ?? null;

// Reserved genetic-material scalar values (spec §1.7/§6) - anything else non-empty is a donor
// code, displayed as itself. `geneticMaterial.oocyte`/`geneticMaterial.sperm` are read as plain
// raw values (spec §6) - never auto-resolved to a name/label here; the genetic-affinity
// certificate leaves those fields blank for manual entry.
export const GENETIC_SOURCE_ROLE_VALUES = ['wife', 'husband'];
export const isGeneticSourceDonorCode = value => Boolean(value) && !GENETIC_SOURCE_ROLE_VALUES.includes(value);

// A name's declined grammatical form (genitive "з клініки «Оті Юме»", accusative "у клініку
// «Вікторія»") lives directly on `name.uk` as a sibling of `nominative` (spec: the same
// {nominative, genitive, accusative} shape every party's name uses) - falls back to the plain
// nominative form when the admin hasn't filled the declined variant in yet, and to '' (never a
// leaked object) when `name.uk` is still a plain, not-yet-migrated string.
const withDeclinedNameFallback = (record, grammaticalCase) => {
  if (!record) return record;
  const nameUk = record?.name?.uk;
  const nameEn = record?.name?.en;
  const declinedUk = isPlainObject(nameUk) ? (nameUk[grammaticalCase] || nameUk.nominative || '') : (nameUk || '');
  const declinedEn = isPlainObject(nameEn) ? (nameEn.full || nameEn.short || '') : (nameEn || '');
  return {
    ...record,
    [grammaticalCase]: { uk: declinedUk, en: declinedEn },
  };
};

// v6 (spec §3/§4): a shipment carries its own sourceClinicId (resolved to `sourceClinic`,
// looked up straight off the unified `parties.clinics` - never a separate `partnerClinics`
// collection); the destination clinic is always the case's own `clinic` (relations.clinicId), the
// same one every other document already resolves - never mutates the stored shipment, just layers
// the resolved party records on top. The real templates read `{{sourceClinic.name.uk.genitive}}`/
// `{{clinic.name.uk.accusative}}` directly (never through this shipment-nested alias) -
// `sourceClinic`/`destinationClinic` are kept as a convenience alias for any template that does
// reference them through the shipment.
export const enrichShipment = (shipment, { sourceClinic, clinic } = {}) => {
  if (!shipment) return null;
  return {
    ...shipment,
    sourceClinic: withDeclinedNameFallback(sourceClinic, 'genitive'),
    destinationClinic: withDeclinedNameFallback(clinic, 'accusative'),
  };
};

// "DD.MM.YYYY" - same rendering every other document date uses (formatDocumentDate is defined
// further down this file; referencing it here is safe since it's only ever called once the whole
// module has finished loading, same pattern as DOCUMENT_DATE_CONFIG's longUk/longEn above). Unlike
// formatDocumentDate itself (a generic "format if it's a date, else pass the value through
// unchanged" helper used on arbitrary placeholder leaves), this always resolves a blank/invalid
// input to '' - consistent with formatDateLongEn/formatDateWordsUk/etc, so an ART formatted-date
// field is never accidentally set to a raw ISO string or undefined.
export const formatDateNumericUk = value => (isIsoDate(value) ? formatDocumentDate(value) : '');

// A date range, spelled out long-form in English and numeric in Ukrainian - "01.01.2026 – 01.02.2026"
// / "01 January 2026 - 01 February 2026". Used only when a shipment's plannedPeriod carries real
// start/end values rather than a migrated freeform text (see formatShipmentPeriod).
export const formatDateRange = (start, end, locale) => {
  if (locale === 'en') return `${formatDateLongEn(start)} - ${formatDateLongEn(end)}`;
  return `${formatDateNumericUk(start)} – ${formatDateNumericUk(end)}`;
};

// Supports both plannedPeriod shapes (spec §6/§7): the v6 start/end pair, or a migrated freeform
// text kept verbatim per locale - never both computed and stored, this only ever reads whichever
// shape is actually present.
export const formatShipmentPeriod = (period, locale = 'uk') => {
  if (period?.start && period?.end) return formatDateRange(period.start, period.end, locale);
  return period?.text?.[locale] ?? '';
};

// The stored code (e.g. "blastocyst") never carries its own display label - this is the lookup
// table, extendable with more stages without touching any resolver/formatter call site.
export const EMBRYO_STAGE_LABELS = {
  blastocyst: {
    uk: { nominative: 'бластоциста', genitive: 'бластоцисти' },
    en: { nominative: 'blastocyst' },
  },
};

const EMPTY_EMBRYO_STAGE_LABEL = { uk: { nominative: '', genitive: '' }, en: { nominative: '' } };

export const resolveEmbryoStageLabel = code => EMBRYO_STAGE_LABELS[code] || EMPTY_EMBRYO_STAGE_LABEL;

// Generic Ukrainian one/few/many noun-form picker (1 -> one, 2-4 -> few, 5+ -> many, with the
// standard 11-14 exception falling into "many") - shared by the embryo count and gestational-age/
// fetus-count wording below instead of one bespoke mod-arithmetic block per noun.
const ukPluralForm = (count, [one, few, many]) => {
  const n = Math.abs(Math.trunc(Number(count) || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
};

const UK_EMBRYO_COUNT_CARDINALS = {
  1: 'один', 2: 'два', 3: 'три', 4: 'чотири', 5: "п'ять", 6: 'шість', 7: 'сім', 8: 'вісім', 9: "дев'ять", 10: 'десять',
};

// "1 -> один ембріон", "2 -> два ембріони", "3 -> три ембріони", "5 -> п'ять ембріонів" (spec §6) -
// a real cardinal-number + noun-agreement formatter, not a lookup table for the four spec examples.
export const formatEmbryoCountTextUk = count => {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return '';
  const word = UK_EMBRYO_COUNT_CARDINALS[n] || String(n);
  return `${word} ${ukPluralForm(n, ['ембріон', 'ембріони', 'ембріонів'])}`;
};

// "6-7 тижнів" (a real range) or "6 тижнів" (a single value, either from/to alone) - spec §6 only
// ever shows the range form, but a partially-filled ultrasound (only `from` recorded yet) should
// still degrade to something readable rather than an empty string.
export const formatGestationalAgeText = weeks => {
  const from = weeks?.from;
  const to = weeks?.to;
  const hasFrom = from !== undefined && from !== null && from !== '';
  const hasTo = to !== undefined && to !== null && to !== '';
  if (hasFrom && hasTo && Number(from) !== Number(to)) return `${from}–${to} ${ukPluralForm(to, ['тиждень', 'тижні', 'тижнів'])}`;
  const single = hasFrom ? from : (hasTo ? to : null);
  if (single === null) return '';
  return `${single} ${ukPluralForm(single, ['тиждень', 'тижні', 'тижнів'])}`;
};

const PREGNANCY_TYPE_LABELS_UK = { 1: 'одноплідна', 2: 'двоплідна', 3: 'триплідна' };

// Determined solely by fetusCount (spec §6: "не створювати окреме source-поле pregnancyType") -
// anything outside 1-3 (unset, 0, or an unusually high multiple) simply resolves to '', a blank in
// the rendered document rather than a guessed label.
export const formatPregnancyTypeTextUk = fetusCount => PREGNANCY_TYPE_LABELS_UK[Number(fetusCount)] || '';

// Layers the formatted-for-template fields onto an already party-enriched shipment (see
// enrichShipment) - a separate step so a caller that only needs the formatted dates (no clinic
// enrichment) can call this alone. `ivfDate`/`sentDate` no longer belong to the shipment at all
// (spec §5/§7) - see enrichIvfForTemplate for the former, the latter is dropped entirely.
export const enrichShipmentForTemplate = shipment => {
  if (!shipment) return null;
  return {
    ...shipment,
    plannedPeriodFormatted: { uk: formatShipmentPeriod(shipment.plannedPeriod, 'uk'), en: formatShipmentPeriod(shipment.plannedPeriod, 'en') },
    receivedDateFormatted: { uk: formatDateNumericUk(shipment.receivedDate), en: formatDateLongEn(shipment.receivedDate) },
  };
};

// case.artProgram.ivf (spec §5/§7) - a standalone singleton, distinct from the shipment, so
// {{ivf.dateFormatted.uk}}/{{ivf.dateFormatted.en}} resolve independently of it.
export const enrichIvfForTemplate = ivf => {
  if (!ivf) return null;
  return {
    ...ivf,
    dateFormatted: { uk: formatDateNumericUk(ivf.date), en: formatDateLongEn(ivf.date) },
  };
};

export const enrichTransferForTemplate = (transferAttempt, shipment) => {
  if (!transferAttempt) return null;
  return {
    ...transferAttempt,
    dateFormatted: { uk: formatDateNumericUk(transferAttempt.date), en: formatDateLongEn(transferAttempt.date) },
    embryoCountText: { uk: formatEmbryoCountTextUk(transferAttempt.embryoCount) },
    embryoStageLabel: resolveEmbryoStageLabel(transferAttempt.embryoStage),
    shipment: enrichShipmentForTemplate(shipment),
    // Nested exactly as stored (spec §1.3: transferAttempt.hcgTest/.ultrasound) - alongside the
    // top-level hcgTest/ultrasound context aliases resolveCaseContext also exposes (spec §5.1).
    hcgTest: enrichHcgTestForTemplate(resolveHcgTest(transferAttempt)),
    ultrasound: enrichUltrasoundForTemplate(resolveUltrasound(transferAttempt)),
  };
};

export const enrichHcgTestForTemplate = hcgTest => {
  if (!hcgTest) return null;
  return {
    ...hcgTest,
    dateFormatted: { uk: formatDateNumericUk(hcgTest.date), en: formatDateLongEn(hcgTest.date) },
  };
};

export const enrichUltrasoundForTemplate = ultrasound => {
  if (!ultrasound) return null;
  return {
    ...ultrasound,
    dateFormatted: { uk: formatDateNumericUk(ultrasound.date), en: formatDateLongEn(ultrasound.date) },
    gestationalAgeText: { uk: formatGestationalAgeText(ultrasound.gestationalAgeWeeks) },
    pregnancyTypeText: { uk: formatPregnancyTypeTextUk(ultrasound.fetusCount) },
  };
};

// case.documents.embryoOwnershipStatement - spec §1.8/§4. There is only ever the case's one
// shipment (resolveShipment) - no shipmentId of its own to pick. `clinics` is
// `{ sourceClinic, clinic }`, the same pair resolveCaseContext already resolves from the case's own
// relations/shipment.
export const buildEmbryoOwnershipStatementContext = (caseData, clinics, ownershipData) => {
  const data = isPlainObject(ownershipData) ? ownershipData : {};
  const resolvedShipment = enrichShipmentForTemplate(enrichShipment(resolveShipment(caseData), clinics));
  return { ...data, shipment: resolvedShipment };
};

// case.documents.geneticAffinityCertificate - spec §1.8/§4/§5.1. There is only ever one transfer
// attempt referencing the case's one shipment - none of them need an id of their own, and neither
// does the transfer attempt's hCG test/ultrasound (spec §1.5: existence alone means positive/
// confirmed) - nothing left to select by id.
// Which name/code actually belongs on a "У лікувальній програмі ДРТ використано яйцеклітини/
// сперматозоїди ..." line - case.artProgram.geneticMaterial.oocyte (or .sperm) already records
// exactly who provided the material ('wife'/'husband', or any other non-empty value is a donor
// code, spec §1.7/§6/GENETIC_SOURCE_ROLE_VALUES), so the certificate can resolve this itself
// instead of leaving it for the admin to type in and keep in sync by hand.
const geneticSourceDisplayName = (sourceValue, role, ownerPerson) => {
  if (sourceValue === role) return ownerPerson ? { uk: ownerPerson.name?.uk?.nominative || '', en: ownerPerson.name?.en || '' } : { uk: '', en: '' };
  if (isGeneticSourceDonorCode(sourceValue)) return { uk: sourceValue, en: sourceValue };
  return { uk: '', en: '' };
};

export const buildGeneticAffinityCertificateContext = (caseData, clinics, certificateData, relatedPersons = {}) => {
  const data = isPlainObject(certificateData) ? certificateData : {};
  const transferAttempt = resolveTransferAttempt(caseData);
  const shipment = enrichShipment(resolveShipment(caseData), clinics);
  const oocyteSource = caseData?.artProgram?.geneticMaterial?.oocyte;
  const spermSource = caseData?.artProgram?.geneticMaterial?.sperm;
  return {
    ...data,
    transferAttempt: enrichTransferForTemplate(transferAttempt, shipment),
    hcgTest: enrichHcgTestForTemplate(resolveHcgTest(transferAttempt)),
    ultrasound: enrichUltrasoundForTemplate(resolveUltrasound(transferAttempt)),
    outgoingNumberOrBlank: data.outgoingNumber?.trim() || '______',
    // A print-only blank, never persisted (spec §4) - a fully blank pattern rather than a
    // hand-picked placeholder date, so it never silently doubles as a real value.
    issueDateOrBlank: { uk: data.issueDate ? formatDateNumericUk(data.issueDate) : '__.__.____' },
    // Shared/cross-referenced by any other document conditioning a block on whether the wife
    // herself was the oocyte donor (e.g. the RATS/birth-registration statement's "та генетичною
    // матір'ю ..." clause) - the "У лікувальній програмі ДРТ використано яйцеклітини..." field this
    // certificate itself prints from the case's scalar case.artProgram.geneticMaterial.oocyte
    // (spec §1.7/§6).
    oocyteSourceIsWife: oocyteSource === 'wife',
    // The certificate's own fieldLine values for "яйцеклітини"/"сперматозоїди": the spouse's own
    // name when they were the source, the raw donor code otherwise - {{geneticAffinityCertificate.
    // oocyteSourceDisplay.uk}}/{{...spermSourceDisplay.uk}} in the template, no manual per-case
    // typing needed.
    oocyteSourceDisplay: geneticSourceDisplayName(oocyteSource, 'wife', relatedPersons.wife),
    spermSourceDisplay: geneticSourceDisplayName(spermSource, 'husband', relatedPersons.husband),
  };
};

// case.documents.racssClinicLetter - spec §1.8/§4. Same single-transfer-attempt/single-shipment
// rule as above; racssClinicLetter itself carries no requisites of its own (spec §1.3 sample:
// `"racssClinicLetter": {}`).
export const buildRacssClinicLetterContext = (caseData, clinics, letterData) => {
  const data = isPlainObject(letterData) ? letterData : {};
  const transferAttempt = resolveTransferAttempt(caseData);
  const shipment = enrichShipment(resolveShipment(caseData), clinics);
  return {
    ...data,
    transferAttempt: enrichTransferForTemplate(transferAttempt, shipment),
    ultrasound: enrichUltrasoundForTemplate(resolveUltrasound(transferAttempt)),
  };
};

// case.documents.medicalServicesAgreement - spec §5.
export const buildMedicalServicesAgreementContext = agreementData => {
  const data = isPlainObject(agreementData) ? agreementData : {};
  return {
    ...data,
    dateFormatted: {
      uk: data.date ? formatDateNumericUk(data.date) : '',
      en: data.date ? formatDateLongEn(data.date) : '',
    },
  };
};

// couple.marriage - spec §10: dateFormatted/certificateDateFormatted layered on top of whatever the
// record already carries (old certificateNumber/certificateDate-only records, or the newer
// date/certificateType/certificateIssuedBy shape) - never removes a field, never requires the new
// ones to be present.
export const enrichCoupleMarriage = couple => {
  if (!isPlainObject(couple) || !isPlainObject(couple.marriage)) return couple;
  const { marriage } = couple;
  return {
    ...couple,
    marriage: {
      ...marriage,
      dateFormatted: { uk: marriage.date ? formatDateNumericUk(marriage.date) : '', en: marriage.date ? formatDateLongEn(marriage.date) : '' },
      certificateDateFormatted: {
        uk: marriage.certificateDate ? formatDateNumericUk(marriage.certificateDate) : '',
        en: marriage.certificateDate ? formatDateLongEn(marriage.certificateDate) : '',
      },
    },
  };
};

export const resolveCaseContext = (catalog, caseId, { childId, templateId } = {}) => {
  const rawCaseRecord = findById(catalog?.cases, caseId);
  if (!rawCaseRecord) return null;
  const caseRecord = normalizeCaseRecord(rawCaseRecord);
  const relations = isPlainObject(caseRecord.relations) ? caseRecord.relations : {};

  const couple = findById(catalog.parties.couples, relations.coupleId);
  const partners = toArray(couple?.partners);
  const rawWife = partners.find(partner => partner?.role === 'wife') || partners[0] || null;
  const rawHusband = partners.find(partner => partner?.role === 'husband') || partners[1] || null;
  // The power of attorney (signing date + apostille date) is a static fact of *this case*, not of
  // the representative person - the same representative can act under a different POA in another
  // case, and one POA can cover several representatives at once, so a separate record per
  // date/person pairing is no longer needed. relations.representativePowerOfAttorney is
  // authoritative when set; a representative record's own (legacy) powerOfAttorney is only a
  // fallback for cases that pre-date this split.
  const casePowerOfAttorney = isPlainObject(relations.representativePowerOfAttorney) ? relations.representativePowerOfAttorney : {};
  const representatives = toArray(relations.representativeIds)
    .map(id => findById(catalog.parties.representatives, id))
    .filter(Boolean)
    .map(record => enrichPersonName({
      ...record,
      powerOfAttorney: {
        ...record.powerOfAttorney,
        date: casePowerOfAttorney.date || record.powerOfAttorney?.date || '',
        apostille: casePowerOfAttorney.apostille || record.powerOfAttorney?.apostille || '',
        apostilleDate: casePowerOfAttorney.apostilleDate || record.powerOfAttorney?.apostilleDate || '',
      },
    }));

  const childbirth = isPlainObject(caseRecord.childbirth) ? caseRecord.childbirth : {};
  const rawChildren = toArray(childbirth.children);
  // The first child is the default fallback for single-child documents - a caller generating a
  // document for a twin passes `childId` to pick a different one; `children` (every child,
  // gender-computed) is exposed alongside it so the UI can offer a selector.
  const selectedRawChild = childId ? rawChildren.find(item => String(item?.id) === String(childId)) : null;
  const rawChild = isPlainObject(selectedRawChild) ? selectedRawChild : (isPlainObject(rawChildren[0]) ? rawChildren[0] : {});
  const medicalConclusion = isPlainObject(rawChild.medicalConclusion) ? rawChild.medicalConclusion : {};

  const documents = isPlainObject(caseRecord.documents) ? caseRecord.documents : {};

  // Every date-bearing document sub-record, built generically from DOCUMENT_DATE_CONFIG - adding
  // a new one (legalServicesDisclaimer, surrogacyAgreementAppendix1) never needs a new inline
  // block here, only a new table row above. Keyed by storage key (case.documents.<key> - the same
  // key TEMPLATE_DOCUMENT_CONFIG's `documentKey` uses), each value already carrying its
  // `contextKey`'s derived fields.
  const documentContextsByStorageKey = Object.fromEntries(
    Object.entries(DOCUMENT_DATE_CONFIG).map(([storageKey, config]) => [
      storageKey,
      withDerivedDateFields(documents[storageKey], config),
    ]),
  );
  const birthRegistration = documentContextsByStorageKey.birthRegistrationConsent;
  const surrogacyAgreement = documentContextsByStorageKey.surrogacyAgreement;
  const maritalStatusDeclaration = documentContextsByStorageKey.maritalStatusDeclaration;
  const legalServicesDisclaimer = documentContextsByStorageKey.legalServicesDisclaimer;
  const surrogacyAgreementAppendix1 = documentContextsByStorageKey.surrogacyAgreementAppendix1;

  // Which document's notaryId is "the" notary for this render (spec §8).
  const notaryTemplateConfig = templateId !== undefined
    ? (TEMPLATE_DOCUMENT_CONFIG[templateId] ?? { documentKey: null, usesNotary: false })
    : DEFAULT_NOTARY_TEMPLATE_CONFIG;
  const notaryDocumentKey = notaryTemplateConfig.usesNotary ? notaryTemplateConfig.documentKey : null;
  const notaryId = notaryDocumentKey ? (documentContextsByStorageKey[notaryDocumentKey]?.notaryId ?? null) : null;
  const notary = enrichPersonName(notaryId ? findById(catalog.parties.notaries, notaryId) : null);

  // The case's own clinic (parties.clinics, relations.clinicId) both runs the surrogacy program in
  // Ukraine and receives the embryos - it signs the documents and is the destination every shipment
  // resolves against; the shipment's own sourceClinicId (spec §3/§4) resolves the separate foreign
  // clinic embryos ship from, from that same unified `parties.clinics` collection - never a second
  // "main" clinic, never a distinct `partnerClinics` collection any more (spec §1). Both are
  // null-safe: a case with no clinicId/sourceClinicId simply resolves to null rather than throwing,
  // so a template referencing it degrades to a visible warning instead of a crash (see
  // getUnresolvedVariablePaths/fillPlaceholders) - e.g. a case with no clinic relation at all
  // (case-kikawa in the reference data has no maternity-hospital relation).
  const enrichClinic = rawClinic => (rawClinic ? {
    ...rawClinic,
    medicalDirector: rawClinic.medicalDirector ? {
      ...rawClinic.medicalDirector,
      name: enrichNameWithDerivedFields(rawClinic.medicalDirector.name),
    } : rawClinic.medicalDirector,
  } : null);
  const clinic = enrichClinic(relations.clinicId ? findById(catalog.parties.clinics, relations.clinicId) : null);
  const rawArtProgram = isPlainObject(caseRecord.artProgram) ? caseRecord.artProgram : {};
  const rawShipment = resolveShipment(caseRecord);
  const sourceClinic = enrichClinic(rawShipment?.sourceClinicId ? findById(catalog.parties.clinics, rawShipment.sourceClinicId) : null);
  const resolvedClinics = { sourceClinic, clinic };

  const wife = enrichPersonName(rawWife);
  const husband = enrichPersonName(rawHusband);

  // ART-program-referencing documents (spec §1.3/§4/§7): each resolves its own referenced
  // shipment/transfer/hcgTest/ultrasound fresh from `caseRecord.artProgram` on every call, so
  // editing an event once (e.g. the transfer date) is reflected in every document that references
  // it.
  const embryoOwnershipStatement = buildEmbryoOwnershipStatementContext(caseRecord, resolvedClinics, documents.embryoOwnershipStatement);
  const geneticAffinityCertificate = buildGeneticAffinityCertificateContext(caseRecord, resolvedClinics, documents.geneticAffinityCertificate, { wife, husband });
  const racssClinicLetter = buildRacssClinicLetterContext(caseRecord, resolvedClinics, documents.racssClinicLetter);
  const medicalServicesAgreement = buildMedicalServicesAgreementContext(documents.medicalServicesAgreement);

  // Canonical top-level ART-program aliases (spec §5.1): the same singleton shipment/transfer
  // attempt/hCG test/ultrasound/ivf every document-scoped context above already resolves, exposed
  // directly so a template can reference {{embryoShipment...}}/{{transferAttempt...}}/{{hcgTest...}}/
  // {{ultrasound...}}/{{ivf...}} without going through a specific document's namespace.
  const transferAttemptRaw = resolveTransferAttempt(caseRecord);
  const shipmentForContext = enrichShipment(rawShipment, resolvedClinics);
  const artProgram = rawArtProgram;

  return {
    case: caseRecord,
    relations,
    couple: enrichCoupleMarriage(couple),
    wife,
    husband,
    surrogateMother: enrichPersonName(relations.surrogateMotherId
      ? findById(catalog.parties.surrogateMothers, relations.surrogateMotherId)
      : null),
    clinic,
    sourceClinic,
    // Stored v5 templates used {{partnerClinic.*}}. Keep that name as a read-only compatibility
    // alias while all new UI and templates use the v6 {{sourceClinic.*}} terminology.
    partnerClinic: sourceClinic,
    representative: representatives[0] || null,
    representatives,
    childbirth,
    children: rawChildren.map(buildChildContext),
    child: buildChildContext(rawChild),
    selectedChildId: rawChild?.id,
    medicalConclusion,
    maternityHospital: childbirth.maternityHospitalId
      ? findById(catalog.parties.maternityHospitals, childbirth.maternityHospitalId)
      : null,
    artProgram,
    embryoShipment: enrichShipmentForTemplate(shipmentForContext),
    transferAttempt: enrichTransferForTemplate(transferAttemptRaw, shipmentForContext),
    hcgTest: enrichHcgTestForTemplate(resolveHcgTest(transferAttemptRaw)),
    ultrasound: enrichUltrasoundForTemplate(resolveUltrasound(transferAttemptRaw)),
    ivf: enrichIvfForTemplate(rawArtProgram.ivf),
    surrogacyAgreement,
    birthRegistration,
    maritalStatusDeclaration,
    legalServicesDisclaimer,
    surrogacyAgreementAppendix1,
    embryoOwnershipStatement,
    geneticAffinityCertificate,
    racssClinicLetter,
    medicalServicesAgreement,
    notary,
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

// Conditional block rendering (batch 26 §6): a paragraph/layoutV2 block can carry a `condition` -
// a plain context path (optionally `!`-negated) that must resolve truthy for the block to render
// at all. Unlike a placeholder inside the block's own text (which degrades to a visible "missing"
// blank when unresolved), a block whose condition doesn't hold is dropped from the generated
// document entirely - e.g. "та генетичною матір'ю ... Кацура Юкако," in the RATS/birth-
// registration statement must only print when the wife herself was the oocyte donor
// (geneticAffinityCertificate.oocyteSourceIsWife, shared/cross-referenced off the same
// case.artProgram.geneticMaterial.oocyte scalar every genetic-affinity-certificate resolves from - see
// buildGeneticAffinityCertificateContext), never shown with a blank/unresolved
// value for any other oocyte source. No `condition` at all (the vast majority of blocks) always
// renders, so this is fully backward compatible.
export const evaluateBlockCondition = (condition, context) => {
  const trimmed = String(condition || '').trim();
  if (!trimmed) return true;
  const negate = trimmed.startsWith('!');
  const path = negate ? trimmed.slice(1).trim() : trimmed;
  const value = getValueByPath(context, path);
  return negate ? !value : Boolean(value);
};

// Text mode renders substituted placeholders, while formatting is stored against the unresolved
// template text. Map display offsets back through those variable-sized substitutions so a range
// after (or touching) a placeholder can never put formatting markers inside its {{token}}.
export const mapResolvedSelectionToRaw = (rawMarkup, context, lang, start, end) => {
  const rawText = plainTextOf(rawMarkup);
  let rawCursor = 0;
  let resolvedCursor = 0;
  const segments = [];
  rawText.replace(PLACEHOLDER_PATTERN, (token, rawPath, tokenOffset) => {
    if (tokenOffset > rawCursor) {
      const length = tokenOffset - rawCursor;
      segments.push({ rawStart: rawCursor, rawEnd: tokenOffset, resolvedStart: resolvedCursor, resolvedEnd: resolvedCursor + length, placeholder: false });
      resolvedCursor += length;
    }
    const resolvedToken = fillPlaceholders(token, context, lang);
    const resolvedLength = plainTextOf(resolvedToken).length;
    segments.push({ rawStart: tokenOffset, rawEnd: tokenOffset + token.length, resolvedStart: resolvedCursor, resolvedEnd: resolvedCursor + resolvedLength, placeholder: true });
    rawCursor = tokenOffset + token.length;
    resolvedCursor += resolvedLength;
    return token;
  });
  if (rawCursor < rawText.length) {
    segments.push({ rawStart: rawCursor, rawEnd: rawText.length, resolvedStart: resolvedCursor, resolvedEnd: resolvedCursor + rawText.length - rawCursor, placeholder: false });
  }
  const mapOffset = (offset, isEnd) => {
    const segment = segments.find(item => offset >= item.resolvedStart && offset <= item.resolvedEnd);
    if (!segment) return rawText.length;
    if (!segment.placeholder) return segment.rawStart + Math.min(offset - segment.resolvedStart, segment.rawEnd - segment.rawStart);
    if (offset === segment.resolvedStart) return segment.rawStart;
    if (offset === segment.resolvedEnd) return segment.rawEnd;
    return isEnd ? segment.rawEnd : segment.rawStart;
  };
  return { start: mapOffset(start, false), end: mapOffset(end, true) };
};

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
    // A conditionally-hidden paragraph (batch 26 §6) never prints, so its own unresolved
    // placeholders (if any) are never a real problem for this export - skip it rather than
    // nagging about a value that will never actually appear.
    if (!evaluateBlockCondition(paragraph?.condition, context)) return;
    ['uk', 'en'].forEach(lang => scan(paragraph?.[lang], lang));
  });
  return [...missing].sort();
};

// Every {{path}} in a piece of text, INCLUDING the two graphical tokens (unlike
// findUnresolvedVariables, which excludes them for the unresolved-variable-warning use case) - only
// the layoutV2 block scan below needs logo/logo-long to show up (spec §5.3: "image/logo sources").
const extractAllVariablePaths = text => [...String(text || '').matchAll(PLACEHOLDER_PATTERN)].map(match => match[1].trim());

// Every {{path}} referenced anywhere in a template (title, beforeTitle blocks, paragraphs, both
// languages) - regardless of whether it currently resolves. Used to scope non-blocking case
// completeness warnings (e.g. childbirth/birth-registration data) to only the documents actually
// checked for generation, instead of nagging about a birth that hasn't happened yet while
// generating an early-stage document like a surrogacy agreement that never references it.
// Every text-bearing field a layoutV2 block can carry (spec §5.3): a plain string leaf (`text`,
// `value`, `caption`, `source`, each entry of `lines`), a bilingual leaf's already-covered by the
// legacy paragraphs/title scan above, and everything nestable - `columns[].content`, `rows` (an
// array of either a block or a row of blocks, e.g. signatureTable) - recursed into.
const scanLayoutV2Block = (block, addPath) => {
  if (!isPlainObject(block)) return;
  ['text', 'value', 'caption', 'source'].forEach(key => extractAllVariablePaths(block[key]).forEach(addPath));
  toArray(block.lines).forEach(line => {
    if (typeof line === 'string') extractAllVariablePaths(line).forEach(addPath);
    else scanLayoutV2Block(line, addPath);
  });
  toArray(block.runs).forEach(run => extractAllVariablePaths(run?.text).forEach(addPath));
  toArray(block.columns).forEach(column => scanLayoutV2Block(column?.content, addPath));
  toArray(block.rows).forEach(row => {
    if (Array.isArray(row)) row.forEach(cell => scanLayoutV2Block(cell, addPath));
    else scanLayoutV2Block(row, addPath);
  });
};

// Every {{path}} referenced anywhere in a template - title, beforeTitle blocks, legacy paragraphs
// (both languages), and every layoutV2 block (spec §5.3: paragraphs/title/beforeTitle/
// layoutV2.blocks/text/runs/lines/value/image sources) - regardless of whether it currently
// resolves. Used to scope non-blocking case completeness warnings (e.g. childbirth/birth-
// registration data) to only the documents actually checked for generation, instead of nagging
// about a birth that hasn't happened yet while generating an early-stage document like a
// surrogacy agreement that never references it.
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
  toArray(template?.layoutV2?.blocks).forEach(block => scanLayoutV2Block(block, path => paths.add(path)));
  return [...paths];
};

// --- Template variable audit (spec §5.3) -----------------------------------------------------
// Classifies every path a template can reference so a dev/test utility can fail on a stale/unknown
// one instead of a renamed field silently degrading to a blank. Prefix tables, not an exhaustive
// enumeration, since a backend/relation path's remaining segments are themselves data-driven
// (`clinic.medicalDirector.name.uk.genitive`, `representatives.0.name.uk.short`, ...).
const SYSTEM_VARIABLE_PATHS = ['logo', 'logo-long'];
// Every resolveCaseContext top-level key that resolves a relation record from `catalog.parties.*`
// straight off `case.relations` - as opposed to a resolved/derived context alias below.
const RESOLVED_RELATION_PATH_PREFIXES = ['relations.', 'couple.', 'wife.', 'husband.', 'clinic.', 'sourceClinic.', 'partnerClinic.', 'surrogateMother.', 'representative.', 'representatives.', 'notary.', 'maternityHospital.'];
// Runtime-only aliases: the canonical ART-program singleton paths (spec §5.1), and every
// document-scoped context object resolveCaseContext builds fresh on each render - none of these
// are ever themselves stored in Firebase, even though some of their leaves pass through
// unmodified stored requisites (e.g. `geneticAffinityCertificate.outgoingNumber`).
const DERIVED_RUNTIME_PATH_PREFIXES = [
  'artProgram.', 'embryoShipment.', 'transferAttempt.', 'hcgTest.', 'ultrasound.', 'ivf.',
  'surrogacyAgreement.', 'birthRegistration.', 'maritalStatusDeclaration.', 'legalServicesDisclaimer.', 'surrogacyAgreementAppendix1.',
  'embryoOwnershipStatement.', 'geneticAffinityCertificate.', 'racssClinicLetter.', 'medicalServicesAgreement.',
];
// Raw backend records reachable straight off the resolved case (`case.artProgram...`,
// `case.documents...`, `case.childbirth...`) or the per-child/case-wide context aliases.
const BACKEND_SOURCE_PATH_PREFIXES = ['case.', 'child.', 'children.', 'childbirth.', 'medicalConclusion.'];

export const classifyTemplateVariablePath = path => {
  const trimmed = String(path || '').trim();
  if (SYSTEM_VARIABLE_PATHS.includes(trimmed)) return 'system';
  if (RESOLVED_RELATION_PATH_PREFIXES.some(prefix => trimmed.startsWith(prefix))) return 'resolvedRelation';
  if (DERIVED_RUNTIME_PATH_PREFIXES.some(prefix => trimmed.startsWith(prefix))) return 'derivedRuntime';
  if (BACKEND_SOURCE_PATH_PREFIXES.some(prefix => trimmed.startsWith(prefix))) return 'backendSource';
  return 'unknown';
};

// Every path referenced by a template (getTemplateReferencedPaths), each classified
// (classifyTemplateVariablePath) - sorted so a test can assert on a stable snapshot and fail the
// moment any path classifies as 'unknown'.
export const auditTemplateVariables = template => [...getTemplateReferencedPaths(template)]
  .sort()
  .map(path => ({ path, classification: classifyTemplateVariablePath(path) }));

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

// A `lv2:<index>` scope (layoutV2Scope) ignores langKey entirely - a layoutV2 paragraph/
// richParagraph block is never bilingual (the whole template renders in its own single
// `languages[0]`), so there is only ever one markup string to read/write, whichever langKey the
// caller happens to pass.
const layoutV2ScopeMatch = scope => /^lv2:(\d+)$/.exec(scope);
// `lv2-label:<index>` (layoutV2LabelScope) - a fieldLine block's label, entirely independent of
// its `lv2:<index>` value slot above. Matched separately from layoutV2ScopeMatch (never confused
// with it - the "-label" segment makes the two patterns mutually exclusive).
const layoutV2LabelScopeMatch = scope => /^lv2-label:(\d+)$/.exec(scope);

export const getTemplateScopeText = (template, scope, langKey) => {
  if (scope === TITLE_SCOPE) return template?.title?.[langKey] || '';
  const beforeTitleMatch = /^beforeTitle:(\d+)$/.exec(scope);
  if (beforeTitleMatch) return template?.beforeTitle?.[Number(beforeTitleMatch[1])]?.[langKey] || '';
  const paragraphMatch = /^p:(\d+)$/.exec(scope);
  if (paragraphMatch) return template?.paragraphs?.[Number(paragraphMatch[1])]?.[langKey] || '';
  const layoutV2LabelMatch = layoutV2LabelScopeMatch(scope);
  if (layoutV2LabelMatch) return layoutV2LabelMarkup(template?.layoutV2?.blocks?.[Number(layoutV2LabelMatch[1])]);
  const layoutV2Match = layoutV2ScopeMatch(scope);
  if (layoutV2Match) return layoutV2ParagraphMarkup(template?.layoutV2?.blocks?.[Number(layoutV2Match[1])]);
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
  const layoutV2LabelMatch = layoutV2LabelScopeMatch(scope);
  if (layoutV2LabelMatch) {
    const index = Number(layoutV2LabelMatch[1]);
    const blocks = template?.layoutV2?.blocks || [];
    return {
      ...template,
      layoutV2: {
        ...template.layoutV2,
        blocks: blocks.map((block, i) => (i === index ? layoutV2LabelFromMarkup(block, value) : block)),
      },
    };
  }
  const layoutV2Match = layoutV2ScopeMatch(scope);
  if (layoutV2Match) {
    const index = Number(layoutV2Match[1]);
    const blocks = template?.layoutV2?.blocks || [];
    return {
      ...template,
      layoutV2: {
        ...template.layoutV2,
        blocks: blocks.map((block, i) => (i === index ? layoutV2ParagraphFromMarkup(block, value) : block)),
      },
    };
  }
  return template;
};

// --- layoutV2 (pixel-exact single-page forms, e.g. genetic-affinity-certificate) ---------------
// A template opts in with `rendererVersion: 2` + a `layoutV2.blocks` array instead of the legacy
// beforeTitle/title/paragraphs shape (spec: "Оновити renderer documentsBuilder"). Unlike the
// legacy bilingual/two-column system, a layoutV2 document is always a single physical A4 sheet in
// its own template.languages[0] - the page-wide UA/EN/UA+EN selector never applies to it (there is
// no side-by-side column concept for a government form reproduced mm-for-mm). Preview, PDF and
// DOCX all read this one normalized tree (spec §8) - only the mm/pt/twip unit conversion differs
// per renderer, never the resolved content or style.
export const isLayoutV2Template = template => template?.rendererVersion === 2 && Array.isArray(template?.layoutV2?.blocks);

// Exported for the Style Editor page (batch 23 §4), which needs the exact same canonical property
// list to enumerate every toggleable field of a named style - never a second hand-maintained copy.
export const LAYOUT_V2_STYLE_KEYS = [
  'fontFamily', 'fontSizePt', 'fontWeight', 'fontStyle', 'lineHeight', 'color', 'align',
  'spaceBeforePt', 'spaceAfterPt', 'textDecoration', 'textTransform', 'letterSpacingPt',
];

const pickLayoutV2StyleKeys = source => LAYOUT_V2_STYLE_KEYS.reduce((acc, key) => {
  if (source && source[key] !== undefined) acc[key] = source[key];
  return acc;
}, {});

export const resolveLayoutV2NamedStyle = (template, styleName) => (
  styleName ? (template?.styleSheet?.[styleName] ?? {}) : {}
);

// block override -> named style -> template.format (clean layoutV2 template spec §2/§3: the base
// style is the template's own `format` - never a required `styleSheet.document` entry, and never
// the page-wide Format-panel settings, which a layoutV2 document never inherits at all). A template
// that never sets `format` simply starts every block from {}, exactly like one whose named style
// already covers everything itself.
export const resolveLayoutV2Style = (template, styleName, overrides) => ({
  ...pickLayoutV2StyleKeys(template?.format),
  ...pickLayoutV2StyleKeys(resolveLayoutV2NamedStyle(template, styleName)),
  ...pickLayoutV2StyleKeys(overrides),
});

// --- Page geometry (clean layoutV2 template spec §5/§6) ---------------------------------------
// A clean template carries only `page.size`/`page.orientation`/`page.marginsMm` - never its own
// widthMm/heightMm/contentWidthMm, which are always derivable and would otherwise just be a second
// copy that could drift from the size/orientation actually selected.
export const PAGE_SIZES_MM = {
  A4: {
    portrait: { width: 210, height: 297 },
    landscape: { width: 297, height: 210 },
  },
};

export const getPageGeometry = template => {
  const page = template?.page ?? {};
  const orientation = page.orientation === 'landscape' ? 'landscape' : 'portrait';
  const size = PAGE_SIZES_MM[page.size] ? page.size : 'A4';
  const dimensions = PAGE_SIZES_MM[size][orientation];
  const margins = {
    top: page?.marginsMm?.top ?? 0,
    right: page?.marginsMm?.right ?? 0,
    bottom: page?.marginsMm?.bottom ?? 0,
    left: page?.marginsMm?.left ?? 0,
  };
  return {
    widthMm: dimensions.width,
    heightMm: dimensions.height,
    margins,
    contentWidthMm: dimensions.width - margins.left - margins.right,
  };
};

// --- lineStyles (clean layoutV2 template spec §4) ----------------------------------------------
// Repeated line/border parameters (letterhead divider, form-field underline, signature-cell rule)
// live once under `lineStyles`, named by a block's own `lineStyle`/`bottomBorderStyle` - resolved
// into a concrete object only in the normalized render tree, never written back onto the template.
export const resolveLineStyle = (template, styleName) => {
  if (!styleName) return null;
  return template?.lineStyles?.[styleName] ?? null;
};

// A signatureTable's own width is always the sum of its columns - never a stored `widthMm` that
// could drift from the columns actually defined.
export const getSignatureTableWidthMm = block => (block?.columnWidthsMm || [])
  .reduce((sum, width) => sum + (Number(width) || 0), 0);

const resolveLayoutV2Text = (text, context, lang) => (text === undefined ? undefined : fillPlaceholders(text, context, lang));

const resolveLayoutV2Runs = (runs, template, context, lang) => (runs || []).map(run => ({
  text: resolveLayoutV2Text(run.text, context, lang) || '',
  style: resolveLayoutV2Style(template, run.style, run.styleOverrides),
}));

// `{{logo}}`/`{{logo-long}}` are graphical tokens, never text-substituted (same convention as the
// legacy renderer's getTemplateLogoType) - an `image` content block tags which clinic-logo variant
// to draw instead of carrying a resolved data URL of its own.
const LOGO_TOKEN_PATTERN = /^\{\{\s*(logo|logo-long)\s*\}\}$/;

const normalizeLayoutV2Content = (content, template, context, lang) => {
  if (!content) return null;
  if (content.type === 'image') {
    const logoMatch = LOGO_TOKEN_PATTERN.exec(String(content.source || '').trim());
    // `hidden` toggles the logo off without discarding its widthMm/heightMm/etc (turning it back
    // on needs no re-entering); offsetXMm/offsetYMm nudge it within its own column - never the
    // column's own widthMm, so a sibling column (the clinic contact block) never shifts when the
    // logo moves (spec: "решта тексту ... не стрибала").
    return {
      type: 'image',
      hidden: Boolean(content.hidden),
      logoToken: logoMatch ? logoMatch[1] : null,
      source: logoMatch ? null : resolveLayoutV2Text(content.source, context, lang),
      widthMm: content.widthMm,
      heightMm: content.heightMm,
      fit: content.fit,
      horizontalAlign: content.horizontalAlign,
      verticalAlign: content.verticalAlign,
      offsetXMm: content.offsetXMm || 0,
      offsetYMm: content.offsetYMm || 0,
    };
  }
  if (content.type === 'stack') {
    return {
      type: 'stack',
      style: resolveLayoutV2Style(template, content.style, content.styleOverrides),
      horizontalAlign: content.horizontalAlign,
      lines: (content.lines || []).map(line => resolveLayoutV2Text(line, context, lang)),
    };
  }
  return { type: 'unknown', raw: content };
};

const normalizeLayoutV2Block = (block, template, context, lang) => {
  const base = {
    type: block?.type,
    marginTopMm: block?.marginTopMm,
    marginBottomMm: block?.marginBottomMm,
  };
  switch (block?.type) {
    case 'letterhead':
      return {
        ...base,
        heightMm: block.heightMm,
        columnGapMm: block.columnGapMm,
        bottomBorder: block.bottomBorder ?? resolveLineStyle(template, block.bottomBorderStyle),
        paddingBottomMm: block.paddingBottomMm,
        columns: (block.columns || []).map(column => ({
          widthMm: column.widthMm,
          content: normalizeLayoutV2Content(column.content, template, context, lang),
        })),
      };
    case 'alignedBox':
      return {
        ...base,
        widthMm: block.widthMm,
        horizontalAlign: block.horizontalAlign,
        style: resolveLayoutV2Style(template, block.style, block.styleOverrides),
        lines: (block.lines || []).map(line => resolveLayoutV2Text(line, context, lang)),
      };
    // A plain paragraph/richParagraph whose whole (unresolved) text is exactly {{logo}}/
    // {{logo-long}} - same convention the legacy (non-layoutV2) renderer already uses
    // (getTemplateLogoType) - draws an actual clinic logo image instead of literal text, so an
    // admin can place the logo anywhere by just typing the token into an ordinary paragraph (full
    // T/B/I/align/condition toolbar), not only through the dedicated letterhead/image block.
    case 'paragraph': {
      const logoMatch = LOGO_TOKEN_PATTERN.exec(String(block.text || '').trim());
      if (logoMatch) return { ...base, logoToken: logoMatch[1] };
      return {
        ...base,
        style: resolveLayoutV2Style(template, block.style, block.styleOverrides),
        text: resolveLayoutV2Text(block.text, context, lang) || '',
      };
    }
    case 'richParagraph': {
      const runs = block.runs || [];
      const logoMatch = runs.length === 1 ? LOGO_TOKEN_PATTERN.exec(String(runs[0]?.text || '').trim()) : null;
      if (logoMatch) return { ...base, logoToken: logoMatch[1] };
      return {
        ...base,
        style: resolveLayoutV2Style(template, block.style, block.styleOverrides),
        runs: resolveLayoutV2Runs(block.runs, template, context, lang),
      };
    }
    case 'fieldLine':
      return {
        ...base,
        label: block.label !== undefined ? resolveLayoutV2Text(block.label, context, lang) : undefined,
        labelRuns: block.labelRuns ? resolveLayoutV2Runs(block.labelRuns, template, context, lang) : undefined,
        labelWidthMm: block.labelWidthMm || 0,
        labelStyle: resolveLayoutV2Style(template, block.style, block.styleOverrides),
        value: resolveLayoutV2Text(block.value, context, lang) || '',
        // valueRuns (batch 2026-08 §: fieldLine gets the full paragraph toolbar) is the value's own
        // bold/italic-carrying sibling, same plain-vs-runs pattern labelRuns/text-vs-runs already
        // are - resolved the same way a richParagraph's runs are.
        valueRuns: block.valueRuns ? resolveLayoutV2Runs(block.valueRuns, template, context, lang) : undefined,
        valueStyle: resolveLayoutV2Style(template, block.valueStyle, block.valueStyleOverrides),
        // Both formats supported (spec §4/§16): an old inline `line` object wins if present, a new
        // template names its border via `lineStyle` into the shared `lineStyles` map instead.
        line: block.line ?? resolveLineStyle(template, block.lineStyle) ?? {},
        caption: block.caption !== undefined ? resolveLayoutV2Text(block.caption, context, lang) : undefined,
        captionStyle: resolveLayoutV2Style(template, block.captionStyle, block.captionStyleOverrides),
      };
    case 'spacer':
      return { ...base, heightMm: block.heightMm };
    case 'signatureTable':
      return {
        ...base,
        // A clean template never stores its own widthMm (spec §5/§10) - it's always the sum of
        // columnWidthsMm; an old template's explicit widthMm (if any) still wins.
        widthMm: block.widthMm ?? getSignatureTableWidthMm(block),
        horizontalAlign: block.horizontalAlign,
        columnWidthsMm: block.columnWidthsMm || [],
        cellPaddingMm: block.cellPaddingMm || 0,
        rows: (block.rows || []).map(row => (
          row?.type === 'spacerRow'
            ? { type: 'spacerRow', heightMm: row.heightMm }
            : (row || []).map(cell => ({
              text: resolveLayoutV2Text(cell?.text, context, lang) || '',
              style: resolveLayoutV2Style(template, cell?.style, cell?.styleOverrides),
              bottomBorder: cell?.bottomBorder ?? resolveLineStyle(template, cell?.bottomBorderStyle),
            }))
        )),
      };
    default:
      // spec §7/§9: an unknown block type never crashes the render - it's carried through as a
      // diagnostic-only entry the renderers skip, with a console warning for whoever authored it.
      console.warn(`Unknown layoutV2 block type: ${block?.type}`);
      return { ...base, unknown: true };
  }
};

// The single normalized tree preview/PDF/DOCX all read (spec §8) - `null` for any template that
// isn't opted into layoutV2, so every caller can do `doc.layoutV2 &&` without a separate feature
// check.
export const buildLayoutV2Document = (template, context) => {
  if (!isLayoutV2Template(template)) return null;
  const lang = (resolveDocLanguages(template) || ['uk'])[0];
  // Geometry is always derived (spec §5/§6) - a clean template's `page` never carries its own
  // widthMm/heightMm/contentWidthMm, so getPageGeometry computes them from size/orientation/margins
  // every render; an old template's explicit page.marginsMm still drives the same computation.
  const geometry = getPageGeometry(template);
  return {
    lang,
    page: {
      ...(template.page || {}),
      widthMm: geometry.widthMm,
      heightMm: geometry.heightMm,
      marginsMm: geometry.margins,
    },
    contentWidthMm: geometry.contentWidthMm,
    // A conditional block (batch 26 §6, evaluateBlockCondition) that doesn't hold is dropped
    // entirely, before normalization - never rendered with a blank/unresolved value.
    blocks: template.layoutV2.blocks
      .filter(block => evaluateBlockCondition(block?.condition, context))
      .map(block => normalizeLayoutV2Block(block, template, context, lang)),
  };
};

// --- Validation (clean layoutV2 template spec §17) ---------------------------------------------
// Best-effort diagnostics for a layoutV2 template - never thrown, always a { errors, warnings }
// list an editor surface can show. A missing/unknown reference always falls back gracefully in the
// renderers/normalizer themselves (undefined style, no border, etc.) - this only flags it for
// whoever is authoring the template.
const LAYOUT_V2_KNOWN_BLOCK_TYPES = ['letterhead', 'paragraph', 'alignedBox', 'richParagraph', 'fieldLine', 'spacer', 'signatureTable'];

export const validateLayoutV2Template = template => {
  const errors = [];
  const warnings = [];
  if (template?.rendererVersion !== 2) return { errors, warnings };
  if (!Array.isArray(template?.layoutV2?.blocks)) {
    errors.push('layoutV2.blocks is missing or is not an array.');
    return { errors, warnings };
  }

  const geometry = getPageGeometry(template);
  const styleNames = new Set(Object.keys(template?.styleSheet || {}));
  const lineStyleNames = new Set(Object.keys(template?.lineStyles || {}));

  const checkStyle = (styleName, where) => {
    if (styleName && !styleNames.has(styleName)) warnings.push(`Unknown named style "${styleName}" (${where}).`);
  };
  const checkLineStyle = (styleName, where) => {
    if (styleName && !lineStyleNames.has(styleName)) warnings.push(`Unknown lineStyle "${styleName}" (${where}).`);
  };
  const checkBottomBorderStyle = (styleName, where) => {
    if (styleName && !lineStyleNames.has(styleName)) warnings.push(`Unknown bottomBorderStyle "${styleName}" (${where}).`);
  };

  template.layoutV2.blocks.forEach((block, index) => {
    const where = `block[${index}] (${block?.type})`;
    if (!LAYOUT_V2_KNOWN_BLOCK_TYPES.includes(block?.type)) {
      warnings.push(`Unknown block type "${block?.type}" (${where}).`);
      return;
    }
    if (block.type === 'letterhead') {
      checkBottomBorderStyle(block.bottomBorderStyle, where);
      const columnsWidthMm = (block.columns || []).reduce((sum, column) => sum + (Number(column.widthMm) || 0), 0)
        + (Number(block.columnGapMm) || 0) * Math.max(0, (block.columns || []).length - 1);
      if (columnsWidthMm > geometry.contentWidthMm) {
        warnings.push(`Letterhead columns (${columnsWidthMm}mm) exceed the content width (${geometry.contentWidthMm}mm).`);
      }
      (block.columns || []).forEach(column => {
        if (column?.content?.type === 'stack') checkStyle(column.content.style, where);
      });
    }
    if (block.type === 'paragraph' || block.type === 'alignedBox') {
      checkStyle(block.style, where);
    }
    if (block.type === 'richParagraph') {
      (block.runs || []).forEach(run => checkStyle(run.style, where));
    }
    if (block.type === 'fieldLine') {
      checkStyle(block.style, where);
      checkStyle(block.valueStyle, where);
      checkStyle(block.captionStyle, where);
      checkLineStyle(block.lineStyle, where);
    }
    if (block.type === 'signatureTable') {
      const tableWidthMm = getSignatureTableWidthMm(block);
      if (tableWidthMm > geometry.contentWidthMm) {
        warnings.push(`signatureTable columns (${tableWidthMm}mm) exceed the content width (${geometry.contentWidthMm}mm).`);
      }
      (block.rows || []).forEach(row => {
        if (row?.type === 'spacerRow') return;
        (row || []).forEach(cell => {
          checkStyle(cell?.style, where);
          checkBottomBorderStyle(cell?.bottomBorderStyle, where);
        });
      });
    }
  });

  return { errors, warnings };
};

// Leftover `{{...}}` anywhere in an already-resolved layoutV2 render tree (buildLayoutV2Document's
// output) means some placeholder in the template has no matching context value (spec §17/§18) -
// returns the distinct unresolved tokens found, empty when everything resolved cleanly.
export const findUnresolvedPlaceholders = layoutV2Doc => {
  if (!layoutV2Doc) return [];
  const serialized = JSON.stringify(layoutV2Doc);
  return [...new Set(serialized.match(/\{\{[^}]+\}\}/g) || [])];
};

// --- layoutV2 paragraph/richParagraph inline bold (batch 25 §3) --------------------------------
// The legacy paragraph/beforeTitle/title editor already has a "select a fragment, press Bold"
// mechanism (toggleInlineFormat, above) built on **markdown**-style runs; layoutV2's `paragraph`/
// `richParagraph` blocks store runs as {text, style} instead (style names one of the template's
// styleSheet entries, resolved by resolveLayoutV2Style), so bolding a fragment here means tagging
// it with the 'inlineEmphasis' named style (already configurable in the Style Editor, batch 23 §4)
// rather than writing a markup character. These operate on the block's raw, unresolved text/runs
// (the same shared markup every case sees, {{tokens}} included) - identical in spirit to Template
// mode for legacy paragraphs, since a layoutV2 block has no per-case resolved-text editing mode.

// A block's runs as one flat {text, style, styleOverrides}[] list regardless of whether it's
// still a plain `paragraph` (single implicit run, no style override) or already a `richParagraph`.
// Bold is the 'inlineEmphasis' named style; italic (added alongside the full toolbar for layoutV2
// paragraphs) is a plain `styleOverrides.fontStyle` instead of a named style, so it works on any
// template regardless of whether its styleSheet defines one.
// A fieldLine block's own templated content is its `value` (label/caption are separate, plain
// fields - see the editor) - `valueRuns` is its bold/italic-carrying sibling, the exact same
// plain-vs-runs pattern `text`/`runs` already is for an ordinary paragraph, so the whole toolbar
// below (mode cycle, Bold, Italic, Insert-variable) works on a fieldLine's value identically to
// any other paragraph's text, instead of only exposing a bare text input for it.
// A generic "field slot" reader: any block field that can independently be either a plain string
// or its own bold/italic-carrying `<key>Runs` sibling (text/runs, value/valueRuns, label/
// labelRuns, ...) - factored out because a fieldLine block carries *two* such slots at once
// (value and label), each fully independent of the other, unlike an ordinary paragraph's one.
const layoutV2FieldSlotRuns = (block, textKey, runsKey) => {
  const runs = block?.[runsKey];
  if (runs) return runs.map(run => ({ text: String(run?.text || ''), style: run?.style, styleOverrides: run?.styleOverrides }));
  return [{ text: String(block?.[textKey] || ''), style: undefined, styleOverrides: undefined }];
};

export const layoutV2ParagraphRuns = block => (block?.type === 'fieldLine'
  ? layoutV2FieldSlotRuns(block, 'value', 'valueRuns')
  : layoutV2FieldSlotRuns(block, 'text', 'runs'));

// A fieldLine's label (e.g. "дружина", or bold-in-part "**та**/або сперматозоїди") is a second,
// entirely independent field slot from its value - its own T/B/I/insert-variable/align toolbar row
// (lv2-label:<index> scope, layoutV2LabelScope below) needs the same runs access the value's does.
export const layoutV2FieldLineLabelRuns = block => layoutV2FieldSlotRuns(block, 'label', 'labelRuns');

export const layoutV2ParagraphPlainText = block => layoutV2ParagraphRuns(block).map(run => run.text).join('');

const withLayoutV2RunOffsets = runs => {
  let pos = 0;
  return runs.map(run => {
    const start = pos;
    pos += run.text.length;
    return { ...run, start, end: pos };
  });
};

const splitLayoutV2RunsAtCuts = (runsWithOffsets, cuts) => {
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
        text: run.text.slice(offset - run.start, cut - run.start), style: run.style, styleOverrides: run.styleOverrides, start: offset, end: cut,
      });
      offset = cut;
    });
  });
  return result;
};

// Offsets are temporary editing data; every other field is persisted run metadata and must match
// before adjacent text can be combined. In particular, runs with the same bold/italic state can
// still carry different colors, sizes, or other renderer overrides.
const layoutV2RunMetadata = run => {
  const metadata = { ...run };
  delete metadata.text;
  delete metadata.start;
  delete metadata.end;
  return metadata;
};

const layoutV2RunFormatKey = run => JSON.stringify(layoutV2RunMetadata(run));

const mergeAdjacentLayoutV2Runs = runs => runs.reduce((merged, run) => {
  if (!run.text) return merged;
  const last = merged[merged.length - 1];
  if (last && layoutV2RunFormatKey(last) === layoutV2RunFormatKey(run)) last.text += run.text;
  else merged.push({ text: run.text, ...layoutV2RunMetadata(run) });
  return merged;
}, []);

const isLayoutV2RunPlain = run => !run.style && !run.styleOverrides?.fontStyle;

// Collapses a merged run list back into a generic field slot's own text/runs pair - the plain
// single-field shape whenever nothing in the result actually carries bold/italic, so an untouched/
// unformatted slot never permanently upgrades to the richer shape. Shared by every slot's Bold/
// Italic toggle and its FromMarkup below, so all three ways of editing a slot's text agree on the
// same collapse rule.
const finalizeLayoutV2FieldSlotRuns = (block, textKey, runsKey, mergedRuns) => {
  const plainText = mergedRuns.map(run => run.text).join('');
  if (mergedRuns.length <= 1 && mergedRuns.every(isLayoutV2RunPlain)) {
    const next = { ...block, [textKey]: plainText };
    delete next[runsKey];
    return next;
  }
  return { ...block, [textKey]: plainText, [runsKey]: mergedRuns };
};

// Same collapse rule as above, but for an ordinary paragraph/richParagraph block, which additionally
// switches its own `type` between the two shapes (a fieldLine's slots never do - `type` always stays
// 'fieldLine' regardless of whether its value/label carry runs).
const finalizeLayoutV2ParagraphRuns = (block, mergedRuns) => {
  if (block?.type === 'fieldLine') return finalizeLayoutV2FieldSlotRuns(block, 'value', 'valueRuns', mergedRuns);
  if (mergedRuns.length <= 1 && mergedRuns.every(isLayoutV2RunPlain)) {
    const { runs: ignoredRuns, ...plainBlock } = block;
    return { ...plainBlock, type: 'paragraph', text: mergedRuns[0]?.text || '' };
  }
  const { text: ignoredText, ...richBlock } = block;
  return { ...richBlock, type: 'richParagraph', runs: mergedRuns };
};

const finalizeLayoutV2FieldLineLabelRuns = (block, mergedRuns) => finalizeLayoutV2FieldSlotRuns(block, 'label', 'labelRuns', mergedRuns);

// MS Word toggle behavior (batch 17), same rule as toggleInlineFormat: if every run inside
// [plainStart, plainEnd) is already 'inlineEmphasis', the whole selection loses it; otherwise the
// whole selection gains it. Always returns a `richParagraph` (a plain `paragraph` block has no
// runs of its own to hold a partial style yet) - collapsed back to a single-run `paragraph` when
// the result ends up with no formatting left anywhere, so an untouched/fully-unformatted block
// stays in its simpler original shape instead of permanently upgrading.
export const toggleLayoutV2ParagraphBold = (block, plainStart, plainEnd) => {
  if (!(plainEnd > plainStart)) return block;
  const runs = withLayoutV2RunOffsets(layoutV2ParagraphRuns(block));
  const split = splitLayoutV2RunsAtCuts(runs, [plainStart, plainEnd]);
  const within = run => run.start >= plainStart && run.end <= plainEnd && run.end > run.start;
  const selected = split.filter(within);
  const allBold = selected.length > 0 && selected.every(run => run.style === 'inlineEmphasis');
  const next = split.map(run => (within(run) ? { ...run, style: allBold ? undefined : 'inlineEmphasis' } : run));
  // Firebase's `set()` rejects a value tree containing a bare `undefined` outright (batch 26 §3) -
  // dropping the now-unused key via destructuring, rather than assigning it `undefined`, keeps
  // this block always directly writable (handled inside finalizeLayoutV2ParagraphRuns).
  return finalizeLayoutV2ParagraphRuns(block, mergeAdjacentLayoutV2Runs(next));
};

// Same MS Word toggle rule as Bold, just flipping styleOverrides.fontStyle instead of the
// 'inlineEmphasis' named style - independent of it, so a fragment can be bold, italic, or both.
export const toggleLayoutV2ParagraphItalic = (block, plainStart, plainEnd) => {
  if (!(plainEnd > plainStart)) return block;
  const runs = withLayoutV2RunOffsets(layoutV2ParagraphRuns(block));
  const split = splitLayoutV2RunsAtCuts(runs, [plainStart, plainEnd]);
  const within = run => run.start >= plainStart && run.end <= plainEnd && run.end > run.start;
  const selected = split.filter(within);
  const allItalic = selected.length > 0 && selected.every(run => run.styleOverrides?.fontStyle === 'italic');
  const next = split.map(run => (within(run)
    ? { ...run, styleOverrides: allItalic ? undefined : { ...run.styleOverrides, fontStyle: 'italic' } }
    : run));
  return finalizeLayoutV2ParagraphRuns(block, mergeAdjacentLayoutV2Runs(next));
};

// --- layoutV2 paragraph full toolbar parity (mode cycle, Italic, Insert-variable) ---------------
// The legacy paragraph/beforeTitle/title editor's whole toolbar (Template/Input/Text mode cycle,
// Bold/Italic, Insert-variable) is built on one shared **bold**/*italic* markup string per row
// (parseFormattedRuns/serializeFormattedRuns) addressed via getTemplateScopeText/
// withTemplateScopeText. Converting a layoutV2 block's field slot to and from that same markup
// shape lets a `lv2:<index>`/`lv2-label:<index>` scope (layoutV2Scope/layoutV2LabelScope) reuse
// that entire existing editor unchanged, instead of duplicating a second toolbar/mode system just
// for layoutV2 blocks. Generic over which slot (getRuns/finalize) so a fieldLine's value and label
// - two fully independent bold/italic-carrying fields on the same block - each get their own
// working toolbar without duplicating this diff algorithm twice.
const layoutV2MarkupFromSlot = (existingBlock, markup, getRuns, finalize) => {
  const previousRuns = getRuns(existingBlock);
  const previousText = previousRuns.map(run => run.text).join('');
  const parsedRuns = parseFormattedRuns(markup);
  const nextText = parsedRuns.map(run => run.text).join('');
  let prefixLength = 0;
  while (prefixLength < previousText.length && prefixLength < nextText.length && previousText[prefixLength] === nextText[prefixLength]) prefixLength += 1;
  let suffixLength = 0;
  while (suffixLength < previousText.length - prefixLength && suffixLength < nextText.length - prefixLength
    && previousText[previousText.length - 1 - suffixLength] === nextText[nextText.length - 1 - suffixLength]) suffixLength += 1;
  const previousAt = offset => {
    if (offset === null) return null;
    let cursor = 0;
    return previousRuns.find(run => {
      const contains = offset >= cursor && offset < cursor + run.text.length;
      cursor += run.text.length;
      return contains;
    });
  };
  const oldOffsetFor = offset => {
    if (offset < prefixLength) return offset;
    if (offset >= nextText.length - suffixLength) return previousText.length - (nextText.length - offset);
    return null;
  };
  const runs = [];
  let nextOffset = 0;
  parsedRuns.forEach(parsedRun => {
    let pieceStart = 0;
    while (pieceStart < parsedRun.text.length) {
      const oldOffset = oldOffsetFor(nextOffset + pieceStart);
      const previous = oldOffset === null ? null : previousAt(oldOffset);
      let pieceEnd = pieceStart + 1;
      while (pieceEnd < parsedRun.text.length && previousAt(oldOffsetFor(nextOffset + pieceEnd)) === previous) pieceEnd += 1;
      const styleOverrides = { ...(previous?.styleOverrides || {}) };
      if (parsedRun.italic) styleOverrides.fontStyle = 'italic';
      else delete styleOverrides.fontStyle;
      const nextRun = { ...(previous || {}), text: parsedRun.text.slice(pieceStart, pieceEnd) };
      if (parsedRun.bold) nextRun.style = 'inlineEmphasis';
      else if (nextRun.style === 'inlineEmphasis') delete nextRun.style;
      if (Object.keys(styleOverrides).length) nextRun.styleOverrides = styleOverrides;
      else delete nextRun.styleOverrides;
      runs.push(nextRun);
      pieceStart = pieceEnd;
    }
    nextOffset += parsedRun.text.length;
  });
  return finalize(existingBlock, mergeAdjacentLayoutV2Runs(runs));
};

const layoutV2RunsToMarkup = runs => serializeFormattedRuns(runs.map(run => ({
  text: run.text,
  bold: run.style === 'inlineEmphasis',
  italic: run.styleOverrides?.fontStyle === 'italic',
})));

export const layoutV2ParagraphMarkup = block => layoutV2RunsToMarkup(layoutV2ParagraphRuns(block));

export const layoutV2ParagraphFromMarkup = (existingBlock, markup) => layoutV2MarkupFromSlot(
  existingBlock, markup, layoutV2ParagraphRuns, finalizeLayoutV2ParagraphRuns,
);

// A fieldLine's label - its own independent T/B/I/insert-variable/align toolbar row, the fix for a
// block whose label was previously either a plain-only field (no bold/italic at all) or, worse,
// fully invisible (labelRuns with no plain `label` at all - see layoutV2FieldLineLabelRuns).
export const layoutV2LabelMarkup = block => layoutV2RunsToMarkup(layoutV2FieldLineLabelRuns(block));

export const layoutV2LabelFromMarkup = (existingBlock, markup) => layoutV2MarkupFromSlot(
  existingBlock, markup, layoutV2FieldLineLabelRuns, finalizeLayoutV2FieldLineLabelRuns,
);

// The scope key a layoutV2 paragraph/richParagraph block edits under (mirrors beforeTitleScope/
// paragraphScope) - resolved by getTemplateScopeText/withTemplateScopeText below.
export const layoutV2Scope = index => `lv2:${index}`;

// A fieldLine block's label - its own, independent scope from layoutV2Scope's value slot above.
export const layoutV2LabelScope = index => `lv2-label:${index}`;

// The effective alignment a layoutV2 block renders with - unlike a legacy paragraph's own `style`
// object, a layoutV2 block's `style` names a *shared* template style (resolveLayoutV2Style), so an
// alignment override belongs on the block's own `styleOverrides` instead, never on the shared
// named style every other block using it would also pick up.
export const getEffectiveLayoutV2BlockAlign = (template, block) => resolveLayoutV2Style(template, block?.style, block?.styleOverrides).align || 'left';

// A fieldLine's own `style`/`styleOverrides` govern its *label* (see normalizeLayoutV2Block) - its
// value has an entirely separate `valueStyle`/`valueStyleOverrides` pair, so the Align button on a
// fieldLine's value row (the toolbar it now shares with every other paragraph) must read/write
// that pair instead, never the label's.
export const getEffectiveLayoutV2FieldLineValueAlign = (template, block) => resolveLayoutV2Style(template, block?.valueStyle, block?.valueStyleOverrides).align || 'left';

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
    documentStyle: normalizeDocumentStyle(template?.documentStyle),
    allowPageBreaks: Boolean(template.allowPageBreaks),
    // Non-null only for a `rendererVersion: 2` template (spec: "Не рендерити legacy та layoutV2
    // одночасно") - every renderer checks this first and, when present, renders exclusively from
    // it instead of the legacy fields below (which still resolve, harmlessly unused, since a
    // template's own `layoutV2.renderLegacyContent` flag is the only source of truth for whether
    // the legacy fields were ever meant to be read here).
    layoutV2: buildLayoutV2Document(template, context),
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
    // A conditional paragraph (batch 26 §6, evaluateBlockCondition) that doesn't hold is dropped
    // from the array entirely, never left in as a blank/unresolved entry - the `visible` flag is
    // computed against each paragraph's own original index (so index-0 logo detection above is
    // never thrown off by an earlier paragraph having been conditionally hidden) and stripped again
    // once the filter has run.
    paragraphs: toArray(template.paragraphs).map((paragraph, index) => {
      const type = getParagraphType(paragraph);
      if (index === 0 && type !== 'text' && !hasDedicatedLogoField) {
        return { type: 'logo-consumed', uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      // A conditionally-hidden paragraph (batch 26 §6, evaluateBlockCondition) is tagged the same
      // no-op-for-the-renderer way an already-consumed logo paragraph is, rather than dropped from
      // the array - dropping it would shift every later paragraph's index, which the editor UI
      // (resolvedDoc.paragraphs[index], keyed by the *template's* paragraph index) relies on
      // staying stable. Each renderer's own bodyParagraphs filter (see DocumentsPdfDocument.jsx/
      // documentsDocxBuilder.js) already skips unknown/no-op types the same way.
      if (!evaluateBlockCondition(paragraph?.condition, context)) {
        return { type: 'condition-hidden', uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      if (type !== 'text') {
        return { type, uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      // Every visual override of this paragraph comes from its one consolidated `style` key (or
      // the legacy flat fields, see getParagraphStyle) - resolved here into flat fields for the
      // renderers. An absent key means "inherit the document's own formatting" (fontSize /
      // firstLineIndentCm / default alignment).
      const style = getParagraphStyle(paragraph);
      // joinWithPrevious (groupJoinedParagraphs below) - a paragraph that continues the previous
      // one mid-sentence must never get the usual forced capital first letter (it isn't starting a
      // new sentence), only the paragraph that actually opens the group should.
      const resolveText = langKey => {
        const filled = fillPlaceholders(localizedText(paragraph, langKey), context, langKey);
        return paragraph.joinWithPrevious ? filled : capitalizeFirstLetter(filled);
      };
      return {
        type,
        bold: style.bold,
        align: style.align,
        indentCm: style.indentCm,
        fontSize: style.fontSize,
        joinWithPrevious: Boolean(paragraph.joinWithPrevious),
        uk: resolveText('uk'),
        en: resolveText('en'),
      };
    }),
  };
};

// A generated document's `paragraphs` array keeps one entry per *template* paragraph (never
// merged, never dropped - see the comment above) so the editor can still show/edit each block on
// its own. Rendering is different: a paragraph tagged `joinWithPrevious` (the paragraph-row toolbar
// toggle) is meant to print as a straight continuation of whatever paragraph immediately precedes
// it - no line break, no first-line indent of its own - most commonly a conditional clause
// (evaluateBlockCondition) sitting mid-sentence, which must read as one continuous paragraph
// whether or not the clause itself is shown. This is the renderer-only step that actually merges
// those runs together, called once by each renderer (DocumentsPdfDocument.jsx,
// documentsDocxBuilder.js) in place of their old plain condition-hidden/logo-consumed filter.
// condition-hidden/logo-consumed entries are dropped here (they never had anything to print) but
// never break the chain - a paragraph after one still joins whatever visible paragraph precedes it,
// exactly as if the hidden one had never been in the array at all.
export const groupJoinedParagraphs = paragraphs => {
  const groups = [];
  toArray(paragraphs).forEach(paragraph => {
    if (paragraph?.type === 'condition-hidden' || paragraph?.type === 'logo-consumed') return;
    const previousGroup = groups[groups.length - 1];
    if (paragraph?.joinWithPrevious && previousGroup?.type === 'text' && paragraph?.type === 'text') {
      previousGroup.uk = `${previousGroup.uk || ''}${paragraph.uk || ''}`;
      previousGroup.en = `${previousGroup.en || ''}${paragraph.en || ''}`;
      return;
    }
    groups.push({ ...paragraph });
  });
  return groups;
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
      // A clinic can be referenced two ways now (spec §1/§4): as the case's own destination clinic
      // (relations.clinicId), or as a shipment's source clinic (artProgram.embryoShipment.
      // sourceClinicId) - either one counts as a reference.
      case 'clinics': return String(relations.clinicId) === targetId
        || String(caseRecord.artProgram?.embryoShipment?.sourceClinicId) === targetId;
      case 'surrogateMothers': return String(relations.surrogateMotherId) === targetId;
      case 'representatives': return toArray(relations.representativeIds).some(repId => String(repId) === targetId);
      case 'maternityHospitals': return String(caseRecord.childbirth?.maternityHospitalId) === targetId;
      // A case can reference the same notary from up to three different documents (spec §8) -
      // any one of them counts as a reference, not just the birth-registration statement.
      case 'notaries': return [
        caseRecord.documents?.birthRegistrationConsent?.notaryId,
        caseRecord.documents?.surrogacyAgreement?.notaryId,
        caseRecord.documents?.maritalStatusDeclaration?.notaryId,
        caseRecord.documents?.legalServicesDisclaimer?.notaryId,
      ].some(notaryId => String(notaryId) === targetId);
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
  // Distinct from the `clinic` groups above: the source clinic (spec §3/§4, resolved from the
  // shipment's own sourceClinicId - still looked up in the same unified `parties.clinics`, never a
  // separate collection) is never the case's own `clinic` record under a different kind - it's the
  // separate clinic embryos ship from (spec: embryo-ownership-statement document). Shown whenever
  // one is selected on the case; a case without a shipment sourceClinicId simply doesn't offer
  // this group.
  { label: 'Клініка-відправник', roots: ['sourceClinic'], predicate: context => Boolean(context?.sourceClinic) },
  // The canonical top-level ART-program singleton aliases (spec §5.1) - shown only once the case
  // actually carries artProgram data, same idea as the document-scoped groups below.
  {
    label: 'Програма ДРТ',
    roots: ['artProgram', 'embryoShipment', 'transferAttempt', 'hcgTest', 'ultrasound', 'ivf'],
    predicate: context => Boolean(context?.case?.artProgram),
  },
  // ART program document contexts (spec §7) - each root is a top-level key resolveCaseContext
  // already exposes. Shown only once the case actually carries that document's own service data
  // (same idea as the partner-clinic group above) - an old case that never uses these documents at
  // all shouldn't show four permanently-empty "Немає даних" groups in the picker.
  {
    label: 'Заява про належність ембріонів',
    roots: ['embryoOwnershipStatement'],
    predicate: context => Boolean(context?.case?.documents?.embryoOwnershipStatement),
  },
  {
    label: 'Довідка про генетичну спорідненість',
    roots: ['geneticAffinityCertificate'],
    predicate: context => Boolean(context?.case?.documents?.geneticAffinityCertificate),
  },
  {
    label: 'Лист клініки до РАЦС',
    roots: ['racssClinicLetter'],
    predicate: context => Boolean(context?.case?.documents?.racssClinicLetter),
  },
  {
    label: 'Договір про медичні послуги',
    roots: ['medicalServicesAgreement'],
    predicate: context => Boolean(context?.case?.documents?.medicalServicesAgreement),
  },
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
// parseFormattedRuns itself doesn't care about nesting order, since `**`/`*` are independent toggles.
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
    out += String(run.text || '');
  });
  for (let i = openOrder.length - 1; i >= 0; i -= 1) {
    out += openOrder[i] === 'bold' ? BOLD_MARKER : ITALIC_MARKER;
  }
  return out;
};

// --- Blank fill-in fields (official-form documents, batch 22 §1) ----------------------------
// A Ukrainian government form's blank line ("паспорт: тип: __________, Код країни: __________")
// is typed as a run of underscores in the template text, the same way it was authored in the
// reference docx - but a printed government form never shows literal underscore glyphs, it shows
// an underlined blank space. This never touches how the underscores are typed/stored (still plain
// `_` characters, so Data/Template mode round-trip unchanged); it only splits an already-formatted
// run (parseFormattedRuns' output) at its underscore stretches, tagging each stretch `blank: true`,
// so the PDF/DOCX renderers can draw that stretch as an underlined run of non-breaking spaces
// instead of underscore characters - the renderer decides whether to actually do that (gated to
// isOfficialFormStyle, batch 22 §1) so every other, non-official-form document keeps showing its
// underscores exactly as before.
const BLANK_FIELD_PATTERN = /_{2,}/g;

export const splitBlankFieldRuns = runs => (runs || []).flatMap(run => {
  const text = String(run.text || '');
  const segments = [];
  let lastIndex = 0;
  for (const match of text.matchAll(BLANK_FIELD_PATTERN)) {
    if (match.index > lastIndex) segments.push({ ...run, text: text.slice(lastIndex, match.index), blank: false });
    segments.push({ ...run, text: match[0], blank: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length || !segments.length) segments.push({ ...run, text: text.slice(lastIndex), blank: false });
  return segments;
});

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

// --- Input mode: editing the resolved (case-substituted) wording directly -------------------
// Input mode shows the resolved wording at rest and, per batch 24 §1, must keep showing it once a
// field is focused too - never falling back to the raw {{token}} markup an admin never asked to
// see. Since the underlying template stays the shared raw markup (case-agnostic), an edit made
// against the resolved text has to be translated back onto that raw string. buildResolvedTextSegments
// walks the raw plain text (markers already stripped, see plainTextOf) once, alternating literal
// spans (which map 1:1 onto their resolved counterpart) and {{token}} spans (replaced by their
// resolved value, almost always a different length) - recording both sides' offsets so an edit's
// position can be translated between them.
const buildResolvedTextSegments = (rawPlainText, context, lang) => {
  const raw = String(rawPlainText || '');
  const segments = [];
  let rawPos = 0;
  let resolvedPos = 0;
  const pattern = new RegExp(PLACEHOLDER_PATTERN.source, 'g');
  let match = pattern.exec(raw);
  while (match) {
    if (match.index > rawPos) {
      const literal = raw.slice(rawPos, match.index);
      segments.push({
        token: false, rawStart: rawPos, rawEnd: match.index, resolvedStart: resolvedPos, resolvedEnd: resolvedPos + literal.length, text: literal,
      });
      resolvedPos += literal.length;
    }
    const path = match[1].trim();
    const rawTokenEnd = match.index + match[0].length;
    let resolvedText;
    if (path === 'logo' || path === 'logo-long') {
      resolvedText = match[0];
    } else {
      const value = context ? resolvePlaceholderValue(context, path, lang) : undefined;
      resolvedText = value === undefined || String(value).trim() === '' ? MISSING_VALUE_PLACEHOLDER : String(value);
    }
    segments.push({
      token: true, rawStart: match.index, rawEnd: rawTokenEnd, resolvedStart: resolvedPos, resolvedEnd: resolvedPos + resolvedText.length, text: resolvedText,
    });
    resolvedPos += resolvedText.length;
    rawPos = rawTokenEnd;
    match = pattern.exec(raw);
  }
  if (rawPos < raw.length || !segments.length) {
    const literal = raw.slice(rawPos);
    segments.push({
      token: false, rawStart: rawPos, rawEnd: raw.length, resolvedStart: resolvedPos, resolvedEnd: resolvedPos + literal.length, text: literal,
    });
  }
  return segments;
};

// Translates an edit made against the resolved wording (Input mode's focused field) back onto the
// raw template markup, so the shared {{token}}s an admin never touched stay exactly as they were.
// Mirrors applyPlainTextEdit's diff-the-single-changed-region approach, but the changed region is
// first "snapped" outward to the nearest segment boundary whenever it lands inside a token's
// resolved span - i.e. typing over part of a substituted name/date bakes that whole value in as
// literal wording instead of corrupting the {{token}} it came from.
export const applyResolvedTextEdit = (rawText, context, lang, newResolvedValue) => {
  const raw = String(rawText || '');
  const rawPlain = plainTextOf(raw);
  const segments = buildResolvedTextSegments(rawPlain, context, lang);
  const oldResolvedPlain = segments.map(segment => segment.text).join('');
  const nextResolvedPlain = String(newResolvedValue || '');
  if (oldResolvedPlain === nextResolvedPlain) return raw;

  const maxCommonStart = Math.min(oldResolvedPlain.length, nextResolvedPlain.length);
  let start = 0;
  while (start < maxCommonStart && oldResolvedPlain[start] === nextResolvedPlain[start]) start += 1;
  let oldEnd = oldResolvedPlain.length;
  let newEnd = nextResolvedPlain.length;
  while (oldEnd > start && newEnd > start && oldResolvedPlain[oldEnd - 1] === nextResolvedPlain[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  // Snap the changed region outward so it never ends inside a token's resolved span - editing into
  // a substituted value bakes that whole value in as literal text rather than corrupting the token.
  const enclosingToken = pos => segments.find(segment => segment.token && pos > segment.resolvedStart && pos < segment.resolvedEnd);
  const startToken = enclosingToken(start);
  const snappedStart = startToken ? startToken.resolvedStart : start;
  const endToken = enclosingToken(oldEnd);
  const snappedOldEnd = endToken ? endToken.resolvedEnd : oldEnd;
  const snappedNewEnd = newEnd + (snappedOldEnd - oldEnd);
  const insertedText = nextResolvedPlain.slice(snappedStart, snappedNewEnd);

  const toRawPos = pos => {
    const exact = segments.find(segment => pos === segment.resolvedStart || pos === segment.resolvedEnd);
    if (exact) return pos === exact.resolvedStart ? exact.rawStart : exact.rawEnd;
    const inside = segments.find(segment => !segment.token && pos > segment.resolvedStart && pos < segment.resolvedEnd);
    return inside ? inside.rawStart + (pos - inside.resolvedStart) : rawPlain.length;
  };
  const rawStart = toRawPos(snappedStart);
  const rawOldEnd = toRawPos(snappedOldEnd);
  const nextRawPlain = `${rawPlain.slice(0, rawStart)}${insertedText}${rawPlain.slice(rawOldEnd)}`;
  return applyPlainTextEdit(raw, nextRawPlain);
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

// --- Document style classes (batch 22 §1) ---------------------------------------------------
// Every template historically rendered with the one shared notarial layout above (the "branded"
// class, tuned for consent letters/agreements). An official regulatory form (e.g. Додаток 18) has
// to visually replicate a government template instead - tighter margins, a smaller dense body, no
// paragraph gap beyond the reference's own empty lines - regardless of whatever the admin's shared
// Format-panel favourites happen to be set to for the rest of the catalog. `documentStyle` is a
// template-level flag (default 'branded', the untouched pre-existing behavior) picked up by
// resolveEffectiveDocFormatting below; unrecognized/missing values always fall back to 'branded' so
// every template saved before this existed keeps rendering exactly as it did.
export const DOCUMENT_STYLES = ['branded', 'official-form'];

export const normalizeDocumentStyle = value => (DOCUMENT_STYLES.includes(value) ? value : 'branded');

export const isOfficialFormStyle = doc => normalizeDocumentStyle(doc?.documentStyle) === 'official-form';

// Measured directly from the reference Додаток 18 docx's own XML (batch 22): pgMar top/right/
// bottom/left = 284/851/567/851 twips = 0.5/1.5/1.0/1.5 cm, single line spacing, no after-paragraph
// spacing (blocks separated only by explicit empty lines, same convention as the branded default),
// a dense form body size and a 14 pt bold centered title.
export const OFFICIAL_FORM_FORMATTING = {
  fontSize: 10,
  titleFontSize: 14,
  lineSpacing: 1,
  paragraphSpacing: 0,
  firstLineIndentCm: 1,
  marginTopCm: 0.5,
  marginRightCm: 1.5,
  marginBottomCm: 1,
  marginLeftCm: 1.5,
  columnGapCm: DEFAULT_DOC_FORMATTING.columnGapCm,
  logoWidthMm: DEFAULT_DOC_FORMATTING.logoWidthMm,
  showLogo: DEFAULT_DOC_FORMATTING.showLogo,
  headerText: DEFAULT_DOC_FORMATTING.headerText,
  footerText: DEFAULT_DOC_FORMATTING.footerText,
  showPageNumbers: DEFAULT_DOC_FORMATTING.showPageNumbers,
  columnDivider: DEFAULT_DOC_FORMATTING.columnDivider,
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

// The formatting a document actually renders with: an official-form document (batch 22 §1) starts
// from the fixed OFFICIAL_FORM_FORMATTING baseline instead of the shared admin-tunable reference,
// so it never inherits the branded catalog's margins/sizes just because the Format panel's
// favourites happen to be set a certain way - a branded document (the default, `documentStyle`
// absent/'branded') keeps starting from the shared reference exactly as before. Either way, that
// document's own `format` overrides still layer on top, so an official-form template can still be
// fine-tuned per document through the same panel.
export const resolveEffectiveDocFormatting = (referenceFormatting, docFormatOverride, documentStyle) => normalizeDocFormatting({
  ...(normalizeDocumentStyle(documentStyle) === 'official-form' ? OFFICIAL_FORM_FORMATTING : referenceFormatting),
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
    // Every case/party record is already migrated to v6 shape by the time this runs (see
    // migrateCaseToV6/normalizeCaseRecord) - stamping the current version here means the next
    // settings save persists `schemaVersion: 6` even if the stored record predates this marker.
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
