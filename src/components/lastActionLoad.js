import {
  getDatabase,
  ref as ref2,
  query,
  orderByChild,
  startAt,
  endAt,
  limitToFirst,
  get,
} from 'firebase/database';
import { PAGE_SIZE, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByLastActionRange(startTs, endTs, limit) {
  const db = getDatabase();
  const q = query(
    ref2(db, 'newUsers'),
    orderByChild('lastAction'),
    startAt(startTs),
    endAt(endTs),
    limitToFirst(limit)
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

  while (filtered.length < target && dayOffset < MAX_LOOKBACK_DAYS) {
    const day = new Date(today);
    day.setDate(today.getDate() - dayOffset);
    const startTs = day.getTime();
    const endTs = startTs + 24 * 60 * 60 * 1000 - 1;

    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchRangeFn(startTs, endTs, totalLimit - filtered.length);

    if (chunk.length > 0) {
      const ids = chunk.map(([id]) => id);
      // eslint-disable-next-line no-await-in-loop
      const extras = await Promise.all(ids.map(id => fetchUserByIdFn(id)));
      const enriched = chunk.map(([id, data], idx) => {
        const extra = extras[idx];
        const combinedData = extra ? { ...data, ...extra } : data;
        return [id, { ...combinedData, userId: combinedData.userId || id }];
      });
      enriched.sort(([, a], [, b]) => (Number(b.lastAction ?? 0) - Number(a.lastAction ?? 0)));
      combined.push(...enriched);
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

    dayOffset += 1;
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
