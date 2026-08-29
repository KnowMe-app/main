import {
  getDatabase,
  ref as ref2,
  query,
  orderByValue,
  equalTo,
  limitToFirst,
  startAfter,
  endAt,
  get as firebaseGet,
} from 'firebase/database';
import { getAuth } from 'firebase/auth';
import { withAdminDownloadToast } from 'utils/backendDownloadToast';

import { PAGE_SIZE } from './constants';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'dateLoad',
    path: args[0],
  });


const isCurrentPastOrNonDateGetInTouch = (value, todayIso) => {
  const normalized = String(value || '').trim();
  if (!normalized) return true;
  return !/^\d{4}-\d{2}-\d{2}$/.test(normalized) || normalized <= todayIso;
};

async function defaultFetchGetInTouchOrdered(limit, options = {}) {
  const db = getDatabase();
  const ownerId = getAuth(db.app).currentUser?.uid;
  if (!ownerId) return { entries: [], hasMore: false, afterKeys: {} };
  const orderedEntries = [];
  const { afterKeys = null, cursorLimit = null } = options || {};
  const nextCursors = { ...(afterKeys || {}) };
  let hasMore = false;
  const requestedLimit = Math.max(1, Number(limit) || PAGE_SIZE);
  const cursorEntryLimit = Math.max(1, Number(cursorLimit) || requestedLimit);
  const fetchLimit = requestedLimit + 1;

  const cursor = afterKeys?.getInTouch;
  const ownerRef = ref2(db, `multiData/getInTouch/${ownerId}`);
  const q = cursor?.value !== undefined
      ? query(
          ownerRef,
          orderByValue(),
          startAfter(cursor.value, cursor.key || ''),
          limitToFirst(fetchLimit),
        )
      : query(
          ownerRef,
          orderByValue(),
          limitToFirst(fetchLimit),
        );

  const snap = await get(q);
  if (snap.exists()) {
    snap.forEach(childSnap => {
      orderedEntries.push([childSnap.key, {
        userId: childSnap.key,
        getInTouch: childSnap.val(),
      }]);
    });
  }

  const limitedEntries = orderedEntries.slice(0, cursorEntryLimit);
  const lastEntry = limitedEntries[limitedEntries.length - 1];
  if (lastEntry) {
    nextCursors.getInTouch = { value: lastEntry[1].getInTouch, key: lastEntry[0] };
  }
  hasMore = orderedEntries.length >= fetchLimit || orderedEntries.length > limitedEntries.length;
  return { entries: orderedEntries, hasMore, afterKeys: nextCursors };
}

const normalizeDateFetchResult = result => {
  if (Array.isArray(result)) {
    return {
      entries: result,
      hasMore: false,
      lastKey: result.length > 0 ? result[result.length - 1][0] : null,
    };
  }

  const entries = Array.isArray(result?.entries) ? result.entries : [];
  return {
    entries,
    hasMore: Boolean(result?.hasMore),
    lastKey: result?.lastKey ?? (entries.length > 0 ? entries[entries.length - 1][0] : null),
    afterKeys: result?.afterKeys ?? null,
  };
};

export async function defaultFetchByDate(dateStr, limit, options = {}) {
  const db = getDatabase();
  const ownerId = getAuth(db.app).currentUser?.uid;
  if (!ownerId) return { entries: [], hasMore: false, lastKey: null, afterKeys: {} };
  const orderedEntries = [];
  let hasMore = false;
  let lastKey = null;
  const { afterKey = null, afterKeys = null, cursorLimit = null } = options || {};
  const nextCursors = { ...(afterKeys || {}) };
  const hasCollectionCursors = afterKeys && typeof afterKeys === 'object';
  const requestedLimit = Math.max(1, Number(limit) || PAGE_SIZE);
  const cursorEntryLimit = Math.max(1, Number(cursorLimit) || requestedLimit);
  const fetchLimit = requestedLimit + 1;

  // Позначки належать поточному редактору. Читаємо їхній індекс, а повні
  // анкети нижче гідратуються звичайним `fetchUserByIdFn`.
  const col = 'getInTouch';
  {
    const collectionRef = ref2(db, `multiData/getInTouch/${ownerId}`);
    const collectionAfterKey = hasCollectionCursors ? afterKeys[col] : afterKey;
    const q = collectionAfterKey
      ? query(
          collectionRef,
          orderByValue(),
          startAfter(dateStr, collectionAfterKey),
          endAt(dateStr),
          limitToFirst(fetchLimit),
        )
      : query(
          collectionRef,
          orderByValue(),
          equalTo(dateStr),
          limitToFirst(fetchLimit),
        );
    // eslint-disable-next-line no-await-in-loop
    const snap = await get(q);
    if (snap.exists()) {
      if (typeof snap.forEach === 'function') {
        snap.forEach(childSnap => {
          const id = childSnap.key;
          orderedEntries.push([id, { userId: id, getInTouch: childSnap.val() }, col]);
        });
      } else {
        Object.entries(snap.val()).forEach(([id, value]) => {
          orderedEntries.push([id, { userId: id, getInTouch: value }, col]);
        });
      }
    }

    if (orderedEntries.length >= fetchLimit) {
      hasMore = true;
    }
  }

  const entries = orderedEntries.slice(0, fetchLimit);
  const limitedEntries = entries.slice(0, cursorEntryLimit);
  limitedEntries.forEach(([id, , col]) => {
    nextCursors[col] = id;
  });
  hasMore = hasMore || entries.length > limitedEntries.length;
  lastKey = limitedEntries.length > 0 ? limitedEntries[limitedEntries.length - 1][0] : null;

  return {
    entries: entries.map(([id, data]) => [id, data]),
    hasMore,
    lastKey,
    afterKeys: nextCursors,
  };
}


export async function fetchFilteredUsersByPage(
  startOffset = 0,
  fetchDateFn,
  fetchUserByIdFn,
  filterSettings = {},
  favoriteUsers = {},
  dislikedUsers = {},
  filterMainFnParam,
  onProgress,
  debugOptions = {}
) {
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];
  const hasCustomFetchDateFn = typeof fetchDateFn === 'function';
  if (!fetchDateFn) fetchDateFn = defaultFetchByDate;
  const target = startOffset + PAGE_SIZE;
  const limit = target + 1;

  let filterMainFn = filterMainFnParam;
  if (!fetchUserByIdFn || !filterMainFn) {
    const mod = await import('./config');
    if (!fetchUserByIdFn) fetchUserByIdFn = mod.fetchUserById;
    if (!filterMainFn) ({ filterMain: filterMainFn } = mod);
  }

  const combined = [];
  const seenIds = new Set();
  let filtered = [];
  let backendHasMore = false;
  const debugLog = typeof debugOptions?.debugLog === 'function' ? debugOptions.debugLog : null;
  const initialAfterKeys = debugOptions?.afterKeys && typeof debugOptions.afterKeys === 'object'
    ? debugOptions.afterKeys
    : null;
  const emitDebug = (step, payload = {}) => {
    if (!debugLog) return;
    debugLog(step, payload);
  };

  const emitProgress = () => {
    if (!onProgress) return;
    const partial = filtered.slice(
      startOffset,
      Math.min(filtered.length, startOffset + PAGE_SIZE)
    );
    const partUsers = {};
    partial.forEach(([pid, pdata]) => {
      partUsers[pid] = pdata;
    });
    onProgress(partUsers);
  };

  const appendFetchedEntries = async entries => {
    const newEntries = entries.filter(([id]) => !seenIds.has(id));
    newEntries.forEach(([id]) => seenIds.add(id));
    const ids = newEntries.map(([id]) => id);
    const extras = await Promise.all(ids.map(id => fetchUserByIdFn(id)));
    newEntries.forEach(([id, data], i) => {
      const extra = extras[i];
      const mergedUser = extra ? { ...data, ...extra } : data;
      if (!isCurrentPastOrNonDateGetInTouch(mergedUser?.getInTouch, todayIso)) return;
      combined.push([id, mergedUser]);
    });
    const rejectReasons = {};
    const collectFilterDebug = (step, payload = {}) => {
      if (step !== 'filterMain:reject') return;
      Object.entries(payload.reasons || {}).forEach(([reason, check]) => {
        if (check?.passed) return;
        rejectReasons[reason] = (rejectReasons[reason] || 0) + 1;
      });
    };
    filtered = filterMainFn(
      combined,
      'DATE2',
      filterSettings,
      favoriteUsers,
      dislikedUsers,
      debugLog ? { debugLog: collectFilterDebug } : undefined,
    );
    emitDebug('fetchFilteredUsersByPage:filter-summary', {
      entriesLength: entries.length,
      newEntriesLength: newEntries.length,
      combinedLength: combined.length,
      filteredLength: filtered.length,
      filterRejected: Math.max(0, combined.length - filtered.length),
      rejectReasons,
    });
    emitProgress();
    return newEntries.length;
  };


  if (hasCustomFetchDateFn) {
    let afterKey = null;
    let afterKeys = initialAfterKeys;
    let dateHasMore = true;
    while (filtered.length < target && dateHasMore) {
      const fetchLimit = limit - filtered.length;
      const batchResult = normalizeDateFetchResult(
        await fetchDateFn(todayIso, fetchLimit, {
          afterKey,
          afterKeys,
          cursorLimit: target - filtered.length,
        })
      );
      const { entries } = batchResult;
      if (entries.length === 0) {
        dateHasMore = false;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const appendedCount = await appendFetchedEntries(entries);
      afterKey = batchResult.lastKey ?? entries[entries.length - 1][0];
      afterKeys = batchResult.afterKeys ?? afterKeys;
      dateHasMore = Boolean(batchResult.hasMore && (afterKey || afterKeys));
      if (appendedCount === 0) break;
    }

    const customSlice = filtered.slice(startOffset, startOffset + PAGE_SIZE);
    const customUsers = {};
    customSlice.forEach(([id, data]) => {
      customUsers[id] = data;
    });
    const customNextOffset = startOffset + customSlice.length;
    return {
      users: customUsers,
      lastKey: customNextOffset,
      hasMore: filtered.length > startOffset + PAGE_SIZE || dateHasMore,
      afterKeys,
    };
  }

  const dayOffset = null;
  const invalidIndex = null;

  let orderedAfterKeys = initialAfterKeys;
  while (filtered.length < target) {
    emitDebug('fetchFilteredUsersByPage:scan-progress', {
      dateStr: null,
      dayOffset,
      invalidIndex,
      entriesLength: null,
      combinedLength: combined.length,
      filteredLength: filtered.length,
      target,
      source: 'ordered-getInTouch-full-scan',
    });
    // eslint-disable-next-line no-await-in-loop
    const batchResult = normalizeDateFetchResult(
      await defaultFetchGetInTouchOrdered(limit - filtered.length, {
        afterKeys: orderedAfterKeys,
        cursorLimit: target - filtered.length,
      })
    );
    orderedAfterKeys = batchResult.afterKeys ?? null;
    const rawEntries = batchResult.entries || [];
    const entries = rawEntries.filter(([, user]) => (
      isCurrentPastOrNonDateGetInTouch(user?.getInTouch, todayIso)
    ));
    // eslint-disable-next-line no-await-in-loop
    const appendedCount = await appendFetchedEntries(entries);
    backendHasMore = Boolean(batchResult.hasMore);
    if (!batchResult.hasMore || rawEntries.length === 0 || appendedCount === 0) break;
  }

  const slice = filtered.slice(startOffset, startOffset + PAGE_SIZE);

  const users = {};
  slice.forEach(([id, data]) => {
    users[id] = data;
  });

  const nextOffset = startOffset + slice.length;
  const hasMore = filtered.length > startOffset + PAGE_SIZE || backendHasMore;
  const stopReason = slice.length >= PAGE_SIZE
    ? 'target-reached'
    : backendHasMore
      ? 'backend-has-more'
      : 'full-scan-exhausted';

  emitDebug('fetchFilteredUsersByPage:result', {
    usersLength: Object.keys(users).length,
    combinedLength: combined.length,
    filteredLength: filtered.length,
    dayOffset,
    invalidIndex,
    lastKey: nextOffset,
    hasMore,
    stopReason,
  });

  return { users, lastKey: nextOffset, hasMore, afterKeys: orderedAfterKeys };
}
