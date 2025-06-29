import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE, INVALID_DATE_TOKENS, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByDate(dateStr, limit) {
  const db = getDatabase();
  const q = query(ref2(db, 'newUsers'), orderByChild('getInTouch'), equalTo(dateStr), limitToFirst(limit));
  const snap = await get(q);
  return snap.exists() ? Object.entries(snap.val()) : [];
}

export async function fetchByDateFromIndex(dateStr, limit) {
  const { fetchUserById } = await import('./config');
  const db = getDatabase();
  const snap = await get(ref2(db, `usersIndex/getInTouch/${dateStr}`));
  if (!snap.exists()) return [];
  const idsRaw = snap.val();
  const ids = Array.isArray(idsRaw) ? idsRaw.slice(0, limit) : [idsRaw];
  const results = await Promise.all(ids.map(id => fetchUserById(id)));
  const entries = [];
  results.forEach((resp, i) => {
    if (resp && resp.existingData) entries.push([ids[i], resp.existingData]);
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
        for (let i = 0; i < extra.length; i += 1) {
          const [eid, edata] = extra[i];
          // eslint-disable-next-line no-await-in-loop
          const extraUserResp = await fetchUserByIdFn(eid);
          const extraUser = extraUserResp ? extraUserResp.existingData : null;
          combined.push([eid, extraUser ? { ...edata, ...extraUser } : edata]);
        }
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
      for (let i = 0; i < chunk.length; i += 1) {
        const [id, data] = chunk[i];
        // eslint-disable-next-line no-await-in-loop
        const extraResp = await fetchUserByIdFn(id);
        const extra = extraResp ? extraResp.existingData : null;
        combined.push([id, extra ? { ...data, ...extra } : data]);
      }
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
