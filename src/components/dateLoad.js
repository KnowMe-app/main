import {
  getDatabase,
  ref as ref2,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
  startAfter,
  endAt,
  get as firebaseGet,
} from 'firebase/database';
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
  const collections = ['newUsers', 'users'];
  const combined = {};
  const orderedEntries = [];
  const nextCursors = {};
  let hasMore = false;
  const fetchLimit = Math.max(1, Number(limit) || PAGE_SIZE) + 1;
  const { afterKeys = null } = options || {};

  for (const col of collections) {
    const collectionRef = ref2(db, col);
    const collectionCursor = afterKeys?.[col];
    const q = collectionCursor?.value !== undefined
      ? query(
          collectionRef,
          orderByChild('getInTouch'),
          startAfter(collectionCursor.value, collectionCursor.key || ''),
          limitToFirst(fetchLimit),
        )
      : query(
          collectionRef,
          orderByChild('getInTouch'),
          limitToFirst(fetchLimit),
        );

    // eslint-disable-next-line no-await-in-loop
    const snap = await get(q);
    let collectionCount = 0;
    if (snap.exists()) {
      if (typeof snap.forEach === 'function') {
        snap.forEach(childSnap => {
          const id = childSnap.key;
          const data = childSnap.val();
          collectionCount += 1;
          nextCursors[col] = { value: data?.getInTouch ?? '', key: id };
          if (!combined[id]) {
            combined[id] = data;
            orderedEntries.push([id, data]);
          }
        });
      } else {
        Object.entries(snap.val()).forEach(([id, data]) => {
          collectionCount += 1;
          nextCursors[col] = { value: data?.getInTouch ?? '', key: id };
          if (!combined[id]) {
            combined[id] = data;
            orderedEntries.push([id, data]);
          }
        });
      }
    }
    if (collectionCount >= fetchLimit) hasMore = true;
  }

  orderedEntries.sort(([, a], [, b]) => String(a?.getInTouch || '').localeCompare(String(b?.getInTouch || '')));
  const entries = orderedEntries.slice(0, fetchLimit);
  const limitedEntries = entries.slice(0, Math.max(1, Number(limit) || PAGE_SIZE));
  hasMore = hasMore || entries.length > limitedEntries.length;

  return { entries: limitedEntries, hasMore, afterKeys: nextCursors };
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

  const collections = ['newUsers', 'users'];
  const combined = {};
  const orderedEntries = [];
  const nextCursors = {};
  let hasMore = false;
  let lastKey = null;
  const { afterKey = null, afterKeys = null } = options || {};
  const hasCollectionCursors = afterKeys && typeof afterKeys === 'object';
  const fetchLimit = Math.max(1, Number(limit) || PAGE_SIZE) + 1;

  // Iterate through both collections and gather matching records.
  // Keep reading one extra row so DATE2 can know whether the same date still
  // has candidates after filters remove the first batch.
  for (const col of collections) {
    const collectionRef = ref2(db, col);
    const collectionAfterKey = hasCollectionCursors ? afterKeys[col] : afterKey;
    const q = collectionAfterKey
      ? query(
          collectionRef,
          orderByChild('getInTouch'),
          startAfter(dateStr, collectionAfterKey),
          endAt(dateStr),
          limitToFirst(fetchLimit),
        )
      : query(
          collectionRef,
          orderByChild('getInTouch'),
          equalTo(dateStr),
          limitToFirst(fetchLimit),
        );
    // eslint-disable-next-line no-await-in-loop
    const snap = await get(q);
    if (snap.exists()) {
      if (typeof snap.forEach === 'function') {
        snap.forEach(childSnap => {
          const id = childSnap.key;
          const data = childSnap.val();
          nextCursors[col] = id;
          if (!combined[id]) {
            combined[id] = data;
            orderedEntries.push([id, data]);
          }
        });
      } else {
        Object.entries(snap.val()).forEach(([id, data]) => {
          nextCursors[col] = id;
          if (!combined[id]) {
            combined[id] = data;
            orderedEntries.push([id, data]);
          }
        });
      }
    }

    if (orderedEntries.length >= fetchLimit) {
      hasMore = true;
      break;
    }
  }

  const entries = orderedEntries.slice(0, fetchLimit);
  const limitedEntries = entries.slice(0, Math.max(1, Number(limit) || PAGE_SIZE));
  hasMore = hasMore || entries.length > limitedEntries.length;
  lastKey = limitedEntries.length > 0 ? limitedEntries[limitedEntries.length - 1][0] : null;

  return { entries: limitedEntries, hasMore, lastKey, afterKeys: nextCursors };
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
      combined.push([id, extra ? { ...data, ...extra } : data]);
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
  };


  if (hasCustomFetchDateFn) {
    let afterKey = null;
    let afterKeys = initialAfterKeys;
    let dateHasMore = true;
    while (filtered.length < target && dateHasMore) {
      const fetchLimit = limit - filtered.length;
      const batchResult = normalizeDateFetchResult(
        await fetchDateFn(todayIso, fetchLimit, { afterKey, afterKeys })
      );
      const { entries } = batchResult;
      if (entries.length === 0) {
        dateHasMore = false;
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      await appendFetchedEntries(entries);
      afterKey = batchResult.lastKey ?? entries[entries.length - 1][0];
      afterKeys = batchResult.afterKeys ?? afterKeys;
      dateHasMore = Boolean(batchResult.hasMore && (afterKey || afterKeys));
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
      await defaultFetchGetInTouchOrdered(limit - filtered.length, { afterKeys: orderedAfterKeys })
    );
    orderedAfterKeys = batchResult.afterKeys ?? null;
    const rawEntries = batchResult.entries || [];
    const entries = rawEntries.filter(([, user]) => (
      isCurrentPastOrNonDateGetInTouch(user?.getInTouch, todayIso)
    ));
    // eslint-disable-next-line no-await-in-loop
    await appendFetchedEntries(entries);
    backendHasMore = Boolean(batchResult.hasMore);
    if (!batchResult.hasMore || rawEntries.length === 0) break;
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
