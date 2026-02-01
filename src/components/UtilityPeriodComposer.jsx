import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';

/*
Dev tasks (UtilityPeriodComposer):
1) Data model + localStorage schema for properties, periods, expense types, carry balance, audit log, and line snapshots.
2) One-screen layout: top bar selectors, compact lines table, right totals + message preview, no scroll.
3) Line types: fixed, metered, formula; manual override; validations for tariffs and readings.
4) Memory: create period from previous with recurring lines and prefills; auto-load on property/period switch.
5) Calculations: per-line amount, totals, balance with carry.
6) Message generator: short/detailed modes, placeholders, copy variants.
7) Directory management: add/edit/disable expense types and properties via compact modals.
8) Autosave + sent audit trail with timestamped changes.
*/

/**
 * @typedef {Object} Property
 * @property {string} id
 * @property {string} name
 * @property {string} tenantName
 * @property {string} currency
 * @property {boolean} isActive
 * @property {string | null} defaultMessageTemplateId
 */

/**
 * @typedef {Object} Period
 * @property {string} id
 * @property {string} propertyId
 * @property {string} month
 * @property {string} dueDate
 * @property {string} paidAmount
 * @property {string} status
 * @property {string} note
 * @property {string} carryBalance
 * @property {ExpenseLine[]} lines
 * @property {AuditEntry[]} history
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ExpenseType
 * @property {string} id
 * @property {string} name
 * @property {string} calcMode
 * @property {string} unit
 * @property {number} sortOrder
 * @property {boolean} isRecurringDefault
 * @property {boolean} isActive
 * @property {string} defaultTariff
 * @property {string} defaultTariff2
 */

/**
 * @typedef {Object} ExpenseLine
 * @property {string} id
 * @property {string} periodId
 * @property {string} expenseTypeId
 * @property {string} amount
 * @property {string} prev
 * @property {string} curr
 * @property {string} tariff
 * @property {string} prev2
 * @property {string} curr2
 * @property {string} tariff2
 * @property {string} dateOfReading
 * @property {number} resultAmount
 * @property {boolean} manualOverride
 * @property {string} overrideAmount
 * @property {string} comment
 * @property {{name: string, calcMode: string, unit: string} | null} typeSnapshot
 *   Snapshot to keep historical data stable when the directory changes.
 */

/**
 * @typedef {Object} AuditEntry
 * @property {string} timestamp
 * @property {string} field
 * @property {string} from
 * @property {string} to
 */

const STORAGE_KEYS = {
  properties: 'utility:properties',
  expenseTypes: 'utility:expenseTypes',
  periods: 'utility:periods',
  templates: 'utility:templates',
};

const DEFAULT_TEMPLATE = {
  id: 'default',
  name: 'Стандартний',
  body:
    '{tenantName}, добрий день. Трохи цифр по комуналці за {periodLabel}: {itemsList} {balanceLabel} {balanceAmount}{dueDateSuffix}',
};

const createDefaultProperties = () => [
  {
    id: nanoid(),
    name: 'Кв 646',
    tenantName: 'Аня',
    currency: 'UAH',
    isActive: true,
    defaultMessageTemplateId: DEFAULT_TEMPLATE.id,
  },
];

const createDefaultExpenseTypes = () => [
  {
    id: nanoid(),
    name: 'ЖЕК + тепло',
    calcMode: 'fixed',
    unit: 'UAH',
    sortOrder: 1,
    isRecurringDefault: true,
    isActive: true,
    defaultTariff: '',
    defaultTariff2: '',
  },
  {
    id: nanoid(),
    name: 'Вода',
    calcMode: 'metered',
    unit: 'm3',
    sortOrder: 2,
    isRecurringDefault: true,
    isActive: true,
    defaultTariff: '49.98',
    defaultTariff2: '',
  },
  {
    id: nanoid(),
    name: 'Світло (2 тарифи)',
    calcMode: 'formula',
    unit: 'kWh',
    sortOrder: 3,
    isRecurringDefault: true,
    isActive: true,
    defaultTariff: '4.32',
    defaultTariff2: '2.16',
  },
  {
    id: nanoid(),
    name: 'Інет',
    calcMode: 'fixed',
    unit: 'UAH',
    sortOrder: 4,
    isRecurringDefault: true,
    isActive: true,
    defaultTariff: '',
    defaultTariff2: '',
  },
];

const parseNumber = value => {
  const parsed = parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;

const formatMoney = value => round2(parseNumber(value)).toFixed(2);

const formatMonthLabel = month => {
  if (!month) return '';
  const [year, rawMonth] = month.split('-');
  const monthIndex = parseInt(rawMonth, 10) - 1;
  const label = new Date(Number(year), monthIndex, 1).toLocaleString('uk-UA', { month: 'long' });
  return `${label} ${year}`;
};

const ensureLocalStorage = (key, fallback) => {
  const existing = localStorage.getItem(key);
  if (!existing) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  try {
    return JSON.parse(existing);
  } catch (error) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
};

const loadPeriods = () => ensureLocalStorage(STORAGE_KEYS.periods, {});

const savePeriods = periods => {
  localStorage.setItem(STORAGE_KEYS.periods, JSON.stringify(periods));
};

const getDefaultPeriod = ({ propertyId, month }) => ({
  id: nanoid(),
  propertyId,
  month,
  dueDate: '',
  paidAmount: '',
  status: 'draft',
  note: '',
  carryBalance: '0',
  lines: [],
  history: [],
  updatedAt: new Date().toISOString(),
});

const calculateLineAmount = (line, type) => {
  const errors = [];
  let result = 0;

  if (!type) return { amount: 0, errors: ['Немає типу'] };

  if (type.calcMode === 'fixed') {
    result = parseNumber(line.amount);
  }

  if (type.calcMode === 'metered') {
    const prev = parseNumber(line.prev);
    const curr = parseNumber(line.curr);
    const tariff = parseNumber(line.tariff);
    if (curr < prev) errors.push('Curr < Prev');
    if (tariff <= 0) errors.push('Tariff ≤ 0');
    result = (curr - prev) * tariff;
  }

  if (type.calcMode === 'formula') {
    const prev1 = parseNumber(line.prev);
    const curr1 = parseNumber(line.curr);
    const tariff1 = parseNumber(line.tariff);
    const prev2 = parseNumber(line.prev2);
    const curr2 = parseNumber(line.curr2);
    const tariff2 = parseNumber(line.tariff2);
    if (curr1 < prev1) errors.push('Curr1 < Prev1');
    if (curr2 < prev2) errors.push('Curr2 < Prev2');
    if (tariff1 <= 0) errors.push('Tariff1 ≤ 0');
    if (tariff2 <= 0) errors.push('Tariff2 ≤ 0');
    result = (curr1 - prev1) * tariff1 + (curr2 - prev2) * tariff2;
  }

  return { amount: round2(result), errors };
};

const calculateTotals = (lines, paidAmount, carryBalance, typeMap) => {
  const totalExpenses = round2(
    lines.reduce((sum, line) => {
      const type = typeMap.get(line.expenseTypeId) || line.typeSnapshot;
      const { amount } = calculateLineAmount(line, type);
      const value = line.manualOverride ? parseNumber(line.overrideAmount) : amount;
      return sum + value;
    }, 0),
  );

  const carry = parseNumber(carryBalance);
  const paid = parseNumber(paidAmount);
  const balance = round2(paid - totalExpenses - carry);
  return { totalExpenses, balance };
};

const normalizePeriodForSave = (period, typeMap) => {
  const updatedLines = period.lines.map(line => {
    const type = typeMap.get(line.expenseTypeId) || line.typeSnapshot;
    const { amount } = calculateLineAmount(line, type);
    return {
      ...line,
      resultAmount: amount,
    };
  });
  return {
    ...period,
    lines: updatedLines,
    updatedAt: new Date().toISOString(),
  };
};

const generateMessage = ({
  template,
  property,
  period,
  totals,
  typeMap,
  mode,
}) => {
  if (!property || !period) return '';

  const items = period.lines.map(line => {
    const type = typeMap.get(line.expenseTypeId) || line.typeSnapshot;
    const { amount } = calculateLineAmount(line, type);
    const value = line.manualOverride ? parseNumber(line.overrideAmount) : amount;
    return `-${formatMoney(value)} ${type?.name ?? 'Витрата'}`;
  });

  const paid = parseNumber(period.paidAmount);
  const paidLabel = paid ? `+${formatMoney(paid)} оплачено` : '+0.00 оплачено';
  const itemsList = [paidLabel, ...items].join(' ');

  const balanceLabel = totals.balance < 0 ? 'борг' : 'переплата';
  const balanceAmount = formatMoney(Math.abs(totals.balance));

  const dueDateSuffix = period.dueDate ? `, я його потім додам в платіж ${period.dueDate}` : '';

  const shortText = template
    .replace('{tenantName}', property.tenantName || 'Орендар')
    .replace('{propertyName}', property.name)
    .replace('{periodLabel}', formatMonthLabel(period.month))
    .replace('{paidAmount}', formatMoney(paid))
    .replace('{itemsList}', itemsList)
    .replace('{totalExpenses}', formatMoney(totals.totalExpenses))
    .replace('{balanceLabel}', balanceLabel)
    .replace('{balanceAmount}', balanceAmount)
    .replace('{dueDate}', period.dueDate)
    .replace('{dueDateSuffix}', dueDateSuffix)
    .replace('{meterDetails}', '');

  if (mode === 'short') return shortText;

  const details = period.lines
    .map(line => {
      const type = typeMap.get(line.expenseTypeId) || line.typeSnapshot;
      const { amount } = calculateLineAmount(line, type);
      if (!type) return '';
      if (type.calcMode === 'fixed') {
        return `${type.name}: ${formatMoney(parseNumber(line.amount))}`;
      }
      if (type.calcMode === 'metered') {
        return `${type.name}: (${line.curr || 0}-${line.prev || 0})*${line.tariff || 0}=${formatMoney(amount)}${line.dateOfReading ? `, дата ${line.dateOfReading}` : ''}`;
      }
      return `${type.name}: ((${line.curr || 0}-${line.prev || 0})*${line.tariff || 0})+` +
        `((${line.curr2 || 0}-${line.prev2 || 0})*${line.tariff2 || 0})=${formatMoney(amount)}` +
        `${line.dateOfReading ? `, дата ${line.dateOfReading}` : ''}`;
    })
    .filter(Boolean)
    .join('\n');

  return `${shortText}\n${details}`;
};

const copyToClipboard = async text => {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const temp = document.createElement('textarea');
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand('copy');
  document.body.removeChild(temp);
  return true;
};

const UtilityPeriodComposer = () => {
  const [properties, setProperties] = useState(() => ensureLocalStorage(STORAGE_KEYS.properties, createDefaultProperties()));
  const [expenseTypes, setExpenseTypes] = useState(() => ensureLocalStorage(STORAGE_KEYS.expenseTypes, createDefaultExpenseTypes()));
  const [templates] = useState(() => ensureLocalStorage(STORAGE_KEYS.templates, [DEFAULT_TEMPLATE]));
  const [selectedPropertyId, setSelectedPropertyId] = useState(() => {
    const stored = ensureLocalStorage(STORAGE_KEYS.properties, createDefaultProperties());
    return stored.find(prop => prop.isActive)?.id || stored[0]?.id || '';
  });
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [period, setPeriod] = useState(() => getDefaultPeriod({ propertyId: selectedPropertyId, month: selectedMonth }));
  const [statusMessage, setStatusMessage] = useState('Saved');
  const [showTypesEditor, setShowTypesEditor] = useState(false);
  const [showPropertyEditor, setShowPropertyEditor] = useState(false);
  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [messageMode, setMessageMode] = useState('short');
  const [copyStatus, setCopyStatus] = useState('');
  const saveTimer = useRef(null);
  const isBootstrapped = useRef(false);

  const typeMap = useMemo(
    () => new Map(expenseTypes.map(type => [type.id, type])),
    [expenseTypes],
  );

  const activeExpenseTypes = useMemo(
    () => expenseTypes.filter(type => type.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [expenseTypes],
  );

  const selectedProperty = useMemo(
    () => properties.find(property => property.id === selectedPropertyId) || properties[0],
    [properties, selectedPropertyId],
  );

  const ensurePeriod = useCallback(
    (propertyId, month) => {
      const storedPeriods = loadPeriods();
      const propertyPeriods = storedPeriods[propertyId] || {};
      if (propertyPeriods[month]) {
        return propertyPeriods[month];
      }

      const newPeriod = getDefaultPeriod({ propertyId, month });
      const prevMonth = new Date(`${month}-01`);
      prevMonth.setMonth(prevMonth.getMonth() - 1);
      const prevKey = prevMonth.toISOString().slice(0, 7);
      const prevPeriod = propertyPeriods[prevKey];

      if (prevPeriod) {
        const computedTotals = calculateTotals(prevPeriod.lines, prevPeriod.paidAmount, prevPeriod.carryBalance, typeMap);
        newPeriod.carryBalance = String(computedTotals.balance);
        newPeriod.dueDate = prevPeriod.dueDate;
        newPeriod.note = prevPeriod.note;
      }

      const recurringTypes = activeExpenseTypes.filter(type => type.isRecurringDefault);
      const recurringLines = recurringTypes.map(type => {
        const prevLine = prevPeriod?.lines.find(line => line.expenseTypeId === type.id);
        return {
          id: nanoid(),
          periodId: newPeriod.id,
          expenseTypeId: type.id,
          amount: prevLine?.amount || '',
          prev: prevLine?.curr || '',
          curr: '',
          tariff: prevLine?.tariff || type.defaultTariff || '',
          prev2: prevLine?.curr2 || '',
          curr2: '',
          tariff2: prevLine?.tariff2 || type.defaultTariff2 || '',
          dateOfReading: prevLine?.dateOfReading || '',
          resultAmount: 0,
          manualOverride: false,
          overrideAmount: '',
          comment: '',
          typeSnapshot: {
            name: type.name,
            calcMode: type.calcMode,
            unit: type.unit,
          },
        };
      });

      newPeriod.lines = recurringLines;
      return newPeriod;
    },
    [activeExpenseTypes, typeMap],
  );

  useEffect(() => {
    const periodData = ensurePeriod(selectedPropertyId, selectedMonth);
    setPeriod(periodData);
  }, [ensurePeriod, selectedPropertyId, selectedMonth]);

  useEffect(() => {
    if (!isBootstrapped.current) {
      isBootstrapped.current = true;
      return;
    }
    setStatusMessage('Saving...');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEYS.properties, JSON.stringify(properties));
      localStorage.setItem(STORAGE_KEYS.expenseTypes, JSON.stringify(expenseTypes));
      localStorage.setItem(STORAGE_KEYS.templates, JSON.stringify(templates));
      const periods = loadPeriods();
      const updatedPeriod = normalizePeriodForSave(period, typeMap);
      const propertyPeriods = { ...(periods[period.propertyId] || {}) };
      propertyPeriods[period.month] = updatedPeriod;
      savePeriods({
        ...periods,
        [period.propertyId]: propertyPeriods,
      });
      setStatusMessage('Saved');
    }, 700);
  }, [properties, expenseTypes, templates, period, typeMap]);

  const updatePeriodField = (field, value) => {
    setPeriod(prev => {
      const next = { ...prev, [field]: value };
      if (prev.status === 'sent' && prev[field] !== value) {
        next.history = [
          ...prev.history,
          {
            timestamp: new Date().toISOString(),
            field,
            from: String(prev[field] ?? ''),
            to: String(value ?? ''),
          },
        ];
      }
      return next;
    });
  };

  const updateLine = (lineId, patch) => {
    setPeriod(prev => {
      const updatedLines = prev.lines.map(line => {
        if (line.id !== lineId) return line;
        const updated = { ...line, ...patch };
        return updated;
      });
      return { ...prev, lines: updatedLines };
    });
  };

  const addLine = typeId => {
    const type = typeMap.get(typeId);
    if (!type) return;
    const newLine = {
      id: nanoid(),
      periodId: period.id,
      expenseTypeId: type.id,
      amount: '',
      prev: '',
      curr: '',
      tariff: type.defaultTariff || '',
      prev2: '',
      curr2: '',
      tariff2: type.defaultTariff2 || '',
      dateOfReading: '',
      resultAmount: 0,
      manualOverride: false,
      overrideAmount: '',
      comment: '',
      typeSnapshot: {
        name: type.name,
        calcMode: type.calcMode,
        unit: type.unit,
      },
    };
    setPeriod(prev => ({ ...prev, lines: [...prev.lines, newLine] }));
  };

  const removeLine = lineId => {
    setPeriod(prev => ({ ...prev, lines: prev.lines.filter(line => line.id !== lineId) }));
  };

  const createPeriodFromPrevious = () => {
    const periods = loadPeriods();
    const propertyPeriods = periods[selectedPropertyId] || {};
    const prevMonth = new Date(`${selectedMonth}-01`);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevKey = prevMonth.toISOString().slice(0, 7);
    const prevPeriod = propertyPeriods[prevKey];
    const basePeriod = getDefaultPeriod({ propertyId: selectedPropertyId, month: selectedMonth });
    if (prevPeriod) {
      const computedTotals = calculateTotals(prevPeriod.lines, prevPeriod.paidAmount, prevPeriod.carryBalance, typeMap);
      basePeriod.carryBalance = String(computedTotals.balance);
      basePeriod.dueDate = prevPeriod.dueDate;
      basePeriod.note = prevPeriod.note;
    }
    const recurringTypes = activeExpenseTypes.filter(type => type.isRecurringDefault);
    basePeriod.lines = recurringTypes.map(type => {
      const prevLine = prevPeriod?.lines.find(line => line.expenseTypeId === type.id);
      return {
        id: nanoid(),
        periodId: basePeriod.id,
        expenseTypeId: type.id,
        amount: prevLine?.amount || '',
        prev: prevLine?.curr || '',
        curr: '',
        tariff: prevLine?.tariff || type.defaultTariff || '',
        prev2: prevLine?.curr2 || '',
        curr2: '',
        tariff2: prevLine?.tariff2 || type.defaultTariff2 || '',
        dateOfReading: prevLine?.dateOfReading || '',
        resultAmount: 0,
        manualOverride: false,
        overrideAmount: '',
        comment: '',
        typeSnapshot: {
          name: type.name,
          calcMode: type.calcMode,
          unit: type.unit,
        },
      };
    });
    setPeriod(basePeriod);
  };

  const totals = useMemo(
    () => calculateTotals(period.lines, period.paidAmount, period.carryBalance, typeMap),
    [period.lines, period.paidAmount, period.carryBalance, typeMap],
  );

  const template = templates.find(item => item.id === selectedProperty?.defaultMessageTemplateId) || templates[0];

  const message = useMemo(
    () => generateMessage({
      template: template?.body || DEFAULT_TEMPLATE.body,
      property: selectedProperty,
      period,
      totals,
      typeMap,
      mode: messageMode,
    }),
    [template, selectedProperty, period, totals, typeMap, messageMode],
  );

  const copyMessage = async mode => {
    const text = mode === 'telegram'
      ? message.replace(/\n{3,}/g, '\n\n').replace(/\s+$/g, '')
      : message;
    await copyToClipboard(text);
    setCopyStatus('Скопійовано');
    setTimeout(() => setCopyStatus(''), 1500);
  };

  const handlePrevMonth = () => {
    const date = new Date(`${selectedMonth}-01`);
    date.setMonth(date.getMonth() - 1);
    setSelectedMonth(date.toISOString().slice(0, 7));
  };

  const handleNextMonth = () => {
    const date = new Date(`${selectedMonth}-01`);
    date.setMonth(date.getMonth() + 1);
    setSelectedMonth(date.toISOString().slice(0, 7));
  };

  const handleAddProperty = name => {
    const newProperty = {
      id: nanoid(),
      name: name || 'Новий об’єкт',
      tenantName: '',
      currency: 'UAH',
      isActive: true,
      defaultMessageTemplateId: DEFAULT_TEMPLATE.id,
    };
    setProperties(prev => [...prev, newProperty]);
    setSelectedPropertyId(newProperty.id);
  };

  const handleUpdateProperty = (propertyId, patch) => {
    setProperties(prev => prev.map(prop => (prop.id === propertyId ? { ...prop, ...patch } : prop)));
  };

  const handleExpenseTypeUpdate = (typeId, patch) => {
    setExpenseTypes(prev => prev.map(type => (type.id === typeId ? { ...type, ...patch } : type)));
  };

  const handleAddExpenseType = () => {
    const newType = {
      id: nanoid(),
      name: 'Нова витрата',
      calcMode: 'fixed',
      unit: 'UAH',
      sortOrder: expenseTypes.length + 1,
      isRecurringDefault: false,
      isActive: true,
      defaultTariff: '',
      defaultTariff2: '',
    };
    setExpenseTypes(prev => [...prev, newType]);
  };

  const visibleLines = period.lines.slice(0, 6);

  return (
    <div style={{
      width: 'min(92vw, 980px)',
      padding: '12px',
      background: '#fff',
      color: '#222',
      fontFamily: 'Arial, sans-serif',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
    }}>
      <div style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
        marginBottom: '10px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '180px' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>Об’єкт</label>
          <select
            value={selectedPropertyId}
            onChange={event => setSelectedPropertyId(event.target.value)}
            style={{ padding: '6px', fontSize: '12px' }}
          >
            {properties.filter(prop => prop.isActive).map(property => (
              <option key={property.id} value={property.id}>
                {property.name}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={() => setShowPropertyEditor(true)} style={styles.smallButton}>
          Налаштувати об’єкти
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: '140px' }}>
          <label style={{ fontSize: '12px', color: '#666' }}>Період</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={event => setSelectedMonth(event.target.value)}
            style={{ padding: '6px', fontSize: '12px' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button type="button" onClick={handlePrevMonth} style={styles.smallButton}>
            ←
          </button>
          <button type="button" onClick={handleNextMonth} style={styles.smallButton}>
            →
          </button>
        </div>
        <button type="button" onClick={createPeriodFromPrevious} style={styles.smallButton}>
          Створити з попереднього
        </button>
        <div style={{ marginLeft: 'auto', fontSize: '12px', color: '#999' }}>{statusMessage}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr', gap: '12px' }}>
        <div style={{ border: '1px solid #eee', borderRadius: '6px', padding: '8px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
            <label style={{ fontSize: '12px', color: '#666' }}>Оплачено</label>
            <input
              value={period.paidAmount}
              onChange={event => updatePeriodField('paidAmount', event.target.value)}
              style={{ width: '120px', padding: '4px', fontSize: '12px' }}
              placeholder="0.00"
            />
            <label style={{ fontSize: '12px', color: '#666' }}>Перенос (+/-)</label>
            <input
              value={period.carryBalance}
              onChange={event => updatePeriodField('carryBalance', event.target.value)}
              style={{ width: '90px', padding: '4px', fontSize: '12px' }}
            />
            <label style={{ fontSize: '12px', color: '#666' }}>Статус</label>
            <select
              value={period.status}
              onChange={event => updatePeriodField('status', event.target.value)}
              style={{ padding: '4px', fontSize: '12px' }}
            >
              <option value="draft">draft</option>
              <option value="sent">sent</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 1fr 0.6fr', gap: '6px', fontSize: '12px', color: '#777', marginBottom: '4px' }}>
            <span>Тип</span>
            <span>Показники / сума</span>
            <span>Дата</span>
            <span>Σ</span>
          </div>

          {visibleLines.map(line => {
            const type = typeMap.get(line.expenseTypeId) || line.typeSnapshot;
            const { amount, errors } = calculateLineAmount(line, type);
            const result = line.manualOverride ? parseNumber(line.overrideAmount) : amount;
            return (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2.4fr 1fr 0.6fr', gap: '6px', alignItems: 'center', marginBottom: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{type?.name || '—'}</div>
                <div>
                  {type?.calcMode === 'fixed' && (
                    <input
                      value={line.amount}
                      onChange={event => updateLine(line.id, { amount: event.target.value })}
                      style={styles.input}
                      placeholder="0.00"
                    />
                  )}
                  {type?.calcMode === 'metered' && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <input value={line.prev} onChange={event => updateLine(line.id, { prev: event.target.value })} style={styles.inputTiny} placeholder="prev" />
                      <input value={line.curr} onChange={event => updateLine(line.id, { curr: event.target.value })} style={styles.inputTiny} placeholder="curr" />
                      <input value={line.tariff} onChange={event => updateLine(line.id, { tariff: event.target.value })} style={styles.inputTiny} placeholder="tariff" />
                    </div>
                  )}
                  {type?.calcMode === 'formula' && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      <input value={line.prev} onChange={event => updateLine(line.id, { prev: event.target.value })} style={styles.inputTiny} placeholder="prev1" />
                      <input value={line.curr} onChange={event => updateLine(line.id, { curr: event.target.value })} style={styles.inputTiny} placeholder="curr1" />
                      <input value={line.tariff} onChange={event => updateLine(line.id, { tariff: event.target.value })} style={styles.inputTiny} placeholder="tar1" />
                      <input value={line.prev2} onChange={event => updateLine(line.id, { prev2: event.target.value })} style={styles.inputTiny} placeholder="prev2" />
                      <input value={line.curr2} onChange={event => updateLine(line.id, { curr2: event.target.value })} style={styles.inputTiny} placeholder="curr2" />
                      <input value={line.tariff2} onChange={event => updateLine(line.id, { tariff2: event.target.value })} style={styles.inputTiny} placeholder="tar2" />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                    <label style={{ fontSize: '10px', color: '#666' }}>
                      <input
                        type="checkbox"
                        checked={line.manualOverride}
                        onChange={event => updateLine(line.id, { manualOverride: event.target.checked })}
                      /> override
                    </label>
                    {line.manualOverride && (
                      <input
                        value={line.overrideAmount}
                        onChange={event => updateLine(line.id, { overrideAmount: event.target.value })}
                        style={styles.inputTiny}
                        placeholder="manual"
                      />
                    )}
                    <button type="button" onClick={() => removeLine(line.id)} style={styles.iconButton}>
                      ✕
                    </button>
                  </div>
                  {errors.length > 0 && (
                    <div style={{ color: '#d9534f', fontSize: '10px' }}>{errors.join(', ')}</div>
                  )}
                </div>
                <input
                  value={line.dateOfReading}
                  onChange={event => updateLine(line.id, { dateOfReading: event.target.value })}
                  style={styles.input}
                  placeholder="ДД.ММ"
                />
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{formatMoney(result)}</div>
              </div>
            );
          })}

          {period.lines.length > 6 && (
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>
              Ще {period.lines.length - 6} рядків приховано
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" onClick={() => setShowAddLineModal(true)} style={styles.smallButton}>
              Додати рядок
            </button>
            <button type="button" onClick={() => setShowTypesEditor(true)} style={styles.smallButton}>
              Налаштувати типи витрат
            </button>
          </div>
        </div>

        <div style={{ border: '1px solid #eee', borderRadius: '6px', padding: '8px' }}>
          <div style={{ fontSize: '12px', color: '#777', marginBottom: '4px' }}>Підсумки</div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Витрати: {formatMoney(totals.totalExpenses)}</div>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>
            Баланс: {totals.balance < 0 ? 'борг' : 'переплата'} {formatMoney(Math.abs(totals.balance))}
          </div>
          <div style={{ fontSize: '12px', color: '#777', marginTop: '8px' }}>Превʼю повідомлення</div>
          <div style={{ display: 'flex', gap: '6px', margin: '6px 0' }}>
            <button type="button" onClick={() => setMessageMode('short')} style={messageMode === 'short' ? styles.smallButtonActive : styles.smallButton}>
              Коротко
            </button>
            <button type="button" onClick={() => setMessageMode('detailed')} style={messageMode === 'detailed' ? styles.smallButtonActive : styles.smallButton}>
              З деталями
            </button>
          </div>
          <textarea readOnly value={message} style={{ width: '100%', height: '150px', fontSize: '11px', padding: '6px' }} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => copyMessage('plain')} style={styles.smallButton}>
              Copy
            </button>
            <button type="button" onClick={() => { setMessageMode('detailed'); copyMessage('plain'); }} style={styles.smallButton}>
              Copy + details
            </button>
            <button type="button" onClick={() => copyMessage('telegram')} style={styles.smallButton}>
              Copy for Telegram
            </button>
            <span style={{ fontSize: '11px', color: '#2b7' }}>{copyStatus}</span>
          </div>
        </div>
      </div>

      {showAddLineModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddLineModal(false)}>
          <div style={styles.modalContent} onClick={event => event.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Додати рядок</div>
            {activeExpenseTypes.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  addLine(type.id);
                  setShowAddLineModal(false);
                }}
                style={{ ...styles.smallButton, width: '100%', marginBottom: '6px' }}
              >
                {type.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showTypesEditor && (
        <div style={styles.modalOverlay} onClick={() => setShowTypesEditor(false)}>
          <div style={styles.modalContentLarge} onClick={event => event.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Налаштувати типи витрат</div>
            {expenseTypes.map(type => (
              <div key={type.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.6fr 0.6fr 0.6fr', gap: '6px', marginBottom: '6px' }}>
                <input value={type.name} onChange={event => handleExpenseTypeUpdate(type.id, { name: event.target.value })} style={styles.input} />
                <select value={type.calcMode} onChange={event => handleExpenseTypeUpdate(type.id, { calcMode: event.target.value })} style={styles.input}>
                  <option value="fixed">fixed</option>
                  <option value="metered">metered</option>
                  <option value="formula">formula</option>
                </select>
                <input value={type.unit} onChange={event => handleExpenseTypeUpdate(type.id, { unit: event.target.value })} style={styles.input} />
                <input value={type.sortOrder} onChange={event => handleExpenseTypeUpdate(type.id, { sortOrder: Number(event.target.value) })} style={styles.input} />
                <label style={{ fontSize: '10px' }}>
                  <input
                    type="checkbox"
                    checked={type.isRecurringDefault}
                    onChange={event => handleExpenseTypeUpdate(type.id, { isRecurringDefault: event.target.checked })}
                  /> recurring
                </label>
                <input value={type.defaultTariff} onChange={event => handleExpenseTypeUpdate(type.id, { defaultTariff: event.target.value })} style={styles.input} placeholder="tariff" />
                <input value={type.defaultTariff2} onChange={event => handleExpenseTypeUpdate(type.id, { defaultTariff2: event.target.value })} style={styles.input} placeholder="tariff2" />
                <label style={{ fontSize: '10px' }}>
                  <input
                    type="checkbox"
                    checked={type.isActive}
                    onChange={event => handleExpenseTypeUpdate(type.id, { isActive: event.target.checked })}
                  /> active
                </label>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button type="button" onClick={handleAddExpenseType} style={styles.smallButton}>Додати тип</button>
              <button type="button" onClick={() => setShowTypesEditor(false)} style={styles.smallButton}>Закрити</button>
            </div>
          </div>
        </div>
      )}

      {showPropertyEditor && (
        <div style={styles.modalOverlay} onClick={() => setShowPropertyEditor(false)}>
          <div style={styles.modalContentLarge} onClick={event => event.stopPropagation()}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Об’єкти оренди</div>
            {properties.map(property => (
              <div key={property.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.6fr 0.6fr', gap: '6px', marginBottom: '6px' }}>
                <input value={property.name} onChange={event => handleUpdateProperty(property.id, { name: event.target.value })} style={styles.input} />
                <input value={property.tenantName} onChange={event => handleUpdateProperty(property.id, { tenantName: event.target.value })} style={styles.input} placeholder="Орендар" />
                <input value={property.currency} onChange={event => handleUpdateProperty(property.id, { currency: event.target.value })} style={styles.input} />
                <label style={{ fontSize: '10px' }}>
                  <input type="checkbox" checked={property.isActive} onChange={event => handleUpdateProperty(property.id, { isActive: event.target.checked })} /> active
                </label>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button type="button" onClick={() => handleAddProperty('Новий об’єкт')} style={styles.smallButton}>Додати об’єкт</button>
              <button type="button" onClick={() => setShowPropertyEditor(false)} style={styles.smallButton}>Закрити</button>
            </div>
          </div>
        </div>
      )}

      {period.status === 'sent' && period.history.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#999' }}>
          Audit log: {period.history.slice(-3).map(entry => `${entry.field} ${entry.from}→${entry.to}`).join(' • ')}
        </div>
      )}
    </div>
  );
};

const styles = {
  smallButton: {
    padding: '6px 10px',
    fontSize: '12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    background: '#f7f7f7',
    cursor: 'pointer',
  },
  smallButtonActive: {
    padding: '6px 10px',
    fontSize: '12px',
    border: '1px solid #2b7',
    borderRadius: '4px',
    background: '#e9f9f0',
    cursor: 'pointer',
  },
  iconButton: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '12px',
  },
  input: {
    padding: '4px',
    fontSize: '12px',
    width: '100%',
  },
  inputTiny: {
    padding: '3px',
    fontSize: '11px',
    width: '52px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1200,
  },
  modalContent: {
    background: '#fff',
    padding: '12px',
    borderRadius: '6px',
    width: '260px',
  },
  modalContentLarge: {
    background: '#fff',
    padding: '12px',
    borderRadius: '6px',
    width: 'min(80vw, 640px)',
  },
};

export default UtilityPeriodComposer;
