import { collectMatchingIndexedLoadMorePage } from './matchingIndexedLoadMore';

describe('collectMatchingIndexedLoadMorePage', () => {
  it('добирає другу indexed page після stale/already loaded role/ag IDs без source pagination', async () => {
    const alreadyLoadedId = 'loaded-ag-user-0000000001';
    const staleId = 'stale-ag-user-00000000001';
    const validId = 'valid-ag-user-00000000001';
    const loadedIds = new Set([alreadyLoadedId]);
    const fetchChunk = jest.fn();
    const fetchMatchingIndexedCandidates = jest
      .fn()
      .mockResolvedValueOnce({
        users: [],
        userIds: [staleId, alreadyLoadedId],
        nextOffset: 2,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        users: [{ userId: validId, role: 'ag' }],
        userIds: [validId],
        nextOffset: 3,
        hasMore: false,
      });

    const result = await collectMatchingIndexedLoadMorePage({
      requestedLimit: 1,
      initialOffset: 0,
      maxPages: 5,
      baseExclude: ['favorite-ag-user-0000001'],
      loadedIds,
      filters: { userRole: { ag: true, ed: false } },
      viewMode: 'default',
      ownerId: 'owner-id',
      fetchMatchingIndexedCandidates,
      hydrateUsersByIds: jest.fn(),
      isLatestLoadMore: () => true,
    });

    expect(result.collected).toEqual([{ userId: validId, role: 'ag' }]);
    expect(result.finalOffset).toBe(3);
    expect(result.finalHasMore).toBe(false);
    expect(result.cursorStuck).toBe(false);
    expect(fetchMatchingIndexedCandidates).toHaveBeenCalledTimes(2);
    expect(fetchMatchingIndexedCandidates).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        offset: 0,
        excludeIds: expect.arrayContaining(['favorite-ag-user-0000001', alreadyLoadedId]),
      })
    );
    expect(fetchMatchingIndexedCandidates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        offset: 2,
        excludeIds: expect.arrayContaining(['favorite-ag-user-0000001', alreadyLoadedId]),
      })
    );
    expect(fetchChunk).not.toHaveBeenCalled();
  });
});
