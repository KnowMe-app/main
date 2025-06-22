import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE } from './constants';

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
  favoriteUsers = {}
) {
  const todayStr = new Date().toISOString().split('T')[0];
  const limit = startOffset + PAGE_SIZE + 1;
  const entries = await fetchDateFn(todayStr, limit);

  let filterMainFn;
  if (!fetchUserByIdFn) {
    const mod = await import('./config');
    fetchUserByIdFn = mod.fetchUserById;
    filterMainFn = mod.filterMain;
  } else {
    ({ filterMain: filterMainFn } = await import('./config'));
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
