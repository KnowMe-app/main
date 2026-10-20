import { purgeLegacyOfflineUsersCopy } from '../legacyOfflineUsersPurge';

// Копія `users.json` у браузері — це вся колекція з контактами. Читати її вже
// нікому, тож база видаляється цілком, а відмова не валить екран.
describe('purgeLegacyOfflineUsersCopy', () => {
  const originalIndexedDb = global.indexedDB;
  afterEach(() => {
    global.indexedDB = originalIndexedDb;
  });

  it('видаляє базу offlineCollections цілком', async () => {
    const request = {};
    const deleteDatabase = jest.fn(() => {
      setTimeout(() => request.onsuccess(), 0);
      return request;
    });
    global.indexedDB = { deleteDatabase };

    await expect(purgeLegacyOfflineUsersCopy()).resolves.toBe(true);
    expect(deleteDatabase).toHaveBeenCalledWith('offlineCollections');
  });

  it('без IndexedDB чи з відмовою просто каже «ні»', async () => {
    global.indexedDB = undefined;
    await expect(purgeLegacyOfflineUsersCopy()).resolves.toBe(false);

    global.indexedDB = { deleteDatabase: () => { throw new Error('blocked'); } };
    await expect(purgeLegacyOfflineUsersCopy()).resolves.toBe(false);
  });
});
