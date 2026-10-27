import { MATCHING_CACHE_TTL_MS } from './matchingCachePolicy';
import {
  clearReactionCache,
  patchCachedReactionValue,
  readFreshReactionSnapshot,
  subscribeReactionCachePatches,
  writeReactionSnapshot,
} from './matchingReactionCache';

// Справжнє сховище, а не мок: мок `localStorage` у кількох сюїтах повертає
// `null` на все (див. CLAUDE.md), і тест мовчки перевіряв би порожнечу.
describe('кеш реакцій матчингу', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('свіжа мапа власника читається, протухла — ні', () => {
    writeReactionSnapshot('viewer', 'owner', 'favorites', { a: 1700, b: 'ed' }, { now: 1000 });
    expect(readFreshReactionSnapshot('viewer', 'owner', 'favorites', { now: 2000 })).toEqual({ a: 1700, b: 'ed' });
    expect(readFreshReactionSnapshot('viewer', 'owner', 'favorites', { now: 1001 + MATCHING_CACHE_TTL_MS })).toBeNull();
    expect(readFreshReactionSnapshot('viewer', 'owner', 'dislikes', { now: 2000 })).toBeNull();
  });

  // Ті самі мапи спільного власника видно лише тому, кому їх відкрито.
  it('привʼязаний до читача', () => {
    writeReactionSnapshot('viewer', 'owner', 'favorites', { a: 1 });
    expect(readFreshReactionSnapshot('other-viewer', 'owner', 'favorites')).toBeNull();
  });

  it('правка лягає в збережену мапу, не зсуває мітки й віддає попереднє значення', () => {
    writeReactionSnapshot('viewer', 'viewer', 'favorites', { a: 1 }, { now: 1000 });
    expect(patchCachedReactionValue('viewer', 'viewer', 'favorites', 'b', 2)).toEqual({ patched: true, previous: undefined });
    expect(patchCachedReactionValue('viewer', 'viewer', 'favorites', 'a', null)).toEqual({ patched: true, previous: 1 });
    expect(readFreshReactionSnapshot('viewer', 'viewer', 'favorites', { now: 2000 })).toEqual({ b: 2 });
    // Мітка лишилась тією, з якою мапу прочитано з бази.
    expect(readFreshReactionSnapshot('viewer', 'viewer', 'favorites', { now: 1001 + MATCHING_CACHE_TTL_MS })).toBeNull();
  });

  it('без збереженої мапи правки нема куди класти — але стрічка її чує', () => {
    const heard = [];
    const unsubscribe = subscribeReactionCachePatches(patch => heard.push(patch));
    expect(patchCachedReactionValue('viewer', 'viewer', 'dislikes', 'a', 5)).toEqual({ patched: false });
    expect(readFreshReactionSnapshot('viewer', 'viewer', 'dislikes')).toBeNull();
    patchCachedReactionValue('viewer', 'viewer', 'dislikes', 'a', false);
    unsubscribe();
    patchCachedReactionValue('viewer', 'viewer', 'dislikes', 'b', 6);
    expect(heard).toEqual([
      { viewerId: 'viewer', ownerId: 'viewer', kind: 'dislikes', cardId: 'a', value: 5 },
      { viewerId: 'viewer', ownerId: 'viewer', kind: 'dislikes', cardId: 'a', value: undefined },
    ]);
  });

  it('вихід стирає реакції всіх читачів пристрою', () => {
    writeReactionSnapshot('viewer-a', 'owner', 'favorites', { a: 1 });
    writeReactionSnapshot('viewer-b', 'owner', 'favorites', { b: 1 });
    clearReactionCache();
    expect(readFreshReactionSnapshot('viewer-a', 'owner', 'favorites')).toBeNull();
    expect(readFreshReactionSnapshot('viewer-b', 'owner', 'favorites')).toBeNull();
  });
});
