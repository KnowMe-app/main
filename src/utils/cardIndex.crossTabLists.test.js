/**
 * Списки id карток (`queries`) лежать одним ключем на всі вкладки, а кожна
 * вкладка тримає свою копію в памʼяті. Запис цілої копії стирав списки й стан
 * пагінації, які тим часом записала інша вкладка. Тепер копія зливається з
 * диском по списку.
 */
const loadTab = () => {
  let tab;
  jest.isolateModules(() => {
    tab = require('./cardIndex');
  });
  return tab;
};

describe('списки карток між вкладками', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.useRealTimers();
  });

  const storedLists = () => JSON.parse(localStorage.getItem('queries') || '{}');

  it('запис однієї вкладки не стирає списку, записаного іншою', () => {
    const tabA = loadTab();
    const tabB = loadTab();
    const start = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(start);
    tabA.getQueryEntry('feed:a');
    tabB.getQueryEntry('feed:b');
    spy.mockReturnValue(start + 10);
    tabA.setIdsForQuery('feed:a', ['a1', 'a2']);
    tabA.flushPendingMatchingCacheWrites();
    spy.mockReturnValue(start + 20);
    tabB.setIdsForQuery('feed:b', ['b1']);
    tabB.flushPendingMatchingCacheWrites();
    spy.mockRestore();
    expect(Object.keys(storedLists()).sort()).toEqual(['feed:a', 'feed:b']);
    // І вкладка, що писала другою, тепер бачить список першої.
    expect(tabB.getQueryEntry('feed:a').ids).toEqual(['a1', 'a2']);
  });

  it('той самий список — перемагає новіший запис', () => {
    const tabA = loadTab();
    const tabB = loadTab();
    tabA.getQueryEntry('fav');
    tabB.getQueryEntry('fav');
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now');
    spy.mockReturnValue(now + 1000);
    tabB.setIdsForQuery('fav', ['new']);
    tabB.flushPendingMatchingCacheWrites();
    spy.mockReturnValue(now);
    tabA.setIdsForQuery('fav', ['old']);
    tabA.flushPendingMatchingCacheWrites();
    spy.mockRestore();
    expect(storedLists().fav.ids).toEqual(['new']);
  });

  it('свідомо прибраний вкладкою список не повертається з диска', () => {
    const tabA = loadTab();
    tabA.setIdsForQuery('stale', ['x']);
    tabA.setIdsForQuery('keep', ['y']);
    tabA.flushPendingMatchingCacheWrites();
    // Вкладка бачила «stale» і прибрала його (як TTL чи «Оновити стрічку»).
    const queries = tabA.loadQueries();
    delete queries.stale;
    tabA.saveQueries(queries);
    tabA.flushPendingMatchingCacheWrites();
    expect(Object.keys(storedLists())).toEqual(['keep']);
  });

  it('скидання кешу не підтягує старіших списків інших вкладок', () => {
    const tabA = loadTab();
    const tabB = loadTab();
    tabB.setIdsForQuery('other', ['o']);
    tabB.flushPendingMatchingCacheWrites();
    const later = Date.now() + 1000;
    const spy = jest.spyOn(Date, 'now').mockReturnValue(later);
    tabA.resetMatchingLocalStorageCache('test');
    tabA.setIdsForQuery('mine', ['m']);
    tabA.flushPendingMatchingCacheWrites();
    spy.mockRestore();
    expect(Object.keys(storedLists())).toEqual(['mine']);
  });

  // Зняття курсора — свідома правка: курсор на диску з новішим `savedAt`
  // не мусить повернутись злиттям, навіть в одній вкладці.
  it('знятий курсор не повертається з диска', () => {
    const tab = loadTab();
    const start = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(start);
    tab.setIdsForQuery('feed:x', ['a']);
    tab.flushPendingMatchingCacheWrites();
    spy.mockReturnValue(start + 100);
    tab.setQueryPagination('feed:x', { cursor: 'c1', hasMore: true });
    tab.flushPendingMatchingCacheWrites();
    spy.mockReturnValue(start + 200);
    tab.setQueryPagination('feed:x', null);
    tab.flushPendingMatchingCacheWrites();
    spy.mockRestore();
    expect(storedLists()['feed:x'].pagination).toBeUndefined();
    expect(tab.getQueryEntry('feed:x').pagination).toBeNull();
  });

  // Дві вкладки, кожна під стелею, разом — понад неї: злитий запис не
  // обходить межу, а втрачає найстаріші списки, і новий лишається.
  it('злиті списки понад стелю втрачають найстаріші, а не весь ключ', () => {
    const tabA = loadTab();
    const tabB = loadTab();
    const bigIds = prefix => Array.from({ length: 2000 }, (_, index) => `${prefix}${String(index).padStart(6, '0')}${'x'.repeat(90)}`);
    const start = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(start);
    tabA.getQueryEntry('a0');
    tabB.getQueryEntry('b0');
    for (let i = 0; i < 11; i += 1) {
      spy.mockReturnValue(start + 10 + i);
      tabA.setIdsForQuery(`a${i}`, bigIds(`a${i}-`));
    }
    tabA.flushPendingMatchingCacheWrites();
    for (let i = 0; i < 11; i += 1) {
      spy.mockReturnValue(start + 100 + i);
      tabB.setIdsForQuery(`b${i}`, bigIds(`b${i}-`));
    }
    tabB.flushPendingMatchingCacheWrites();
    spy.mockRestore();
    const raw = localStorage.getItem('queries');
    expect(raw).not.toBeNull();
    expect(raw.length).toBeLessThanOrEqual(tabB.MATCHING_CACHE_MAX_CHARS);
    const keys = Object.keys(JSON.parse(raw));
    expect(keys).toContain('b10');
    expect(keys).not.toContain('a0');
  });
});
