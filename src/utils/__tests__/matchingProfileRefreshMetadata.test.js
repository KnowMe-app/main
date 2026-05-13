import {
  buildFallbackProfileRefreshMetadata,
  buildProfilePaginationInvalidationReasons,
} from '../matchingProfileRefreshMetadata';

const signature = value => JSON.stringify(value ?? '');
const rulesSignature = rawRules => signature(String(rawRules || ''));
const keysSignature = keys => signature([...(keys || [])].sort());
const snapshotKey = ({ accessUserId, rawRules, searchKeySetKeys }) => signature({
  accessUserId,
  rawRules: rawRules || '',
  searchKeySetKeys: [...(searchKeySetKeys || [])].sort(),
});
const parseRules = rawRules => rawRules ? [{ rawRules }] : [];

describe('matching profile refresh metadata', () => {
  it('invalidates pagination when fallback rules/search key snapshot differs from cached metadata', () => {
    const cached = {
      accessUserId: 'viewer-1',
      rawRules: 'old-rules',
      searchKeySetsOfExactUser: ['viewer-1_old'],
      rawRulesSignature: rulesSignature('old-rules'),
      searchKeySetsOfExactUserSignature: keysSignature(['viewer-1_old']),
      collectionSource: 'newUsers',
      accessSnapshotKey: snapshotKey({
        accessUserId: 'viewer-1',
        rawRules: 'old-rules',
        searchKeySetKeys: ['viewer-1_old'],
      }),
    };

    const fallback = buildFallbackProfileRefreshMetadata({
      cached,
      latestCache: cached,
      state: {
        currentAdditionalAccessRules: 'new-restrictive-rules',
        currentSearchKeySetKeys: ['viewer-1_new'],
        collectionSource: 'newUsers',
      },
      normalizedAccessUserId: 'viewer-1',
      staleReasons: ['force-refresh'],
      requestVersion: 3,
      latestRequestVersion: 3,
      profilePath: 'fetchUserById(viewer-1)',
      buildAccessSnapshotKey: snapshotKey,
      parseRules,
      getRawRulesSignature: rulesSignature,
      getSearchKeySetsOfExactUserSignature: keysSignature,
    });

    expect(fallback.rawRules).toBe('new-restrictive-rules');
    expect(fallback.searchKeySetsOfExactUser).toEqual(['viewer-1_new']);
    expect(fallback.paginationInvalidationReasons).toEqual(expect.arrayContaining([
      'rawRulesSignature-changed',
      'searchKeySetsOfExactUserSignature-changed',
      'accessSnapshotKey-changed',
    ]));
    expect(fallback.paginationInvalidationReasons.length).toBeGreaterThan(0);
  });

  it('returns the latest cache instead of building stale fallback metadata for late failed/null refreshes', () => {
    const oldCached = {
      accessUserId: 'viewer-1',
      rawRules: 'old-rules',
      searchKeySetsOfExactUser: ['viewer-1_old'],
      rawRulesSignature: rulesSignature('old-rules'),
      searchKeySetsOfExactUserSignature: keysSignature(['viewer-1_old']),
      collectionSource: 'newUsers',
      accessSnapshotKey: snapshotKey({
        accessUserId: 'viewer-1',
        rawRules: 'old-rules',
        searchKeySetKeys: ['viewer-1_old'],
      }),
    };
    const latestCache = {
      accessUserId: 'viewer-1',
      rawRules: 'new-rules-from-request-b',
      searchKeySetsOfExactUser: ['viewer-1_new'],
      rawRulesSignature: rulesSignature('new-rules-from-request-b'),
      searchKeySetsOfExactUserSignature: keysSignature(['viewer-1_new']),
      collectionSource: 'newUsers',
      accessSnapshotKey: snapshotKey({
        accessUserId: 'viewer-1',
        rawRules: 'new-rules-from-request-b',
        searchKeySetKeys: ['viewer-1_new'],
      }),
    };

    const fallback = buildFallbackProfileRefreshMetadata({
      cached: oldCached,
      latestCache,
      state: {
        currentAdditionalAccessRules: 'old-captured-request-a-rules',
        currentSearchKeySetKeys: ['viewer-1_request_a'],
        collectionSource: 'newUsers',
      },
      normalizedAccessUserId: 'viewer-1',
      staleReasons: ['force-refresh'],
      requestVersion: 4,
      latestRequestVersion: 5,
      profilePath: 'fetchUserById(viewer-1)',
      buildAccessSnapshotKey: snapshotKey,
      parseRules,
      getRawRulesSignature: rulesSignature,
      getSearchKeySetsOfExactUserSignature: keysSignature,
    });

    expect(fallback.rawRules).toBe('new-rules-from-request-b');
    expect(fallback.searchKeySetsOfExactUser).toEqual(['viewer-1_new']);
    expect(fallback.staleResponse).toBe(true);
    expect(fallback.staleFallbackIgnored).toBe(true);
  });

  it('uses the same invalidation comparison for successful refresh metadata', () => {
    const cached = {
      accessUserId: 'viewer-1',
      rawRulesSignature: rulesSignature('old-rules'),
      searchKeySetsOfExactUserSignature: keysSignature(['viewer-1_old']),
      collectionSource: 'newUsers',
      accessSnapshotKey: snapshotKey({
        accessUserId: 'viewer-1',
        rawRules: 'old-rules',
        searchKeySetKeys: ['viewer-1_old'],
      }),
    };

    expect(buildProfilePaginationInvalidationReasons({
      cached,
      metadata: {
        accessUserId: 'viewer-1',
        rawRulesSignature: rulesSignature('new-rules'),
        searchKeySetsOfExactUserSignature: keysSignature(['viewer-1_new']),
        collectionSource: 'newUsers',
      },
      accessSnapshotKey: snapshotKey({
        accessUserId: 'viewer-1',
        rawRules: 'new-rules',
        searchKeySetKeys: ['viewer-1_new'],
      }),
    })).toEqual(expect.arrayContaining([
      'rawRulesSignature-changed',
      'searchKeySetsOfExactUserSignature-changed',
      'accessSnapshotKey-changed',
    ]));
  });
});
