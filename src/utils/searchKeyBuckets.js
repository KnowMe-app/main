// Single source of truth for the searchKey index vocabulary.
//
// The same bucket names are produced by the index writers in `components/config.js`
// and consumed by the readers (`utils/matchingDataProvider.js`,
// `utils/newUsersFilterSetsIndex.js`, the point-membership path in `config.js`).
// Keeping private copies of these lists is what made the Matching filters silently
// drop cards: a bucket the reader did not know about (`+`/`-` for a known Rh without
// a blood group, `sm`/`pp`/`cl` roles) or a bucket whose checkbox the drawer never
// renders (`no` — "поле не заповнене") was treated as "not selected" and its cards
// disappeared from the deck.
//
// Three rules make writers, readers and the hydrated-card post-filter agree:
//
//   1. `no` is never stored. "Поле не заповнене" is the absence of the id from the
//      index, not a bucket holding ~90% of the collection.
//   2. A bucket whose filter key the group does not offer at all is NOT a reason to
//      exclude a card. It falls back to the group's catch-all option ("?" / other),
//      exactly like the post-filter categorisers, and is allowed outright when the
//      group offers no catch-all either.
//   3. A selection that keeps the unfilled cards is read as an exclusion: pull the
//      rejected buckets and subtract them, because the kept side is not on record.

export const SEARCH_KEY_EMPTY_BUCKET = 'no';
export const SEARCH_KEY_UNKNOWN_BUCKET = '?';

export const BLOOD_SEARCH_KEY_BUCKETS = [
  '1+', '1-', '1', '2+', '2-', '2', '3+', '3-', '3', '4+', '4-', '4', '+', '-', '?', 'no',
];
export const MARITAL_STATUS_SEARCH_KEY_BUCKETS = ['+', '-', '?', 'no'];
export const ROLE_SEARCH_KEY_BUCKETS = ['ed', 'sm', 'ag', 'ip', 'pp', 'cl', '?', 'no'];
export const CSECTION_SEARCH_KEY_BUCKETS = ['cs2plus', 'cs1', 'cs0', 'other', 'no'];
export const IMT_SEARCH_KEY_BUCKETS = ['le28', '29_31', '32_35', '36_plus', '?', 'no'];
export const CONTACT_SEARCH_KEY_BUCKETS = [
  'vk', 'instagram', 'ameblo', 'facebook', 'phone', 'telegram', 'telegram2',
  'tiktok', 'linkedin', 'youtube', 'email', 'twitter', 'line', 'otherLink',
];
export const USER_ID_SEARCH_KEY_BUCKETS = ['vk', 'aa', 'ab', 'id', 'long', 'mid', 'other'];
export const FIELD_COUNT_SEARCH_KEY_BUCKETS = ['le5', 'f6_10', 'f11_20', 'f20_plus'];
export const BMI_SEARCH_KEY_BUCKETS = ['lt18_5', '18_5_24_9', '25_29_9', '30_plus', 'other'];
export const COUNTRY_SEARCH_KEY_BUCKETS = ['ua', 'other', 'unknown'];

/**
 * Which bucket a profile belongs to, for the two indexes whose value is derived
 * rather than stored. Both the writer (components/config.js) and the hydrated-card
 * post-filter call these, so the index and the filter cannot drift apart on a
 * rounding boundary or on what counts as "not on record".
 */
export const resolveBmiBucket = profile => {
  const directBmi = Number(String(profile?.bmi ?? profile?.imt ?? '').replace(',', '.').trim());
  let bmi = Number.isFinite(directBmi) && directBmi > 0 ? directBmi : null;

  if (bmi === null) {
    const height = Number(String(profile?.height || '').replace(',', '.').trim());
    const weight = Number(String(profile?.weight || '').replace(',', '.').trim());
    if (Number.isFinite(height) && Number.isFinite(weight) && height > 0 && weight > 0) {
      bmi = weight / (height / 100) ** 2;
    }
  }

  if (!Number.isFinite(bmi) || bmi <= 0) return 'other';
  if (bmi < 18.5) return 'lt18_5';
  if (bmi <= 24.9) return '18_5_24_9';
  if (bmi <= 29.9) return '25_29_9';
  return '30_plus';
};

const UA_COUNTRY_VALUES = ['ukraine', 'україна', 'украина', 'украин', 'уккраина'];

export const resolveCountryBucket = profile => {
  const raw = String(profile?.country ?? '').trim();
  if (!raw) return 'unknown';
  return UA_COUNTRY_VALUES.includes(raw.toLowerCase()) ? 'ua' : 'other';
};

// Bucket -> filter option key, per index. Buckets missing from a map keep their own name.
export const MARITAL_STATUS_BUCKET_FILTER_KEYS = { '+': 'married', '-': 'unmarried', '?': 'other', no: 'empty' };
export const ROLE_BUCKET_FILTER_KEYS = { '?': 'other', no: 'empty' };
export const IMT_BUCKET_FILTER_KEYS = { '?': 'other' };
export const AGE_BUCKET_FILTER_KEYS = { '?': 'other', no: 'empty' };

/**
 * What each index guarantees about its buckets.
 *
 * `emptyBucket` — the virtual bucket that stands for "поле не заповнене". It is
 *   never written; membership means the id appears under no bucket of this index.
 * `coverage`
 *   'total'   — every profile lands in exactly one bucket (or, when the index has an
 *               emptyBucket, in none at all), so a read can be inverted safely.
 *   'partial' — a profile may sit in several buckets or none, and "none" is not a
 *               selectable option, so a read can never be inverted.
 * `openVocabulary` — buckets are data, not a fixed list (one node per birth date,
 *   per day of last action, per centimetre), so they are queried by range rather
 *   than named one by one.
 */
export const SEARCH_KEY_INDEX_SPECS = {
  blood: { buckets: BLOOD_SEARCH_KEY_BUCKETS, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total' },
  maritalStatus: { buckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total' },
  role: { buckets: ROLE_SEARCH_KEY_BUCKETS, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total' },
  csection: { buckets: CSECTION_SEARCH_KEY_BUCKETS, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total' },
  imt: { buckets: IMT_SEARCH_KEY_BUCKETS, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total' },
  contact: { buckets: CONTACT_SEARCH_KEY_BUCKETS, emptyBucket: null, coverage: 'partial' },
  userId: { buckets: USER_ID_SEARCH_KEY_BUCKETS, emptyBucket: null, coverage: 'total' },
  fields: { buckets: FIELD_COUNT_SEARCH_KEY_BUCKETS, emptyBucket: null, coverage: 'total' },
  // `other` here means the BMI could not be computed at all, and `unknown` means no
  // country on record - the same "nothing to index" case `no` covers elsewhere, so
  // they are the empty bucket of their index and are not stored either.
  bmi: { buckets: BMI_SEARCH_KEY_BUCKETS, emptyBucket: 'other', coverage: 'total' },
  country: { buckets: COUNTRY_SEARCH_KEY_BUCKETS, emptyBucket: 'unknown', coverage: 'total' },
  age: { buckets: null, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total', openVocabulary: true },
  height: { buckets: null, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total', openVocabulary: true },
  weight: { buckets: null, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total', openVocabulary: true },
  lastAction: { buckets: null, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total', openVocabulary: true },
  getInTouch: { buckets: null, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total', openVocabulary: true },
  reaction: { buckets: null, emptyBucket: SEARCH_KEY_EMPTY_BUCKET, coverage: 'total', openVocabulary: true },
};

export const getSearchKeyIndexSpec = indexName => SEARCH_KEY_INDEX_SPECS[indexName] || {};

export const getSearchKeyEmptyBucket = indexName => getSearchKeyIndexSpec(indexName).emptyBucket ?? null;

export const isOpenVocabularySearchKeyIndex = indexName =>
  Boolean(getSearchKeyIndexSpec(indexName).openVocabulary);

/**
 * Drop the values the index does not store. Writers call this so no `no` leaf is
 * ever created again; readers call it so a plan never asks for a node that by
 * design does not exist.
 */
export const withoutEmptySearchKeyBucket = (values, indexName) => {
  const emptyBucket = indexName === undefined ? SEARCH_KEY_EMPTY_BUCKET : getSearchKeyEmptyBucket(indexName);
  const list = values instanceof Set ? [...values] : (values || []);
  const kept = list.filter(value => value !== undefined && value !== null && String(value) !== emptyBucket);
  return values instanceof Set ? new Set(kept) : kept;
};

// Options a group may use as its catch-all when it does not render a checkbox for
// the bucket at hand. Ordered: the first one the group actually offers wins.
const FALLBACK_FILTER_KEYS = ['other', '?'];

export const resolveBucketFilterKey = (bucket, bucketMap = {}) => bucketMap?.[bucket] || bucket;

const hasFilterOption = (group, key) =>
  Boolean(group && typeof group === 'object' && Object.prototype.hasOwnProperty.call(group, key));

export const hasActiveSearchKeyFilterGroup = group =>
  Boolean(group && typeof group === 'object' && Object.values(group).some(value => value === false));

/**
 * Is `bucket` inside the selection expressed by a filter group?
 *
 * The group is the UI state ({ ed: true, ag: false, other: true }); the bucket is a
 * node under `searchKey/<root>/<index>/`. Rule 2 above: an option the drawer does not
 * render must never remove cards, so it defers to the catch-all and, failing that,
 * counts as selected.
 */
export const isBucketSelectedByFilterGroup = (group, bucket, { bucketMap = {}, fallbackKeys = FALLBACK_FILTER_KEYS } = {}) => {
  if (!group || typeof group !== 'object') return true;

  const key = resolveBucketFilterKey(String(bucket), bucketMap);
  if (hasFilterOption(group, key)) return Boolean(group[key]);

  const fallbackKey = (fallbackKeys || []).find(candidate => hasFilterOption(group, candidate));
  if (fallbackKey) return Boolean(group[fallbackKey]);

  return true;
};

export const selectSearchKeyBuckets = (group, allBuckets = [], { bucketMap = {}, fallbackKeys } = {}) => {
  if (!hasActiveSearchKeyFilterGroup(group)) return [];
  return (allBuckets || [])
    .map(String)
    .filter(bucket => isBucketSelectedByFilterGroup(group, bucket, { bucketMap, fallbackKeys }));
};

const unique = values => [...new Set((values || []).map(String))];

const buildPlan = (mode, buckets, selected, rejected, canInvert = false) => ({
  mode,
  buckets,
  selectedBuckets: selected,
  excludedBuckets: rejected,
  // True only where reading the other side is a free optimisation rather than the
  // only correct reading: every card has exactly one bucket and none is virtual, so
  // the caller may flip back to `include` when it has nothing to subtract from.
  canInvert,
  includeBuckets: selected,
});

/**
 * Decide how to read a group: pull the selected buckets ("include"), or pull the
 * rejected ones and subtract them from the candidates ("exclude").
 *
 * Which one is not a matter of taste. `no` is not stored, so a selection that keeps
 * the unfilled cards can only be expressed by subtracting what it rejects; and a
 * selection that rejects them can only be expressed by naming what it keeps —
 * inverting it would let the unfilled cards back in through the gap in the index.
 * Inverting is a free optimisation only where every profile is guaranteed a bucket
 * and none can hold two.
 *
 *   'include' — read `buckets`, those ids are the candidates.
 *   'exclude' — read `buckets`, subtract those ids from candidates found elsewhere.
 *   'range'   — open vocabulary; the caller queries by key range instead.
 *   'defer'   — the index cannot express this selection; leave it to the post-filter.
 *   'none'    — the selection covers everything, the group restricts nothing.
 *
 * An 'exclude' or 'defer' plan cannot produce candidates on its own — the caller
 * needs at least one 'include'/'range' plan (or the unindexed deck) to work from.
 */
export const planSearchKeyBucketRead = ({
  indexName,
  allBuckets,
  selectedBuckets = [],
  emptyBucket,
  coverage,
} = {}) => {
  const spec = getSearchKeyIndexSpec(indexName);
  const resolvedEmptyBucket = emptyBucket !== undefined ? emptyBucket : (spec.emptyBucket ?? null);
  const resolvedCoverage = coverage || spec.coverage || 'partial';

  const all = unique(allBuckets || spec.buckets || []);
  // An open vocabulary has no list to intersect against - the selection is whatever
  // the drawer asked for, and the reader turns it into key ranges.
  const selected = spec.openVocabulary
    ? unique(selectedBuckets)
    : unique(selectedBuckets).filter(bucket => all.includes(bucket));
  const rejected = all.filter(bucket => !selected.includes(bucket));
  const keepsUnfilled = Boolean(resolvedEmptyBucket) && selected.includes(resolvedEmptyBucket);

  if (spec.openVocabulary) {
    // Nothing to name: the caller queries key ranges. It can still only do so while
    // the unfilled cards are rejected - they have no key to range over.
    return keepsUnfilled
      ? buildPlan('defer', [], selected, rejected)
      : buildPlan('range', [], selected, rejected);
  }

  if (!selected.length) return buildPlan('include', [], selected, rejected);
  if (!rejected.length) return buildPlan('none', [], selected, rejected);

  const readable = buckets => buckets.filter(bucket => bucket !== resolvedEmptyBucket);

  if (resolvedEmptyBucket) {
    return keepsUnfilled
      ? buildPlan('exclude', readable(rejected), selected, rejected)
      : buildPlan('include', readable(selected), selected, rejected);
  }

  if (resolvedCoverage === 'total' && rejected.length < selected.length) {
    return buildPlan('exclude', rejected, selected, rejected, true);
  }

  return buildPlan('include', selected, selected, rejected);
};

/** Modes that can name candidates rather than only reject them. */
export const canSearchKeyPlanNameCandidates = mode => mode === 'include' || mode === 'range';
