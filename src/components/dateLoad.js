import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE, INVALID_DATE_TOKENS, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByDate(dateStr, limit) {
  const db = getDatabase();

  const collections = ['newUsers', 'users'];
  const combined = {};

  // Iterate through both collections and gather matching records
  for (const col of collections) {
    // eslint-disable-next-line no-await-in-loop
    const q = query(ref2(db, col), orderByChild('getInTouch'), equalTo(dateStr), limitToFirst(limit));
    // eslint-disable-next-line no-await-in-loop
    const snap = await get(q);
    if (snap.exists()) {
      Object.entries(snap.val()).forEach(([id, data]) => {
        if (!combined[id]) combined[id] = data;
      });
    }

    if (Object.keys(combined).length >= limit) break;
  }

  return Object.entries(combined).slice(0, limit);
}


export async function fetchFilteredUsersByPage(
  startOffset = 0,
  fetchDateFn = defaultFetchByDate,
  fetchUserByIdFn,
  filterSettings = {},
  favoriteUsers = {},
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
  let filtered = [];

  const MAX_LOAD_DAYS = MAX_LOOKBACK_DAYS; // safety cap
  let dayOffset = 0;
  let invalidIndex = 0;

  while (filtered.length < target && dayOffset < MAX_LOAD_DAYS) {
    const fetchLimit = limit - filtered.length;
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchDateFn(dateStr, fetchLimit);
    if (chunk.length === 0) {
      while (
        filtered.length < target &&
        invalidIndex < INVALID_DATE_TOKENS.length
      ) {
        // eslint-disable-next-line no-await-in-loop
        const extra = await fetchDateFn(
          INVALID_DATE_TOKENS[invalidIndex],
          limit - filtered.length
        );
        invalidIndex += 1;
        const extraIds = extra.map(([eid]) => eid);
        const extraUsers = await Promise.all(
          extraIds.map(id => fetchUserByIdFn(id))
        );
        extra.forEach(([eid, edata], idx) => {
          const extraUser = extraUsers[idx];
          combined.push([eid, extraUser ? { ...edata, ...extraUser } : edata]);
        });
        filtered = filterMainFn(
          combined,
          'DATE2',
          filterSettings,
          favoriteUsers
        );
        if (onProgress) {
          const partial = filtered.slice(
            startOffset,
            Math.min(filtered.length, startOffset + PAGE_SIZE)
          );
          const partUsers = {};
          partial.forEach(([pid, pdata]) => {
            partUsers[pid] = pdata;
          });
          onProgress(partUsers);
        }
      }
    } else {
      const ids = chunk.map(([id]) => id);
      const extras = await Promise.all(ids.map(id => fetchUserByIdFn(id)));
      chunk.forEach(([id, data], i) => {
        const extra = extras[i];
        combined.push([id, extra ? { ...data, ...extra } : data]);
      });
      filtered = filterMainFn(combined, 'DATE2', filterSettings, favoriteUsers);
      if (onProgress) {
        const partial = filtered.slice(
          startOffset,
          Math.min(filtered.length, startOffset + PAGE_SIZE)
        );
        const partUsers = {};
        partial.forEach(([pid, pdata]) => {
          partUsers[pid] = pdata;
        });
        onProgress(partUsers);
      }
    }
    dayOffset += 1;
  }

  const slice = filtered.slice(startOffset, startOffset + PAGE_SIZE);

  const users = {};
  slice.forEach(([id, data]) => {
    users[id] = data;
  });

  const nextOffset = startOffset + slice.length;
  const hasMore = filtered.length > startOffset + PAGE_SIZE;

  return { users, lastKey: nextOffset, hasMore };
}
