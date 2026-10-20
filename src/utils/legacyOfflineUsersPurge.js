/**
 * Прибрати з браузера збережену копію legacy `users.json`.
 *
 * Режим «offline» на `AddNewProfile` і локальний експорт контактів колись
 * читали вибраний `users.json` і клали його в IndexedDB (`offlineCollections`),
 * щоб файл переживав перезавантаження. З колекцією `users` застосунок більше не
 * працює, і обидва входи тепер читають файли вузлів анкет — але копія, яку
 * поклали раніше, лишилась би в браузері назавжди. А це повна колекція з
 * контактами всіх анкет, тож лишати її «бо вже ніхто не читає» не можна.
 *
 * Читати її звідси нема кому й навіщо, тож база просто видаляється цілком.
 * Відмова (приватне вікно, заблоковане сховище) не валить нічого: це прибирання,
 * а не умова роботи екрана.
 */
const LEGACY_OFFLINE_COLLECTIONS_DB = 'offlineCollections';

export const purgeLegacyOfflineUsersCopy = () =>
  new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined' || typeof indexedDB.deleteDatabase !== 'function') {
        resolve(false);
        return;
      }
      const request = indexedDB.deleteDatabase(LEGACY_OFFLINE_COLLECTIONS_DB);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
      // Інша вкладка ще тримає базу відкритою — видалення завершиться, щойно
      // вона її закриє; чекати на це екран не мусить.
      request.onblocked = () => resolve(false);
    } catch (error) {
      resolve(false);
    }
  });
