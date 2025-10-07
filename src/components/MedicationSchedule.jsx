import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';

import {
  deriveScheduleDisplayInfo,
  formatWeeksDaysToken,
  sanitizeDescription,
  generateSchedule,
} from './StimulationSchedule';
import {
  BASE_MEDICATIONS,
  BASE_MEDICATION_PLACEHOLDERS,
  BASE_MEDICATIONS_MAP,
  deriveShortLabel,
  slugifyMedicationKey,
} from '../utils/medicationConstants';
import { parseMedicationClipboardData } from '../utils/medicationClipboard';

const DEFAULT_ROWS = 280;
const WEEKDAY_LABELS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const DATE_COLUMN_MIN_WIDTH = 58;
const DATE_COLUMN_STYLE = { minWidth: `${DATE_COLUMN_MIN_WIDTH}px` };

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: black;
`;

const IssuedList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const IssuedRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const IssuedRowHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
`;

const IssuedLabel = styled.span`
  font-weight: 500;
`;

const IssuedInput = styled.input`
  width: 120px;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d0d0d0;
  font-size: 14px;
  color: black;

  &::placeholder {
    color: #888;
  }
`;

const IssuedStats = styled.span`
  font-size: 13px;
  color: #666;
`;

const RemainingValue = styled.span`
  color: ${props => {
    if (props.$negative) {
      return '#d1433f';
    }

    if (props.$positive) {
      return '#1a7f37';
    }

    return 'inherit';
  }};
  font-weight: 500;
`;

const FormulaHint = styled.span`
  font-size: 12px;
  color: #888;
`;

const AddMedicationRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid #e6e6e6;
`;

const AddMedicationLabel = styled.span`
  font-weight: 500;
  font-size: 14px;
`;

const AddMedicationControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const AddMedicationInput = styled.input`
  width: ${props => (props.$wide ? '200px' : '120px')};
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #d0d0d0;
  font-size: 14px;
  color: black;
  box-sizing: border-box;
`;

const AddMedicationButton = styled.button`
  padding: 6px 10px;
  border-radius: 6px;
  border: none;
  background-color: #2e7d32;
  color: white;
  font-size: 16px;
  cursor: pointer;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;

  &:hover:not(:disabled) {
    background-color: #276528;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const AddMedicationHint = styled.span`
  font-size: 12px;
  color: #777;
`;

const AddMedicationGuide = styled.span`
  font-size: 12px;
  color: #555;
  white-space: nowrap;
`;

const TableWrapper = styled.div`
  max-height: 60vh;
  overflow: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: black;
`;

const Th = styled.th`
  position: sticky;
  top: 0;
  background: #fafafa;
  padding: 8px;
  border-bottom: 1px solid #d9d9d9;
  font-weight: 500;
  text-align: left;
`;

const Td = styled.td`
  padding: 6px 6px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
`;

const CellInput = styled.input`
  width: 2ch;
  min-width: 20px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid
    ${({ $status }) => {
      if ($status === 'negative') {
        return '#ef5350';
      }
      if ($status === 'positive') {
        return '#66bb6a';
      }
      return '#d0d0d0';
    }};
  font-size: 13px;
  text-align: center;
  color: ${({ $status }) => {
    if ($status === 'negative') {
      return '#b71c1c';
    }
    if ($status === 'positive') {
      return '#1b5e20';
    }
    return 'black';
  }};
  box-sizing: border-box;
  display: inline-block;
  background-color: ${({ $status }) => {
    if ($status === 'negative') {
      return '#ffebee';
    }
    if ($status === 'positive') {
      return '#e8f5e9';
    }
    return 'white';
  }};
`;

const MedicationTh = styled(Th)`
  min-width: 26px;
  width: 26px;
  max-width: 26px;
  text-align: center;
  padding: 6px;
  background: #fafafa;
  overflow: visible;
`;

const MedicationHeaderContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

const MedicationHeaderButton = styled.button`
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  line-height: 1.1;
  transition: background-color 0.2s ease, color 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;

  &:hover {
    background: rgba(183, 28, 28, 0.1);
    color: #b71c1c;
  }

  &:focus-visible {
    outline: 2px solid #b71c1c;
    outline-offset: 2px;
  }
`;

const DayCell = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-weight: 500;
`;

const DayBadge = styled.span`
  font-size: 11px;
  color: #555;
  font-weight: 600;
  white-space: nowrap;
`;

const DayNumber = styled.span`
  font-variant-numeric: tabular-nums;
`;

const DateCellContent = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
`;

const DateText = styled.span`
  font-variant-numeric: tabular-nums;
`;

const WeekdayTag = styled.span`
  font-size: 12px;
  color: #777;
  text-transform: lowercase;
`;

const YearSeparatorRow = styled.tr`
  background: #f3f3f3;
`;

const YearSeparatorCell = styled.td`
  padding: 6px 10px;
  font-weight: 600;
  font-size: 13px;
  color: #444;
  border-bottom: 1px solid #e0e0e0;
`;

const HighlightedRow = styled.tr`
  background: #fff6e5;
`;

const DescriptionRow = styled.tr`
  background: #fffaf0;
`;

const DescriptionCell = styled.td`
  padding: 8px 12px;
  border-bottom: 1px solid #f0e0c5;
  font-size: 13px;
  color: #6a4b16;
`;

const StatusCell = styled.td`
  padding: 6px 6px;
  border-bottom: 1px solid #f0e0c5;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
`;

const StatusValue = styled.span`
  color: ${props => (props.$isNegative ? '#d32f2f' : '#2e7d32')};
`;

const MedicationTd = styled(Td)`
  text-align: center;
  padding: 4px;
  min-width: 26px;
  width: 26px;
`;

const MedicationStatusCell = styled(StatusCell)`
  background: #fffaf0;
`;

const DescriptionList = styled.ul`
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const DescriptionItem = styled.li`
  list-style-type: '•';
  padding-left: 4px;
`;

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background: white;
  border-radius: 12px;
  padding: 24px;
  width: min(90vw, 360px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
`;

const ModalMessage = styled.p`
  margin: 0;
  font-size: 14px;
  color: #444;
`;

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const ModalButton = styled.button`
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s ease;
`;

const ModalCancelButton = styled(ModalButton)`
  background: #e0e0e0;
  color: #333;

  &:hover {
    background: #cfcfcf;
  }
`;

const ModalConfirmButton = styled(ModalButton)`
  background: #d84315;
  color: white;

  &:hover {
    background: #bf360c;
  }
`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const differenceInCalendarDays = (target, base) => {
  if (!(target instanceof Date) || !(base instanceof Date)) return 0;

  const normalizedTarget = new Date(target);
  normalizedTarget.setHours(0, 0, 0, 0);

  const normalizedBase = new Date(base);
  normalizedBase.setHours(0, 0, 0, 0);

  const diff = normalizedTarget.getTime() - normalizedBase.getTime();
  return Math.round(diff / MS_PER_DAY);
};

const isValidDate = date => date instanceof Date && !Number.isNaN(date.getTime());

const parseDateString = (value, baseDate) => {
  if (!value) return null;
  if (value instanceof Date) return isValidDate(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (isValidDate(direct)) return direct;

  const parts = trimmed.split(/[./-]/).filter(Boolean);
  if (parts.length < 2) return null;
  const [dayPart, monthPart, yearPart] = parts;
  const day = Number(dayPart);
  const month = Number(monthPart);
  if (Number.isNaN(day) || Number.isNaN(month)) return null;

  const monthIndex = month - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;

  const hasExplicitYear = yearPart !== undefined && yearPart !== null && yearPart !== '';
  if (hasExplicitYear) {
    const normalizedYear = Number(yearPart.length === 2 ? `20${yearPart}` : yearPart);
    if (Number.isNaN(normalizedYear)) return null;
    const candidate = new Date(normalizedYear, monthIndex, day);
    if (!isValidDate(candidate)) return null;
    if (candidate.getDate() !== day || candidate.getMonth() !== monthIndex) return null;
    return candidate;
  }

  const base = baseDate instanceof Date && isValidDate(baseDate) ? baseDate : null;
  const referenceYear = base ? base.getFullYear() : new Date().getFullYear();
  const candidateYears = base ? [referenceYear - 1, referenceYear, referenceYear + 1] : [referenceYear];
  const validCandidates = candidateYears
    .map(year => {
      const candidate = new Date(year, monthIndex, day);
      if (!isValidDate(candidate)) return null;
      if (candidate.getDate() !== day || candidate.getMonth() !== monthIndex) return null;
      return candidate;
    })
    .filter(Boolean);

  if (validCandidates.length === 0) return null;

  if (!base) {
    return validCandidates[0];
  }

  let closest = validCandidates[0];
  let minDiff = Math.abs(closest.getTime() - base.getTime());
  for (let index = 1; index < validCandidates.length; index += 1) {
    const candidate = validCandidates[index];
    const diff = Math.abs(candidate.getTime() - base.getTime());
    if (diff < minDiff) {
      closest = candidate;
      minDiff = diff;
    }
  }

  return closest;
};

const formatISODate = date => {
  if (!(date instanceof Date)) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  if (!(date instanceof Date)) return null;
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const sanitizeDateInput = (value, baseDate) => {
  if (!value) return '';
  const parsed = parseDateString(value, baseDate);
  return parsed ? formatISODate(parsed) : String(value);
};

const formatDateForDisplay = value => {
  const parsed = parseDateString(value);
  if (!parsed) return value || '';
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
};

const DAYS_IN_WEEK = 7;
const TEN_WEEKS_IN_DAYS = 10 * DAYS_IN_WEEK;
const PROGYNOVA_TAPER_PHASE_LENGTH = 5;
const INJESTA_START_DAY = 14;
const INJESTA_END_DAY = 12 * DAYS_IN_WEEK;
const INJESTA_DEFAULT_DAILY_DOSE = 2;

const PLAN_HANDLERS = {
  progynova: {
    defaultIssued: 21,
    maxDay: TEN_WEEKS_IN_DAYS + PROGYNOVA_TAPER_PHASE_LENGTH * 2,
    getDailyValue: ({ dayNumber, issued, used }) => {
      if (!Number.isFinite(dayNumber) || dayNumber <= 0) return '';
      if (!Number.isFinite(issued) || issued <= 0) return '';
      if (!Number.isFinite(used) || used >= issued) return '';

      if (dayNumber <= 3) {
        return 1;
      }

      if (dayNumber <= 5) {
        return 2;
      }

      if (dayNumber <= TEN_WEEKS_IN_DAYS) {
        return 3;
      }

      const daysBeyondTenWeeks = dayNumber - TEN_WEEKS_IN_DAYS;

      if (daysBeyondTenWeeks >= 1 && daysBeyondTenWeeks <= PROGYNOVA_TAPER_PHASE_LENGTH) {
        return 2;
      }

      if (
        daysBeyondTenWeeks > PROGYNOVA_TAPER_PHASE_LENGTH &&
        daysBeyondTenWeeks <= PROGYNOVA_TAPER_PHASE_LENGTH * 2
      ) {
        return 1;
      }

      return '';
    },
  },
  metypred: {
    defaultIssued: 30,
    maxDay: 60,
    getDailyValue: ({ dayNumber }) => (dayNumber >= 1 && dayNumber <= 60 ? 1 : ''),
  },
  aspirin: {
    defaultIssued: 14,
    maxDay: 36 * DAYS_IN_WEEK,
    getDailyValue: ({ dayNumber }) => (dayNumber >= 1 && dayNumber <= 36 * DAYS_IN_WEEK ? 1 : ''),
  },
  injesta: {
    defaultIssued: 0,
    maxDay: INJESTA_END_DAY,
    getDailyValue: ({ dayNumber }) => {
      if (!Number.isFinite(dayNumber)) return '';
      if (dayNumber < INJESTA_START_DAY || dayNumber > INJESTA_END_DAY) return '';
      return INJESTA_DEFAULT_DAILY_DOSE;
    },
  },
  folicAcid: {
    defaultIssued: 25,
    maxDay: 12 * DAYS_IN_WEEK,
    getDailyValue: ({ dayNumber }) => (dayNumber >= 1 && dayNumber <= 12 * DAYS_IN_WEEK ? 1 : ''),
  },
  luteina: {
    defaultIssued: 0,
    maxDay: 16 * DAYS_IN_WEEK,
    getDailyValue: ({ dayNumber }) => (dayNumber >= 13 && dayNumber <= 16 * DAYS_IN_WEEK ? 2 : ''),
  },
  custom: {
    defaultIssued: 0,
    maxDay: 0,
    getDailyValue: ({ rowDate, medication, issued, used, schedule }) => {
      if (!medication || !issued) return '';
      const scheduleStart = parseDateString(schedule?.startDate);
      const startDate = parseDateString(medication.startDate, scheduleStart);
      if (!(rowDate instanceof Date) || !startDate) return '';
      if (rowDate < startDate) return '';
      if (!Number.isFinite(issued) || issued <= 0) return '';
      if (!Number.isFinite(used)) return '';
      if (used >= issued) return '';
      return 1;
    },
  },
};

const getPlanHandler = plan => PLAN_HANDLERS[plan] || PLAN_HANDLERS.custom;

const getPlanDefaultIssued = (plan, medication) => {
  const handler = getPlanHandler(plan);
  if (typeof handler.defaultIssued === 'function') {
    return handler.defaultIssued({ medication });
  }
  const base = Number(handler.defaultIssued);
  return Number.isFinite(base) ? base : 0;
};

const getPlanMaxDay = plan => {
  const handler = getPlanHandler(plan);
  const value = Number(handler.maxDay);
  return Number.isFinite(value) && value > 0 ? value : 0;
};

const sanitizeCellValue = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '.');
    if (normalized === '') return '';
    const numberValue = Number(normalized);
    return Number.isNaN(numberValue) ? '' : numberValue;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? '' : numberValue;
};

const parseDecimalInput = value => {
  if (value === null || value === undefined) {
    return Number.NaN;
  }

  if (typeof value === 'number') {
    return value;
  }

  const normalized = String(value).trim().replace(/,/g, '.');
  if (!normalized) {
    return Number.NaN;
  }

  return Number(normalized);
};

const doesMedicationMatchDefaultDistribution = (schedule, key) => {
  if (!schedule || !key) return false;

  const rows = Array.isArray(schedule.rows) ? schedule.rows : [];
  if (!rows.length) {
    return true;
  }

  const medication = schedule?.medications?.[key];
  if (!medication) {
    return true;
  }

  const issued = Number(medication.issued) || 0;
  if (issued <= 0) {
    return rows.every(row => sanitizeCellValue(row?.values?.[key]) === '');
  }

  const comparisonSchedule = {
    ...schedule,
    medications: { [key]: medication },
    medicationOrder: [key],
  };

  const baseRows = rows.map(row => ({
    date: row?.date,
    values: { [key]: '' },
  }));

  const expectedRows = applyDefaultDistribution(baseRows, comparisonSchedule, { onlyKeys: [key] });

  for (let index = 0; index < rows.length; index += 1) {
    const actual = sanitizeCellValue(rows[index]?.values?.[key]);
    const expected = sanitizeCellValue(expectedRows[index]?.values?.[key]);

    if (actual === '') {
      if (expected !== '') {
        return false;
      }
      continue;
    }

    if (actual !== expected) {
      return false;
    }
  }

  return true;
};

const sanitizeScheduleForStorage = schedule => {
  if (!schedule || typeof schedule !== 'object') {
    return schedule;
  }

  const medicationOrder = Array.isArray(schedule.medicationOrder)
    ? schedule.medicationOrder.filter(Boolean)
    : [];
  const medications = schedule.medications && typeof schedule.medications === 'object'
    ? schedule.medications
    : {};

  const keysToRemove = medicationOrder.filter(key => {
    const medication = medications[key];
    if (!medication) {
      return false;
    }
    const plan = medication.plan || key;
    const issued = Number(medication.issued) || 0;
    const defaultIssued = getPlanDefaultIssued(plan, medication);

    if (issued !== defaultIssued) {
      return false;
    }

    if (medication.displayValue) {
      return false;
    }

    return doesMedicationMatchDefaultDistribution(schedule, key);
  });

  if (!keysToRemove.length) {
    return {
      ...schedule,
    };
  }

  const removalSet = new Set(keysToRemove);

  const sanitizedMedications = Object.entries(medications).reduce((acc, [key, value]) => {
    if (!removalSet.has(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});

  const sanitizedOrder = medicationOrder.filter(key => !removalSet.has(key));

  const rows = Array.isArray(schedule.rows) ? schedule.rows : [];
  const sanitizedRows = rows.map(row => {
    const values = row?.values && typeof row.values === 'object' ? { ...row.values } : {};
    let changed = false;

    removalSet.forEach(key => {
      if (key in values) {
        delete values[key];
        changed = true;
      }
    });

    if (!changed) {
      return row;
    }

    return {
      ...row,
      values,
    };
  });

  const hasRowData = sanitizedRows.some(row => {
    if (!row || typeof row !== 'object') {
      return false;
    }
    const values = row.values && typeof row.values === 'object' ? row.values : {};
    return Object.values(values).some(value => sanitizeCellValue(value) !== '');
  });

  return {
    ...schedule,
    medications: sanitizedMedications,
    medicationOrder: sanitizedOrder,
    rows: hasRowData ? sanitizedRows : [],
  };
};

const evaluateIssuedInput = (displayValue, fallbackIssued) => {
  if (displayValue === null || displayValue === undefined) {
    const fallback = Number(fallbackIssued);
    return {
      issued: Number.isFinite(fallback) ? fallback : 0,
      displayValue: '',
    };
  }

  if (displayValue === '') {
    return {
      issued: 0,
      displayValue: '',
    };
  }

  const raw = String(displayValue).trim();
  if (!raw) {
    return { issued: 0, displayValue: '' };
  }

  const cleaned = raw.startsWith('=') ? raw.slice(1) : raw;
  const parts = cleaned.split('+').map(part => part.replace(/,/g, '.').trim()).filter(Boolean);

  if (parts.length > 1) {
    const numbers = parts.map(Number);
    if (numbers.every(num => !Number.isNaN(num))) {
      const sum = numbers.reduce((acc, num) => acc + num, 0);
      return {
        issued: sum,
        displayValue: raw.startsWith('=') ? raw : `=${cleaned}`,
      };
    }
  }

  const numberValue = Number(cleaned.replace(/,/g, '.'));
  if (!Number.isNaN(numberValue)) {
    return {
      issued: numberValue,
      displayValue: raw.startsWith('=') ? raw : '',
    };
  }

  const fallback = Number(fallbackIssued);
  return {
    issued: Number.isFinite(fallback) ? fallback : 0,
    displayValue: raw,
  };
};

const ensureRowsLength = (rows, minLength, startDate, medicationKeys = []) => {
  const baseDate = parseDateString(startDate) || new Date();
  const sourceRows = Array.isArray(rows) ? rows : [];
  const targetLength = Math.max(minLength || 0, sourceRows.length);
  const result = [];

  for (let index = 0; index < targetLength; index += 1) {
    const source = sourceRows[index];
    const baseValues = source && typeof source === 'object' ? (source.values || source) : {};
    const values = {};
    medicationKeys.forEach(key => {
      values[key] = sanitizeCellValue(baseValues[key]);
    });
    result.push({
      date: formatISODate(addDays(baseDate, index)),
      values,
    });
  }

  return result;
};

const applyDefaultDistribution = (rows, schedule, options = {}) => {
  const { skipExisting = false, existingLength = 0, onlyKeys = null } = options;
  const medicationKeys = Array.isArray(schedule?.medicationOrder)
    ? schedule.medicationOrder
    : [];
  const filteredKeys = Array.isArray(onlyKeys) && onlyKeys.length > 0
    ? medicationKeys.filter(key => onlyKeys.includes(key))
    : medicationKeys;
  const baseDate = parseDateString(schedule?.startDate) || new Date();
  const usageCounters = {};
  medicationKeys.forEach(key => {
    usageCounters[key] = 0;
  });

  return rows.map((row, rowIndex) => {
    const rowDate = parseDateString(row.date, baseDate) || addDays(baseDate, rowIndex);
    const nextValues = { ...row.values };
    const shouldSkipRow = skipExisting && rowIndex < existingLength;
    const isFirstRow = rowIndex === 0;

    medicationKeys.forEach(key => {
      const shouldProcessKey = filteredKeys.includes(key);

      if (!shouldProcessKey) {
        return;
      }

      if (isFirstRow) {
        nextValues[key] = '';
        return;
      }

      const medication = schedule?.medications?.[key] || {};
      const plan = medication.plan || key;
      const handler = getPlanHandler(plan);
      const issued = Number(medication.issued) || 0;
      const currentValue = sanitizeCellValue(nextValues[key]);

      if (currentValue !== '') {
        usageCounters[key] += Number(currentValue);
        nextValues[key] = currentValue;
        return;
      }

      if (issued <= 0 || shouldSkipRow) {
        nextValues[key] = '';
        return;
      }

      if (usageCounters[key] >= issued) {
        nextValues[key] = '';
        return;
      }

      const proposed = handler.getDailyValue({
        dayNumber: rowIndex + 1,
        rowDate,
        medication,
        schedule,
        issued,
        used: usageCounters[key],
      });

      const numericValue = Number(proposed);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        nextValues[key] = '';
        return;
      }

      const remaining = issued - usageCounters[key];
      const applied = Math.min(remaining, numericValue);
      usageCounters[key] += applied;
      nextValues[key] = applied;
    });

    return {
      ...row,
      values: nextValues,
    };
  });
};

const calculateRequiredRows = (medicationOrder = [], medications = {}, baseLength = 0) =>
  Math.max(
    DEFAULT_ROWS,
    baseLength,
    ...medicationOrder.map(key => {
      const medication = medications?.[key] || {};
      const issued = Number(medication.issued) || 0;
      const plan = medication.plan || key;
      return Math.max(issued, getPlanMaxDay(plan));
    }),
  );

const normalizeRows = (rowsInput, startDate, schedule) => {
  const medicationOrder = Array.isArray(schedule?.medicationOrder)
    ? schedule.medicationOrder
    : [];
  const existingLength = Array.isArray(rowsInput) ? rowsInput.length : 0;
  const hasExistingRows = existingLength > 0;
  const minRows = calculateRequiredRows(medicationOrder, schedule?.medications, existingLength);

  const baseRows = ensureRowsLength(rowsInput, minRows, startDate, medicationOrder);

  if (!hasExistingRows) {
    return applyDefaultDistribution(baseRows, schedule);
  }

  if (existingLength < minRows) {
    return applyDefaultDistribution(baseRows, schedule, {
      skipExisting: true,
      existingLength,
    });
  }

  const medicationKeys = Array.isArray(schedule?.medicationOrder)
    ? schedule.medicationOrder
    : [];

  const rowsWithValues = Array.isArray(rowsInput) ? rowsInput : [];

  const keysNeedingDefaults = medicationKeys.filter(key => {
    const medication = schedule?.medications?.[key];
    const issued = Number(medication?.issued) || 0;

    if (issued <= 0) {
      return false;
    }

    return !rowsWithValues.some(row => {
      if (!row || typeof row !== 'object') {
        return false;
      }

      const sourceValues =
        row.values && typeof row.values === 'object' ? row.values : row;

      return sanitizeCellValue(sourceValues?.[key]) !== '';
    });
  });

  if (keysNeedingDefaults.length > 0) {
    return applyDefaultDistribution(baseRows, schedule, { onlyKeys: keysNeedingDefaults });
  }

  return baseRows;
};

const normalizeData = (data, options = {}) => {
  const cycleStart = options.cycleStart;
  const cycleStartDate = parseDateString(cycleStart);
  const rawStartDate = data?.startDate;

  const resolveIsoDate = candidate => {
    if (!candidate) return '';
    const parsed = parseDateString(candidate, cycleStartDate);
    return parsed ? formatISODate(parsed) : '';
  };

  const startDate = (() => {
    const cycleIso = resolveIsoDate(cycleStart);
    if (cycleIso) return cycleIso;

    const sanitizedCycleStart = sanitizeDateInput(cycleStart, cycleStartDate);
    const sanitizedCycleIso = resolveIsoDate(sanitizedCycleStart);
    if (sanitizedCycleIso) return sanitizedCycleIso;

    if (cycleStartDate) return formatISODate(cycleStartDate);

    const sanitizedStoredIso = resolveIsoDate(sanitizeDateInput(rawStartDate, cycleStartDate));
    if (sanitizedStoredIso) return sanitizedStoredIso;

    const rawStoredIso = resolveIsoDate(rawStartDate);
    if (rawStoredIso) return rawStoredIso;

    return formatISODate(new Date());
  })();

  const storedMedications = data?.medications || {};
  const storedOrder = Array.isArray(data?.medicationOrder)
    ? data.medicationOrder.filter(Boolean)
    : [];

  const orderSet = new Set();
  const medicationOrder = [];
  const baseMedicationKeys = BASE_MEDICATIONS.map(({ key }) => key);
  const customMedicationKeys = [];

  const addToOrder = key => {
    if (!key || orderSet.has(key)) return;
    orderSet.add(key);
    medicationOrder.push(key);
  };

  const rememberCustomKey = key => {
    if (!key) return;
    if (baseMedicationKeys.includes(key)) return;
    if (customMedicationKeys.includes(key)) return;
    customMedicationKeys.push(key);
  };

  storedOrder.forEach(rememberCustomKey);
  Object.keys(storedMedications).forEach(rememberCustomKey);

  baseMedicationKeys.forEach(addToOrder);
  customMedicationKeys.forEach(addToOrder);

  const medications = {};

  medicationOrder.forEach(key => {
    const baseDefinition = BASE_MEDICATIONS_MAP.get(key);
    const source = storedMedications[key] || {};
    const plan = source.plan || baseDefinition?.plan || key;
    const baseDisplay =
      source.displayValue !== undefined && source.displayValue !== null
        ? String(source.displayValue)
        : '';
    const computed = evaluateIssuedInput(baseDisplay, source.issued);
    const issuedSource =
      source.issued !== undefined && source.issued !== null
        ? Number(source.issued)
        : null;
    const defaultIssued = getPlanDefaultIssued(plan, source);
    const issued =
      issuedSource !== null && Number.isFinite(issuedSource)
        ? issuedSource
        : computed.issued || defaultIssued;

    medications[key] = {
      issued: Number.isFinite(issued) ? issued : 0,
      displayValue: baseDisplay ? computed.displayValue || baseDisplay : computed.displayValue || '',
      label: source.label || baseDefinition?.label || key,
      short: source.short || baseDefinition?.short || (source.label || key).slice(0, 2).toUpperCase(),
      plan,
      startDate: source.startDate || '',
    };
  });

  const scheduleBase = {
    startDate,
    medications,
    medicationOrder,
  };

  const rows = normalizeRows(data?.rows, startDate, scheduleBase);

  return {
    ...scheduleBase,
    rows,
    updatedAt: data?.updatedAt || Date.now(),
  };
};

const mergeScheduleWithClipboardData = (current, parsed) => {
  if (!parsed || typeof parsed !== 'object') {
    return current;
  }

  if (!current || typeof current !== 'object') {
    return {
      ...parsed,
      rows: Array.isArray(parsed.rows)
        ? parsed.rows.map(row => ({
            date: row?.date || '',
            values: Object.entries(row?.values || {}).reduce((acc, [key, value]) => {
              acc[key] = sanitizeCellValue(value);
              return acc;
            }, {}),
          }))
        : [],
    };
  }

  const previousStartDate = parseDateString(current.startDate);
  const parsedStartDate = parseDateString(parsed.startDate, previousStartDate || undefined);

  let effectiveStartDate = previousStartDate || parsedStartDate || new Date();
  if (parsedStartDate && previousStartDate && parsedStartDate < previousStartDate) {
    effectiveStartDate = parsedStartDate;
  } else if (!previousStartDate && parsedStartDate) {
    effectiveStartDate = parsedStartDate;
  }

  const effectiveStartIso = formatISODate(effectiveStartDate);

  const previousOrder = Array.isArray(current.medicationOrder)
    ? current.medicationOrder.filter(Boolean)
    : [];
  const parsedOrder = Array.isArray(parsed.medicationOrder)
    ? parsed.medicationOrder.filter(Boolean)
    : [];

  const orderSet = new Set(previousOrder);
  const mergedOrder = [...previousOrder];
  parsedOrder.forEach(key => {
    if (!orderSet.has(key)) {
      orderSet.add(key);
      mergedOrder.push(key);
    }
  });

  const mergedMedications = { ...(current.medications || {}) };
  parsedOrder.forEach(key => {
    const parsedMedication = parsed.medications?.[key];
    if (parsedMedication) {
      mergedMedications[key] = { ...parsedMedication };
    }
  });

  const medicationKeys = mergedOrder;

  const buildRowValues = (row, keys) => {
    const sourceValues = row?.values && typeof row.values === 'object' ? row.values : {};
    const values = {};
    keys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(sourceValues, key)) {
        values[key] = sanitizeCellValue(sourceValues[key]);
      } else {
        values[key] = '';
      }
    });
    return values;
  };

  const existingRows = Array.isArray(current.rows)
    ? current.rows.map(row => ({
        date: row?.date || '',
        values: buildRowValues(row, medicationKeys),
      }))
    : [];

  const needsPrefix =
    previousStartDate &&
    effectiveStartDate &&
    previousStartDate > effectiveStartDate
      ? differenceInCalendarDays(previousStartDate, effectiveStartDate)
      : 0;

  const prefixRows = [];
  for (let index = 0; index < needsPrefix; index += 1) {
    const iso = formatISODate(addDays(effectiveStartDate, index));
    const values = {};
    medicationKeys.forEach(key => {
      values[key] = '';
    });
    prefixRows.push({ date: iso, values });
  }

  const rowsWithPrefix = [...prefixRows, ...existingRows];

  const parsedRows = Array.isArray(parsed.rows) ? parsed.rows : [];
  const parsedRowMap = new Map();
  let parsedMaxDate = null;
  parsedRows.forEach(row => {
    if (!row || typeof row !== 'object') {
      return;
    }
    const iso = row.date;
    if (!iso) {
      return;
    }
    const parsedDate = parseDateString(iso, parsedStartDate || effectiveStartDate);
    if (parsedDate && (!parsedMaxDate || parsedDate > parsedMaxDate)) {
      parsedMaxDate = parsedDate;
    }
    const values = row.values && typeof row.values === 'object' ? row.values : {};
    parsedRowMap.set(iso, values);
  });

  let existingMaxDate = null;
  rowsWithPrefix.forEach(row => {
    const rowDate = parseDateString(row.date, effectiveStartDate);
    if (rowDate && (!existingMaxDate || rowDate > existingMaxDate)) {
      existingMaxDate = rowDate;
    }
  });

  const finalEndDate = (() => {
    if (parsedMaxDate && existingMaxDate) {
      return parsedMaxDate > existingMaxDate ? parsedMaxDate : existingMaxDate;
    }
    return parsedMaxDate || existingMaxDate || effectiveStartDate;
  })();

  const totalDays = Math.max(
    rowsWithPrefix.length,
    differenceInCalendarDays(finalEndDate, effectiveStartDate) + 1,
  );

  const baseRows = [];
  for (let index = 0; index < totalDays; index += 1) {
    const iso = formatISODate(addDays(effectiveStartDate, index));
    const sourceRow = rowsWithPrefix[index];
    const sourceValues =
      sourceRow?.values && typeof sourceRow.values === 'object' ? sourceRow.values : {};
    const values = {};
    medicationKeys.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(sourceValues, key)) {
        values[key] = sanitizeCellValue(sourceValues[key]);
      } else {
        values[key] = '';
      }
    });
    baseRows.push({
      date: iso,
      values,
    });
  }

  const parsedKeySet = new Set(parsedOrder);
  const mergedRows = baseRows.map(row => {
    const parsedValues = parsedRowMap.get(row.date);
    if (!parsedValues) {
      return row;
    }

    const nextValues = { ...row.values };
    parsedKeySet.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(parsedValues, key)) {
        nextValues[key] = sanitizeCellValue(parsedValues[key]);
      }
    });

    return {
      ...row,
      values: nextValues,
    };
  });

  return {
    ...current,
    startDate: effectiveStartIso || current.startDate || parsed.startDate || '',
    medicationOrder: medicationKeys,
    medications: mergedMedications,
    rows: mergedRows,
  };
};

const formatNumber = value => {
  if (value === '' || value === null || value === undefined) return '0';
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toFixed(2));
  return rounded.toString();
};

const containsYearInfo = value => {
  if (!value) return false;
  if (value instanceof Date) return true;
  const trimmed = String(value).trim();
  if (!trimmed) return false;
  return /(\d{4}|\d{2}[./-]\d{2}[./-]\d{2,4})/.test(trimmed);
};

const parseStimulationEvents = (stimulationSchedule, startDate, options = {}) => {
  const events = [];
  const baseDate =
    parseDateString(startDate) || parseDateString(options.fallbackBaseDate);

  let scheduleSource = stimulationSchedule;
  if (!scheduleSource && baseDate instanceof Date) {
    scheduleSource = generateSchedule(baseDate);
  }

  if (!scheduleSource) return events;

  const normalizeDate = rawDate => {
    const parsed = parseDateString(rawDate, baseDate);
    if (!parsed) return null;
    const normalized = new Date(parsed);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const pushEvent = ({ rawDate, label, key }) => {
    const date = normalizeDate(rawDate);
    if (!date) return;

    const info = deriveScheduleDisplayInfo({ date, label });
    const sanitizedRawLabel = sanitizeDescription(info.labelValue || '');
    const trimmedDisplayLabel = (info.displayLabel || '').trim();
    const trimmedSecondaryLabel = (info.secondaryLabel || '').trim();
    const trimmedSanitizedLabel = sanitizedRawLabel.trim();
    let meaningfulRemainder = trimmedSanitizedLabel;

    if (meaningfulRemainder && trimmedSecondaryLabel) {
      const normalizedRemainder = meaningfulRemainder.toLowerCase();
      const normalizedSecondary = trimmedSecondaryLabel.toLowerCase();
      if (normalizedRemainder.startsWith(normalizedSecondary)) {
        meaningfulRemainder = meaningfulRemainder
          .slice(trimmedSecondaryLabel.length)
          .trim()
          .replace(/^[.,;:!?-]+/, '')
          .trim();
      }
    }

    if (!trimmedDisplayLabel && !meaningfulRemainder) {
      return;
    }

    const descriptionParts = [info.secondaryLabel, info.displayLabel].filter(Boolean);
    const description = descriptionParts.join(' • ') || info.labelValue || '';
    const iso = formatISODate(date);

    events.push({
      key: key || `${iso}-${events.length}`,
      date,
      iso,
      dayMonth: formatDateForDisplay(date),
      secondaryLabel: info.secondaryLabel || '',
      displayLabel: info.displayLabel || '',
      labelValue: info.labelValue || '',
      description,
      hasExplicitYear: containsYearInfo(rawDate),
    });
  };

  if (typeof scheduleSource === 'string') {
    const lines = scheduleSource.split('\n').map(line => line.trim()).filter(Boolean);
    lines.forEach((line, index) => {
      const parts = line.split('\t');
      if (!parts.length) return;
      const datePart = parts[0]?.trim();
      const keyPart = parts.length > 2 ? parts[1]?.trim() : '';
      const labelPart = parts
        .slice(parts.length > 2 ? 2 : 1)
        .join('\t')
        .trim();
      pushEvent({
        rawDate: datePart,
        label: labelPart,
        key: keyPart || `line-${index}`,
      });
    });
  } else if (Array.isArray(scheduleSource)) {
    scheduleSource.forEach((item, index) => {
      if (!item) return;
      pushEvent({
        rawDate: item.date || item.day || '',
        label: item.label || '',
        key: item.key || `item-${index}`,
      });
    });
  } else if (typeof scheduleSource === 'object') {
    Object.values(scheduleSource).forEach((item, index) => {
      if (!item) return;
      pushEvent({
        rawDate: item.date || item.day || '',
        label: item.label || '',
        key: item.key || `entry-${index}`,
      });
    });
  }

  return events
    .filter(event => event.date instanceof Date && !Number.isNaN(event.date.getTime()))
    .sort((a, b) => a.date - b.date);
};

const stripLeadingDelimiters = value => value.replace(/^[\s•.,;:!?()\-–—]+/, '');

const buildDatePrefixVariants = date => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return [];
  }

  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const paddedDay = String(day).padStart(2, '0');
  const paddedMonth = String(month).padStart(2, '0');
  const fullYear = String(year);
  const shortYear = fullYear.slice(-2);

  const variants = new Set([
    `${paddedDay}.${paddedMonth}.${fullYear}`,
    `${paddedDay}.${paddedMonth}.${shortYear}`,
    `${day}.${month}.${fullYear}`,
    `${day}.${month}.${shortYear}`,
    `${paddedDay}.${paddedMonth}`,
    `${day}.${month}`,
    `${paddedDay}/${paddedMonth}/${fullYear}`,
    `${paddedDay}/${paddedMonth}/${shortYear}`,
    `${paddedDay}/${paddedMonth}`,
    `${day}/${month}`,
    `${paddedDay}-${paddedMonth}-${fullYear}`,
    `${paddedDay}-${paddedMonth}`,
    `${day}-${month}`,
    `${paddedDay} ${paddedMonth} ${fullYear}`,
    `${paddedDay} ${paddedMonth}`,
    `${day} ${month}`,
    paddedDay,
    String(day),
  ]);

  return Array.from(variants).filter(Boolean);
};

const buildPrefixCandidates = event => {
  const prefixes = [];

  const datePrefixes = buildDatePrefixVariants(event?.date);
  if (datePrefixes.length) {
    prefixes.push(...datePrefixes);
  }

  const secondaryLabel = (event?.secondaryLabel || '').trim();
  if (secondaryLabel) {
    prefixes.push(secondaryLabel);
    if (/^\d+$/.test(secondaryLabel)) {
      prefixes.push(secondaryLabel.padStart(2, '0'));
    }
  }

  return Array.from(new Set(prefixes)).sort((a, b) => b.length - a.length);
};

const stripPrefixOnce = (text, prefix) => {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const normalizedPrefix = typeof prefix === 'string' ? prefix.trim() : '';

  if (!normalizedText || !normalizedPrefix) {
    return null;
  }

  const lowerText = normalizedText.toLowerCase();
  const lowerPrefix = normalizedPrefix.toLowerCase();
  if (!lowerText.startsWith(lowerPrefix)) {
    return null;
  }

  const remainderSlice = normalizedText.slice(normalizedPrefix.length);
  const nextChar = remainderSlice.charAt(0);
  const prefixIsNumeric = /^\d+$/.test(normalizedPrefix);

  if (!prefixIsNumeric && nextChar && !/[\s•.,;:!?()\-–—]/.test(nextChar)) {
    return null;
  }

  let remainder = remainderSlice;

  if (prefixIsNumeric) {
    const dayPrefixMatch = remainder.match(/^(?:\s*[-–—]?\s*)(?:й|ий)(?:\s*день)?/i);
    if (dayPrefixMatch) {
      remainder = remainder.slice(dayPrefixMatch[0].length);
    } else if (nextChar && !/[\s•.,;:!?()\-–—]/.test(nextChar)) {
      return null;
    }
  }

  return stripLeadingDelimiters(remainder);
};

const cleanMedicationEventComment = event => {
  if (!event) {
    return '';
  }

  const candidates = [event.labelValue, event.displayLabel, event.description];
  let baseText = '';

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const rawValue = String(candidate).trim();
    if (rawValue) {
      baseText = rawValue;
      break;
    }
  }

  if (!baseText) {
    return '';
  }

  let working = stripLeadingDelimiters(baseText);
  const prefixes = buildPrefixCandidates(event);

  for (const prefix of prefixes) {
    const stripped = stripPrefixOnce(working, prefix);
    if (stripped === null) {
      continue;
    }

    working = stripped;
    if (!working) {
      return '';
    }
  }

  const collapsedWhitespace = working.replace(/\s+/g, ' ').trim();
  return collapsedWhitespace;
};

const buildStimulationEventLookup = (stimulationSchedule, startDate, options = {}) => {
  const events = parseStimulationEvents(stimulationSchedule, startDate, options);
  const byIso = new Map();
  const byDayMonth = new Map();

  events.forEach(event => {
    if (!byIso.has(event.iso)) {
      byIso.set(event.iso, []);
    }
    byIso.get(event.iso).push(event);

    if (!event.hasExplicitYear) {
      if (!byDayMonth.has(event.dayMonth)) {
        byDayMonth.set(event.dayMonth, []);
      }
      byDayMonth.get(event.dayMonth).push(event);
    }
  });

  return { events, byIso, byDayMonth };
};

const MedicationSchedule = ({
  data,
  onChange,
  cycleStart,
  stimulationSchedule,
  onResetDistributionChange,
}) => {
  const [schedule, setSchedule] = useState(() => normalizeData(data, { cycleStart }));
  const [focusedMedication, setFocusedMedication] = useState(null);
  const [newMedicationDraft, setNewMedicationDraft] = useState(() => ({
    label: '',
    short: '',
    issued: '',
    startDate: formatISODate(new Date()),
  }));
  const [pendingRemovalKey, setPendingRemovalKey] = useState(null);
  const scheduleRef = useRef(schedule);

  const medicationOrder = useMemo(
    () => (Array.isArray(schedule?.medicationOrder) ? schedule.medicationOrder : []),
    [schedule?.medicationOrder],
  );

  const medicationList = useMemo(
    () =>
      medicationOrder.map(key => {
        const stored = schedule?.medications?.[key] || {};
        const base = BASE_MEDICATIONS_MAP.get(key);
        const label = stored.label || base?.label || key;
        const short = stored.short || base?.short || label.slice(0, 2).toUpperCase();
        return {
          key,
          label,
          short,
          data: stored,
        };
      }),
    [medicationOrder, schedule?.medications],
  );

  const pendingRemovalMedication = useMemo(
    () => medicationList.find(({ key }) => key === pendingRemovalKey) || null,
    [medicationList, pendingRemovalKey],
  );

  const removalModalTitleId = useMemo(
    () => (pendingRemovalMedication ? `remove-medication-${pendingRemovalMedication.key}` : undefined),
    [pendingRemovalMedication],
  );

  const totalColumns = medicationList.length + 2;

  useEffect(() => {
    const normalized = normalizeData(data, { cycleStart });
    setSchedule(normalized);
    scheduleRef.current = sanitizeScheduleForStorage(normalized);
  }, [data, cycleStart]);

  const updateSchedule = useCallback(updater => {
    setSchedule(prev => {
      const base = prev || scheduleRef.current || normalizeData({}, { cycleStart });
      const next = typeof updater === 'function' ? updater(base) : updater;
      const enriched = { ...next, updatedAt: Date.now() };
      const sanitized = sanitizeScheduleForStorage(enriched);
      scheduleRef.current = sanitized;
      if (typeof onChange === 'function') {
        onChange(sanitized);
      }
      return enriched;
    });
  }, [onChange, cycleStart]);

  const stimulationEvents = useMemo(
    () =>
      buildStimulationEventLookup(stimulationSchedule, schedule?.startDate, {
        fallbackBaseDate: cycleStart,
      }),
    [stimulationSchedule, schedule?.startDate, cycleStart],
  );

  const handleIssuedChange = useCallback(
    (key, rawValue) => {
      updateSchedule(prev => {
        if (!prev) return prev;
        const prevMed = prev.medications?.[key] || {};
        const { issued, displayValue } = evaluateIssuedInput(rawValue, prevMed.issued);
        const medications = {
          ...prev.medications,
          [key]: {
            ...prevMed,
            issued,
            displayValue,
          },
        };
        const medicationOrder = Array.isArray(prev.medicationOrder) ? prev.medicationOrder : [];
        const minRows = calculateRequiredRows(medicationOrder, medications, prev.rows.length);
        const baseRows = ensureRowsLength(prev.rows, minRows, prev.startDate, medicationOrder);
        const clearedRows = baseRows.map(row => ({
          ...row,
          values: {
            ...row.values,
            [key]: '',
          },
        }));
        const scheduleWithMedication = {
          ...prev,
          medications,
          medicationOrder,
        };
        const rows =
          issued > 0
            ? applyDefaultDistribution(clearedRows, scheduleWithMedication, { onlyKeys: [key] })
            : clearedRows;

        return {
          ...scheduleWithMedication,
          rows,
        };
      });
    },
    [updateSchedule],
  );

  const handleIssuedFocus = useCallback(key => {
    setFocusedMedication(key);
  }, []);

  const handleIssuedBlur = useCallback(() => {
    setFocusedMedication(null);
  }, []);

  const handleRemoveMedication = useCallback(
    key => {
      updateSchedule(prev => {
        if (!prev) return prev;

        const prevMedications = prev.medications || {};
        const { [key]: _, ...restMedications } = prevMedications;
        const medicationOrder = Array.isArray(prev.medicationOrder)
          ? prev.medicationOrder.filter(item => item !== key)
          : Object.keys(restMedications);

        const rows = Array.isArray(prev.rows)
          ? prev.rows.map(row => {
              if (!row) return row;
              const nextValues = { ...(row.values || {}) };
              if (Object.prototype.hasOwnProperty.call(nextValues, key)) {
                delete nextValues[key];
                return {
                  ...row,
                  values: nextValues,
                };
              }
              if (!row.values) {
                return {
                  ...row,
                  values: nextValues,
                };
              }
              return row;
            })
          : [];

        return {
          ...prev,
          medications: restMedications,
          medicationOrder,
          rows,
        };
      });

      setFocusedMedication(prev => (prev === key ? null : prev));
    },
    [updateSchedule],
  );

  const handleCancelRemoveMedication = useCallback(() => {
    setPendingRemovalKey(null);
  }, []);

  const handleConfirmRemoveMedication = useCallback(() => {
    if (!pendingRemovalKey) return;
    handleRemoveMedication(pendingRemovalKey);
    setPendingRemovalKey(null);
  }, [handleRemoveMedication, pendingRemovalKey]);

  const handleNewMedicationDraftChange = useCallback((field, value) => {
    setNewMedicationDraft(prevDraft => ({
      ...prevDraft,
      [field]: value,
    }));
  }, []);

  const handleCreateMedicationColumn = useCallback(() => {
    const clipboardSource = newMedicationDraft.label;
    if (clipboardSource) {
      const parsedSchedule = parseMedicationClipboardData(clipboardSource);
      if (parsedSchedule) {
        updateSchedule(prev => mergeScheduleWithClipboardData(prev, parsedSchedule));
        setNewMedicationDraft({
          label: '',
          short: '',
          issued: '',
          startDate: formatISODate(new Date()),
        });
        toast.success('Графік ліків відновлено з буферу обміну');
        return;
      }
    }

    const label = newMedicationDraft.label?.trim();
    if (!label) {
      return;
    }

    const shortInput = newMedicationDraft.short?.trim();
    const fallbackShort = deriveShortLabel(label);
    const normalizedShort = (shortInput || fallbackShort || label.slice(0, 2)).toUpperCase();
    const issuedRaw = parseDecimalInput(newMedicationDraft.issued);
    const issued =
      Number.isFinite(issuedRaw) && issuedRaw > 0 ? Number(issuedRaw.toFixed(2)) : 0;

    updateSchedule(prev => {
      if (!prev) return prev;
      const existingMedications = prev.medications || {};
      const baseKey = slugifyMedicationKey(label) || `custom-${Date.now()}`;
      let key = baseKey;
      let suffix = 1;
      while (existingMedications[key]) {
        key = `${baseKey}-${suffix}`;
        suffix += 1;
      }

      const medicationOrder = Array.isArray(prev.medicationOrder) ? prev.medicationOrder : [];
      const nextOrder = [...medicationOrder, key];
      const referenceDate = parseDateString(prev.startDate) || new Date();
      const fallbackStartDate = formatISODate(new Date());
      const sanitizedStartDate = newMedicationDraft.startDate
        ? sanitizeDateInput(newMedicationDraft.startDate, referenceDate) || fallbackStartDate
        : fallbackStartDate;

      const medications = {
        ...existingMedications,
        [key]: {
          issued,
          displayValue: '',
          label,
          short: normalizedShort,
          plan: 'custom',
          startDate: sanitizedStartDate,
        },
      };

      const minRows = calculateRequiredRows(nextOrder, medications, prev.rows.length);
      const baseRows = ensureRowsLength(prev.rows, minRows, prev.startDate, nextOrder);
      const clearedRows = baseRows.map(row => ({
        ...row,
        values: {
          ...row.values,
          [key]: '',
        },
      }));

      const scheduleWithNewMedication = {
        ...prev,
        medications,
        medicationOrder: nextOrder,
      };

      const rows =
        issued > 0
          ? applyDefaultDistribution(clearedRows, scheduleWithNewMedication, { onlyKeys: [key] })
          : clearedRows;

      return {
        ...scheduleWithNewMedication,
        rows,
      };
    });

    setNewMedicationDraft({
      label: '',
      short: '',
      issued: '',
      startDate: formatISODate(new Date()),
    });
  }, [newMedicationDraft, updateSchedule]);

  const canAddMedication = newMedicationDraft.label.trim().length > 0;

  const handleCellChange = useCallback((rowIndex, key, rawValue) => {
    updateSchedule(prev => {
      const rows = prev.rows.map((row, index) => {
        if (index < rowIndex) {
          return row;
        }
        const nextValues = { ...row.values };
        const sanitized = sanitizeCellValue(rawValue);
        if (index === rowIndex) {
          nextValues[key] = sanitized;
        } else {
          nextValues[key] = sanitized;
        }
        return {
          ...row,
          values: nextValues,
        };
      });

      return {
        ...prev,
        rows,
      };
    });
  }, [updateSchedule]);

  const handleResetDistribution = useCallback(() => {
    updateSchedule(prev => {
      if (!prev) return prev;
      const medicationOrder = Array.isArray(prev.medicationOrder) ? prev.medicationOrder : [];
      const minRows = calculateRequiredRows(medicationOrder, prev.medications, prev.rows.length);
      const baseRows = ensureRowsLength(prev.rows, minRows, prev.startDate, medicationOrder);
      const scheduleBase = { ...prev, medicationOrder };
      return {
        ...scheduleBase,
        rows: applyDefaultDistribution(baseRows, scheduleBase),
      };
    });
  }, [updateSchedule]);

  useEffect(() => {
    if (typeof onResetDistributionChange === 'function') {
      onResetDistributionChange(handleResetDistribution);
      return () => onResetDistributionChange(null);
    }
    return undefined;
  }, [handleResetDistribution, onResetDistributionChange]);

  const totals = useMemo(() => {
    const result = {};
    const rows = schedule.rows || [];
    medicationList.forEach(({ key }) => {
      const issued = schedule.medications?.[key]?.issued || 0;
      const used = rows.reduce((acc, row) => {
        const value = Number(row.values?.[key]);
        if (Number.isNaN(value)) return acc;
        return acc + value;
      }, 0);
      result[key] = {
        issued,
        used,
        remaining: issued - used,
      };
    });
    return result;
  }, [schedule, medicationList]);

  return (
    <Container>
      <IssuedList>
        {medicationList.map(({ key, label, data }) => {
          const medication = data || { issued: 0, displayValue: '' };
          const { issued = 0, displayValue = '' } = medication;
          const stats = totals[key] || { used: 0, remaining: issued };
          const showFormula = focusedMedication === key && displayValue;
          const inputValue =
            focusedMedication === key && displayValue
              ? displayValue
              : issued || '';
          const placeholderText = BASE_MEDICATION_PLACEHOLDERS[key] || 'Видано';

          return (
            <IssuedRow key={key}>
              <IssuedRowHeader>
                <IssuedLabel>{label}</IssuedLabel>
                <IssuedInput
                  value={inputValue}
                  onChange={event => handleIssuedChange(key, event.target.value)}
                  onFocus={() => handleIssuedFocus(key)}
                  onBlur={handleIssuedBlur}
                  placeholder={placeholderText}
                />
                <IssuedStats>
                  Видано: {formatNumber(issued)} • Використано: {formatNumber(stats.used)} • Залишок:{' '}
                  <RemainingValue
                    $negative={stats.remaining < 0}
                    $positive={stats.remaining > 0}
                  >
                    {formatNumber(stats.remaining)}
                  </RemainingValue>
                </IssuedStats>
              </IssuedRowHeader>
              {showFormula && displayValue && (
                <FormulaHint>Формула: {displayValue}</FormulaHint>
              )}
            </IssuedRow>
          );
        })}
      </IssuedList>

      <AddMedicationRow>
        <AddMedicationLabel>Інші ліки</AddMedicationLabel>
        <AddMedicationControls>
          <AddMedicationGuide>Назва, скорочення, дата, кількість</AddMedicationGuide>
          <AddMedicationInput
            $wide
            placeholder="Назва"
            value={newMedicationDraft.label}
            onChange={event => handleNewMedicationDraftChange('label', event.target.value)}
          />
          <AddMedicationInput
            placeholder="Скорочення"
            value={newMedicationDraft.short}
            onChange={event => handleNewMedicationDraftChange('short', event.target.value)}
            maxLength={8}
          />
          <AddMedicationInput
            type="date"
            value={newMedicationDraft.startDate}
            onChange={event => handleNewMedicationDraftChange('startDate', event.target.value)}
          />
          <AddMedicationInput
            type="text"
            inputMode="decimal"
            placeholder="Видано"
            value={newMedicationDraft.issued}
            onChange={event => handleNewMedicationDraftChange('issued', event.target.value)}
          />
          <AddMedicationButton
            type="button"
            onClick={handleCreateMedicationColumn}
            disabled={!canAddMedication}
            aria-label="Додати інші ліки"
          >
            +
          </AddMedicationButton>
        </AddMedicationControls>
        <AddMedicationHint>
          За замовчуванням значення буде заповнено по 1 з обраної дати, поки не закінчаться видані ліки.
        </AddMedicationHint>
      </AddMedicationRow>

      <TableWrapper>
        <StyledTable>
          <thead>
            <tr>
              <Th style={{ width: '30px' }}>#</Th>
              <Th style={DATE_COLUMN_STYLE}>Дата</Th>
              {medicationList.map(({ key, short }) => (
                <MedicationTh key={key}>
                  <MedicationHeaderContent>
                    <MedicationHeaderButton
                      type="button"
                      onClick={() => setPendingRemovalKey(key)}
                      aria-label={`Видалити колонку ${short}`}
                      title={`Видалити колонку ${short}`}
                    >
                      {short}
                    </MedicationHeaderButton>
                  </MedicationHeaderContent>
                </MedicationTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const rows = [];
              let currentYear = null;
              const baseDate = parseDateString(schedule.startDate);
              const issuedByMedication = {};
              const runningUsage = {};

              medicationList.forEach(({ key }) => {
                issuedByMedication[key] = Number(schedule.medications?.[key]?.issued) || 0;
                runningUsage[key] = 0;
              });

              schedule.rows.forEach((row, index) => {
                const dayNumber = index + 1;
                const hasDayNumber = Number.isFinite(dayNumber) && dayNumber > 0;
                const dayOffset = hasDayNumber ? dayNumber - 1 : 0;
                const showWeeksDaysToken =
                  hasDayNumber && dayNumber > 7 && dayOffset % 7 === 0;
                const showDayNumber = hasDayNumber && !showWeeksDaysToken;
                const weeksDaysToken = showWeeksDaysToken
                  ? formatWeeksDaysToken(Math.floor(dayOffset / 7), 0)
                  : null;
                const parsedDate = parseDateString(row.date, baseDate);
                const formattedDate = formatDateForDisplay(parsedDate);
                const weekday = parsedDate ? WEEKDAY_LABELS[parsedDate.getDay()] : '';
                const year = parsedDate ? parsedDate.getFullYear() : null;
                const isoDate = row.date;
                const eventsForRow =
                  stimulationEvents.byIso.get(isoDate) ||
                  stimulationEvents.byDayMonth.get(formattedDate) ||
                  [];

                const rowBalances = {};
                const cellStatuses = {};
                medicationList.forEach(({ key }) => {
                  const sanitizedValue = sanitizeCellValue(row.values?.[key]);
                  let numericValue = null;
                  if (sanitizedValue !== '') {
                    const parsedValue = Number(sanitizedValue);
                    if (!Number.isNaN(parsedValue)) {
                      numericValue = parsedValue;
                      runningUsage[key] += parsedValue;
                    }
                  }

                  const balance = issuedByMedication[key] - runningUsage[key];
                  rowBalances[key] = balance;

                  if (numericValue !== null && numericValue > 0) {
                    cellStatuses[key] = balance < 0 ? 'negative' : 'positive';
                  } else {
                    cellStatuses[key] = null;
                  }
                });

                if (year !== null && year !== currentYear) {
                  currentYear = year;
                  rows.push(
                    <YearSeparatorRow key={`year-${year}-${index}`}>
                      <YearSeparatorCell colSpan={totalColumns}>{year}</YearSeparatorCell>
                    </YearSeparatorRow>,
                  );
                }

                const RowComponent = eventsForRow.length ? HighlightedRow : 'tr';
                const rowKey = `${isoDate || 'row'}-${index}`;

                rows.push(
                  <RowComponent key={rowKey}>
                    <Td style={{ textAlign: 'center' }}>
                      <DayCell>
                        {showDayNumber && <DayNumber>{dayNumber}</DayNumber>}
                        {weeksDaysToken && <DayBadge>{weeksDaysToken}</DayBadge>}
                      </DayCell>
                    </Td>
                    <Td style={DATE_COLUMN_STYLE}>
                      <DateCellContent>
                        <DateText>{formattedDate}</DateText>
                        {weekday && <WeekdayTag>{weekday}</WeekdayTag>}
                      </DateCellContent>
                    </Td>
                      {medicationList.map(({ key }) => {
                        const cellStatus = cellStatuses[key];
                        return (
                          <MedicationTd key={key}>
                            <CellInput
                              $status={cellStatus}
                              value={
                                row.values?.[key] === '' || row.values?.[key] === undefined
                                  ? ''
                                  : row.values[key]
                              }
                              onChange={event => handleCellChange(index, key, event.target.value)}
                            />
                          </MedicationTd>
                        );
                      })}
                  </RowComponent>,
                );

                const descriptionItems = eventsForRow
                  .map(event => {
                    const text = cleanMedicationEventComment(event);
                    return {
                      key: event.key,
                      text,
                    };
                  })
                  .filter(item => item.text);

                if (descriptionItems.length) {
                  rows.push(
                    <DescriptionRow key={`${rowKey}-description`}>
                      <DescriptionCell colSpan={2}>
                        <DescriptionList>
                          {descriptionItems.map(item => (
                            <DescriptionItem key={item.key}>{item.text}</DescriptionItem>
                          ))}
                        </DescriptionList>
                      </DescriptionCell>
                      {medicationList.map(({ key }) => {
                        const balance = rowBalances[key];
                        return (
                          <MedicationStatusCell key={key}>
                            <StatusValue $isNegative={balance < 0}>{formatNumber(balance)}</StatusValue>
                          </MedicationStatusCell>
                        );
                      })}
                    </DescriptionRow>,
                  );
                }
              });

              return rows;
            })()}
          </tbody>
        </StyledTable>
      </TableWrapper>

      {pendingRemovalMedication && (
        <ModalOverlay onClick={handleCancelRemoveMedication}>
          <ModalContainer
            role="dialog"
            aria-modal="true"
            aria-labelledby={removalModalTitleId}
            onClick={event => event.stopPropagation()}
          >
            <ModalTitle id={removalModalTitleId}>Видалити колонку?</ModalTitle>
            <ModalMessage>
              Ви впевнені, що хочете видалити колонку «{pendingRemovalMedication.short}»? Цю дію не можна скасувати.
            </ModalMessage>
            <ModalActions>
              <ModalCancelButton type="button" onClick={handleCancelRemoveMedication}>
                Скасувати
              </ModalCancelButton>
              <ModalConfirmButton type="button" onClick={handleConfirmRemoveMedication}>
                Видалити
              </ModalConfirmButton>
            </ModalActions>
          </ModalContainer>
        </ModalOverlay>
      )}
    </Container>
  );
};

export {
  applyDefaultDistribution,
  normalizeRows,
  mergeScheduleWithClipboardData,
  cleanMedicationEventComment,
  buildStimulationEventLookup,
};
export default MedicationSchedule;
