import {
  BASE_MEDICATIONS,
  BASE_MEDICATIONS_MAP,
  deriveShortLabel,
  slugifyMedicationKey,
} from './medicationConstants';

const DATE_PATTERN = /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/g;
const DATE_SOURCE_PATTERN = '\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}';
const SINGLE_LINE_ENTRY_BOUNDARY = new RegExp(
  `(${DATE_SOURCE_PATTERN})\\s+(\\d+(?:[.,]\\d+)?)[ \\t]+(?=[^,]+,\\s*${DATE_SOURCE_PATTERN})`,
  'g',
);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseISODate = isoString => {
  if (!isoString || typeof isoString !== 'string') {
    return null;
  }

  const parts = isoString.split('-');
  if (parts.length < 3) {
    return null;
  }

  const [yearPart, monthPart, dayPart] = parts;
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const candidate = new Date(year, month - 1, day);
  if (
    !Number.isFinite(candidate.getTime()) ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  candidate.setHours(0, 0, 0, 0);
  return candidate;
};

const formatISODate = date => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDisplayDate = value => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split(/[./-]/).filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const [dayPart, monthPart, yearPart] = parts;
  const day = Number(dayPart);
  const month = Number(monthPart);
  let year = Number(yearPart);

  if (yearPart.length === 2) {
    year = Number(`20${yearPart}`);
  }

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
    return null;
  }

  const candidate = new Date(year, month - 1, day);
  if (
    !Number.isFinite(candidate.getTime()) ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  candidate.setHours(0, 0, 0, 0);
  return candidate;
};

const formatDisplayDate = isoString => {
  const date = parseISODate(isoString);
  if (!date) {
    return '';
  }

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}.${month}.${year}`;
};

const addDays = (date, amount) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    return null;
  }

  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  next.setHours(0, 0, 0, 0);
  return next;
};

const differenceInDays = (start, end) => {
  if (!(start instanceof Date) || !(end instanceof Date)) {
    return 0;
  }

  const diff = end.getTime() - start.getTime();
  return Math.round(diff / MS_PER_DAY);
};

const formatDoseValue = value => {
  if (value === null || value === undefined || value === '') {
    return '0';
  }

  const numberValue = Number(value);
  if (Number.isNaN(numberValue)) {
    return '0';
  }

  if (Number.isInteger(numberValue)) {
    return String(numberValue);
  }

  const rounded = Number(numberValue.toFixed(2));
  return Number.isInteger(rounded) ? String(rounded) : rounded.toString();
};

const sanitizeRowValue = value => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
};

const findFirstPositiveIndex = values => {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] > 0) {
      return index;
    }
  }
  return -1;
};

const findLastPositiveIndex = values => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] > 0) {
      return index;
    }
  }
  return -1;
};

const normalizeLabel = label => label.trim().toLowerCase();

const findBaseMedicationMatch = label => {
  if (!label) {
    return null;
  }

  const normalizedLabel = normalizeLabel(label);

  const direct = BASE_MEDICATIONS.find(
    item => normalizeLabel(item.label) === normalizedLabel || normalizeLabel(item.short) === normalizedLabel,
  );
  if (direct) {
    return direct;
  }

  return (
    BASE_MEDICATIONS.find(item => normalizedLabel.startsWith(normalizeLabel(item.label))) ||
    BASE_MEDICATIONS.find(item => normalizeLabel(item.label).startsWith(normalizedLabel)) ||
    null
  );
};

const ensureUniqueKey = (baseKey, usedKeys) => {
  let key = baseKey;
  let suffix = 1;

  while (usedKeys.has(key)) {
    key = `${baseKey}-${suffix}`;
    suffix += 1;
  }

  usedKeys.add(key);
  return key;
};

const parseClipboardLine = line => {
  if (!line || typeof line !== 'string') {
    return null;
  }

  const commaIndex = line.indexOf(',');
  if (commaIndex === -1) {
    return null;
  }

  const label = line.slice(0, commaIndex).trim();
  const rest = line.slice(commaIndex + 1).trim();

  if (!label || !rest) {
    return null;
  }

  const dateMatches = [...rest.matchAll(DATE_PATTERN)];
  if (dateMatches.length < 2) {
    return null;
  }

  const endDateRaw = dateMatches[0][1];
  const startDateRaw = dateMatches[dateMatches.length - 1][1];

  const endDateIndex = rest.indexOf(endDateRaw);
  const startDateIndex = rest.indexOf(startDateRaw, endDateIndex + endDateRaw.length);

  if (endDateIndex === -1 || startDateIndex === -1) {
    return null;
  }

  const dosesPart = rest.slice(endDateIndex + endDateRaw.length, startDateIndex).trim();
  const afterStart = rest.slice(startDateIndex + startDateRaw.length).trim();

  if (!dosesPart || !afterStart) {
    return null;
  }

  const issuedMatch = afterStart.match(/^\d+(?:[.,]\d+)?/);
  if (!issuedMatch) {
    return null;
  }

  const issued = Number(issuedMatch[0].replace(',', '.'));
  if (!Number.isFinite(issued)) {
    return null;
  }

  const doseTokens = dosesPart.split('+').map(token => token.trim()).filter(Boolean);
  if (!doseTokens.length) {
    return null;
  }

  const doses = [];
  for (const token of doseTokens) {
    const numericValue = Number(token.replace(',', '.'));
    if (!Number.isFinite(numericValue)) {
      return null;
    }
    doses.push(numericValue);
  }

  const startDate = parseDisplayDate(startDateRaw);
  const endDate = parseDisplayDate(endDateRaw);

  if (!startDate || !endDate) {
    return null;
  }

  const expectedLength = differenceInDays(startDate, endDate) + 1;
  const normalizedEndDate = expectedLength === doses.length ? endDate : addDays(startDate, doses.length - 1);

  return {
    label,
    doses,
    issued,
    startDateISO: formatISODate(startDate),
    endDateISO: formatISODate(normalizedEndDate),
  };
};

const splitClipboardLines = value =>
  value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

const parseClipboardLines = lines => {
  if (!Array.isArray(lines) || !lines.length) {
    return null;
  }

  const parsed = [];
  for (const line of lines) {
    const parsedLine = parseClipboardLine(line);
    if (!parsedLine) {
      return null;
    }
    parsed.push(parsedLine);
  }

  return parsed;
};

const insertFallbackEntryDelimiters = text => {
  if (typeof text !== 'string' || !text.trim() || text.includes('\n')) {
    return text;
  }

  return text.replace(SINGLE_LINE_ENTRY_BOUNDARY, '$1 $2\n');
};

export const formatMedicationScheduleForClipboard = schedule => {
  if (!schedule || typeof schedule !== 'object') {
    return '';
  }

  const medicationOrder = Array.isArray(schedule.medicationOrder) ? schedule.medicationOrder : [];
  const medications = schedule.medications && typeof schedule.medications === 'object' ? schedule.medications : {};
  const rows = Array.isArray(schedule.rows) ? schedule.rows : [];

  if (!medicationOrder.length || !rows.length) {
    return '';
  }

  const lines = [];

  medicationOrder.forEach(key => {
    const medication = medications[key];
    if (!medication) {
      return;
    }

    const label = medication.label || BASE_MEDICATIONS_MAP.get(key)?.label || key;
    const issuedValue = Number(medication.issued);
    const issued = Number.isFinite(issuedValue) ? Math.max(0, issuedValue) : 0;

    const values = rows.map(row => sanitizeRowValue(row?.values?.[key] ?? row?.[key]));
    const firstIndex = findFirstPositiveIndex(values);
    const lastIndex = findLastPositiveIndex(values);

    if (firstIndex === -1 || lastIndex === -1) {
      return;
    }

    const startRow = rows[firstIndex];
    const endRow = rows[lastIndex];

    if (!startRow || !endRow) {
      return;
    }

    const doseSlice = values.slice(firstIndex, lastIndex + 1);
    const doseString = doseSlice.map(formatDoseValue).join('+');
    const endDateDisplay = formatDisplayDate(endRow.date);
    const startDateDisplay = formatDisplayDate(startRow.date);

    if (!doseString || !endDateDisplay || !startDateDisplay) {
      return;
    }

    lines.push(`${label}, ${endDateDisplay} ${doseString} ${startDateDisplay} ${formatDoseValue(issued)}`);
  });

  return lines.join('\n');
};

export const parseMedicationClipboardData = input => {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  let parsedLines = parseClipboardLines(splitClipboardLines(trimmed));

  if (!parsedLines) {
    const normalized = insertFallbackEntryDelimiters(trimmed);
    if (normalized && normalized !== trimmed) {
      parsedLines = parseClipboardLines(splitClipboardLines(normalized));
    }
  }

  if (!parsedLines) {
    return null;
  }

  const startDates = parsedLines
    .map(item => parseISODate(item.startDateISO))
    .filter(date => date instanceof Date && Number.isFinite(date.getTime()));

  if (!startDates.length) {
    return null;
  }

  startDates.forEach(date => date.setHours(0, 0, 0, 0));

  let globalStartDate = startDates[0];
  for (const date of startDates) {
    if (date < globalStartDate) {
      globalStartDate = date;
    }
  }

  let globalEndDate = globalStartDate;
  parsedLines.forEach(item => {
    const startDate = parseISODate(item.startDateISO);
    const explicitEndDate = parseISODate(item.endDateISO);
    if (!startDate) {
      return;
    }
    const lengthBasedEnd = item.doses.length ? addDays(startDate, item.doses.length - 1) : startDate;
    const effectiveEnd = explicitEndDate && explicitEndDate > lengthBasedEnd ? explicitEndDate : lengthBasedEnd;
    if (effectiveEnd && effectiveEnd > globalEndDate) {
      globalEndDate = effectiveEnd;
    }
  });

  const totalDays = Math.max(1, differenceInDays(globalStartDate, globalEndDate) + 1);
  const rows = Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(globalStartDate, index);
    return {
      date: formatISODate(date),
      values: {},
    };
  });

  const medications = {};
  const medicationOrder = [];
  const usedKeys = new Set();

  parsedLines.forEach(item => {
    const { label, doses, issued, startDateISO } = item;
    const baseMatch = findBaseMedicationMatch(label);
    const baseKey = baseMatch?.key;
    const plan = baseMatch?.plan || 'custom';
    let short = baseMatch?.short || '';

    let keyCandidate = baseKey || slugifyMedicationKey(label) || 'custom-medication';
    keyCandidate = ensureUniqueKey(keyCandidate, usedKeys);

    if (!short) {
      short = deriveShortLabel(label) || keyCandidate.slice(0, 2).toUpperCase();
    }

    const normalizedIssued = Number.isFinite(issued) ? Math.max(0, Math.round(issued)) : 0;

    medications[keyCandidate] = {
      label,
      short,
      issued: normalizedIssued,
      displayValue: '',
      plan,
      startDate: startDateISO,
    };
    medicationOrder.push(keyCandidate);

    const startDate = parseISODate(startDateISO);
    if (!startDate) {
      return;
    }

    const startOffset = differenceInDays(globalStartDate, startDate);
    doses.forEach((dose, index) => {
      const rowIndex = startOffset + index;
      if (rowIndex < 0 || rowIndex >= rows.length) {
        return;
      }
      const numericDose = Number(dose);
      if (Number.isFinite(numericDose) && numericDose > 0) {
        rows[rowIndex].values[keyCandidate] = numericDose;
      } else {
        rows[rowIndex].values[keyCandidate] = '';
      }
    });
  });

  rows.forEach(row => {
    medicationOrder.forEach(key => {
      if (!(key in row.values)) {
        row.values[key] = '';
      }
    });
  });

  return {
    startDate: formatISODate(globalStartDate),
    medications,
    medicationOrder,
    rows,
    updatedAt: Date.now(),
  };
};
