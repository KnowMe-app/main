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
  fetchUserByIdFn
) {
  const todayStr = new Date().toISOString().split('T')[0];
  const limit = startOffset + PAGE_SIZE + 1;
  const entries = await fetchDateFn(todayStr, limit);
  const slice = entries.slice(startOffset, startOffset + PAGE_SIZE);

  if (!fetchUserByIdFn) {
    const { fetchUserById } = await import('./config');
    fetchUserByIdFn = fetchUserById;
  }

  const users = {};
  for (let i = 0; i < slice.length; i += 1) {
    const [id, data] = slice[i];
    // eslint-disable-next-line no-await-in-loop
    const extra = await fetchUserByIdFn(id);
    users[id] = extra ? { ...data, ...extra } : data;
  }

  const nextOffset = startOffset + slice.length;
  const hasMore = entries.length > startOffset + PAGE_SIZE;

  return { users, lastKey: nextOffset, hasMore };
}
