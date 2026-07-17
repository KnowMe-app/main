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

// Accepts the same JSON shape as surrogacy-documents-paragraphs-uk-en.json: `{ data: {...},
// documents: [...] }`. Partial payloads are fine - `{ documents: [...] }` alone, `{ data: {...} }`
// alone, or top-level party collections without the `data` wrapper.
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

  const dataSource = isPlainObject(parsed.data) ? parsed.data : parsed;
  const incoming = emptyDocumentsCatalog();
  PARTY_COLLECTIONS.forEach(collection => {
    let rawCollection = dataSource[collection];
    // Backend exports include `data.cases.clinics` for clinic-logo filenames; it mirrors the
    // Realtime Database storage path and is not a case record. Keep Technical merges from
    // importing that logo node as a generated case.
    if (collection === 'cases' && isPlainObject(rawCollection)) {
      const { clinics: _clinicLogos, ...caseRecords } = rawCollection;
      rawCollection = caseRecords;
    }
    incoming.parties[collection] = toArray(rawCollection).filter(record => isPlainObject(record));
  });
  incoming.documents = toArray(parsed.documents).filter(record => isPlainObject(record));

  const hasParties = PARTY_COLLECTIONS.some(collection => incoming.parties[collection].length > 0);
  if (!hasParties && incoming.documents.length === 0) {
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
  catalog.clinicLogos = { ...(current?.clinicLogos || {}) };
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

// Short numbered section titles ("1. Предмет Договору") are bolded; long numbered clauses
// ("1.1. Клініка зобов'язується...") are not - only a short heading-shaped paragraph qualifies.
const SECTION_HEADING_PATTERN = /^\d+(?:\.\d+)*\.\s+\S+/;
const SECTION_HEADING_MAX_LENGTH = 120;

export const isSectionHeading = text => {
  const trimmed = String(text || '').trim();
  if (!trimmed || trimmed.length > SECTION_HEADING_MAX_LENGTH) return false;
  return SECTION_HEADING_PATTERN.test(trimmed);
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

// One generated document, ready for the PDF/DOCX renderers: bilingual title + paragraph pairs
// with every placeholder already substituted from the case context, then any per-case data-mode
// overrides applied on top. Logo/logo-long paragraphs are never text-substituted or overridden -
// they stay tagged for the renderer to draw a graphical block instead (spec §5-§7).
export const buildGeneratedDocument = (template, context, docOverride = null) => {
  const override = isPlainObject(docOverride) ? docOverride : {};
  return {
    id: template.id,
    allowPageBreaks: Boolean(template.allowPageBreaks),
    title: {
      uk: overriddenText(override.title, 'uk', fillPlaceholders(localizedText(template.title, 'uk'), context, 'uk')),
      en: overriddenText(override.title, 'en', fillPlaceholders(localizedText(template.title, 'en'), context, 'en')),
    },
    paragraphs: toArray(template.paragraphs).map((paragraph, index) => {
      const type = getParagraphType(paragraph);
      if (type !== 'text') {
        return { type, uk: paragraph?.uk || '', en: paragraph?.en || '' };
      }
      const paragraphOverride = overrideAt(override.paragraphs, index);
      return {
        type,
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

// Most recently used case first (spec §5), the rest keep catalog order.
export const orderCasesByRecent = (cases, recentCaseIds) => {
  const recent = toArray(recentCaseIds).map(String);
  const rank = id => {
    const index = recent.indexOf(String(id));
    return index === -1 ? recent.length : index;
  };
  return [...(cases || [])].sort((a, b) => rank(a.id) - rank(b.id));
};

export const upsertRecentCaseId = (recentCaseIds, caseId) => {
  if (!caseId) return toArray(recentCaseIds).map(String);
  const id = String(caseId);
  return [id, ...toArray(recentCaseIds).map(String).filter(existing => existing !== id)].slice(0, 20);
};

// --- Layouts + formatting settings ----------------------------------------------------------

export const DOCUMENT_LAYOUTS = [
  { id: 'two-column', label: 'UA + EN · 2 columns' },
  { id: 'one-column-uk', label: 'UA · 1 column' },
  { id: 'one-column-en', label: 'EN · 1 column' },
];

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
  };
};

// The backend settings record stores formatting values and the recently-used case order.
// Clinic logos are resolved from Storage at render time, not stored as URLs/data URLs here.
export const normalizeDocumentsSettings = raw => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    formatting: normalizeDocFormatting(source.formatting),
    clinicLogo: null,
    recentCaseIds: toArray(source.recentCaseIds).map(String),
  };
};

// --- File naming ----------------------------------------------------------------------------

export const buildDocumentsFileName = (catalog, caseRecord, layout, extension) => {
  const label = buildCaseLabel(catalog, caseRecord)
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'Case';
  const langTag = layout === 'one-column-uk' ? 'UA' : layout === 'one-column-en' ? 'EN' : 'UA-EN';
  const today = new Date();
  const ymd = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  return `Documents_${label}_${langTag}_${ymd}.${extension}`;
};
