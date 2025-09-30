import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

const MEDICATIONS = [
  { key: 'progynova', label: 'Прогінова', short: 'Пр', defaultDisplayValue: '=21+7+21' },
  { key: 'metypred', label: 'Метипред', short: 'Мт', defaultDisplayValue: '=21+7+21' },
  { key: 'aspirin', label: 'Аспірин кардіо', short: 'АК', defaultDisplayValue: '' },
];

const DEFAULT_ROWS = 35;

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

const DateInput = styled(CellInput)`
  text-align: left;
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

const parseDateString = value => {
  if (!value) return null;
  if (value instanceof Date) return isValidDate(value) ? value : null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (isValidDate(direct)) return direct;

  const parts = trimmed.split(/[./-]/);
  if (parts.length < 2) return null;
  const [dayPart, monthPart, yearPart] = parts;
  const day = Number(dayPart);
  const month = Number(monthPart);
  if (Number.isNaN(day) || Number.isNaN(month)) return null;
  const year = yearPart
    ? Number(yearPart.length === 2 ? `20${yearPart}` : yearPart)
    : new Date().getFullYear();
  if (Number.isNaN(year)) return null;
  const candidate = new Date(year, month - 1, day);
  if (!isValidDate(candidate)) return null;
  if (candidate.getDate() !== day || candidate.getMonth() !== month - 1) return null;
  return candidate;
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

const sanitizeDateInput = value => {
  if (!value) return '';
  const parsed = parseDateString(value);
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
  const nextRows = rows.map(row => ({
    date: sanitizeDateInput(row.date),
    values: { ...row.values },
  }));

  const baseDate = parseDateString(startDate) || parseDateString(rows[0]?.date) || new Date();

  let index = nextRows.length;
  while (index < minLength) {
    const prevRow = nextRows[index - 1];
    const prevDate = parseDateString(prevRow?.date) || addDays(baseDate, index - 1) || new Date();
    const nextDate = formatISODate(addDays(prevDate, 1));
    nextRows.push(createRow(nextDate, prevRow?.values));
    index += 1;
  }

  return nextRows;
};

const applyDefaultDistribution = (rows, medications) => {
  return rows.map((row, rowIndex) => {
    const nextValues = { ...row.values };
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
    return {
      ...row,
      values: nextValues,
    };
  });
};

const normalizeRows = (rowsInput, startDate, medications) => {
  const rowsSource = Array.isArray(rowsInput) && rowsInput.length > 0
    ? rowsInput
    : generateDefaultRows(Math.max(DEFAULT_ROWS, ...MEDICATIONS.map(({ key }) => medications[key]?.issued || 0)), startDate);

  const normalized = rowsSource.map((row, index) => {
    const baseValues = row && typeof row === 'object' ? (row.values || row) : {};
    const date = row?.date ? sanitizeDateInput(row.date) : sanitizeDateInput(formatISODate(addDays(parseDateString(startDate) || new Date(), index)));
    const values = {};
    MEDICATIONS.forEach(({ key }) => {
      values[key] = sanitizeCellValue(baseValues[key]);
    });
    return {
      date,
      values,
    };
  });

  return applyDefaultDistribution(normalized, medications);
};

const generateDefaultRows = (count, startDate) => {
  const base = parseDateString(startDate) || new Date();
  return Array.from({ length: count }).map((_, index) => {
    const date = formatISODate(addDays(base, index));
    return createRow(date);
  });
};

const normalizeData = data => {
  const rawStartDate = data?.startDate;
  const startDate = sanitizeDateInput(rawStartDate) || formatISODate(new Date());

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

const MedicationSchedule = ({ data, onChange, onClose, userLabel, userId }) => {
  const [schedule, setSchedule] = useState(() => normalizeData(data));
  const [focusedMedication, setFocusedMedication] = useState(null);
  const scheduleRef = useRef(schedule);

  useEffect(() => {
    const normalized = normalizeData(data);
    setSchedule(normalized);
    scheduleRef.current = normalized;
  }, [data]);

  const updateSchedule = useCallback(updater => {
    setSchedule(prev => {
      const base = prev || scheduleRef.current || normalizeData({});
      const next = typeof updater === 'function' ? updater(base) : updater;
      const enriched = { ...next, updatedAt: Date.now() };
      scheduleRef.current = enriched;
      if (typeof onChange === 'function') {
        onChange(enriched);
      }
      return enriched;
    });
  }, [onChange]);

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

  const handleDateChange = useCallback((rowIndex, value) => {
    updateSchedule(prev => {
      const rows = prev.rows.map((row, index) => {
        if (index !== rowIndex) return row;
        const nextDate = sanitizeDateInput(value);
        return {
          ...row,
          date: nextDate,
        };
      });

      const nextStartDate = rowIndex === 0 ? sanitizeDateInput(value) || prev.startDate : prev.startDate;

      return {
        ...prev,
        rows,
        startDate: nextStartDate,
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
            {schedule.rows.map((row, index) => {
              const dayNumber = index + 1;
              const showOneTabletLabel = dayNumber >= 8 && (dayNumber - 1) % 7 === 0;

              return (
                <tr key={`${row.date || 'row'}-${index}`}>
                  <Td style={{ textAlign: 'center' }}>
                    <DayCell>
                      <span>{dayNumber}</span>
                      {showOneTabletLabel && <DayBadge>1т1д</DayBadge>}
                    </DayCell>
                  </Td>
                <Td>
                  <DateInput
                    value={formatDateForDisplay(row.date)}
                    onChange={event => handleDateChange(index, event.target.value)}
                    placeholder="ДД.ММ"
                  />
                </Td>
                {MEDICATIONS.map(({ key }) => (
                  <Td key={key}>
                    <CellInput
                      value={row.values?.[key] === '' || row.values?.[key] === undefined ? '' : row.values[key]}
                      onChange={event => handleCellChange(index, key, event.target.value)}
                    />
                  </Td>
                ))}
                </tr>
              );
            })}
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
