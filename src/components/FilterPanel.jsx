import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { SearchFilters } from './SearchFilters';
import { REACTION_FILTER_DEFAULTS } from 'utils/reactionCategory';

const defaultsAdd = {
  csection: { cs2plus: true, cs1: true, cs0: true, no: true, other: true },
  role: { ed: true, sm: true, ag: true, ip: true, pp: true, cl: true, other: true, empty: true },
  maritalStatus: { married: true, unmarried: true, other: true, empty: true },
  bloodGroup: { 1: true, 2: true, 3: true, 4: true, other: true, empty: true },
  rh: { '+': true, '-': true, other: true, empty: true },
  age: {
    le25: true,
    '26_30': true,
    '31_33': true,
    '34_36': true,
    '37_42': true,
    '43_plus': true,
    other: true,
    empty: true,
  },
  imt: {
    le28: true,
    '29_31': true,
    '32_35': true,
    '36_plus': true,
    other: true,
    no: true,
  },
  height: {
    lt163: true,
    '163_176': true,
    '177_180': true,
    '181_plus': true,
    other: true,
    no: true,
  },
  contact: { vk: true, instagram: true, ameblo: true, facebook: true, phone: true, telegram: true, telegram2: true, tiktok: true, email: true, twitter: true, line: true, otherLink: true },
  userId: { vk: true, aa: true, ab: true, id: true, long: true, mid: true, other: true },
  fields: { le5: true, f6_10: true, f11_20: true, f20_plus: true },
  commentLength: {
    w0_9: true,
    w10_29: true,
    w30_49: true,
    w50_99: true,
    w100_199: true,
    w200_plus: true,
    other: true,
  },
  reaction: { ...REACTION_FILTER_DEFAULTS },
  lastAction: {
    today: true,
    yesterday: true,
    last3days: true,
    last7days: true,
    last14days: true,
    last30days: true,
    no: true,
    '?': true,
  },
};

const defaultsMatching = {
  userRole: { ed: true, ag: false, ip: false, other: false },
  maritalStatus: { married: true, unmarried: true, other: true },
  bloodGroup: { 1: true, 2: true, 3: true, 4: true, other: true },
  rh: { '+': true, '-': true, other: true },
  age: {
    le25: true,
    '26_30': true,
    '31_33': true,
    '34_36': true,
    '37_plus': true,
    other: true,
  },
  bmi: {
    lt18_5: true,
    '18_5_24_9': true,
    '25_29_9': true,
    '30_plus': true,
    other: true,
  },
  country: { ua: true, other: true, unknown: true },
};

const normalizeFilterGroup = (value, defaults) => {
  if (!value || typeof value !== 'object') return { ...defaults };
  return Object.keys(defaults).reduce((acc, key) => {
    acc[key] = value[key] !== undefined ? value[key] : defaults[key];
    return acc;
  }, {});
};

export const getDefaultFilters = ({ mode = 'default', nonAdminAllActive = false } = {}) => {
  if (mode !== 'matching') return defaultsAdd;
  if (!nonAdminAllActive) return defaultsMatching;
  return {
    ...defaultsMatching,
    userRole: { ed: true, ag: true, ip: true, other: true },
  };
};

export const getFilterStorageKey = ({ mode = 'default', storageKey } = {}) =>
  storageKey || (mode === 'matching' ? 'matchingFilters' : 'userFilters');

export const getInitialFilters = ({ mode = 'default', storageKey, nonAdminAllActive = false } = {}) => {
  const defaultFilters = getDefaultFilters({ mode, nonAdminAllActive });
  const stored = localStorage.getItem(getFilterStorageKey({ mode, storageKey }));
  if (!stored) return { ...defaultFilters };
  try {
    const parsed = JSON.parse(stored);
    const result = {};
    for (const key of Object.keys(defaultFilters)) {
      const savedKey = parsed[key] !== undefined ? key : key === 'userRole' ? 'role' : key;
      result[key] = normalizeFilterGroup(parsed[savedKey], defaultFilters[key]);
    }
    return result;
  } catch {
    return { ...defaultFilters };
  }
};

const FilterPanel = ({
  onChange,
  hideUserId = false,
  hideCommentLength = false,
  mode = 'default',
  storageKey: customKey,
  resetToken,
  nonAdminAllActive = false,
  allowedFilterNames,
  bloodSearchKeyMode = false,
  reactionFilterOptions,
}) => {
  const defaultFilters = useMemo(
    () => getDefaultFilters({ mode, nonAdminAllActive }),
    [mode, nonAdminAllActive],
  );
  const storageKey = getFilterStorageKey({ mode, storageKey: customKey });

  const [filters, setFilters] = useState(() =>
    getInitialFilters({ mode, storageKey, nonAdminAllActive }),
  );
  const onChangeRef = useRef(onChange);
  const lastNotifiedFiltersRef = useRef();
  const prevResetTokenRef = useRef(resetToken);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const notifyFiltersChange = useCallback(nextFilters => {
    if (lastNotifiedFiltersRef.current === nextFilters) return;
    lastNotifiedFiltersRef.current = nextFilters;
    if (onChangeRef.current) onChangeRef.current(nextFilters);
  }, []);

  const handleFiltersChange = useCallback(nextFilters => {
    setFilters(nextFilters);
    notifyFiltersChange(nextFilters);
  }, [notifyFiltersChange]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(filters));
    notifyFiltersChange(filters);
  }, [filters, notifyFiltersChange, storageKey]);

  useEffect(() => {
    if (prevResetTokenRef.current === resetToken) return;
    prevResetTokenRef.current = resetToken;
    setFilters({ ...defaultFilters });
  }, [defaultFilters, resetToken]);

  return (
    <SearchFilters
      filters={filters}
      onChange={handleFiltersChange}
      hideUserId={hideUserId}
      hideCommentLength={hideCommentLength}
      mode={mode}
      bloodSearchKeyMode={bloodSearchKeyMode}
      reactionFilterOptions={reactionFilterOptions}
      allowedFilterNames={allowedFilterNames}
    />
  );
};

export default FilterPanel;
