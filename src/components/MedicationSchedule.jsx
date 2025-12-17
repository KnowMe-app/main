import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';

import {
  deriveScheduleDisplayInfo,
  formatWeeksDaysToken,
  sanitizeDescription,
  generateSchedule,
} from './StimulationSchedule';
import MedicationTableLayout from './MedicationTableLayout';
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
const EARLY_PLACEHOLDER_MAX_DAY = 33;
const EARLY_PLACEHOLDER_KEYS = new Set(['injesta', 'luteina']);
const MEDICATION_ALTERNATIVE_INFO = {
  injesta:
    '• Лютеїна 1-4 (р/о/в2)\n• Дуфастон р/о/в + Лютеїна р/о/в\n• Масляний прогестерон\n• Крінон 2 ніч',
  luteina: '• Утрожестан\n• Прогінорм ОВО 200\n• Крінон 1-3',
  aspirin: '• Кардіомагніл',
};

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

const InfoSuperscript = styled.button.attrs({ type: 'button' })`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  font-size: 10px;
  line-height: 1;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #1e88e5;
  color: white;
  vertical-align: top;
  border: none;
  padding: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid #1e88e5;
    outline-offset: 2px;
  }
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
  position: relative;
  max-height: 60vh;
  overflow: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
`;

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  color: black;
  table-layout: fixed;
`;

const TableHead = styled.thead`
  position: sticky;
  top: 0;
  z-index: 5;
`;

const TableHeaderRow = styled.tr`
  background: #fafafa;
`;

const Th = styled.th`
  position: sticky;
  top: 0;
  background: #fafafa;
  padding: 6px;
  border-bottom: 1px solid #d9d9d9;
  font-weight: 500;
  text-align: center;
  z-index: 5;
`;

const Td = styled.td`
  padding: 4px 4px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
`;

const CellInput = styled.input`
  width: 100%;
  max-width: 2ch;
  min-width: 0;
  padding: 2.4px;
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
  &::placeholder {
    color: #b0b0b0;
  }
`;

const MedicationTh = styled(Th)`
  text-align: center;
  padding: 3.2px;
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
  padding: 3px 4px;
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
  gap: 4px;
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
  gap: 3px;
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
  padding: 6px 8px;
  border-bottom: 1px solid #f0e0c5;
  font-size: 13px;
  color: #6a4b16;
`;

const MedicationTd = styled(Td)`
  text-align: center;
  padding: 2.4px;
`;

const DescriptionList = styled.ul`
  margin: 0;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const DescriptionItem = styled.li`
  list-style-type: '•';
  padding-left: 2px;
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
  white-space: pre-line;
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

const ModalSecondaryButton = styled(ModalButton)`
  background: #1976d2;
  color: white;

  &:hover {
    background: #115293;
  }
`;

const ModalConfirmButton = styled(ModalButton)`
  background: #d84315;
  color: white;

  &:hover {
    background: #bf360c;
  }
`;

const ModalSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ModalSectionTitle = styled.h3`
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #222;
`;

const ModalHint = styled.p`
  margin: 0;
  font-size: 13px;
  color: #555;
  white-space: pre-line;
`;

const HiddenOptionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const HiddenOptionButton = styled.button`
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #d0d0d0;
  background: white;
  cursor: pointer;
  text-align: left;
  font-size: 14px;
  transition: background-color 0.2s ease, border-color 0.2s ease;

  &:hover {
    background: #f5f5f5;
    border-color: #bdbdbd;
  }
`;

const HiddenOptionEmpty = styled.span`
  font-size: 13px;
  color: #777;
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
const PREGNANCY_CONFIRMATION_LABEL = 'УЗД, підтвердження вагітності';

const matchesPregnancyConfirmationEvent = event => {
  if (!event) {
    return false;
  }

  const target = PREGNANCY_CONFIRMATION_LABEL.toLowerCase();
  const candidates = [event.labelValue, event.displayLabel, event.description];

  return candidates.some(candidate => {
    if (!candidate) {
      return false;
    }

    try {
      return String(candidate).toLowerCase().includes(target);
    } catch (error) {
      return false;
    }
  });
};

const getPregnancyConfirmationDayNumber = ({ baseDate, stimulationEvents }) => {
  const events = Array.isArray(stimulationEvents?.events) ? stimulationEvents.events : [];
  if (!(baseDate instanceof Date)) {
    return null;
  }

  for (const event of events) {
    if (!matchesPregnancyConfirmationEvent(event)) {
      continue;
    }

    const eventDate =
      event?.date instanceof Date
        ? event.date
        : parseDateString(event?.iso, baseDate) || parseDateString(event?.labelValue, baseDate);

    if (!(eventDate instanceof Date)) {
      continue;
    }

    const dayNumber = differenceInCalendarDays(eventDate, baseDate) + 1;
    if (Number.isFinite(dayNumber) && dayNumber > 0) {
      return dayNumber;
    }
  }

  return null;
};

const getProgynovaBaseDose = dayNumber => {
  if (!Number.isFinite(dayNumber) || dayNumber <= 0) {
    return 0;
  }

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

  return 0;
};

const PLAN_HANDLERS = {
  progynova: {
    defaultIssued: 21,
    maxDay: TEN_WEEKS_IN_DAYS + PROGYNOVA_TAPER_PHASE_LENGTH * 2,
    getDailyValue: ({ dayNumber, pregnancyConfirmationDay }) => {
      if (!Number.isFinite(dayNumber) || dayNumber <= 0) return '';
      const baseDose = getProgynovaBaseDose(dayNumber);
      if (baseDose <= 0) {
        return '';
      }

      const pregnancyDay = Number(pregnancyConfirmationDay);
      if (!Number.isFinite(pregnancyDay) || pregnancyDay <= 0 || dayNumber <= pregnancyDay) {
        return baseDose;
      }

      const daysSinceEvent = dayNumber - pregnancyDay;
      if (daysSinceEvent < 1) {
        return baseDose;
      }

      const doseAtEventDay = getProgynovaBaseDose(pregnancyDay);
      const allowedSteps = Math.min(Math.max(doseAtEventDay, 0), 3);
      if (allowedSteps <= 0) {
        return baseDose;
      }

      const stepIndex = Math.floor((daysSinceEvent - 1) / PROGYNOVA_TAPER_PHASE_LENGTH) + 1;
      const effectiveReduction = Math.min(stepIndex, allowedSteps);
      const adjustedDose = Math.max(baseDose - effectiveReduction, 0);

      return adjustedDose > 0 ? adjustedDose : '';
    },
  },
  metypred: {
    defaultIssued: 30,
    maxDay: 60,
    getDailyValue: ({ dayNumber, pregnancyConfirmationDay }) => {
      if (!Number.isFinite(dayNumber) || dayNumber <= 0 || dayNumber > 60) {
        return '';
      }

      const pregnancyDay = Number(pregnancyConfirmationDay);
      if (Number.isFinite(pregnancyDay) && pregnancyDay > 0) {
        const daysAfterConfirmation = dayNumber - pregnancyDay;
        if (daysAfterConfirmation >= 1 && daysAfterConfirmation <= PROGYNOVA_TAPER_PHASE_LENGTH) {
          return 0.5;
        }

        if (daysAfterConfirmation > PROGYNOVA_TAPER_PHASE_LENGTH) {
          return '';
        }
      }

      return 1;
    },
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

const isPartialDecimal = value => /^-?\d*(?:[.,]\d*)?$/.test(value);

const sanitizeCellValue = value => {
  if (value === null || value === undefined) return '';

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : '';
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return '';
  }

  const normalized = stringValue.replace(/,/g, '.');

  if (isPartialDecimal(normalized)) {
    if (normalized.endsWith('.') || ['-', '.', '-.'].includes(normalized)) {
      return normalized;
    }

    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? '' : parsed;
  }

  const numberValue = Number(normalized);
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
  const removedBaseMedications = Array.isArray(schedule.removedBaseMedications)
    ? schedule.removedBaseMedications.filter(key => BASE_MEDICATIONS_MAP.has(key))
    : [];
  const hiddenMedicationKeys = Array.isArray(schedule.hiddenMedicationKeys)
    ? schedule.hiddenMedicationKeys.filter(key => medicationOrder.includes(key))
    : [];

  const hiddenMedicationSet = new Set(hiddenMedicationKeys);

  const keysToRemove = medicationOrder.filter(key => {
    if (hiddenMedicationSet.has(key)) {
      return false;
    }

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
      removedBaseMedications,
      hiddenMedicationKeys,
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
  const sanitizedHiddenMedicationKeys = hiddenMedicationKeys.filter(key => !removalSet.has(key));

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
    removedBaseMedications,
    hiddenMedicationKeys: sanitizedHiddenMedicationKeys,
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
      issued: '',
      displayValue: '',
    };
  }

  const raw = String(displayValue).trim();
  if (!raw) {
    return { issued: '', displayValue: '' };
  }

  const cleaned = raw.startsWith('=') ? raw.slice(1) : raw;
  const expression = cleaned.replace(/,/g, '.');
  const expressionParts = expression.match(/[+-]?\s*\d+(?:\.\d+)?/g);

  if (expressionParts && expressionParts.length > 1) {
    const numbers = expressionParts.map(part => Number(part.replace(/\s+/g, '')));

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
  const {
    skipExisting = false,
    existingLength = 0,
    onlyKeys = null,
    pregnancyConfirmationDay: pregnancyConfirmationDayOption = null,
  } = options;
  const medicationKeys = Array.isArray(schedule?.medicationOrder)
    ? schedule.medicationOrder
    : [];
  const filteredKeys = Array.isArray(onlyKeys) && onlyKeys.length > 0
    ? medicationKeys.filter(key => onlyKeys.includes(key))
    : medicationKeys;
  const baseDate = parseDateString(schedule?.startDate) || new Date();
  const pregnancyConfirmationDay = (() => {
    if (Number.isFinite(pregnancyConfirmationDayOption) && pregnancyConfirmationDayOption > 0) {
      return pregnancyConfirmationDayOption;
    }

    const scheduleValue = Number(schedule?.pregnancyConfirmationDay);
    return Number.isFinite(scheduleValue) && scheduleValue > 0 ? scheduleValue : null;
  })();
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
        pregnancyConfirmationDay,
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

const deriveEarlyPlaceholderDose = ({
  medicationKey,
  dayNumber,
  rowDate,
  schedule,
  used,
}) => {
  if (!EARLY_PLACEHOLDER_KEYS.has(medicationKey)) return '';
  if (!Number.isFinite(dayNumber) || dayNumber > EARLY_PLACEHOLDER_MAX_DAY) return '';

  const medication = schedule?.medications?.[medicationKey] || {};
  const issued = Number(medication.issued) || 0;
  if (issued > 0) return '';

  const plan = medication.plan || medicationKey;
  const handler = getPlanHandler(plan);
  if (typeof handler.getDailyValue !== 'function') return '';

  const pregnancyConfirmationDay = Number(schedule?.pregnancyConfirmationDay);
  const value = handler.getDailyValue({
    dayNumber,
    rowDate,
    medication,
    issued,
    used: Number(used) || 0,
    schedule,
    pregnancyConfirmationDay:
      Number.isFinite(pregnancyConfirmationDay) && pregnancyConfirmationDay > 0
        ? pregnancyConfirmationDay
        : null,
  });

  return sanitizeCellValue(value);
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

    if (medication?.manualDistribution) {
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
  const storedRemovedBaseMedications = Array.isArray(data?.removedBaseMedications)
    ? data.removedBaseMedications.filter(key => BASE_MEDICATIONS_MAP.has(key))
    : [];
  const storedHiddenMedicationKeys = Array.isArray(data?.hiddenMedicationKeys)
    ? data.hiddenMedicationKeys.filter(Boolean)
    : [];

  const removedBaseMedications = storedRemovedBaseMedications.filter(key => {
    if (storedOrder.includes(key)) {
      return false;
    }
    if (storedMedications[key]) {
      return false;
    }
    return true;
  });

  const orderSet = new Set();
  const medicationOrder = [];
  const baseMedicationKeys = BASE_MEDICATIONS.map(({ key }) => key);
  const customMedicationKeys = [];
  const removedBaseMedicationSet = new Set(removedBaseMedications);

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

  baseMedicationKeys.forEach(key => {
    if (removedBaseMedicationSet.has(key)) {
      return;
    }
    addToOrder(key);
  });
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
      manualDistribution: Boolean(source.manualDistribution),
    };
  });

  const pregnancyConfirmationDay = (() => {
    const storedValue = Number(data?.pregnancyConfirmationDay);
    if (Number.isFinite(storedValue) && storedValue > 0) {
      return storedValue;
    }

    if (typeof options.resolvePregnancyConfirmationDay === 'function') {
      const resolved = options.resolvePregnancyConfirmationDay({ startDate });
      if (Number.isFinite(resolved) && resolved > 0) {
        return resolved;
      }
    }

    const optionValue = Number(options?.pregnancyConfirmationDay);
    if (Number.isFinite(optionValue) && optionValue > 0) {
      return optionValue;
    }

    return null;
  })();

  const scheduleBase = {
    startDate,
    medications,
    medicationOrder,
    pregnancyConfirmationDay,
    removedBaseMedications,
    hiddenMedicationKeys: storedHiddenMedicationKeys.filter(key => medicationOrder.includes(key)),
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

  const previousRemovedBaseMedications = Array.isArray(current.removedBaseMedications)
    ? current.removedBaseMedications.filter(key => BASE_MEDICATIONS_MAP.has(key))
    : [];
  const parsedRemovedBaseMedications = Array.isArray(parsed.removedBaseMedications)
    ? parsed.removedBaseMedications.filter(key => BASE_MEDICATIONS_MAP.has(key))
    : [];
  const removedBaseMedicationSet = new Set([
    ...previousRemovedBaseMedications,
    ...parsedRemovedBaseMedications,
  ]);

  const mergedMedications = { ...(current.medications || {}) };
  parsedOrder.forEach(key => {
    const parsedMedication = parsed.medications?.[key];
    if (parsedMedication) {
      mergedMedications[key] = { ...parsedMedication };
    }
  });

  const medicationKeys = mergedOrder;

  const previousHiddenMedicationKeys = Array.isArray(current.hiddenMedicationKeys)
    ? current.hiddenMedicationKeys.filter(Boolean)
    : [];
  const parsedHiddenMedicationKeys = Array.isArray(parsed.hiddenMedicationKeys)
    ? parsed.hiddenMedicationKeys.filter(Boolean)
    : [];
  const hiddenMedicationKeySet = new Set([
    ...previousHiddenMedicationKeys,
    ...parsedHiddenMedicationKeys,
  ]);
  const hiddenMedicationKeys = medicationKeys.filter(key => hiddenMedicationKeySet.has(key));

  medicationKeys.forEach(key => {
    if (BASE_MEDICATIONS_MAP.has(key)) {
      removedBaseMedicationSet.delete(key);
    }
  });

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
    removedBaseMedications: Array.from(removedBaseMedicationSet),
    hiddenMedicationKeys,
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
  const resolvePregnancyConfirmationDay = useCallback(
    ({ startDate }) => {
      const lookup = buildStimulationEventLookup(stimulationSchedule, startDate, {
        fallbackBaseDate: cycleStart,
      });
      const baseDate = parseDateString(startDate) || parseDateString(cycleStart);
      return getPregnancyConfirmationDayNumber({
        baseDate,
        stimulationEvents: lookup,
      });
    },
    [stimulationSchedule, cycleStart],
  );

  const [schedule, setSchedule] = useState(() =>
    normalizeData(data, { cycleStart, resolvePregnancyConfirmationDay }),
  );
  const [focusedMedication, setFocusedMedication] = useState(null);
  const [newMedicationDraft, setNewMedicationDraft] = useState(() => ({
    label: '',
    short: '',
    issued: '',
    startDate: formatISODate(new Date()),
  }));
  const [pendingRemovalKey, setPendingRemovalKey] = useState(null);
  const [infoMedicationKey, setInfoMedicationKey] = useState(null);
  const scheduleRef = useRef(schedule);

  const medicationOrder = useMemo(
    () => (Array.isArray(schedule?.medicationOrder) ? schedule.medicationOrder : []),
    [schedule?.medicationOrder],
  );

  const hiddenMedicationKeys = useMemo(() => {
    const hidden = Array.isArray(schedule?.hiddenMedicationKeys)
      ? schedule.hiddenMedicationKeys.filter(Boolean)
      : [];
    const orderSet = new Set(medicationOrder);
    return hidden.filter(key => orderSet.has(key));
  }, [medicationOrder, schedule?.hiddenMedicationKeys]);

  const hiddenMedicationSet = useMemo(
    () => new Set(hiddenMedicationKeys),
    [hiddenMedicationKeys],
  );

  const visibleMedicationOrder = useMemo(
    () => medicationOrder.filter(key => !hiddenMedicationSet.has(key)),
    [medicationOrder, hiddenMedicationSet],
  );

  const medicationList = useMemo(
    () =>
      visibleMedicationOrder.map(key => {
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
    [visibleMedicationOrder, schedule?.medications],
  );

  const hiddenMedicationList = useMemo(
    () =>
      hiddenMedicationKeys
        .map(key => {
          const stored = schedule?.medications?.[key] || {};
          const base = BASE_MEDICATIONS_MAP.get(key);
          const label = stored.label || base?.label || key;
          const short = stored.short || base?.short || label.slice(0, 2).toUpperCase();
          return {
            key,
            label,
            short,
          };
        })
        .filter(Boolean),
    [hiddenMedicationKeys, schedule?.medications],
  );

  const pendingRemovalMedication = useMemo(
    () => medicationList.find(({ key }) => key === pendingRemovalKey) || null,
    [medicationList, pendingRemovalKey],
  );

  const removalModalTitleId = useMemo(
    () => (pendingRemovalMedication ? `remove-medication-${pendingRemovalMedication.key}` : undefined),
    [pendingRemovalMedication],
  );

  const infoModalTitleId = useMemo(
    () => (infoMedicationKey ? `medication-info-${infoMedicationKey}` : undefined),
    [infoMedicationKey],
  );

  const infoModalText = useMemo(
    () => (infoMedicationKey ? MEDICATION_ALTERNATIVE_INFO[infoMedicationKey] : ''),
    [infoMedicationKey],
  );


  useEffect(() => {
    const normalized = normalizeData(data, { cycleStart, resolvePregnancyConfirmationDay });
    setSchedule(normalized);
    scheduleRef.current = sanitizeScheduleForStorage(normalized);
  }, [data, cycleStart, resolvePregnancyConfirmationDay]);

  const updateSchedule = useCallback(updater => {
    setSchedule(prev => {
      const base =
        prev ||
        scheduleRef.current ||
        normalizeData({}, { cycleStart, resolvePregnancyConfirmationDay });
      const next = typeof updater === 'function' ? updater(base) : updater;
      const enriched = { ...next, updatedAt: Date.now() };
      const sanitized = sanitizeScheduleForStorage(enriched);
      scheduleRef.current = sanitized;
      if (typeof onChange === 'function') {
        onChange(sanitized);
      }
      return enriched;
    });
  }, [onChange, cycleStart, resolvePregnancyConfirmationDay]);

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
        const isManualDistribution = prevMed.manualDistribution === true;
        // The manualDistribution flag prevents automatic redistribution of doses
        // when a user has manually edited per-day values. When it's set, changing
        // the issued amount simply updates the stored value without regenerating
        // the default daily plan for that medication.
        //
        // UA: прапорець manualDistribution фіксує ваші ручні правки. Якщо ви
        // змінили кількість виданих доз і прапорець уже ввімкнено, система лише
        // оновить збережене значення issued і НЕ перераховуватиме стандартний
        // розподіл по днях для цього препарату.
        const medications = {
          ...prev.medications,
          [key]: {
            ...prevMed,
            issued,
            displayValue,
            manualDistribution: isManualDistribution
              ? true
              : issued > 0
                ? false
                : prevMed.manualDistribution,
          },
        };
        const medicationOrder = Array.isArray(prev.medicationOrder) ? prev.medicationOrder : [];
        const minRows = calculateRequiredRows(medicationOrder, medications, prev.rows.length);
        const baseRows = ensureRowsLength(prev.rows, minRows, prev.startDate, medicationOrder);
        const scheduleWithMedication = {
          ...prev,
          medications,
          medicationOrder,
        };
        let rows;

        if (issued > 0 && !isManualDistribution) {
          rows = applyDefaultDistribution(baseRows, scheduleWithMedication, { onlyKeys: [key] });
        } else if (issued > 0 && isManualDistribution) {
          rows = baseRows;
        } else {
          rows = baseRows.map(row => ({
            ...row,
            values: {
              ...row.values,
              [key]: '',
            },
          }));
        }

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

  const handleOpenMedicationInfo = useCallback(key => {
    if (MEDICATION_ALTERNATIVE_INFO[key]) {
      setInfoMedicationKey(key);
    }
  }, []);

  const handleCloseMedicationInfo = useCallback(() => {
    setInfoMedicationKey(null);
  }, []);

  const handleInfoKeyDown = useCallback((event, key) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpenMedicationInfo(key);
    }
  }, [handleOpenMedicationInfo]);

  const handleRemoveMedication = useCallback(
    key => {
      updateSchedule(prev => {
        if (!prev) return prev;

        const prevMedications = prev.medications || {};
        const { [key]: _, ...restMedications } = prevMedications;
        const medicationOrder = Array.isArray(prev.medicationOrder)
          ? prev.medicationOrder.filter(item => item !== key)
          : Object.keys(restMedications);

        const previousRemovedBaseMedications = Array.isArray(prev.removedBaseMedications)
          ? prev.removedBaseMedications.filter(baseKey => BASE_MEDICATIONS_MAP.has(baseKey))
          : [];
        const removedBaseMedicationSet = new Set(previousRemovedBaseMedications);
        if (BASE_MEDICATIONS_MAP.has(key)) {
          removedBaseMedicationSet.add(key);
        }

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

        const hiddenMedicationKeys = Array.isArray(prev.hiddenMedicationKeys)
          ? prev.hiddenMedicationKeys.filter(Boolean)
          : [];
        const filteredHiddenMedicationKeys = hiddenMedicationKeys.filter(item => item !== key);

        return {
          ...prev,
          medications: restMedications,
          medicationOrder,
          rows,
          removedBaseMedications: Array.from(removedBaseMedicationSet),
          hiddenMedicationKeys: filteredHiddenMedicationKeys,
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

  const handleHideMedication = useCallback(
    key => {
      updateSchedule(prev => {
        if (!prev) return prev;
        const order = Array.isArray(prev.medicationOrder)
          ? prev.medicationOrder.filter(Boolean)
          : [];
        if (!order.includes(key)) {
          return prev;
        }

        const hiddenMedicationKeys = Array.isArray(prev.hiddenMedicationKeys)
          ? prev.hiddenMedicationKeys.filter(Boolean)
          : [];

        if (hiddenMedicationKeys.includes(key)) {
          return prev;
        }

        return {
          ...prev,
          hiddenMedicationKeys: [...hiddenMedicationKeys, key],
        };
      });

      setPendingRemovalKey(null);
    },
    [updateSchedule],
  );

  const handleRestoreHiddenMedication = useCallback(
    key => {
      updateSchedule(prev => {
        if (!prev) return prev;

        const hiddenMedicationKeys = Array.isArray(prev.hiddenMedicationKeys)
          ? prev.hiddenMedicationKeys.filter(Boolean)
          : [];

        if (!hiddenMedicationKeys.includes(key)) {
          return prev;
        }

        const nextHiddenMedicationKeys = hiddenMedicationKeys.filter(item => item !== key);

        return {
          ...prev,
          hiddenMedicationKeys: nextHiddenMedicationKeys,
        };
      });
    },
    [updateSchedule],
  );

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
          manualDistribution: false,
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

      const previousRemovedBaseMedications = Array.isArray(prev.removedBaseMedications)
        ? prev.removedBaseMedications.filter(baseKey => BASE_MEDICATIONS_MAP.has(baseKey))
        : [];
      const removedBaseMedicationSet = new Set(previousRemovedBaseMedications);
      if (BASE_MEDICATIONS_MAP.has(key)) {
        removedBaseMedicationSet.delete(key);
      }

      const scheduleWithNewMedication = {
        ...prev,
        medications,
        medicationOrder: nextOrder,
        removedBaseMedications: Array.from(removedBaseMedicationSet),
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

  const handleCellChange = useCallback(
    (rowIndex, key, rawValue) => {
      updateSchedule(prev => {
        if (!prev || !Array.isArray(prev.rows) || rowIndex < 0) {
          return prev;
        }

        const sanitized = sanitizeCellValue(rawValue);
        let changed = false;

        const rows = prev.rows.map((row, index) => {
          if (!row || index < rowIndex) {
            return row;
          }

          const currentValue = row.values?.[key];
          if (sanitizeCellValue(currentValue) === sanitized) {
            return row;
          }

          changed = true;

          return {
            ...row,
            values: {
              ...row.values,
              [key]: sanitized,
            },
          };
        });

        if (!changed) {
          return prev;
        }

        const prevMedications = prev.medications || {};
        const prevMedication = prevMedications[key] || {};
        let medications = prevMedications;

        if (prevMedication.manualDistribution !== true) {
          medications = {
            ...prevMedications,
            [key]: {
              ...prevMedication,
              manualDistribution: true,
            },
          };
        }

        return {
          ...prev,
          rows,
          medications,
        };
      });
    },
    [updateSchedule],
  );

  const handleResetDistribution = useCallback(() => {
    updateSchedule(prev => {
      if (!prev) return prev;
      const medicationOrder = Array.isArray(prev.medicationOrder) ? prev.medicationOrder : [];
      const minRows = calculateRequiredRows(medicationOrder, prev.medications, prev.rows.length);
      const baseRows = ensureRowsLength(prev.rows, minRows, prev.startDate, medicationOrder);
      const medications = { ...prev.medications };
      medicationOrder.forEach(key => {
        if (medications[key]) {
          medications[key] = {
            ...medications[key],
            manualDistribution: false,
          };
        }
      });
      const scheduleBase = { ...prev, medicationOrder, medications };
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
                <IssuedLabel>
                  {label}
                  {MEDICATION_ALTERNATIVE_INFO[key] && (
                    <InfoSuperscript
                      role="button"
                      aria-label={MEDICATION_ALTERNATIVE_INFO[key]}
                      title={MEDICATION_ALTERNATIVE_INFO[key]}
                      onClick={() => handleOpenMedicationInfo(key)}
                      onKeyDown={event => handleInfoKeyDown(event, key)}
                    >
                      i
                    </InfoSuperscript>
                  )}
                </IssuedLabel>
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

      <MedicationTableLayout medicationCount={medicationList.length}>
        {({ totalColumns, indexHeaderStyle, dateHeaderStyle, indexCellStyle, dateCellStyle, medicationColumnStyle }) => (
          <TableWrapper>
            <StyledTable>
              <TableHead>
                <TableHeaderRow>
                  <Th style={indexHeaderStyle}>#</Th>
                  <Th style={dateHeaderStyle}>Дата</Th>
                  {medicationList.map(({ key, short }) => (
                    <MedicationTh key={key} style={medicationColumnStyle}>
                      <MedicationHeaderContent>
                          <MedicationHeaderButton
                            type="button"
                            onClick={() => setPendingRemovalKey(key)}
                            onContextMenu={event => {
                              event.preventDefault();
                              setPendingRemovalKey(key);
                            }}
                            aria-label={`Видалити колонку ${short}`}
                            title={`Видалити колонку ${short}`}
                          >
                            {short}
                          </MedicationHeaderButton>
                      </MedicationHeaderContent>
                    </MedicationTh>
                  ))}
                </TableHeaderRow>
              </TableHead>
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

                    const cellStatuses = {};
                    const cellPlaceholders = {};
                    medicationList.forEach(({ key }) => {
                      const medication = schedule.medications?.[key] || {};
                      const issued = Number(medication.issued) || 0;
                      const sanitizedValue = sanitizeCellValue(row.values?.[key]);
                      const placeholderDose = deriveEarlyPlaceholderDose({
                        medicationKey: key,
                        dayNumber,
                        rowDate: parsedDate,
                        schedule,
                        used: runningUsage[key],
                      });
                      let numericValue = null;
                      if (sanitizedValue !== '') {
                        const parsedValue = Number(sanitizedValue);
                        if (!Number.isNaN(parsedValue)) {
                          numericValue = parsedValue;
                          runningUsage[key] += parsedValue;
                        }
                      }

                      const balance = issuedByMedication[key] - runningUsage[key];
                      if (numericValue !== null && numericValue > 0) {
                        cellStatuses[key] = balance < 0 ? 'negative' : 'positive';
                      } else {
                        cellStatuses[key] = null;
                      }

                      cellPlaceholders[key] = placeholderDose !== '' && issued <= 0 ? placeholderDose : '';
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
                        <Td style={indexCellStyle}>
                          <DayCell>
                            {showDayNumber && <DayNumber>{dayNumber}</DayNumber>}
                            {weeksDaysToken && <DayBadge>{weeksDaysToken}</DayBadge>}
                          </DayCell>
                        </Td>
                        <Td style={dateCellStyle}>
                          <DateCellContent>
                            <DateText>{formattedDate}</DateText>
                            {weekday && <WeekdayTag>{weekday}</WeekdayTag>}
                          </DateCellContent>
                        </Td>
                        {medicationList.map(({ key }) => {
                          const cellStatus = cellStatuses[key];
                          const placeholder = cellPlaceholders[key];
                          return (
                            <MedicationTd key={key} style={medicationColumnStyle}>
                              <CellInput
                                $status={cellStatus}
                                value={
                                  row.values?.[key] === '' || row.values?.[key] === undefined
                                    ? ''
                                    : row.values[key]
                                }
                                placeholder={placeholder || undefined}
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
                      .filter(Boolean);

                    if (descriptionItems.length) {
                      rows.push(
                        <DescriptionRow key={`desc-${rowKey}`}>
                          <DescriptionCell colSpan={totalColumns}>
                            <DescriptionList>
                              {descriptionItems.map(({ key, text }) => (
                                <DescriptionItem key={key}>{text}</DescriptionItem>
                              ))}
                            </DescriptionList>
                          </DescriptionCell>
                        </DescriptionRow>,
                      );
                    }
                  });

                  return rows;
                })()}
              </tbody>
            </StyledTable>
          </TableWrapper>
        )}
      </MedicationTableLayout>


      {infoModalText && (
        <ModalOverlay onClick={handleCloseMedicationInfo}>
          <ModalContainer
            role="dialog"
            aria-modal="true"
            aria-labelledby={infoModalTitleId}
            onClick={event => event.stopPropagation()}
          >
            <ModalTitle id={infoModalTitleId}>Додаткова інформація</ModalTitle>
            <ModalMessage>{infoModalText}</ModalMessage>
            <ModalActions>
              <ModalCancelButton type="button" onClick={handleCloseMedicationInfo}>
                Зрозуміло
              </ModalCancelButton>
            </ModalActions>
          </ModalContainer>
        </ModalOverlay>
      )}


      {pendingRemovalMedication && (
        <ModalOverlay onClick={handleCancelRemoveMedication}>
          <ModalContainer
            role="dialog"
            aria-modal="true"
            aria-labelledby={removalModalTitleId}
            onClick={event => event.stopPropagation()}
          >
            <ModalTitle id={removalModalTitleId}>Управління колонкою</ModalTitle>
            <ModalMessage>
              Ви впевнені, що хочете видалити колонку «{pendingRemovalMedication.short}»? Цю дію не можна
              скасувати.
            </ModalMessage>
            <ModalSection>
              <ModalSectionTitle>Дії з колонкою</ModalSectionTitle>
              <ModalHint>
                Приховайте колонку, щоб тимчасово прибрати її з таблиці без втрати даних. Видалення остаточно
                прибере колонку та її дані.
              </ModalHint>
              <ModalActions>
                <ModalCancelButton type="button" onClick={handleCancelRemoveMedication}>
                  Скасувати
                </ModalCancelButton>
                <ModalSecondaryButton
                  type="button"
                  onClick={() => handleHideMedication(pendingRemovalMedication.key)}
                >
                  Приховати
                </ModalSecondaryButton>
                <ModalConfirmButton type="button" onClick={handleConfirmRemoveMedication}>
                  Видалити
                </ModalConfirmButton>
              </ModalActions>
            </ModalSection>

            <ModalSection>
              <ModalSectionTitle>Повернути приховану колонку</ModalSectionTitle>
              {hiddenMedicationList.length ? (
                <HiddenOptionList>
                  {hiddenMedicationList.map(({ key, label, short }) => (
                    <HiddenOptionButton type="button" key={key} onClick={() => handleRestoreHiddenMedication(key)}>
                      {label} ({short})
                    </HiddenOptionButton>
                  ))}
                </HiddenOptionList>
              ) : (
                <HiddenOptionEmpty>Наразі немає прихованих колонок.</HiddenOptionEmpty>
              )}
            </ModalSection>
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
  evaluateIssuedInput,
};
export default MedicationSchedule;
