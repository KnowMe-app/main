// Кеш карток у IndexedDB: підвантаження до першого кадру, перенос з
// `localStorage`, запис і скидання. У jsdom IndexedDB немає, тож сховище
// підмінене памʼяттю з тим самим інтерфейсом.
const mockIdbStore = new Map();
jest.mock('./idbKeyValue', () => ({
  isIndexedDbAvailable: () => true,
  idbGetMany: async keys => Object.fromEntries(keys.map(key => [key, mockIdbStore.get(key)])),
  idbPut: async (key, value) => { mockIdbStore.set(key, JSON.parse(JSON.stringify(value))); },
  idbDelete: async key => { mockIdbStore.delete(key); },
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
});
