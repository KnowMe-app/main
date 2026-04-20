import React, { useEffect, useState, useMemo, useRef } from 'react';
import { SearchFilters } from './SearchFilters';
import { REACTION_FILTER_DEFAULTS } from 'utils/reactionCategory';

const defaultsAdd = {
  csection: { cs2plus: true, cs1: true, cs0: true, no: true, other: true },
  role: { ed: true, sm: true, ag: true, ip: true, cl: true, other: true, empty: true },
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
  contact: { vk: true, instagram: true, facebook: true, phone: true, telegram: true, telegram2: true, tiktok: true, email: true },
  userId: { vk: true, aa: true, ab: true, long: true, mid: true, other: true },
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
};

const defaultsMatching = {
  userRole: { ed: true, ag: false, ip: false, other: false },
  maritalStatus: { married: true, unmarried: true, other: true, empty: true },
  bloodGroup: { 1: true, 2: true, 3: true, 4: true, other: true, empty: true },
  rh: { '+': true, '-': true, other: true, empty: true },
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
  return typeof value === 'object' && value !== null ? { ...defaults, ...value } : { ...defaults };
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
}) => {
  const defaultFilters = useMemo(() => {
    if (mode !== 'matching') return defaultsAdd;
    if (!nonAdminAllActive) return defaultsMatching;
    return {
      ...defaultsMatching,
      userRole: { ed: true, ag: true, ip: true, other: true },
    };
  }, [mode, nonAdminAllActive]);
  const storageKey = customKey || (mode === 'matching' ? 'matchingFilters' : 'userFilters');

  const getInitialFilters = () => {
    const stored = localStorage.getItem(storageKey);
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

  const [filters, setFilters] = useState(getInitialFilters);
  const onChangeRef = useRef(onChange);
  const prevResetTokenRef = useRef(resetToken);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(filters));
    if (onChangeRef.current) onChangeRef.current(filters);
  }, [filters, storageKey]);

  useEffect(() => {
    if (prevResetTokenRef.current === resetToken) return;
    prevResetTokenRef.current = resetToken;
    setFilters({ ...defaultFilters });
  }, [defaultFilters, resetToken]);

  return (
    <SearchFilters
      filters={filters}
      onChange={setFilters}
      hideUserId={hideUserId}
      hideCommentLength={hideCommentLength}
      mode={mode}
      bloodSearchKeyMode={bloodSearchKeyMode}
      allowedFilterNames={allowedFilterNames}
    />
  );
};

export default FilterPanel;
