// Functions for sequentially loading users by lastLogin2
import { getDatabase, ref as ref2, query, orderByChild, equalTo, limitToFirst, get } from 'firebase/database';
import { PAGE_SIZE, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByLastLogin(dateStr, limit) {
  const db = getDatabase();
  const q = query(ref2(db, 'users'), orderByChild('lastLogin2'), equalTo(dateStr), limitToFirst(limit));
  const snap = await get(q);
  return snap.exists() ? Object.entries(snap.val()) : [];
}

// onProgress(partialUsers, dateStr) is called after each date is processed.
// partialUsers contains users found so far starting from startOffset.
export async function fetchUsersByLastLoginPaged(
  startOffset = 0,
  limit = PAGE_SIZE,
  fetchDateFn = defaultFetchByLastLogin,
  onProgress
) {
  const today = new Date();
  const target = startOffset + limit;
  const totalLimit = target + 1;

  console.log('[fetchUsersByLastLoginPaged] startOffset', startOffset, 'limit', limit);

  const combined = [];
  let dayOffset = 0;

  while (combined.length < target && dayOffset < MAX_LOOKBACK_DAYS) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchDateFn(dateStr, totalLimit - combined.length);
    console.log('[fetchUsersByLastLoginPaged] fetched', dateStr, 'count', chunk.length);

    if (chunk.length > 0) {
      chunk.sort((a, b) => b[1].lastLogin2.localeCompare(a[1].lastLogin2));
      combined.push(...chunk);
    }

    if (onProgress) {
      const partial = combined.slice(startOffset, Math.min(combined.length, startOffset + limit));
      const partUsers = {};
      partial.forEach(([pid, pdata]) => {
        partUsers[pid] = pdata;
      });
      onProgress(partUsers, dateStr);
    }

    dayOffset += 1;
  }

  const slice = combined.slice(startOffset, startOffset + limit);
  const users = slice.map(([id, data]) => ({ userId: id, ...data }));
  const nextOffset = startOffset + slice.length;
  const hasMore = combined.length > startOffset + limit;

  return { users, lastKey: nextOffset, hasMore };
}
