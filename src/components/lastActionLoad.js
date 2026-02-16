import {
  getDatabase,
  ref as ref2,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToLast,
  get,
} from 'firebase/database';
import { PAGE_SIZE, MAX_LOOKBACK_DAYS } from './constants';

const LOOKBACK_BATCH_DAYS = 7;

export async function defaultFetchByLastActionRange(startTs, endTs, limit) {
  const db = getDatabase();
  const q = query(
    ref2(db, 'newUsers'),
    orderByChild('lastAction'),
    startAt(startTs),
    endAt(endTs),
    limitToLast(limit)
  );
  const snap = await get(q);
  return snap.exists() ? Object.entries(snap.val()) : [];
}

export async function fetchUsersByLastActionPaged(
  startOffset = 0,
  limit = PAGE_SIZE,
  fetchRangeFn = defaultFetchByLastActionRange,
  fetchUserByIdFn,
  filterSettings = {},
  favoriteUsers = {},
  dislikedUsers = {},
  filterMainFnParam,
  onProgress
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = startOffset + limit;
  const totalLimit = target + 1;

  let filterMainFn = filterMainFnParam;
  if (!fetchUserByIdFn || !filterMainFn) {
    const mod = await import('./config');
    if (!fetchUserByIdFn) fetchUserByIdFn = mod.fetchUserById;
    if (!filterMainFn) ({ filterMain: filterMainFn } = mod);
  }

  const combined = [];
  let filtered = [];
  let dayOffset = 0;
  const seenIds = new Set();

  while (filtered.length < target && dayOffset < MAX_LOOKBACK_DAYS) {
    const fetchLimit = Math.max(totalLimit - filtered.length, limit + 1);
    const batchDays = [];

    for (
      let i = 0;
      i < LOOKBACK_BATCH_DAYS && dayOffset + i < MAX_LOOKBACK_DAYS;
      i += 1
    ) {
      const day = new Date(today);
      day.setDate(today.getDate() - (dayOffset + i));
      const startTs = day.getTime();
      const endTs = startTs + 24 * 60 * 60 * 1000 - 1;
      batchDays.push({ startTs, endTs });
    }

    // eslint-disable-next-line no-await-in-loop
    const chunks = await Promise.all(
      batchDays.map(({ startTs, endTs }) =>
        fetchRangeFn(startTs, endTs, fetchLimit)
      )
    );

    const flattened = chunks.flat();
    const uniqueChunk = flattened.filter(([id]) => {
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });

    if (uniqueChunk.length > 0) {
      const ids = uniqueChunk.map(([id]) => id);
      // eslint-disable-next-line no-await-in-loop
      const extras = await Promise.all(ids.map(id => fetchUserByIdFn(id)));
      const enriched = uniqueChunk.map(([id, data], idx) => {
        const extra = extras[idx];
        const combinedData = extra ? { ...data, ...extra } : data;
        return [id, { ...combinedData, userId: combinedData.userId || id }];
      });
      enriched.sort(([, a], [, b]) => (Number(b.lastAction ?? 0) - Number(a.lastAction ?? 0)));
      combined.push(...enriched);
      combined.sort(([, a], [, b]) => (Number(b.lastAction ?? 0) - Number(a.lastAction ?? 0)));
    }

    filtered = filterMainFn(
      combined,
      'LAST_ACTION',
      filterSettings,
      favoriteUsers,
      dislikedUsers
    );

    if (onProgress) {
      const partial = filtered.slice(
        startOffset,
        Math.min(filtered.length, startOffset + limit)
      );
      const partUsers = {};
      partial.forEach(([pid, pdata]) => {
        partUsers[pid] = pdata;
      });
      onProgress(partUsers);
    }

    dayOffset += batchDays.length;
  }

  const slice = filtered.slice(startOffset, startOffset + limit);
  const users = {};
  slice.forEach(([id, data]) => {
    users[id] = data;
  });

  const nextOffset = startOffset + slice.length;
  const hasMore = filtered.length > startOffset + limit;

  return { users, lastKey: nextOffset, hasMore };
}
