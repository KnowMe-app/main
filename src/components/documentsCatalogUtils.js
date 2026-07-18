// Pure data logic for the Documents page (legal/client document generator). Everything here is
// UI-free so it can be unit-tested: parsing the paste-and-parse technical input, additively
// merging parsed records into the backend catalog, resolving a case's parties into a placeholder
// context, filling {{placeholder}} tokens, and normalizing the backend-persisted settings record
// (favourite formatting values + recently-used cases).

export const DOCUMENTS_PARTIES_PATH = 'documentsBuilder/parties';
export const DOCUMENTS_TEMPLATES_PATH = 'documentsBuilder/templates';
export const DOCUMENTS_SETTINGS_PATH = 'documentsBuilder/settings';

// Clinic-logo paths. The Storage folder holds the image files themselves (and is listed directly
// as the source of truth for which variants exist); the Realtime Database node at the same path
// holds the per-variant layout assignments as `{ file, layout }` entries (legacy nodes stored
// bare filenames - both shapes are normalized by normalizeClinicLogoEntries).
export const clinicLogoDbPath = clinicId => `${DOCUMENTS_PARTIES_PATH}/cases/clinics/${clinicId}/logo`;
export const clinicLogoStorageFolder = clinicId => `${DOCUMENTS_PARTIES_PATH}/cases/clinics/${clinicId}/logo`;
export const clinicLogoStorageFilePath = (clinicId, fileName) => `${clinicLogoStorageFolder(clinicId)}/${fileName}`;

export const PARTY_COLLECTIONS = ['couples', 'surrogateMothers', 'representatives', 'clinics', 'cases'];

export const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toArray = value => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (isPlainObject(value)) return Object.values(value).filter(Boolean);
  return [];
};

const makeRecordId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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
  parties: { couples: [], surrogateMothers: [], representatives: [], clinics: [], cases: [] },
  documents: [],
  clinicLogos: {},
});

// Backend stores every collection keyed by record id (so merges/deletes touch single children);
// this converts a raw snapshot (or a pasted array) back into ordered arrays for the UI.
export const normalizeDocumentsCatalog = (rawParties, rawTemplates) => {
  const catalog = emptyDocumentsCatalog();
  PARTY_COLLECTIONS.forEach(collection => {
    let rawCollection = rawParties?.[collection];
    // `parties/cases/clinics` is the clinic-logo file-name store (see clinicLogoDbPath), not a
    // case record - it must never leak into the cases list.
    if (collection === 'cases' && isPlainObject(rawCollection)) {
      const { clinics: _clinicLogos, ...caseRecords } = rawCollection;
      rawCollection = caseRecords;
    }
    catalog.parties[collection] = toArray(rawCollection).filter(record => isPlainObject(record));
  });
  catalog.documents = toArray(rawTemplates).filter(record => isPlainObject(record));
  const rawClinicLogos = rawParties?.cases?.clinics;
  if (isPlainObject(rawClinicLogos)) {
    Object.entries(rawClinicLogos).forEach(([clinicId, node]) => {
      const entries = normalizeClinicLogoEntries(node?.logo);
      if (entries.length) catalog.clinicLogos[clinicId] = entries;
    });
  }
  // Legacy fallback: earlier builds kept the file names on the clinic record itself.
  catalog.parties.clinics.forEach(clinic => {
    if (!catalog.clinicLogos[String(clinic.id)] && Array.isArray(clinic.logo)) {
      const entries = normalizeClinicLogoEntries(clinic.logo);
      if (entries.length) catalog.clinicLogos[String(clinic.id)] = entries;
    }
  });
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
  PARTY_COLLECTIONS.forEach(collection => {
    let rawCollection = dataSource[collection];
    // Backend exports include `cases.clinics` for clinic-logo layout assignments; it mirrors the
    // Realtime Database storage path and is not a case record - carried into incoming.clinicLogos
    // instead of being imported as a generated case.
    if (collection === 'cases' && isPlainObject(rawCollection)) {
      const { clinics: clinicLogoNode, ...caseRecords } = rawCollection;
      rawCollection = caseRecords;
      if (isPlainObject(clinicLogoNode)) {
        Object.entries(clinicLogoNode).forEach(([clinicId, node]) => {
          const entries = normalizeClinicLogoEntries(node?.logo);
          if (entries.length) incoming.clinicLogos[clinicId] = entries;
        });
      }
    }
    incoming.parties[collection] = toArray(rawCollection).filter(record => isPlainObject(record));
  });
  incoming.documents = toArray(templatesSource).filter(record => isPlainObject(record));

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
      collection.replace(/s$/, ''),
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

export const resolveCaseContext = (catalog, caseId) => {
  const caseRecord = findById(catalog?.parties?.cases, caseId);
  if (!caseRecord) return null;
  const couple = findById(catalog.parties.couples, caseRecord.coupleId);
  const partners = toArray(couple?.partners);
  const wife = partners.find(partner => partner?.role === 'wife') || partners[0] || null;
  const husband = partners.find(partner => partner?.role === 'husband') || partners[1] || null;
  const representatives = toArray(caseRecord.representativeIds)
    .map(id => findById(catalog.parties.representatives, id))
    .filter(Boolean);
  return {
    case: caseRecord,
    couple,
    wife,
    husband,
    surrogateMother: findById(catalog.parties.surrogateMothers, caseRecord.surrogateMotherId),
    clinic: findById(catalog.parties.clinics, caseRecord.clinicId),
    representative: representatives[0] || null,
    representatives,
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
  toArray(template?.paragraphs).forEach(paragraph => {
    ['uk', 'en'].forEach(lang => scan(paragraph?.[lang], lang));
  });
  return [...missing].sort();
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
  return {
    id: template.id,
    allowPageBreaks: Boolean(template.allowPageBreaks),
    logo,
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
  const couple = findById(catalog?.parties?.couples, caseRecord.coupleId);
  const partners = toArray(couple?.partners);
  const coupleNames = partners
    .map(partner => localizedText(partner?.name, 'en') || localizedText(partner?.name?.uk, 'uk'))
    .filter(Boolean)
    .join(' & ');
  const surrogate = findById(catalog?.parties?.surrogateMothers, caseRecord.surrogateMotherId);
  const surrogateName = localizedText(surrogate?.name, 'en');
  const parts = [coupleNames, surrogateName ? `SM ${surrogateName}` : ''].filter(Boolean);
  return parts.join(' — ') || String(caseRecord.id);
};

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
// duplicating the page before it). SAFETY_FACTOR knowingly underfills every page rather than risk
// a column overflowing alone onto its own near-empty extra page.
const AVG_CHAR_WIDTH_EM = 0.5;
const SAFETY_FACTOR = 0.75;

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
