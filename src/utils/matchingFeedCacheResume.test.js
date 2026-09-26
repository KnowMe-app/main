import {
  readFeedQueryEntry,
  setIdsForQuery,
  setQueryPagination,
  TTL_MS,
} from './cardIndex';
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

    const entry = readFeedQueryEntry('default');
    expect(entry.ids).toEqual(['a1', 'a2']);
    expect(entry.pagination).toMatchObject({ cursor, hasMore: true, signature: 's' });
    expect(typeof entry.pagination.savedAt).toBe('number');
  });

  it('читає id стрічки без звірки з кешем повних анкет', () => {
    // Рядки стрічки — проєкції, в `cards` їх немає; `getQueryEntry` викидав
    // би такі id, і список стрічки після перезавантаження був би порожнім.
    setIdsForQuery('default', ['projectionOnly1', 'projectionOnly2']);
    expect(readFeedQueryEntry('default').ids).toEqual(['projectionOnly1', 'projectionOnly2']);
  });

  it('знімається через null', () => {
    setIdsForQuery('default', ['a1']);
    setQueryPagination('default', { cursor, hasMore: true, signature: 's' });
    setQueryPagination('default', null);
    const entry = readFeedQueryEntry('default');
    expect(entry.pagination).toBeNull();
    expect(entry.ids).toEqual(['a1']);
  });
});
