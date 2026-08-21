import {
  BLOOD_SEARCH_KEY_BUCKETS,
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
      allBuckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
      selectedBuckets: ['+', '?', 'no'],
    });

    expect(plan.mode).toBe('exclude');
    expect(plan.buckets).toEqual(['-']);
  });

  it('reads the selected buckets when the bulk buckets are rejected', () => {
    const plan = planSearchKeyBucketRead({
      allBuckets: BLOOD_SEARCH_KEY_BUCKETS,
      selectedBuckets: ['1+', '1-', '1'],
    });

    expect(plan.mode).toBe('include');
    expect(plan.buckets).toEqual(['1+', '1-', '1']);
  });

  it('reports nothing to read when the selection covers the whole vocabulary', () => {
    const plan = planSearchKeyBucketRead({
      allBuckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
      selectedBuckets: MARITAL_STATUS_SEARCH_KEY_BUCKETS,
    });

    expect(plan.mode).toBe('none');
    expect(plan.buckets).toEqual([]);
  });

  it('prefers the smaller side when neither holds a bulk bucket', () => {
    const plan = planSearchKeyBucketRead({
      allBuckets: ['a', 'b', 'c', 'd'],
      selectedBuckets: ['a', 'b', 'c'],
    });

    expect(plan.mode).toBe('exclude');
    expect(plan.buckets).toEqual(['d']);
  });
});
