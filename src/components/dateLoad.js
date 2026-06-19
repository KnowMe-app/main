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

import { PAGE_SIZE, INVALID_DATE_TOKENS, MAX_LOOKBACK_DAYS } from './constants';

const get = (...args) =>
  withAdminDownloadToast(firebaseGet(...args), {
    operation: 'get',
    source: 'dateLoad',
    path: args[0],
  });

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
  fetchDateFn = defaultFetchByDate,
  fetchUserByIdFn,
  filterSettings = {},
  favoriteUsers = {},
  dislikedUsers = {},
  filterMainFnParam,
  onProgress
) {
  const today = new Date();
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
    filtered = filterMainFn(
      combined,
      'DATE2',
      filterSettings,
      favoriteUsers,
      dislikedUsers
    );
    emitProgress();
  };

  const loadDateUntilEnough = async dateStr => {
    let afterKey = null;
    let afterKeys = null;
    let dateHasMore = true;

    while (filtered.length < target && dateHasMore) {
      const fetchLimit = limit - filtered.length;
      // eslint-disable-next-line no-await-in-loop
      const batchResult = normalizeDateFetchResult(
        await fetchDateFn(dateStr, fetchLimit, { afterKey, afterKeys })
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

    if (filtered.length >= target && dateHasMore) {
      backendHasMore = true;
    }
  };

  const MAX_LOAD_DAYS = MAX_LOOKBACK_DAYS; // safety cap
  let dayOffset = 0;

  while (filtered.length < target && dayOffset < MAX_LOAD_DAYS) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    // eslint-disable-next-line no-await-in-loop
    await loadDateUntilEnough(dateStr);
    dayOffset += 1;
  }

  let invalidIndex = 0;
  while (
    filtered.length < target &&
    invalidIndex < INVALID_DATE_TOKENS.length
  ) {
    // eslint-disable-next-line no-await-in-loop
    await loadDateUntilEnough(INVALID_DATE_TOKENS[invalidIndex]);
    invalidIndex += 1;
  }

  const slice = filtered.slice(startOffset, startOffset + PAGE_SIZE);

  const users = {};
  slice.forEach(([id, data]) => {
    users[id] = data;
  });

  const nextOffset = startOffset + slice.length;
  const hasMore = filtered.length > startOffset + PAGE_SIZE || backendHasMore;

  return { users, lastKey: nextOffset, hasMore };
}
