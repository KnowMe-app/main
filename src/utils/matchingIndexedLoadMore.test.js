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

  // Набір фільтрів на кшталт «крім Агентства» вміє лише відкидати: індекс не
  // називає жодного id і віддає деку послідовній пагінації. Порожня відповідь
  // тут не означає «нічого не знайшлось», і той, хто викликав, мусить бачити
  // різницю — інакше стрічка обірветься на першому ж такому фільтрі.
  it('відрізняє «індекс нічого не дав» від «плану індексу не склалось»', async () => {
    const fetchMatchingIndexedCandidates = jest.fn().mockResolvedValue({
      usedIndex: false,
      users: [],
      userIds: [],
      nextOffset: 0,
      hasMore: false,
      reason: 'exclude-only-index-plan',
    });

    const result = await collectMatchingIndexedLoadMorePage({
      requestedLimit: 5,
      initialOffset: 0,
      filters: { userRole: { ed: true, ag: false, ip: true, other: true } },
      fetchMatchingIndexedCandidates,
      hydrateUsersByIds: jest.fn(),
    });

    expect(result.usedIndex).toBe(false);
    expect(result.deferToSourcePagination).toBe(true);
    expect(result.deferReason).toBe('exclude-only-index-plan');
    expect(result.collected).toEqual([]);
  });

  it('порожня, але справжня відповідь індексу деку джерелу не віддає', async () => {
    const fetchMatchingIndexedCandidates = jest.fn().mockResolvedValue({
      usedIndex: true,
      users: [],
      userIds: [],
      nextOffset: 0,
      hasMore: false,
    });

    const result = await collectMatchingIndexedLoadMorePage({
      requestedLimit: 5,
      initialOffset: 0,
      filters: { userRole: { ag: true } },
      fetchMatchingIndexedCandidates,
      hydrateUsersByIds: jest.fn(),
    });

    expect(result.usedIndex).toBe(true);
    expect(result.deferToSourcePagination).toBe(false);
  });
});
