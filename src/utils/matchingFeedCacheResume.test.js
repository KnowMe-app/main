import {
  buildFeedListKey,
  composeCachedCards,
  FEED_LIST_MAX_KEYS,
  getQueryEntry,
  loadQueries,
  setCachedMatchingSummaryCards,
  setIdsForQuery,
  setQueryPagination,
  TTL_MS,
} from './cardIndex';
import { updateCard } from './cardsStorage';
import { normalizeFeedCursor, resolveFeedCacheResume } from './matchingFeedCacheResume';

const NOW = 1_800_000_000_000;
const cursor = { date: '2026-09-01', userId: 'userId000000000000000001' };

describe('resolveFeedCacheResume', () => {
  it('довіряє стану, записаному за тієї самої умови', () => {
    expect(resolveFeedCacheResume({
      pagination: { cursor, hasMore: true, signature: 'a', savedAt: NOW - 1000 },
      signature: 'a',
      now: NOW,
    })).toEqual({ usable: true, exhausted: false, cursor });
  });

  it('дочитана до кінця стрічка не питає бекенд, навіть без курсора', () => {
    // Саме так виглядає вузька дека: дві картки під фільтрами й кінець
    // джерела. Доти кожне перезавантаження обходило `matchingCards` з початку.
    expect(resolveFeedCacheResume({
      pagination: { cursor: null, hasMore: false, signature: 'a', savedAt: NOW },
      signature: 'a',
      now: NOW,
    })).toEqual({ usable: true, exhausted: true, cursor: null });
  });

  it('не бере стан, отриманий за інших фільтрів чи ролі', () => {
    expect(resolveFeedCacheResume({
      pagination: { cursor, hasMore: false, signature: 'a', savedAt: NOW },
      signature: 'b',
      now: NOW,
    }).usable).toBe(false);
  });

  it('не бере стан, старший за TTL', () => {
    expect(resolveFeedCacheResume({
      pagination: { cursor, hasMore: false, signature: 'a', savedAt: NOW - TTL_MS - 1 },
      signature: 'a',
      now: NOW,
    }).usable).toBe(false);
  });

  it('незакінчена стрічка без курсора продовжуватись не може', () => {
    expect(resolveFeedCacheResume({
      pagination: { cursor: 5, hasMore: true, signature: 'a', savedAt: NOW },
      signature: 'a',
      now: NOW,
    }).usable).toBe(false);
  });

  it('курсором джерела є лише пара (дата, id)', () => {
    expect(normalizeFeedCursor(cursor)).toEqual(cursor);
    expect(normalizeFeedCursor(12)).toBeNull();
    expect(normalizeFeedCursor({ date: '2026-09-01' })).toBeNull();
    expect(normalizeFeedCursor(null)).toBeNull();
  });
});

describe('стан пагінації стрічки в кеші', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('переживає перезапис списку id', () => {
    setIdsForQuery('default', ['a1']);
    setQueryPagination('default', { cursor, hasMore: true, signature: 's' });
    setIdsForQuery('default', ['a1', 'a2']);

    const entry = getQueryEntry('default');
    expect(entry.ids).toEqual(['a1', 'a2']);
    expect(entry.pagination).toMatchObject({ cursor, hasMore: true, signature: 's' });
    expect(typeof entry.pagination.savedAt).toBe('number');
  });

  it('читає id стрічки без звірки з кешем повних анкет', () => {
    // Рядки стрічки — проєкції, в `cards` їх немає; `getQueryEntry` колись
    // викидав такі id, і список стрічки після перезавантаження був порожнім.
    setIdsForQuery('default', ['projectionOnly1', 'projectionOnly2']);
    expect(getQueryEntry('default').ids).toEqual(['projectionOnly1', 'projectionOnly2']);
  });

  it('знімається через null', () => {
    setIdsForQuery('default', ['a1']);
    setQueryPagination('default', { cursor, hasMore: true, signature: 's' });
    setQueryPagination('default', null);
    const entry = getQueryEntry('default');
    expect(entry.pagination).toBeNull();
    expect(entry.ids).toEqual(['a1']);
  });
});

describe('composeCachedCards', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ownerId', 'viewer-owner');
  });

  it('складає список з обох сховищ, а бракує — називає', () => {
    updateCard('fullOnly', { name: 'Повна' });
    setCachedMatchingSummaryCards({ summaryOnly: { userId: 'summaryOnly', name: 'Проєкція', __matchingSummary: true } });

    const { cards, missingIds } = composeCachedCards(['fullOnly', 'summaryOnly', 'nowhere']);

    expect(cards.fullOnly.name).toBe('Повна');
    expect(cards.summaryOnly.name).toBe('Проєкція');
    expect(missingIds).toEqual(['nowhere']);
  });

  it('для редагування проєкцію не віддає', () => {
    setCachedMatchingSummaryCards({ summaryOnly: { userId: 'summaryOnly', __matchingSummary: true } });
    expect(composeCachedCards(['summaryOnly'], { allowProjections: false }).missingIds).toEqual(['summaryOnly']);
  });

  it('свіжіша проєкція перебиває старішу повну анкету', () => {
    const realNow = Date.now;
    try {
      Date.now = () => 1_000_000;
      updateCard('both', { name: 'Стара анкета' });
      Date.now = () => 2_000_000;
      setCachedMatchingSummaryCards({ both: { userId: 'both', name: 'Нова проєкція', __matchingSummary: true } });
      expect(composeCachedCards(['both']).cards.both.name).toBe('Нова проєкція');
    } finally {
      Date.now = realNow;
    }
  });
});

describe('список стрічки на кожну умову', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('різні фільтри — різні списки, той самий фільтр — той самий', () => {
    expect(buildFeedListKey('{"a":1}')).toBe(buildFeedListKey('{"a":1}'));
    expect(buildFeedListKey('{"a":1}')).not.toBe(buildFeedListKey('{"a":2}'));
    expect(buildFeedListKey('{"a":1}').startsWith('feed:')).toBe(true);
  });

  it('тримає обмежену кількість списків і прибирає старий ключ `default`', () => {
    setIdsForQuery('default', ['legacy']);
    for (let index = 0; index < FEED_LIST_MAX_KEYS + 5; index += 1) {
      setIdsForQuery(buildFeedListKey(`sig-${index}`), [`id-${index}`]);
    }
    const keys = Object.keys(loadQueries());
    expect(keys).not.toContain('default');
    expect(keys.filter(key => key.startsWith('feed:'))).toHaveLength(FEED_LIST_MAX_KEYS);
    expect(keys).toContain(buildFeedListKey(`sig-${FEED_LIST_MAX_KEYS + 4}`));
  });
});
