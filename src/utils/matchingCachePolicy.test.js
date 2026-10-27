import { CACHE_TTL_MS } from './cacheConstants';
import {
  MATCHING_CACHE_TTL_MS,
  isMatchingCacheFresh,
  readTimedCacheEntry,
  removeCacheEntriesByPrefix,
  writeTimedCacheEntry,
} from './matchingCachePolicy';

// Справжнє сховище, а не мок: мок `localStorage` у кількох сюїтах повертає
// `null` на все (див. CLAUDE.md), і тест мовчки перевіряв би порожнечу.
describe('загальне правило кеша матчингу', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('свіжість одна на всі шари — шість годин', () => {
    expect(MATCHING_CACHE_TTL_MS).toBe(6 * 60 * 60 * 1000);
    expect(MATCHING_CACHE_TTL_MS).toBe(CACHE_TTL_MS);
  });

  it('свіже — записане не раніше як TTL тому; без мітки кеша немає', () => {
    expect(isMatchingCacheFresh(1000, { now: 1000 + MATCHING_CACHE_TTL_MS })).toBe(true);
    expect(isMatchingCacheFresh(1000, { now: 1001 + MATCHING_CACHE_TTL_MS })).toBe(false);
    expect(isMatchingCacheFresh(0, { now: 1 })).toBe(false);
    expect(isMatchingCacheFresh(undefined)).toBe(false);
    expect(isMatchingCacheFresh('abc')).toBe(false);
  });

  it('запис з міткою читається, поки свіжий, і зникає, щойно протух', () => {
    writeTimedCacheEntry('km.test', { keys: ['a'] }, { now: 1000 });
    expect(readTimedCacheEntry('km.test', { now: 2000 })).toEqual({ keys: ['a'], cachedAt: 1000 });
    expect(readTimedCacheEntry('km.test', { now: 1001 + MATCHING_CACHE_TTL_MS })).toBeNull();
  });

  it('зіпсований запис — це відсутність кеша, а не помилка', () => {
    window.localStorage.setItem('km.test', '{oops');
    expect(readTimedCacheEntry('km.test')).toBeNull();
  });

  it('стирає записи за префіксом і лишає решту сховища', () => {
    writeTimedCacheEntry('km.a:1', { v: 1 });
    writeTimedCacheEntry('km.a:2', { v: 2 });
    window.localStorage.setItem('appLanguage', 'uk');
    removeCacheEntriesByPrefix('km.a:');
    expect(window.localStorage.getItem('km.a:1')).toBeNull();
    expect(window.localStorage.getItem('km.a:2')).toBeNull();
    expect(window.localStorage.getItem('appLanguage')).toBe('uk');
  });
});
