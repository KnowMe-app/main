// Functions for sequentially loading users by lastLogin
import {
  getDatabase,
  ref as ref2,
  query,
  orderByChild,
  equalTo,
  limitToFirst,
  get,
} from 'firebase/database';
import { PAGE_SIZE, MAX_LOOKBACK_DAYS } from './constants';

export async function defaultFetchByLastLogin(dateStr, limit) {
  const db = getDatabase();
  // Query users by lastLogin which is stored in dd.mm.yyyy format. Database has
  // indexOn for this field.
  const q = query(
    ref2(db, 'users'),
    orderByChild('lastLogin'),
    equalTo(dateStr),
    limitToFirst(limit)
  );
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
  const MAX_LOAD_DAYS = MAX_LOOKBACK_DAYS; // safety cap
  let dayOffset = 0;

  while (combined.length < target && dayOffset < MAX_LOAD_DAYS) {
    const date = new Date(today);
    date.setDate(today.getDate() - dayOffset);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yy = date.getFullYear();
    const dateStr = `${dd}.${mm}.${yy}`;
    // eslint-disable-next-line no-await-in-loop
    const chunk = await fetchDateFn(dateStr, totalLimit - combined.length);
    console.log('[fetchUsersByLastLoginPaged] fetched', dateStr, 'count', chunk.length);

    if (chunk.length > 0) {
      const parse = str => {
        const [d, m, y] = str.split('.');
        return `${y}-${m}-${d}`;
      };
      chunk.sort((a, b) => {
        const bDate = b[1].lastLogin ? parse(b[1].lastLogin) : '';
        const aDate = a[1].lastLogin ? parse(a[1].lastLogin) : '';
        return bDate.localeCompare(aDate);
      });
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
