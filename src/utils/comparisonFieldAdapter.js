// Isolated adapter so comparison writes can be exercised without evaluating source text.
export const createSaveComparisonField = deps => async (userId, field, value) => {
  const {
    auth, database, resolveCanonicalFieldName, resolveFieldOwnerNode, PROFILE_NODES,
    buildMatchingCardProjection, normalizeStoredDates, sanitizeUploadedInfoPhones,
    ref2, set, get, readProfileFromNodes, syncUserSearchIdIndex, syncUserSearchKeyIndex,
    refreshMatchingCardAfterProfileWrite, mirrorProfileToLegacyUsers, updateDataInFiresoreDB,
    clearMatchingSearchResultCache, setOwnerWriter, setOwnerGetInTouch,
  } = deps;
  const ownerId = auth.currentUser?.uid;
  if (!ownerId || !userId) throw new Error('Користувач або картка не визначені');
  const canonical = resolveCanonicalFieldName(field);
  let path;
  const payload = normalizeStoredDates(sanitizeUploadedInfoPhones({ [canonical]: value }));
  let savedValue = payload[canonical];
  if (field === 'writer' || field === 'getInTouch') {
    path = `multiData/${field}/${ownerId}/${userId}`;
    const saved = field === 'writer'
      ? await setOwnerWriter(ownerId, userId, savedValue)
      : await setOwnerGetInTouch(ownerId, userId, savedValue);
    if (!saved) throw new Error('Позначку не збережено');
  } else {
    const node = resolveFieldOwnerNode(field);
    if (!node) throw new Error(`Поле ${field} не підтримує перенесення`);
    path = `${node}/${userId}/${canonical}`;
    if (node === PROFILE_NODES.matchingCards) {
      savedValue = buildMatchingCardProjection(userId, payload)?.[canonical];
      if (savedValue === undefined) throw new Error(`Некоректне значення ${field}`);
    }
    const previous = (await readProfileFromNodes(userId, { includeTechnical: true })) || {};
    const lastAction = Date.now();
    await set(ref2(database, path), savedValue);
    await set(ref2(database, `${PROFILE_NODES.profileWorkflow}/${userId}/lastAction`), lastAction);
    const changed = { [canonical]: savedValue, lastAction };
    const next = { ...previous, ...changed };
    await syncUserSearchIdIndex(userId, previous, next);
    await syncUserSearchKeyIndex(userId, previous, next);
    if (node !== PROFILE_NODES.matchingCards) {
      await refreshMatchingCardAfterProfileWrite(userId, changed, 'update');
    }
    const legacyWritten = await mirrorProfileToLegacyUsers(userId, changed, 'update');
    if (legacyWritten) await updateDataInFiresoreDB(userId, changed, 'check');
  }
  const snapshot = await get(ref2(database, path));
  if (!snapshot.exists()) throw new Error(`Не підтверджено збереження ${field}`);
  clearMatchingSearchResultCache();
  return snapshot.val();
};
