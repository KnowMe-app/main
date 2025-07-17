import React, { useEffect, useState } from 'react';
import { SearchFilters } from './SearchFilters';

const defaultFilters = {
  csection: { cs2plus: true, cs1: true, cs0: true, other: true },
  role: { ed: true, sm: true, ag: true, ip: true, cl: true, other: true },
  maritalStatus: { married: true, unmarried: true, other: true },
  blood: { pos: true, neg: true, other: true },
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

const normalizeFilterGroup = (value, defaults) => {
  return typeof value === 'object' && value !== null ? { ...defaults, ...value } : { ...defaults };
};

const getInitialFilters = () => {
  const stored = localStorage.getItem('userFilters');
  if (!stored) return { ...defaultFilters };
  try {
    const parsed = JSON.parse(stored);
    return {
      csection: normalizeFilterGroup(parsed.csection, defaultFilters.csection),
      role: normalizeFilterGroup(parsed.role, defaultFilters.role),
      maritalStatus: normalizeFilterGroup(parsed.maritalStatus, defaultFilters.maritalStatus),
      blood: normalizeFilterGroup(parsed.blood, defaultFilters.blood),
      age: normalizeFilterGroup(parsed.age, defaultFilters.age),
      userId: normalizeFilterGroup(parsed.userId, defaultFilters.userId),
      fields: normalizeFilterGroup(parsed.fields, defaultFilters.fields),
      commentLength: normalizeFilterGroup(parsed.commentLength, defaultFilters.commentLength),
    };
  } catch {
    return { ...defaultFilters };
  }
};

const FilterPanel = ({ onChange, hideUserId = false, hideCommentLength = false }) => {
  const [filters, setFilters] = useState(getInitialFilters);

  useEffect(() => {
    localStorage.setItem('userFilters', JSON.stringify(filters));
    if (onChange) onChange(filters);
  }, [filters, onChange]);

  return (
    <SearchFilters
      filters={filters}
      onChange={setFilters}
      hideUserId={hideUserId}
      hideCommentLength={hideCommentLength}
    />
  );
};

export default FilterPanel;
