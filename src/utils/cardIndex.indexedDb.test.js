// Кеш карток у IndexedDB: підвантаження до першого кадру, перенос з
// `localStorage`, запис і скидання. У jsdom IndexedDB немає, тож сховище
// підмінене памʼяттю з тим самим інтерфейсом.
const mockIdbStore = new Map();
const mockIdbFailures = { get: false, delete: false };
jest.mock('./idbKeyValue', () => ({
  isIndexedDbAvailable: () => true,
  idbGetMany: async keys => {
    if (mockIdbFailures.get) throw new Error('IndexedDB preload timeout');
    return Object.fromEntries(keys.map(key => [key, mockIdbStore.get(key)]));
  },
  idbPut: async (key, value) => { mockIdbStore.set(key, JSON.parse(JSON.stringify(value))); },
  idbDelete: async key => {
    if (mockIdbFailures.delete) throw new Error('IndexedDB unavailable');
    mockIdbStore.delete(key);
  },
}));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const loadModule = () => {
  let mod;
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    mod = require('./cardIndex');
  });
  return mod;
};

beforeEach(() => {
  mockIdbStore.clear();
  mockIdbFailures.get = false;
  mockIdbFailures.delete = false;
  localStorage.clear();
  localStorage.setItem('ownerId', 'viewer');
});

describe('кеш карток в IndexedDB', () => {
  it('переносить кеш з localStorage і знімає ключ лише після запису', async () => {
    const cardIndex = loadModule();
    cardIndex.saveCard({ userId: 'a', name: 'Оксана' });
    cardIndex.flushPendingMatchingCacheWrites();
    expect(localStorage.getItem('cards')).not.toBeNull();

    const next = loadModule();
    await expect(next.preloadCardCacheFromIndexedDb()).resolves.toBe(true);
    expect(next.loadCards().a.name).toBe('Оксана');
    await flush();
    expect(mockIdbStore.get('cards').items.a.name).toBe('Оксана');
    expect(localStorage.getItem('cards')).toBeNull();
  });

  it('після підвантаження пише в IndexedDB, а не в localStorage', async () => {
    const cardIndex = loadModule();
    await cardIndex.preloadCardCacheFromIndexedDb();
    cardIndex.saveCard({ userId: 'b', name: 'Марія' });
    cardIndex.flushPendingMatchingCacheWrites();
    await flush();
    expect(mockIdbStore.get('cards').items.b.name).toBe('Марія');
    expect(localStorage.getItem('cards')).toBeNull();
    // Наступна вкладка читає з IndexedDB.
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.loadCards().b.name).toBe('Марія');
  });

  it('скидання кешу стирає й IndexedDB', async () => {
    const cardIndex = loadModule();
    await cardIndex.preloadCardCacheFromIndexedDb();
    cardIndex.saveCard({ userId: 'c', name: 'Ірина' });
    cardIndex.flushPendingMatchingCacheWrites();
    await flush();
    cardIndex.resetMatchingLocalStorageCache('test');
    await flush();
    expect(mockIdbStore.has('cards')).toBe(false);
    expect(cardIndex.loadCards()).toEqual({});
  });

  it('скидання стирає IndexedDB і тоді, коли вкладка її не підвантажила', async () => {
    mockIdbStore.set('cards', { __cacheVersion: 1, items: { old: {} } });
    const cardIndex = loadModule();
    // Підвантаження не було (тайм-аут) — вкладка на localStorage.
    cardIndex.resetMatchingLocalStorageCache('test');
    await flush();
    expect(mockIdbStore.has('cards')).toBe(false);
  });

  it('проєкції стрічки привʼязані до читача', async () => {
    const cardIndex = loadModule();
    await cardIndex.preloadCardCacheFromIndexedDb();
    cardIndex.setCachedMatchingSummaryCards({ a: { userId: 'a', name: 'Оксана', __matchingSummary: true } });
    cardIndex.flushPendingMatchingCacheWrites();
    await flush();
    expect(cardIndex.getCachedMatchingSummaryCards(['a']).cards.a).toBeTruthy();
    localStorage.setItem('ownerId', 'someone-else');
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.getCachedMatchingSummaryCards(['a']).cards.a).toBeUndefined();
  });

  it('вкладка на localStorage після тайм-ауту: наступне підвантаження бере новіше', async () => {
    const first = loadModule();
    await first.preloadCardCacheFromIndexedDb();
    first.saveCard({ userId: 'a', name: 'Before' });
    first.flushPendingMatchingCacheWrites();
    await flush();
    // Наступна вкладка не дочекалась IndexedDB і писала в localStorage.
    mockIdbFailures.get = true;
    const fallback = loadModule();
    await expect(fallback.preloadCardCacheFromIndexedDb()).resolves.toBe(false);
    await new Promise(resolve => setTimeout(resolve, 5));
    fallback.saveCard({ userId: 'a', name: 'After' });
    fallback.flushPendingMatchingCacheWrites();
    // Третя вкладка знову з IndexedDB — картка не відкочується до Before.
    mockIdbFailures.get = false;
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.loadCards().a.name).toBe('After');
    await flush();
    expect(mockIdbStore.get('cards').items.a.name).toBe('After');
    expect(localStorage.getItem('cards')).toBeNull();
  });

  it('копії localStorage й IndexedDB зводяться по картці, а не цілою копією', async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 5));
    const idbTab = loadModule();
    await idbTab.preloadCardCacheFromIndexedDb();
    mockIdbFailures.get = true;
    const fallback = loadModule();
    await expect(fallback.preloadCardCacheFromIndexedDb()).resolves.toBe(false);
    mockIdbFailures.get = false;
    fallback.saveCard({ userId: 'a', name: 'Before' });
    fallback.flushPendingMatchingCacheWrites();
    await wait();
    idbTab.saveCard({ userId: 'a', name: 'After' });
    idbTab.flushPendingMatchingCacheWrites();
    await flush();
    await wait();
    // Обгортка localStorage новіша (B записано останнім), а картка a — ні.
    fallback.saveCard({ userId: 'b', name: 'B' });
    fallback.flushPendingMatchingCacheWrites();
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.loadCards().a.name).toBe('After');
    expect(next.loadCards().b.name).toBe('B');
    await flush();
    expect(mockIdbStore.get('cards').items.a.name).toBe('After');
    expect(mockIdbStore.get('cards').items.b.name).toBe('B');
    expect(localStorage.getItem('cards')).toBeNull();
  });

  it('зведення копій не воскрешає картку, яку інша вкладка забула за журналом', async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 5));
    const idbTab = loadModule();
    await idbTab.preloadCardCacheFromIndexedDb();
    idbTab.saveCard({ userId: 'a', name: 'Old' });
    idbTab.flushPendingMatchingCacheWrites();
    await flush();
    await wait();
    mockIdbFailures.get = true;
    const fallback = loadModule();
    await expect(fallback.preloadCardCacheFromIndexedDb()).resolves.toBe(false);
    mockIdbFailures.get = false;
    // Вкладка на localStorage картки a не мала, але журнал сказав, що вона змінилась.
    fallback.forgetCachedCardBodies(['a']);
    fallback.flushPendingMatchingCacheWrites();
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.loadCards().a).toBeUndefined();
    await flush();
    expect(mockIdbStore.get('cards').items.a).toBeUndefined();
  });

  it('картка, записана після останнього збереження іншої копії, лишається', async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 5));
    mockIdbFailures.get = true;
    const fallback = loadModule();
    await expect(fallback.preloadCardCacheFromIndexedDb()).resolves.toBe(false);
    mockIdbFailures.get = false;
    fallback.saveCard({ userId: 'b', name: 'B' });
    fallback.flushPendingMatchingCacheWrites();
    await wait();
    const idbTab = loadModule();
    await idbTab.preloadCardCacheFromIndexedDb();
    idbTab.saveCard({ userId: 'a', name: 'A' });
    idbTab.flushPendingMatchingCacheWrites();
    await flush();
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.loadCards().a.name).toBe('A');
  });

  it('скидання, якого IndexedDB не підтвердила, не повертається на наступному старті', async () => {
    const first = loadModule();
    await first.preloadCardCacheFromIndexedDb();
    first.saveCard({ userId: 'a', name: 'Скинуте' });
    first.flushPendingMatchingCacheWrites();
    await flush();
    mockIdbFailures.delete = true;
    first.resetMatchingLocalStorageCache('test');
    await flush();
    expect(mockIdbStore.has('cards')).toBe(true);
    mockIdbFailures.delete = false;
    const next = loadModule();
    await next.preloadCardCacheFromIndexedDb();
    expect(next.loadCards()).toEqual({});
    await flush();
    expect(mockIdbStore.has('cards')).toBe(false);
    expect(localStorage.getItem('km.cardCacheIdbInvalidated.v1')).toBeNull();
  });
});
