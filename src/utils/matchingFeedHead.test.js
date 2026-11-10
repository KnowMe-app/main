import fs from 'fs';
import path from 'path';

import {
  FEED_HEAD_PREPEND_SCROLL_LIMIT,
  prependFeedHead,
  selectFreshFeedHead,
  shouldPrependFeedHeadNow,
} from './matchingFeedHead';

const card = id => ({ userId: id });

describe('верх стрічки на відкритті з кешу', () => {
  it('бере з голови лише те, чого в деці ще немає, у порядку стрічки', () => {
    const fresh = selectFreshFeedHead({
      headUsers: [card('new1'), card('old1'), card('new2'), card('new1'), null],
      knownIds: new Set(['old1', 'old2']),
    });
    expect(fresh.map(user => user.userId)).toEqual(['new1', 'new2']);
  });

  it('нове стає нагору, а наявне вдруге не додається', () => {
    const deck = [card('old1'), card('old2')];
    expect(prependFeedHead(deck, [card('new1'), card('old2')]).map(user => user.userId))
      .toEqual(['new1', 'old1', 'old2']);
  });

  it('без нового повертає ту саму деку — React не перемальовує', () => {
    const deck = [card('old1')];
    expect(prependFeedHead(deck, [card('old1')])).toBe(deck);
  });

  it('нагору одразу — лише коли людина вгорі, інакше плашка', () => {
    expect(shouldPrependFeedHeadNow(0)).toBe(true);
    expect(shouldPrependFeedHeadNow(FEED_HEAD_PREPEND_SCROLL_LIMIT)).toBe(true);
    expect(shouldPrependFeedHeadNow(FEED_HEAD_PREPEND_SCROLL_LIMIT + 1)).toBe(false);
  });
});

describe('Matching підключає верх стрічки', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'Matching.jsx'), 'utf8');

  it('після показу деки з кешу читає голову стрічки без курсора', () => {
    const cachedBranch = source.slice(
      source.indexOf("console.log('[loadInitial] using cache', cached.length);"),
      source.indexOf('if (cacheResume.exhausted) {'),
    );
    expect(cachedBranch).toContain('await fetchChunk(INITIAL_LOAD, undefined, exclude)');
    expect(cachedBranch).toContain('selectFreshFeedHead(');
    expect(cachedBranch).toContain('setFeedHeadNewUsers(fresh)');
  });

  it('«Оновити стрічку» не скидає фільтрів, «Почати заново» — скидає', () => {
    expect(source).toContain("const refreshFeedKeepingFilters = React.useCallback(() => restartFeed({ keepFilters: true }), [restartFeed]);");
    expect(source).toContain("const resetFiltersAndCache = React.useCallback(() => restartFeed(), [restartFeed]);");
    expect(source).toContain("key: 'refreshFeed'");
    const restart = source.slice(source.indexOf('const restartFeed = React.useCallback('), source.indexOf('const resetFiltersAndCache ='));
    expect(restart).toContain("if (!keepFilters) {\n      localStorage.removeItem('matchingFilters');");
  });

  it('плашка «Нові анкети» стоїть над списком і лише в стрічці', () => {
    expect(source).toContain('data-testid="feed-head-new"');
    expect(source).toContain("{feedHeadNewUsers.length > 0 && viewMode === 'default' && (");
    // Пошук чи колекція знімають чергу: інакше плашка підмішала б у видачу чужі картки.
    expect(source).toContain("if (viewMode !== 'default') setFeedHeadNewUsers(current => (current.length ? [] : current));");
  });

  it('прийняте плашкою дописується в кешований список стрічки', () => {
    const handler = source.slice(
      source.indexOf('const showFeedHeadNewUsers = React.useCallback('),
      source.indexOf('}, [buildFeedCacheSignature, feedHeadNewUsers]);'),
    );
    expect(handler).toContain("if (!fresh.length || viewModeRef.current !== 'default') return;");
    expect(handler).toContain('setIdsForQuery(feedListKey, result.map(u => u.userId));');
  });

  // Фільтри лишились тими самими, тож ефект наданого доступу сам не
  // перезапуститься — а його картки оновлення щойно скинуло.
  it('«Оновити стрічку» перезапускає картки наданого доступу', () => {
    const restart = source.slice(source.indexOf('const restartFeed = React.useCallback('), source.indexOf('const resetFiltersAndCache ='));
    expect(restart).toContain('if (keepFilters) setAccessScopedReloadToken(prev => prev + 1);');
    expect(source).toContain('  }, [\n    accessScopedReloadToken,\n    announcePublicFeedUnavailable,');
  });
});
