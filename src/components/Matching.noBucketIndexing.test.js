const fs = require('fs');
const path = require('path');

const configSource = () => fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const matchingDataProviderSource = () => fs.readFileSync(path.join(__dirname, '../utils/matchingDataProvider.js'), 'utf8');
const searchKeyBucketsSource = () => fs.readFileSync(path.join(__dirname, '../utils/searchKeyBuckets.js'), 'utf8');

// `no` used to hold ~90% of every index and was the single biggest thing the app
// downloaded. It is not written any more: "поле не заповнене" is the absence of the
// id. These tests pin the three places that has to hold true at once - the writers,
// the read plan, and the per-card check - because a regression in any one of them
// silently drops the majority of the deck instead of failing loudly.
describe('searchKey `no` bucket is neither written nor read', () => {
  it('strips the empty bucket from every value the writers send', () => {
    const source = configSource();

    expect(source).toContain('const nextValues = withoutEmptySearchKeyBucket(getBloodIndexSet(nextData), BLOOD_SEARCH_KEY_INDEX);');
    expect(source).toContain('withoutEmptySearchKeyBucket(getMaritalStatusIndexSet(nextData), MARITAL_STATUS_SEARCH_KEY_INDEX)');
    expect(source).toContain('withoutEmptySearchKeyBucket(getRoleIndexSet(user), ROLE_SEARCH_KEY_INDEX)');
    expect(source).toContain('withoutEmptySearchKeyBucket(getAgeIndexSet(user), AGE_SEARCH_KEY_INDEX)');
    // lastAction/getInTouch build a single bucket string rather than a set.
    expect(source).toContain('if (bucket === SEARCH_KEY_EMPTY_BUCKET) return acc;');
  });

  it('replaces an index node on rebuild so a reindex leaves nothing stale behind', () => {
    const source = configSource();

    expect(source).toContain('const resetSearchKeyIndexNodes = async (searchKeyRoot, indexNames = []) => {');
    expect(source).toContain('await resetSearchKeyIndexNodes(searchKeyRoot, [BLOOD_SEARCH_KEY_INDEX]);');
    expect(source).toContain('await resetSearchKeyIndexNodes(searchKeyRoot, [IMT_SEARCH_KEY_INDEX, HEIGHT_SEARCH_KEY_INDEX, WEIGHT_SEARCH_KEY_INDEX]);');
  });

  it('routes each collection to exactly one index root', () => {
    const source = configSource();

    expect(source).toContain('export const resolveSearchKeyRootForCollection = collection =>');
    expect(source).toContain("(collection === 'users' ? SEARCH_KEY_USERS_INDEX_ROOT : SEARCH_KEY_INDEX_ROOT);");
    expect(source).toContain('export const resolveSearchKeyRootForUserId = userId =>');
    expect(source).not.toContain("const searchKeyRoot = options?.rootPath || SEARCH_KEY_INDEX_ROOT;");
  });

  it('plans reads so the unstored bucket is never requested', () => {
    const source = searchKeyBucketsSource();

    expect(source).toContain("export const SEARCH_KEY_EMPTY_BUCKET = 'no';");
    expect(source).toContain('const readable = buckets => buckets.filter(bucket => bucket !== resolvedEmptyBucket);');
    expect(source).toContain("? buildPlan('exclude', readable(rejected), selected, rejected)");
    expect(source).toContain(": buildPlan('include', readable(selected), selected, rejected);");
  });

  it('reads a group forwards or backwards according to its plan', () => {
    const source = configSource();

    expect(source).toContain('const withSearchKeyReadPlan = group => {');
    expect(source).toContain("const passesOnHit = readMode !== 'exclude';");
    expect(source).toContain("const isBroadSearchKeyPointGroup = group => group?.readMode === 'defer' || group?.readMode === 'range';");
  });

  it('never lets an exclusion plan be read as an inclusion in searchKeySets', () => {
    const source = fs.readFileSync(path.join(__dirname, '../utils/newUsersFilterSetsIndex.js'), 'utf8');

    expect(source).toContain("const useExcludeStrategy = readMode === 'exclude';");
    expect(source).toContain('(useExcludeStrategy && (planBuckets.length === 0 || filterSets.length === 0))');
    // A drawer filter the index cannot express must widen the deck, never zero an
    // access rule - so it is dropped, not read.
    expect(source).toContain("if (readMode === 'none' || readMode === 'defer') {");
  });

  it('materialises the empty bucket inside searchKeySets, where an access rule names it', () => {
    const source = fs.readFileSync(path.join(__dirname, '../utils/newUsersFilterSetsIndex.js'), 'utf8');

    expect(source).toContain('const emptyBucket = getSearchKeyEmptyBucket(fieldName);');
    expect(source).toContain('result[fieldName][emptyBucket][userId] = true;');
    expect(source).toContain("collectAgeIdsByFilters(ageFilterMap, [rootPath], { emptyBucketStored: true })");
  });

  it('gives bmi and country a written index instead of leaving them to the post-filter', () => {
    const source = configSource();

    expect(source).toContain("const BMI_SEARCH_KEY_INDEX = 'bmi';");
    expect(source).toContain("const COUNTRY_SEARCH_KEY_INDEX = 'country';");
    expect(source).toContain('export const createBmiSearchKeyIndexInCollection =');
    expect(source).toContain('export const createCountrySearchKeyIndexInCollection =');
    // One rule for the derived value, shared with the post-filter.
    expect(source).toContain('const getBmiCategory = value => resolveBmiBucket(value);');
    expect(source).toContain('const getCountryCategory = value => resolveCountryBucket(value);');
  });

  it('builds role and marital status buckets from the shared vocabulary', () => {
    const source = matchingDataProviderSource();

    expect(source).toContain('const buildAllowedBucketsFromFilterGroup = (group, allBuckets = [], bucketMap = {}) =>');
    expect(source).toContain('selectSearchKeyBuckets(group, allBuckets, { bucketMap })');
    expect(source).toContain('const buckets = buildAllowedBucketsFromFilterGroup(roleFilters, ROLE_BUCKETS, ROLE_BUCKET_FILTER_KEYS);');
    expect(source).toContain('const buildMaritalStatusBuckets = filters => buildAllowedBucketsFromFilterGroup(');
    expect(source).toContain('MARITAL_STATUS_BUCKET_MAP');
  });
});
