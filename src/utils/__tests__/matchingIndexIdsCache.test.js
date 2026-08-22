import {
  MATCHING_INDEX_CACHE_VERSION,
  MATCHING_QUERY_MAX_IDS,
  getIndexIdsByQuery,
  setIndexIdsForQuery,
} from '../cardIndex';

const makeIds = count => Array.from({ length: count }, (unused, index) => `user-${String(index).padStart(6, '0')}`);

const save = (key, ids) => setIndexIdsForQuery(key, ids, {
  complete: true,
  cacheVersion: MATCHING_INDEX_CACHE_VERSION,
  meta: { filterSignature: 'sig', collectionSource: 'users', ownerId: '', accessUserId: '' },
});

describe('кеш списку кандидатів індексу', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('віддає список, який помістився цілком', () => {
    save('q', makeIds(50));
    const cached = getIndexIdsByQuery('q', { requiredComplete: true });
    expect(cached?.ids).toHaveLength(50);
    expect(cached?.complete).toBe(true);
  });

  it('не називає обрізаний список повним', () => {
    // Обіцянка «повний» — це те, на що спирається пагінація: читач нарізає кеш
    // на сторінки і зупиняється, коли той скінчився. Позначити обрізаний список
    // повним означало б відрубати деці хвіст на весь TTL.
    save('q', makeIds(MATCHING_QUERY_MAX_IDS + 500));

    const stored = getIndexIdsByQuery('q', { requiredComplete: false });
    expect(stored?.ids).toHaveLength(MATCHING_QUERY_MAX_IDS);
    expect(stored?.complete).toBe(false);

    // А отже, читач, якому потрібен саме повний список, його тут не знайде і
    // піде читати бакети заново.
    expect(getIndexIdsByQuery('q', { requiredComplete: true })).toBeNull();
  });

  it('віддає рівно межу як повний список', () => {
    save('q', makeIds(MATCHING_QUERY_MAX_IDS));
    const cached = getIndexIdsByQuery('q', { requiredComplete: true });
    expect(cached?.ids).toHaveLength(MATCHING_QUERY_MAX_IDS);
    expect(cached?.complete).toBe(true);
  });

  it('не віддає запис чужої версії схеми кеша', () => {
    setIndexIdsForQuery('q', makeIds(10), { complete: true, cacheVersion: MATCHING_INDEX_CACHE_VERSION + 1 });
    expect(getIndexIdsByQuery('q', { requiredComplete: true })).toBeNull();
  });

  it('не віддає запис, знятий з іншого набору фільтрів', () => {
    save('q', makeIds(10));
    const mismatch = getIndexIdsByQuery('q', {
      requiredComplete: true,
      expectedMeta: { filterSignature: 'інша', collectionSource: 'users', ownerId: '', accessUserId: '' },
    });
    expect(mismatch).toBeNull();
  });
});
