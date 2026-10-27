import { isMatchingLocalStorageCacheKey } from './cardIndex';
import { MATCHING_CACHE_TTL_MS } from './matchingCachePolicy';
import {
  MATCHING_FEED_SNAPSHOT_KEY,
  clearPersistedFeedSnapshot,
  readPersistedFeedSnapshot,
  writePersistedFeedSnapshot,
} from './matchingFeedSnapshot';

// Справжнє сховище, а не мок: мок `localStorage` у кількох сюїтах повертає
// `null` на все (див. CLAUDE.md), і тест мовчки перевіряв би порожнечу.
describe('остання дека стрічки на пристрої', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useRealTimers();
  });

  it('повертає id деки тому самому читачеві й нікому іншому', () => {
    writePersistedFeedSnapshot({ ownerId: 'uid-a', ids: ['c1', 'c2', 'c1', ''] });
    expect(readPersistedFeedSnapshot('uid-a')).toEqual(expect.objectContaining({ ownerId: 'uid-a', ids: ['c1', 'c2'] }));
    expect(readPersistedFeedSnapshot('uid-b')).toBeNull();
  });

  it('протухлий знімок не показується', () => {
    jest.useFakeTimers().setSystemTime(1000);
    writePersistedFeedSnapshot({ ownerId: 'uid-a', ids: ['c1'] });
    jest.setSystemTime(1001 + MATCHING_CACHE_TTL_MS);
    expect(readPersistedFeedSnapshot('uid-a')).toBeNull();
    jest.useRealTimers();
  });

  // «Почати стрічку заново» і зміна ролі скидають кеш матчингу — і знімок
  // мусить піти разом з ним, інакше скинута дека поверталась би звідси.
  it('лежить під ключем, який стирає скид кеша матчингу', () => {
    expect(isMatchingLocalStorageCacheKey(MATCHING_FEED_SNAPSHOT_KEY)).toBe(true);
  });

  it('стирається на вихід', () => {
    writePersistedFeedSnapshot({ ownerId: 'uid-a', ids: ['c1'] });
    clearPersistedFeedSnapshot();
    expect(readPersistedFeedSnapshot('uid-a')).toBeNull();
  });
});
