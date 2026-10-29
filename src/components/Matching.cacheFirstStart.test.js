const fs = require('fs');
const path = require('path');

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

/**
 * Загальне правило кеша матчингу (`utils/matchingCachePolicy`): свіже з
 * памʼяті пристрою — без бекенду, протухле — один запит, і він лягає в кеш.
 * Ці перевірки стережуть місця, де старт стрічки колись питав базу щоразу.
 */
describe('Matching cache-first start', () => {
  const matching = read('Matching.jsx');
  const config = read('config.js');

  it('reads the viewer profile through the device cache, not straight from the base', () => {
    expect(matching).toContain('const profile = await loadViewerProfile(user.uid);');
    expect(matching).not.toMatch(/\bfetchUserById\(/);
    expect(read('App.jsx')).toContain('const profile = await loadViewerProfile(user.uid);');

    const start = config.indexOf('export const loadViewerProfile');
    const body = config.slice(start, config.indexOf('\nexport ', start + 1));
    expect(body.indexOf('readFreshMyProfileCache(uid)')).toBeGreaterThan(-1);
    expect(body.indexOf('readFreshMyProfileCache(uid)')).toBeLessThan(body.indexOf('fetchUserById(uid)'));
    expect(body).toContain('writeMyProfileCache(uid, profile)');
  });

  it('serves fresh reaction maps from the cache and subscribes only when they are stale', () => {
    const cachedCheck = matching.indexOf("readFreshReactionSnapshot(viewerIdForCache, effectiveOwnerId, 'favorites')");
    const subscription = matching.indexOf('const unsubFav = onValue(favRef');
    expect(cachedCheck).toBeGreaterThan(-1);
    expect(cachedCheck).toBeLessThan(subscription);
    expect(matching).toContain("writeReactionSnapshot(viewerIdForCache, effectiveOwnerId, 'favorites'");
    expect(matching).toContain("writeReactionSnapshot(viewerIdForCache, effectiveOwnerId, 'dislikes'");
    // Без підписки власну реакцію несе правка кеша, а не луна `onValue`.
    expect(matching).toContain('subscribeReactionCachePatches(');
  });

  it('routes every reaction write through the reaction cache', () => {
    ['addFavoriteUser', 'removeFavoriteUser', 'setReactionUserValue', 'setReactionUserValues', 'addDislikeUser', 'removeDislikeUser']
      .forEach(name => {
        const start = config.indexOf(`export const ${name} =`);
        const body = config.slice(start, config.indexOf('\nexport ', start + 1));
        expect(body).toContain('writeReactionsThroughCache(');
      });
  });

  // Голова адмінської стрічки щоразу читалась з бази — тепер і вона за
  // правилом кеша.
  it('lets the admin feed use a fresh cache too', () => {
    expect(matching).toContain('if (cacheResume.usable && viewModeRef.current === startMode) {');
    expect(matching).not.toContain('viewModeRef.current === startMode && !isAdmin');
  });

  it('caches the additional search-key set keys', () => {
    const start = matching.indexOf('async function resolveAdditionalSearchKeySetKeysForMatching');
    const body = matching.slice(start, matching.indexOf('\n}\n', start));
    expect(body.indexOf('readTimedCacheEntry(cacheKey)')).toBeLessThan(body.indexOf("refDb(database, 'searchKeySets')"));
    expect(body).toContain('writeTimedCacheEntry(cacheKey, { keys: searchKeySetKeys });');
  });

  // Дека після перезавантаження — з памʼяті пристрою, а перша ж відповідь
  // бекенду її замінює, а не дописується за нею.
  it('restores the last deck from the device and lets the backend replace it', () => {
    expect(matching).toContain('readFeedSnapshot() || readPersistedFeedSnapshotForMount()');
    expect(matching).toContain('writePersistedFeedSnapshot({ ownerId, ids:');
    expect(matching).toContain('setUsers(prev => (replaces ? unique : [...prev, ...unique]));');
    expect(matching).toContain('const map = new Map((replacesWithResult ? [] : prev).map(u => [u.userId, u]));');
  });

  // Перша звістка панелі фільтрів приходить на монтуванні — і стирала знімок
  // раніше, ніж його встигали побачити.
  it('keeps the restored deck through the filter panel first notice', () => {
    expect(matching).toMatch(/if \(!restoredFeedSnapshotRef\.current\) \{\n\s+loadedIdsRef\.current = new Set\(\);\n\s+setUsers\(\[\]\);/);
  });

  // До входу адмін рахувався звичайним читачем, і панель фільтрів ставила йому
  // умовчання ролі, а після входу перебирала їх назад — дека вантажилась двічі.
  it('resolves access from the remembered viewer until Firebase answers', () => {
    expect(matching).toContain('uid: auth.currentUser?.uid || readRememberedViewerId(),');
  });

  // До відповіді Firebase дека з кеша може вже стояти на екрані: право на
  // контакти й фото рахується від читача, тож вони чекають на вхід.
  it('waits for the signed-in viewer before reading contacts and photos', () => {
    expect(matching).toContain('onRequestContacts={ownerId ? handleRequestRowContacts : undefined}');
    expect(matching).toMatch(/if \(!ownerId\) return undefined;\n\s+const pool = feedSource\.slice\(0, FEED_PHOTO_HYDRATION_LIMIT\);/);
  });
});
