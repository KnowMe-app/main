import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { deriveScheduleDisplayInfo } from './StimulationSchedule';

const MEDICATIONS = [
  { key: 'progynova', label: 'Прогінова', short: 'Пр', defaultDisplayValue: '=21+7+21' },
  { key: 'metypred', label: 'Метипред', short: 'Мт', defaultDisplayValue: '=21+7+21' },
  { key: 'aspirin', label: 'Аспірин кардіо', short: 'АК', defaultDisplayValue: '' },
];

const DEFAULT_ROWS = 35;
const WEEKDAY_LABELS = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const TOTAL_COLUMNS = MEDICATIONS.length + 2;

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: black;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 24px;
  font-weight: 600;
`;

const Subtitle = styled.p`
  margin: 0;
  font-size: 14px;
  color: #555;
`;

const CloseButton = styled.button`
  padding: 8px 14px;
  border-radius: 6px;
  border: none;
  background-color: #f0f0f0;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #e0e0e0;
  }
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
`;

const IssuedStats = styled.span`
  font-size: 13px;
  color: #666;
`;

const FormulaHint = styled.span`
  font-size: 12px;
  color: #888;
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
  padding: 10px;
  border-bottom: 1px solid #d9d9d9;
  font-weight: 500;
  text-align: left;
`;

const Td = styled.td`
  padding: 8px 10px;
  border-bottom: 1px solid #f0f0f0;
  vertical-align: middle;
`;

const CellInput = styled.input`
  width: 2.5ch;
  min-width: 32px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid #d0d0d0;
  font-size: 13px;
  text-align: center;
  color: black;
  box-sizing: border-box;
  display: inline-block;
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
  gap: 6px;
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
  padding: 10px 14px;
  border-bottom: 1px solid #f0e0c5;
  font-size: 13px;
  color: #6a4b16;
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

const ActionsRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  padding: 8px 14px;
  border-radius: 6px;
  border: none;
  background-color: #ffb347;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #ff9a1a;
  }
`;

const InfoNote = styled.p`
  margin: 0;
  font-size: 12px;
  color: #777;
`;

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

const sanitizeCellValue = value => {
  if (value === null || value === undefined) return '';
  if (value === '') return '';
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? '' : numberValue;
};

const evaluateIssuedInput = (displayValue, fallbackIssued) => {
  if (displayValue === null || displayValue === undefined || displayValue === '') {
    const fallback = Number(fallbackIssued);
    return {
      issued: Number.isFinite(fallback) ? fallback : 0,
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

const createRow = (date, baseValues = {}) => {
  const values = {};
  MEDICATIONS.forEach(({ key }) => {
    const base = baseValues[key];
    values[key] = sanitizeCellValue(base);
  });
  return {
    date,
    values,
  };
};

const ensureRowsLength = (rows, minLength, startDate) => {
  const baseDate = parseDateString(startDate) || new Date();
  const sourceRows = Array.isArray(rows) ? rows : [];
  const targetLength = Math.max(minLength || 0, sourceRows.length);
  const result = [];

  for (let index = 0; index < targetLength; index += 1) {
    const source = sourceRows[index];
    const baseValues = source && typeof source === 'object' ? (source.values || source) : {};
    const values = {};
    MEDICATIONS.forEach(({ key }) => {
      values[key] = sanitizeCellValue(baseValues[key]);
    });
    result.push({
      date: formatISODate(addDays(baseDate, index)),
      values,
    });
  }

  return result;
};

const applyDefaultDistribution = (rows, medications, options = {}) => {
  const { skipExisting = false, existingLength = 0 } = options;

  return rows.map((row, rowIndex) => {
    const nextValues = { ...row.values };
    const shouldSkipRow = skipExisting && rowIndex < existingLength;

    if (!shouldSkipRow) {
      MEDICATIONS.forEach(({ key }) => {
        const issued = medications[key]?.issued ?? 0;
        if (issued <= 0) {
          if (nextValues[key] === undefined) {
            nextValues[key] = '';
          }
          return;
        }
        if (rowIndex < issued) {
          const currentValue = nextValues[key];
          if (currentValue === '' || currentValue === undefined) {
            nextValues[key] = 1;
          }
        } else if (nextValues[key] === undefined) {
          nextValues[key] = '';
        }
      });
    }

    return {
      ...row,
      values: nextValues,
    };
  });
};

const normalizeRows = (rowsInput, startDate, medications) => {
  const existingLength = Array.isArray(rowsInput) ? rowsInput.length : 0;
  const hasExistingRows = existingLength > 0;
  const minRows = Math.max(
    DEFAULT_ROWS,
    existingLength,
    ...MEDICATIONS.map(({ key }) => medications[key]?.issued || 0),
  );

  const baseRows = ensureRowsLength(rowsInput, minRows, startDate);

  if (!hasExistingRows) {
    return applyDefaultDistribution(baseRows, medications);
  }

  if (existingLength < minRows) {
    return applyDefaultDistribution(baseRows, medications, {
      skipExisting: true,
      existingLength,
    });
  }

  return baseRows;
};

const normalizeData = (data, options = {}) => {
  const cycleStart = options.cycleStart;
  const cycleStartDate = parseDateString(cycleStart);
  const sanitizedCycleStart = sanitizeDateInput(cycleStart, cycleStartDate);
  const rawStartDate = data?.startDate;
  const startDate =
    sanitizedCycleStart ||
    sanitizeDateInput(rawStartDate, cycleStartDate) ||
    (cycleStartDate ? formatISODate(cycleStartDate) : formatISODate(new Date()));

  const medications = {};
  MEDICATIONS.forEach(({ key, defaultDisplayValue }) => {
    const source = data?.medications?.[key] || {};
    const baseDisplay =
      source.displayValue !== undefined && source.displayValue !== null
        ? String(source.displayValue)
        : defaultDisplayValue;
    const computed = evaluateIssuedInput(baseDisplay, source.issued);
    const issued = source.issued !== undefined && source.issued !== null
      ? Number(source.issued)
      : computed.issued;

    medications[key] = {
      issued: Number.isFinite(issued) ? issued : 0,
      displayValue: baseDisplay ? computed.displayValue || baseDisplay : computed.displayValue || '',
    };
  });

  const rows = normalizeRows(data?.rows, startDate, medications);

  return {
    startDate,
    medications,
    rows,
    updatedAt: data?.updatedAt || Date.now(),
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

const parseStimulationEvents = (stimulationSchedule, startDate) => {
  const events = [];
  if (!stimulationSchedule) return events;

  const baseDate = parseDateString(startDate);

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

  if (typeof stimulationSchedule === 'string') {
    const lines = stimulationSchedule.split('\n').map(line => line.trim()).filter(Boolean);
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
  } else if (Array.isArray(stimulationSchedule)) {
    stimulationSchedule.forEach((item, index) => {
      if (!item) return;
      pushEvent({
        rawDate: item.date || item.day || '',
        label: item.label || '',
        key: item.key || `item-${index}`,
      });
    });
  } else if (typeof stimulationSchedule === 'object') {
    Object.values(stimulationSchedule).forEach((item, index) => {
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

const buildStimulationEventLookup = (stimulationSchedule, startDate) => {
  const events = parseStimulationEvents(stimulationSchedule, startDate);
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
  onClose,
  userLabel,
  userId,
  cycleStart,
  stimulationSchedule,
}) => {
  const [schedule, setSchedule] = useState(() => normalizeData(data, { cycleStart }));
  const [focusedMedication, setFocusedMedication] = useState(null);
  const scheduleRef = useRef(schedule);

  useEffect(() => {
    const normalized = normalizeData(data, { cycleStart });
    setSchedule(normalized);
    scheduleRef.current = normalized;
  }, [data, cycleStart]);

  const updateSchedule = useCallback(updater => {
    setSchedule(prev => {
      const base = prev || scheduleRef.current || normalizeData({}, { cycleStart });
      const next = typeof updater === 'function' ? updater(base) : updater;
      const enriched = { ...next, updatedAt: Date.now() };
      scheduleRef.current = enriched;
      if (typeof onChange === 'function') {
        onChange(enriched);
      }
      return enriched;
    });
  }, [onChange, cycleStart]);

  const stimulationEvents = useMemo(
    () => buildStimulationEventLookup(stimulationSchedule, schedule?.startDate),
    [stimulationSchedule, schedule?.startDate],
  );

  const handleIssuedChange = useCallback((key, rawValue) => {
    updateSchedule(prev => {
      const prevMed = prev.medications[key] || { issued: 0, displayValue: '' };
      const { issued, displayValue } = evaluateIssuedInput(rawValue, prevMed.issued);
      const medications = {
        ...prev.medications,
        [key]: {
          issued,
          displayValue,
        },
      };

      const maxIssued = Math.max(
        DEFAULT_ROWS,
        ...MEDICATIONS.map(({ key: medKey }) => medKey === key ? issued : medications[medKey]?.issued || 0),
      );

      const baseRows = ensureRowsLength(prev.rows, maxIssued, prev.startDate);
      const rows = baseRows.map((row, rowIndex) => {
        const nextValues = { ...row.values };
        if (issued <= 0) {
          nextValues[key] = '';
          return { ...row, values: nextValues };
        }
        if (rowIndex < issued) {
          const currentValue = nextValues[key];
          if (currentValue === '' || currentValue === undefined) {
            nextValues[key] = 1;
          }
        } else {
          nextValues[key] = '';
        }
        return {
          ...row,
          values: nextValues,
        };
      });

      return {
        ...prev,
        medications,
        rows,
      };
    });
  }, [updateSchedule]);

  const handleIssuedFocus = useCallback(key => {
    setFocusedMedication(key);
  }, []);

  const handleIssuedBlur = useCallback(() => {
    setFocusedMedication(null);
  }, []);

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

  const handleAddRow = useCallback(() => {
    updateSchedule(prev => {
      const lastRow = prev.rows[prev.rows.length - 1];
      const lastDate = parseDateString(lastRow?.date) || parseDateString(prev.startDate) || new Date();
      const nextDate = formatISODate(addDays(lastDate, 1));
      const newRow = createRow(nextDate, lastRow?.values);
      return {
        ...prev,
        rows: [...prev.rows, newRow],
      };
    });
  }, [updateSchedule]);

  const handleResetDistribution = useCallback(() => {
    updateSchedule(prev => {
      const maxIssued = Math.max(
        DEFAULT_ROWS,
        ...MEDICATIONS.map(({ key }) => prev.medications[key]?.issued || 0),
      );
      const baseRows = ensureRowsLength(prev.rows, maxIssued, prev.startDate);
      return {
        ...prev,
        rows: applyDefaultDistribution(baseRows, prev.medications),
      };
    });
  }, [updateSchedule]);

  const totals = useMemo(() => {
    const result = {};
    const rows = schedule.rows || [];
    MEDICATIONS.forEach(({ key }) => {
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
  }, [schedule]);

  return (
    <Container>
      <Header>
        <div>
          <Title>Ліки</Title>
          {(userLabel || userId) && (
            <Subtitle>
              {userLabel && <strong>{userLabel}</strong>}
              {userLabel && userId ? ' • ' : ''}
              {userId && <span>ID: {userId}</span>}
            </Subtitle>
          )}
        </div>
        <CloseButton type="button" onClick={onClose}>
          Закрити
        </CloseButton>
      </Header>

      <IssuedList>
        {MEDICATIONS.map(({ key, label }) => {
          const medication = schedule.medications[key] || { issued: 0, displayValue: '' };
          const { issued, displayValue } = medication;
          const stats = totals[key] || { used: 0, remaining: issued };
          const showFormula = focusedMedication === key && displayValue;
          const inputValue =
            focusedMedication === key && displayValue
              ? displayValue
              : issued || '';

          return (
            <IssuedRow key={key}>
              <IssuedRowHeader>
                <IssuedLabel>{label}</IssuedLabel>
                <IssuedInput
                  value={inputValue}
                  onChange={event => handleIssuedChange(key, event.target.value)}
                  onFocus={() => handleIssuedFocus(key)}
                  onBlur={handleIssuedBlur}
                  placeholder="Видано"
                />
                <IssuedStats>
                  Видано: {formatNumber(issued)} • Використано: {formatNumber(stats.used)} • Залишок: {formatNumber(stats.remaining)}
                </IssuedStats>
              </IssuedRowHeader>
              {showFormula && displayValue && (
                <FormulaHint>Формула: {displayValue}</FormulaHint>
              )}
            </IssuedRow>
          );
        })}
      </IssuedList>

      <TableWrapper>
        <StyledTable>
          <thead>
            <tr>
              <Th style={{ width: '60px' }}>#</Th>
              <Th style={{ minWidth: '110px' }}>Дата</Th>
              {MEDICATIONS.map(({ key, short }) => (
                <Th key={key} style={{ minWidth: '90px', textAlign: 'center' }}>
                  {short}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              const rows = [];
              let currentYear = null;
              const baseDate = parseDateString(schedule.startDate);

              schedule.rows.forEach((row, index) => {
                const dayNumber = index + 1;
                const showOneTabletLabel = dayNumber >= 8 && (dayNumber - 1) % 7 === 0;
                const parsedDate = parseDateString(row.date, baseDate);
                const formattedDate = formatDateForDisplay(parsedDate);
                const weekday = parsedDate ? WEEKDAY_LABELS[parsedDate.getDay()] : '';
                const year = parsedDate ? parsedDate.getFullYear() : null;
                const isoDate = row.date;
                const eventsForRow =
                  stimulationEvents.byIso.get(isoDate) ||
                  stimulationEvents.byDayMonth.get(formattedDate) ||
                  [];

                if (year !== null && year !== currentYear) {
                  currentYear = year;
                  rows.push(
                    <YearSeparatorRow key={`year-${year}-${index}`}>
                      <YearSeparatorCell colSpan={TOTAL_COLUMNS}>{year}</YearSeparatorCell>
                    </YearSeparatorRow>,
                  );
                }

                const RowComponent = eventsForRow.length ? HighlightedRow : 'tr';
                const rowKey = `${isoDate || 'row'}-${index}`;

                rows.push(
                  <RowComponent key={rowKey}>
                    <Td style={{ textAlign: 'center' }}>
                      <DayCell>
                        {!showOneTabletLabel && <DayNumber>{dayNumber}</DayNumber>}
                        {showOneTabletLabel && <DayBadge>1т1д</DayBadge>}
                      </DayCell>
                    </Td>
                    <Td>
                      <DateCellContent>
                        <DateText>{formattedDate}</DateText>
                        {weekday && <WeekdayTag>{weekday}</WeekdayTag>}
                      </DateCellContent>
                    </Td>
                    {MEDICATIONS.map(({ key }) => (
                      <Td key={key}>
                        <CellInput
                          value={
                            row.values?.[key] === '' || row.values?.[key] === undefined
                              ? ''
                              : row.values[key]
                          }
                          onChange={event => handleCellChange(index, key, event.target.value)}
                        />
                      </Td>
                    ))}
                  </RowComponent>,
                );

                const descriptionItems = eventsForRow
                  .map(event => ({
                    key: event.key,
                    text: event.description || event.labelValue || '',
                  }))
                  .filter(item => item.text);

                if (descriptionItems.length) {
                  rows.push(
                    <DescriptionRow key={`${rowKey}-description`}>
                      <DescriptionCell colSpan={TOTAL_COLUMNS}>
                        <DescriptionList>
                          {descriptionItems.map(item => (
                            <DescriptionItem key={item.key}>{item.text}</DescriptionItem>
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

      <ActionsRow>
        <ActionButton type="button" onClick={handleAddRow}>
          Додати день
        </ActionButton>
        <ActionButton type="button" onClick={handleResetDistribution}>
          Заповнити по 1 таблетці
        </ActionButton>
      </ActionsRow>

      <InfoNote>Зміни зберігаються автоматично. В клітинках можна задавати дозування вручну, воно буде продовжене вниз до наступної зміни.</InfoNote>
    </Container>
  );
};

export default MedicationSchedule;
