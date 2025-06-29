import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE, INVALID_DATE_TOKENS, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByDate(dateStr, limit) {
  const db = getDatabase();
  const q = query(ref2(db, 'newUsers'), orderByChild('getInTouch'), equalTo(dateStr), limitToFirst(limit));
  const snap = await get(q);
  return snap.exists() ? Object.entries(snap.val()) : [];
}

export async function fetchByDateFromIndex(dateStr, limit, allowedIds) {
  const { fetchUserById } = await import('./config');
  const db = getDatabase();
  const snap = await get(ref2(db, `usersIndex/getInTouch/${dateStr}`));
  if (!snap.exists()) return [];
  const idsRaw = snap.val();
  let ids;
  if (Array.isArray(idsRaw)) {
    ids = idsRaw;
  } else if (idsRaw && typeof idsRaw === 'object') {
    ids = Object.keys(idsRaw);
  } else {
    ids = [idsRaw];
  }
  if (allowedIds) {
    ids = ids.filter(id => allowedIds.has(id));
  }
  ids = ids.slice(0, limit);
  const results = await Promise.all(ids.map(id => fetchUserById(id)));
  const entries = [];
  results.forEach((data, i) => {
    if (data) entries.push([ids[i], data]);
  });
  return entries;
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

  let dayOffset = 0;
  let invalidIndex = 0;

  while (filtered.length < target && dayOffset < MAX_LOOKBACK_DAYS) {
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
