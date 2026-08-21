import React, { useState } from 'react';
import styled from 'styled-components';
import { normalizeDisplayValue } from './profileLayoutConfig';
import { getContactEntries } from './contactMethods';
import { utilCalculateAge } from './smallCard/utilCalculateAge';

// Admin-only data diagnostics for a matching row (spec §9).
//
// This module is only ever reached through React.lazy behind the diagnostics
// flag, so nothing here - the checks, the styles, the raw dump - is downloaded
// by an ordinary user.

const BMI_TOLERANCE = 0.5;

// An absent field must read as "no value", not as 0 - Number('') is 0, and a
// zero here would make every profile without an age field look inconsistent.
const toNumber = value => {
  const raw = String(normalizeDisplayValue(value)).replace(',', '.').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPhotoCount = user => {
  const raw = Array.isArray(user?.photos) ? user.photos : [user?.photos, user?.photo, user?.avatar];
  return raw.map(normalizeDisplayValue).filter(Boolean).length;
};

export const normalizePhoneDigits = value => String(value || '').replace(/[^\d]/g, '').replace(/^0+/, '');

// Every phone on every rendered profile, so a number that appears on two of them
// can be named on both rows rather than only on the second one seen.
export const buildPhoneIndex = users => {
  const index = new Map();
  (users || []).forEach(user => {
    if (!user?.userId) return;
    getContactEntries(user)
      .filter(entry => entry.key === 'phone')
      .forEach(entry => {
        const digits = normalizePhoneDigits(entry.value);
        if (!digits) return;
        if (!index.has(digits)) index.set(digits, new Set());
        index.get(digits).add(user.userId);
      });
  });
  return index;
};

export const collectProfileIssues = (user, { phoneIndex, failsActiveFilter = false } = {}) => {
  const issues = [];
  if (!user) return issues;

  if (getPhotoCount(user) === 0) issues.push('немає жодного фото');

  const birth = normalizeDisplayValue(user.birth);
  if (!birth) {
    issues.push('немає дати народження');
  } else {
    const storedAge = toNumber(user.age);
    const computedAge = utilCalculateAge(birth);
    if (storedAge !== null && Number.isFinite(computedAge) && storedAge !== computedAge) {
      issues.push(`вік ${storedAge} ≠ ${computedAge} за ДН`);
    }
  }

  const storedBmi = toNumber(user.bmi);
  const weight = toNumber(user.weight);
  const height = toNumber(user.height);
  if (storedBmi !== null && weight && height) {
    const computedBmi = (weight / ((height / 100) ** 2));
    if (Math.abs(storedBmi - computedBmi) > BMI_TOLERANCE) {
      issues.push(`BMI ${storedBmi} ≠ ${computedBmi.toFixed(1)} за зростом і вагою`);
    }
  }

  const contacts = getContactEntries(user);
  if (!contacts.length) issues.push('немає жодного контакту');

  if (phoneIndex) {
    const duplicated = contacts
      .filter(entry => entry.key === 'phone')
      .map(entry => normalizePhoneDigits(entry.value))
      .filter(digits => digits && (phoneIndex.get(digits)?.size || 0) > 1);
    if (duplicated.length) issues.push('телефон дублює інший профіль');
  }

  // A row that fails a filter it was supposed to be excluded by means the
  // filtering pipeline let it through - a bug in the query, not in the record.
  if (failsActiveFilter) issues.push('не проходить активний фільтр, але у видачі');

  return issues;
};

const Badge = styled.button`
  display: block;
  width: 100%;
  margin-top: 8px;
  padding: 4px 8px;
  box-sizing: border-box;
  text-align: left;
  font: inherit;
  font-size: 11px;
  line-height: 1.45;
  cursor: pointer;
  border: 1px solid color-mix(in srgb, #d64545 60%, transparent);
  border-radius: 8px;
  background: none;
  color: #d64545;

  &:focus-visible {
    outline: 2px solid color-mix(in srgb, #d64545 50%, transparent);
    outline-offset: 1px;
  }
`;

const RawDump = styled.pre`
  margin: 6px 0 0;
  padding: 8px 10px;
  max-height: 260px;
  overflow: auto;
  font-size: 10.5px;
  line-height: 1.45;
  border-radius: 8px;
  background: var(--matching-section-bg);
  color: var(--matching-muted-text);
  white-space: pre-wrap;
  word-break: break-word;
`;

const MatchingDiagnostics = ({ user, phoneIndex, failsActiveFilter }) => {
  const [open, setOpen] = useState(false);
  const issues = collectProfileIssues(user, { phoneIndex, failsActiveFilter });
  if (!issues.length) return null;

  return (
    <div onClick={e => e.stopPropagation()}>
      <Badge
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {issues.join(' · ')}
      </Badge>
      {open && <RawDump>{JSON.stringify(user, null, 2)}</RawDump>}
    </div>
  );
};

export default MatchingDiagnostics;
