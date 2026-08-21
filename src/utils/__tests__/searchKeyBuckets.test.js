import {
  BLOOD_SEARCH_KEY_BUCKETS,
  CONTACT_SEARCH_KEY_BUCKETS,
  MARITAL_STATUS_BUCKET_FILTER_KEYS,
  MARITAL_STATUS_SEARCH_KEY_BUCKETS,
  ROLE_BUCKET_FILTER_KEYS,
  ROLE_SEARCH_KEY_BUCKETS,
  isBucketSelectedByFilterGroup,
  planSearchKeyBucketRead,
  selectSearchKeyBuckets,
} from '../searchKeyBuckets';

// The Matching drawer renders four role options and no "поле не заповнене" one, so
// the buckets it never names (`no`, and the sm/pp/cl roles) have to follow "?".
const MATCHING_ROLE_GROUP = { ed: true, ag: true, ip: true, other: true };
const MATCHING_MARITAL_GROUP = { married: true, unmarried: true, other: true };

describe('isBucketSelectedByFilterGroup', () => {
  it('falls back to the "?" option for buckets the group has no checkbox for', () => {
    expect(isBucketSelectedByFilterGroup({ ...MATCHING_ROLE_GROUP }, 'no', { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toBe(true);
    expect(isBucketSelectedByFilterGroup({ ...MATCHING_ROLE_GROUP, other: false }, 'no', { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toBe(false);
    expect(isBucketSelectedByFilterGroup({ ...MATCHING_ROLE_GROUP }, 'sm', { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toBe(true);
    expect(isBucketSelectedByFilterGroup({ ...MATCHING_ROLE_GROUP, other: false }, 'sm', { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toBe(false);
  });

  it('prefers an explicit option over the fallback', () => {
    const groupWithEmpty = { ...MATCHING_ROLE_GROUP, empty: false };
    expect(isBucketSelectedByFilterGroup(groupWithEmpty, 'no', { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toBe(false);
    expect(isBucketSelectedByFilterGroup({ ...groupWithEmpty, empty: true, other: false }, 'no', { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toBe(true);
  });

  it('keeps a bucket when the group offers neither the option nor a fallback', () => {
    expect(isBucketSelectedByFilterGroup({ ag: true, ed: false }, 'pp')).toBe(true);
  });
});

describe('selectSearchKeyBuckets', () => {
  it('is inert while every option is still on', () => {
    expect(selectSearchKeyBuckets({ ...MATCHING_ROLE_GROUP }, ROLE_SEARCH_KEY_BUCKETS, { bucketMap: ROLE_BUCKET_FILTER_KEYS })).toEqual([]);
  });

  it('keeps the unfilled cards that the "?" option stands for', () => {
    const buckets = selectSearchKeyBuckets(
      { ...MATCHING_ROLE_GROUP, ag: false },
      ROLE_SEARCH_KEY_BUCKETS,
      { bucketMap: ROLE_BUCKET_FILTER_KEYS },
    );

    expect(buckets).toContain('no');
    expect(buckets).toContain('sm');
    expect(buckets).not.toContain('ag');
  });

  it('drops the unfilled cards once "?" is switched off', () => {
    const buckets = selectSearchKeyBuckets(
      { ...MATCHING_MARITAL_GROUP, other: false },
      MARITAL_STATUS_SEARCH_KEY_BUCKETS,
      { bucketMap: MARITAL_STATUS_BUCKET_FILTER_KEYS },
    );

    expect(buckets).toEqual(['+', '-']);
  });
});

describe('planSearchKeyBucketRead', () => {
  it('reads the rejected buckets when the selection keeps a bulk bucket', () => {
    const plan = planSearchKeyBucketRead({
      indexName: 'maritalStatus',
      allBuckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
      selectedBuckets: ['+', '?', 'no'],
    });

    expect(plan.mode).toBe('exclude');
    expect(plan.buckets).toEqual(['-']);
  });

  it('reads the selected buckets when the bulk buckets are rejected', () => {
    const plan = planSearchKeyBucketRead({
      indexName: 'blood',
      allBuckets: BLOOD_SEARCH_KEY_BUCKETS,
      selectedBuckets: ['1+', '1-', '1'],
    });

    expect(plan.mode).toBe('include');
    expect(plan.buckets).toEqual(['1+', '1-', '1']);
  });

  it('reports nothing to read when the selection covers the whole vocabulary', () => {
    const plan = planSearchKeyBucketRead({
      indexName: 'maritalStatus',
      allBuckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
      selectedBuckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
    });

    expect(plan.mode).toBe('none');
    expect(plan.buckets).toEqual([]);
  });

  it('inverts a wide selection only where every card is guaranteed a bucket', () => {
    const total = planSearchKeyBucketRead({
      allBuckets: ['a', 'b', 'c', 'd'],
      selectedBuckets: ['a', 'b', 'c'],
      emptyBucket: null,
      coverage: 'total',
    });

    expect(total.mode).toBe('exclude');
    expect(total.buckets).toEqual(['d']);

    // A card can sit in several contact buckets, so subtracting "no vk" would drop
    // cards that are also on telegram. Such an index is only ever read forwards.
    const partial = planSearchKeyBucketRead({
      indexName: 'contact',
      selectedBuckets: CONTACT_SEARCH_KEY_BUCKETS.filter(bucket => bucket !== 'vk'),
    });

    expect(partial.mode).toBe('include');
    expect(partial.buckets).not.toContain('vk');
  });

  it('never names the unstored `no` bucket in a read', () => {
    const plan = planSearchKeyBucketRead({
      indexName: 'role',
      selectedBuckets: ['ed', 'ag', 'ip', 'sm', 'pp', 'cl', '?', 'no'].filter(bucket => bucket !== 'ag'),
    });

    expect(plan.mode).toBe('exclude');
    expect(plan.buckets).toEqual(['ag']);
    expect(plan.buckets).not.toContain('no');
  });

  it('queries an open vocabulary by range, and gives up when it must keep the unfilled cards', () => {
    expect(planSearchKeyBucketRead({ indexName: 'age', selectedBuckets: ['le25', '26_30'] }).mode).toBe('range');
    expect(planSearchKeyBucketRead({ indexName: 'age', selectedBuckets: ['le25', 'no'] }).mode).toBe('defer');
  });
});
