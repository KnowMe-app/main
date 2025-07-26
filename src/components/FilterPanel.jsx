import React, { useEffect, useState, useMemo } from 'react';
import { SearchFilters } from './SearchFilters';

const defaultsAdd = {
  csection: { cs2plus: true, cs1: true, cs0: true, other: true },
  role: { ed: true, sm: true, ag: true, ip: true, cl: true, other: true },
  maritalStatus: { married: true, unmarried: true, other: true },
  bloodGroup: { 1: true, 2: true, 3: true, 4: true, other: true },
  rh: { '+': true, '-': true, other: true },
  age: {
    le25: true,
    '26_30': true,
    '31_36': true,
    '37_42': true,
    '43_plus': true,
    other: true,
  },
  userId: { vk: true, aa: true, ab: true, long: true, mid: true, other: true },
  fields: { lt4: true, lt8: true, lt12: true, other: true },
  commentLength: {
    w0_9: true,
    w10_29: true,
    w30_49: true,
    w50_99: true,
    w100_199: true,
    w200_plus: true,
    other: true,
  },
};

const defaultsMatching = {
  role: { ed: true, ag: false, ip: false, other: false },
  maritalStatus: { married: true, unmarried: true, other: true },
  bloodGroup: { 1: true, 2: true, 3: true, 4: true, other: true },
  rh: { '+': true, '-': true, other: true },
  age: {
    le25: true,
    '26_30': true,
    '31_36': true,
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
}) => {
  const defaultFilters = useMemo(
    () => (mode === 'matching' ? defaultsMatching : defaultsAdd),
    [mode],
  );
  const storageKey =
    customKey || (mode === 'matching' ? 'matchingFilters' : 'userFilters');

  const getInitialFilters = () => {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return { ...defaultFilters };
    try {
      const parsed = JSON.parse(stored);
      const result = {};
      for (const key of Object.keys(defaultFilters)) {
        result[key] = normalizeFilterGroup(parsed[key], defaultFilters[key]);
      }
      return result;
    } catch {
      return { ...defaultFilters };
    }
  };

  const [filters, setFilters] = useState(getInitialFilters);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(filters));
    if (onChange) onChange(filters);
  }, [filters, onChange, storageKey]);

  return <SearchFilters filters={filters} onChange={setFilters} hideUserId={hideUserId} hideCommentLength={hideCommentLength} mode={mode} />;
};

export default FilterPanel;
