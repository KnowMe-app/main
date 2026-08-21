// Single source of truth for the searchKey index vocabulary.
//
// The same bucket names are produced by the index writers in `components/config.js`
// and consumed by the Matching index reader in `utils/matchingDataProvider.js`.
// Keeping two private copies of these lists is what made the Matching filters
// silently drop cards: a bucket the reader did not know about (`+`/`-` for a known
// Rh without a blood group, `sm`/`pp`/`cl` roles) or a bucket whose checkbox the
// Matching drawer never renders (`no` — "поле не заповнене") was treated as
// "not selected" and its cards disappeared from the deck.
//
// Two rules make the reader agree with the post-filter that runs on hydrated cards:
//
//   1. A bucket whose filter key the group does not offer at all is NOT a reason to
//      exclude a card. It falls back to the group's catch-all option ("?" / other),
//      exactly like the post-filter categorisers, and is allowed outright when the
//      group offers no catch-all either.
//   2. Selections that keep most of the vocabulary are read as an exclusion instead
//      of a union, so the huge buckets (`no` holds ~90% of the profiles) never go
//      over the wire.

export const SEARCH_KEY_NO_BUCKET = 'no';
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

// Bucket -> filter option key, per index. Buckets missing from a map keep their own name.
export const MARITAL_STATUS_BUCKET_FILTER_KEYS = { '+': 'married', '-': 'unmarried', '?': 'other', no: 'empty' };
export const ROLE_BUCKET_FILTER_KEYS = { '?': 'other', no: 'empty' };
export const IMT_BUCKET_FILTER_KEYS = { '?': 'other' };
export const AGE_BUCKET_FILTER_KEYS = { '?': 'other', no: 'empty' };

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
 * node under `searchKey/<root>/<index>/`. Rule 1 above: an option the drawer does not
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

// Buckets that hold a large share of every collection. Reading one of them costs
// hundreds of kilobytes, so a selection that merely tolerates them is answered with
// an exclusion read instead of a union read.
export const BULK_SEARCH_KEY_BUCKETS = new Set([SEARCH_KEY_NO_BUCKET, SEARCH_KEY_UNKNOWN_BUCKET]);

/**
 * Decide how to read a group: pull the selected buckets ("include"), or pull the
 * rejected ones and subtract them from the candidates ("exclude").
 *
 * Exclude wins when the selection contains a bulk bucket, or when it simply covers
 * more nodes than the rejection does. An exclude plan cannot produce candidates on
 * its own — the caller needs at least one include plan (or the unindexed deck) to
 * subtract from.
 */
export const planSearchKeyBucketRead = ({ allBuckets = [], selectedBuckets = [] } = {}) => {
  const all = [...new Set((allBuckets || []).map(String))];
  const selected = [...new Set((selectedBuckets || []).map(String))].filter(bucket => all.includes(bucket));
  const excluded = all.filter(bucket => !selected.includes(bucket));

  if (!selected.length) return { mode: 'include', buckets: [], selectedBuckets: [], excludedBuckets: excluded };
  if (!excluded.length) return { mode: 'none', buckets: [], selectedBuckets: selected, excludedBuckets: [] };

  const selectionHoldsBulkBucket = selected.some(bucket => BULK_SEARCH_KEY_BUCKETS.has(bucket));
  const exclusionHoldsBulkBucket = excluded.some(bucket => BULK_SEARCH_KEY_BUCKETS.has(bucket));

  const preferExclude = selectionHoldsBulkBucket
    ? !exclusionHoldsBulkBucket
    : !exclusionHoldsBulkBucket && excluded.length < selected.length;

  return preferExclude
    ? { mode: 'exclude', buckets: excluded, selectedBuckets: selected, excludedBuckets: excluded }
    : { mode: 'include', buckets: selected, selectedBuckets: selected, excludedBuckets: excluded };
};
