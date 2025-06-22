import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE, INVALID_DATE_TOKENS, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByDate(dateStr, limit) {
  const db = getDatabase();
  const q = query(ref2(db, 'newUsers'), orderByChild('getInTouch'), equalTo(dateStr), limitToFirst(limit));
  const snap = await get(q);
  return snap.exists() ? Object.entries(snap.val()) : [];
}

export async function fetchFilteredUsersByPage(
  startOffset = 0,
  fetchDateFn = defaultFetchByDate,
  fetchUserByIdFn,
  filterSettings = {},
  favoriteUsers = {},
  filterMainFnParam
) {
  const today = new Date();
  const limit = startOffset + PAGE_SIZE + 1;
  const entries = [];

  let dayOffset = 0;
  let invalidIndex = 0;

  while (entries.length < limit && dayOffset < MAX_LOOKBACK_DAYS) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchDateFn(dateStr, limit - entries.length);
    if (chunk.length === 0) {
      while (
        entries.length < limit &&
        invalidIndex < INVALID_DATE_TOKENS.length
      ) {
        // eslint-disable-next-line no-await-in-loop
        const extra = await fetchDateFn(
          INVALID_DATE_TOKENS[invalidIndex],
          limit - entries.length
        );
        invalidIndex += 1;
        entries.push(...extra);
      }
    } else {
      entries.push(...chunk);
    }
    dayOffset += 1;
  }

  let filterMainFn = filterMainFnParam;
  if (!fetchUserByIdFn || !filterMainFn) {
    const mod = await import('./config');
    if (!fetchUserByIdFn) fetchUserByIdFn = mod.fetchUserById;
    if (!filterMainFn) ({ filterMain: filterMainFn } = mod);
  }

  const combined = [];
  for (let i = 0; i < entries.length; i += 1) {
    const [id, data] = entries[i];
    // eslint-disable-next-line no-await-in-loop
    const extra = await fetchUserByIdFn(id);
    combined.push([id, extra ? { ...data, ...extra } : data]);
  }

  const filtered = filterMainFn(combined, 'DATE2', filterSettings, favoriteUsers);
  const slice = filtered.slice(startOffset, startOffset + PAGE_SIZE);

  const users = {};
  slice.forEach(([id, data]) => {
    users[id] = data;
  });

  const nextOffset = startOffset + slice.length;
  const hasMore = filtered.length > startOffset + PAGE_SIZE;

  return { users, lastKey: nextOffset, hasMore };
}
