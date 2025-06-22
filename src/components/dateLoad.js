import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE } from './constants';

export async function defaultFetchByDate(dateStr, limit) {
  const db = getDatabase();
  const q = query(ref2(db, 'newUsers'), orderByChild('getInTouch'), equalTo(dateStr), limitToFirst(limit));
  const snap = await get(q);
  return snap.exists() ? Object.entries(snap.val()) : [];
}

function offsetToDiff(offset) {
  return -offset;
}

export async function fetchFilteredUsersByPage(
  startOffset = 0,
  fetchDateFn = defaultFetchByDate,
  fetchUserByIdFn
) {
  const result = [];
  let offset = startOffset;

  while (result.length < PAGE_SIZE) {
    const diff = offsetToDiff(offset);
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + diff);
    const dateStr = currentDate.toISOString().split('T')[0];
    // eslint-disable-next-line no-await-in-loop
    const entries = await fetchDateFn(dateStr, PAGE_SIZE - result.length);
    if (entries.length) {
      result.push(...entries);
    }
    offset += 1;
    if (offset > 730) break;
  }

  if (!fetchUserByIdFn) {
    const { fetchUserById } = await import('./config');
    fetchUserByIdFn = fetchUserById;
  }

  const userIds = result.map(([id]) => id);
  const userResults = await Promise.all(userIds.map(id => fetchUserByIdFn(id)));

  const users = {};
  userResults.forEach((data, idx) => {
    const id = userIds[idx];
    if (data) users[id] = { ...result[idx][1], ...data };
  });

  return { users, lastKey: offset, hasMore: result.length === PAGE_SIZE };
}
