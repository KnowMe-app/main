import React from 'react';
import { get, ref } from 'firebase/database';
import { cacheLoad2Users } from 'utils/load2Storage';
import { getCard, serializeQueryFilters } from 'utils/cardIndex';
import { PAGE_SIZE, database } from './config';

export const LAST_ACTION2_SORT_MODE = 'LA2';
export const LAST_ACTION2_FILTER = 'LAST_ACTION2';
export const LAST_ACTION2_FILTER_STORAGE_KEY = 'addFiltersLA2';
export const LAST_ACTION2_SEARCH_KEY_INDEX = 'lastAction';

export const createInitialLA2State = (filtersKey = '') => ({
  bucketCache: {},
  filterBucketCache: {},
  shownIds: new Set(),
  acceptedIds: [],
  bucketCursor: 0,
  userCursorByBucket: {},
  defaultDayOffset: 0,
  hasMore: true,
  filtersKey,
});

export const serializeLA2State = la2State => ({
  acceptedIds: [...(la2State?.acceptedIds || [])],
  shownIds: [...(la2State?.shownIds || [])],
  bucketCursor: la2State?.bucketCursor || 0,
  userCursorByBucket: la2State?.userCursorByBucket || {},
  defaultDayOffset: la2State?.defaultDayOffset || 0,
  hasMore: la2State?.hasMore !== false,
  filtersKey: la2State?.filtersKey || '',
});

export const restoreLA2State = snapshot => ({
  ...createInitialLA2State(snapshot?.filtersKey || ''),
  ...(snapshot || {}),
  shownIds: new Set(snapshot?.shownIds || []),
  acceptedIds: snapshot?.acceptedIds || [],
  bucketCache: {},
  filterBucketCache: {},
});

export const resetLA2StateRef = la2StateRef => {
  if (!la2StateRef) return;
  la2StateRef.current = createInitialLA2State();
};

export const getLA2AcceptedOrder = la2StateRef => la2StateRef?.current?.acceptedIds || [];

const toLocalIsoDate = date => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const makeLastActionDateBucket = dayOffset => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - dayOffset);
  return `d_${toLocalIsoDate(date)}`;
};

const getSelectedLastActionBuckets = currentFilters => {
  const la = currentFilters?.lastAction || {};
  const selected = Object.entries(la)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key);
  const buckets = [];
  const addBucket = bucket => {
    if (bucket && !buckets.includes(bucket)) buckets.push(bucket);
  };
  const addRange = days => {
    for (let day = 0; day < days; day += 1) addBucket(makeLastActionDateBucket(day));
  };

  selected.forEach(key => {
    if (key === 'today') addBucket(makeLastActionDateBucket(0));
    if (key === 'yesterday') addBucket(makeLastActionDateBucket(1));
    if (key === 'last3days') addRange(3);
    if (key === 'last7days') addRange(7);
    if (key === 'last14days') addRange(14);
    if (key === 'last30days') addRange(30);
    if (key === 'no') addBucket('no');
    if (key === '?') addBucket('?');
  });

  return { buckets, hasExplicitBuckets: buckets.length > 0 };
};

const isFilterGroupAppliedForLA2 = group => {
  if (!group || typeof group !== 'object') return false;
  const values = Object.values(group);
  if (!values.length) return false;
  const enabledCount = values.filter(value => value === true).length;
  return enabledCount > 0 && enabledCount < values.length;
};

const mapLA2FilterValueToBuckets = (filterName, value) => {
  const direct = bucket => ({ indexName: filterName, bucket });
  if (filterName === 'lastAction') return [];
  if (filterName === 'role') return [direct(value === 'other' ? '?' : value === 'empty' ? 'no' : value)];
  if (filterName === 'csection') return [direct(value === 'other' ? 'other' : value)];
  if (filterName === 'contact') return [direct(value)];
  if (filterName === 'imt') return [direct(value === 'other' ? '?' : value)];
  if (filterName === 'maritalStatus') {
    if (value === 'married') return [direct('+')];
    if (value === 'unmarried') return [direct('-')];
    if (value === 'empty') return [direct('no')];
    return [direct('?')];
  }
  if (filterName === 'bloodGroup') {
    return [{ indexName: 'blood', bucket: value === 'other' ? '?' : value === 'empty' ? 'no' : value }];
  }
  if (filterName === 'rh') {
    return [{ indexName: 'blood', bucket: value === 'other' ? '?' : value === 'empty' ? 'no' : value }];
  }
  if (filterName === 'userId') return [direct(value)];
  if (filterName === 'reaction') {
    const map = { question: '?', none: 'no', special99: '99' };
    if (map[value]) return [{ indexName: 'reaction', bucket: map[value] }];
  }
  return [];
};

const getLA2SearchKeyBucketIds = async (la2StateRef, indexName, bucket) => {
  const cacheKey = `${indexName}/${bucket}`;
  const cache = indexName === LAST_ACTION2_SEARCH_KEY_INDEX
    ? la2StateRef.current.bucketCache
    : la2StateRef.current.filterBucketCache;
  if (cache[cacheKey]) return cache[cacheKey];

  const snapshot = await get(ref(database, `searchKey/${indexName}/${bucket}`));
  const ids = snapshot.exists() ? Object.keys(snapshot.val() || {}).filter(Boolean) : [];
  const idSet = new Set(ids);
  cache[cacheKey] = idSet;
  return idSet;
};

const buildLA2AppliedFilters = currentFilters => {
  return Object.entries(currentFilters || {})
    .filter(([filterName, group]) => filterName !== 'lastAction' && isFilterGroupAppliedForLA2(group))
    .map(([filterName, group]) => {
      const buckets = Object.entries(group)
        .filter(([, enabled]) => enabled === true)
        .flatMap(([value]) => mapLA2FilterValueToBuckets(filterName, value))
        .filter(({ indexName, bucket }) => indexName && bucket);
      return { filterName, buckets };
    })
    .filter(group => group.buckets.length > 0);
};

const userPassesLA2SearchKeyFilters = async (la2StateRef, userId, appliedFilters) => {
  for (const group of appliedFilters) {
    let matchedGroup = false;
    for (const bucketInfo of group.buckets) {
      // eslint-disable-next-line no-await-in-loop
      const bucketIds = await getLA2SearchKeyBucketIds(la2StateRef, bucketInfo.indexName, bucketInfo.bucket);
      if (bucketIds.has(userId)) {
        matchedGroup = true;
        break;
      }
    }
    if (!matchedGroup) return false;
  }
  return true;
};

const ensureLA2StateForFilters = (la2StateRef, currentFilters) => {
  const filtersKey = serializeQueryFilters(currentFilters || {});
  if (la2StateRef.current.filtersKey === filtersKey) return;
  la2StateRef.current = createInitialLA2State(filtersKey);
};

export const loadMoreUsersLastAction2 = async ({
  la2StateRef,
  currentFilters = {},
  currentPage = 1,
  hasMore = true,
  isEditingRef,
  fetchUserById,
  mergeWithoutOverwrite,
  cacheFetchedUsers,
  setUsers,
  setHasMore,
  setTotalCount,
}) => {
  if (isEditingRef?.current) return { cacheCount: 0, backendCount: 0, hasMore };
  ensureLA2StateForFilters(la2StateRef, currentFilters);
  const la2State = la2StateRef.current;
  const targetAcceptedCount = Math.max(currentPage * PAGE_SIZE, la2State.acceptedIds.length + PAGE_SIZE);
  const { buckets: presetBuckets, hasExplicitBuckets } = getSelectedLastActionBuckets(currentFilters);
  const appliedFilters = buildLA2AppliedFilters(currentFilters);
  let safety = 0;
  const safetyLimit = 600;

  while (la2State.acceptedIds.length < targetAcceptedCount && la2State.hasMore && safety < safetyLimit) {
    safety += 1;
    let bucket;
    if (hasExplicitBuckets) {
      bucket = presetBuckets[la2State.bucketCursor];
      if (!bucket) {
        la2State.hasMore = false;
        break;
      }
    } else {
      bucket = makeLastActionDateBucket(la2State.defaultDayOffset);
    }

    // eslint-disable-next-line no-await-in-loop
    const idsSet = await getLA2SearchKeyBucketIds(la2StateRef, LAST_ACTION2_SEARCH_KEY_INDEX, bucket);
    const ids = [...idsSet];
    const cursor = la2State.userCursorByBucket[bucket] || 0;
    const slice = ids.slice(cursor, cursor + PAGE_SIZE);
    la2State.userCursorByBucket[bucket] = cursor + slice.length;

    for (const userId of slice) {
      if (la2State.shownIds.has(userId)) continue;
      // eslint-disable-next-line no-await-in-loop
      const passes = await userPassesLA2SearchKeyFilters(la2StateRef, userId, appliedFilters);
      if (!passes) continue;
      la2State.shownIds.add(userId);
      la2State.acceptedIds.push(userId);
      if (la2State.acceptedIds.length >= targetAcceptedCount) break;
    }

    if (slice.length < PAGE_SIZE || la2State.userCursorByBucket[bucket] >= ids.length) {
      if (hasExplicitBuckets) la2State.bucketCursor += 1;
      else la2State.defaultDayOffset += 1;
    }

    if (!hasExplicitBuckets && la2State.defaultDayOffset > safetyLimit) {
      la2State.hasMore = false;
    }
  }

  const pageIds = la2State.acceptedIds.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const pageUsers = {};
  await Promise.all(
    pageIds.map(async userId => {
      const cached = getCard(userId);
      const user = cached || (await fetchUserById(userId));
      if (user) pageUsers[userId] = user;
    })
  );

  if (!isEditingRef?.current) setUsers(prev => mergeWithoutOverwrite(prev, pageUsers));
  cacheFetchedUsers(pageUsers, cacheLoad2Users, currentFilters);
  setHasMore(la2State.hasMore);
  setTotalCount(Math.max(la2State.acceptedIds.length + (la2State.hasMore ? PAGE_SIZE : 0), la2State.acceptedIds.length));
  return { cacheCount: 0, backendCount: Object.keys(pageUsers).length, hasMore: la2State.hasMore };
};

export const LastAction2SortModeButton = ({ SortModeLabel, loadSortMode, onChange }) => (
  <SortModeLabel>
    <input
      type="radio"
      name="load-sort-mode"
      value={LAST_ACTION2_SORT_MODE}
      checked={loadSortMode === LAST_ACTION2_SORT_MODE}
      onChange={event => onChange(event.target.value)}
    />
    LA2
  </SortModeLabel>
);
