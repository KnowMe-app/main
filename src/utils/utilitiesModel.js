/**
 * Комуналка: розрахунок місяця по квартирі (17.11, на прохання власниці
 * продукту — замість таблиці Excel).
 *
 * Кожне число живе в самому місяці: показники, тарифи, суми (ЖЕК, інтернет),
 * бюджет і коригування. Дат «тариф діє з …» немає навмисно: власниця обрала
 * модель «перенести з минулого місяця тапом» — незмінне переноситься одним
 * дотиком, а змінене видно позначкою «змінено · було …». Показник «було»
 * береться з попереднього місяця сам; перший місяць квартири — з початкових
 * показників (`apartment.init`), а заміну лічильника посеред року задає
 * «було вручну» (`…prev`).
 *
 * Тут лише чисті функції: модель даних, вирази, розрахунок, текст для
 * орендаря. Запис і памʼять пристрою — `utilitiesOfflineWrites`, екран —
 * `components/UtilitiesPage`.
 */

// Вираз як у клітинці Excel: «1340-571.13», «299/31*30». Власний розбір, а не
// `Function`: рядок пише людина, і виконувати його як код не можна.
// Знаки, які люди пишуть руками чи вставляють з калькулятора: «×», «÷», «−»
// і «=» на початку, як у клітинці Excel.
const normalizeExprSigns = src => String(src ?? '')
  .replace(/[×xх·]/gi, '*')
  .replace(/[÷:]/g, '/')
  .replace(/[−–—]/g, '-')
  .replace(/^\s*=/, '');

export const evalUtilityExpr = src => {
  const s = normalizeExprSigns(src).replace(/,/g, '.').replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[0-9.+\-*/()]+$/.test(s)) return NaN;
  let i = 0;
  const peek = () => s[i];
  const expr = () => {
    let value = term();
    while (peek() === '+' || peek() === '-') {
      const op = s[i++];
      const right = term();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };
  function term() {
    let value = factor();
    while (peek() === '*' || peek() === '/') {
      const op = s[i++];
      const right = factor();
      value = op === '*' ? value * right : value / right;
    }
    return value;
  }
  function factor() {
    if (peek() === '-') { i += 1; return -factor(); }
    if (peek() === '+') { i += 1; return factor(); }
    if (peek() === '(') {
      i += 1;
      const value = expr();
      if (peek() !== ')') throw new Error('paren');
      i += 1;
      return value;
    }
    const match = /^\d*\.?\d+|^\d+\./.exec(s.slice(i));
    if (!match) throw new Error('number');
    i += match[0].length;
    return parseFloat(match[0]);
  }
  try {
    const value = expr();
    return i === s.length && Number.isFinite(value) ? value : NaN;
  } catch {
    return NaN;
  }
};

export const hasValue = value => value !== null && value !== undefined && String(value).trim() !== '';
export const isNumber = value => typeof value === 'number' && Number.isFinite(value);
export const isFormula = expr => /[+\-*/()]/.test(normalizeExprSigns(expr).trim().replace(/^-/, ''));

export const getPath = (obj, path) => String(path).split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);

export const setPath = (obj, path, value) => {
  const keys = String(path).split('.');
  let node = obj;
  keys.slice(0, -1).forEach(key => {
    if (node[key] == null || typeof node[key] !== 'object') node[key] = {};
    node = node[key];
  });
  node[keys[keys.length - 1]] = value;
};

// ---------- дати й місяці ----------
export const MONTHS = ['січень', 'лютий', 'березень', 'квітень', 'травень', 'червень', 'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'];
export const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
export const MONTHS_LOC = ['січні', 'лютому', 'березні', 'квітні', 'травні', 'червні', 'липні', 'серпні', 'вересні', 'жовтні', 'листопаді', 'грудні'];

export const isMonthKey = mk => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(mk || ''));
export const monthIndex = mk => Number(String(mk).slice(5, 7)) - 1;
export const monthName = mk => `${MONTHS[monthIndex(mk)]} ${String(mk).slice(0, 4)}`;
export const capitalize = text => (text ? text[0].toUpperCase() + text.slice(1) : text);
export const nextMonthKey = mk => {
  let [year, month] = String(mk).split('-').map(Number);
  month += 1;
  if (month > 12) { month = 1; year += 1; }
  return `${year}-${String(month).padStart(2, '0')}`;
};
export const todayIso = (now = new Date()) => {
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
export const formatDmy = iso => {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};
export const formatDm = iso => {
  if (!iso) return '';
  const [, m, d] = String(iso).split('-');
  return d && m ? `${d}.${m}` : '';
};
export const parseDmy = text => {
  const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(text || '').trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime()) || todayIso(date) !== iso) return null;
  return iso;
};

// ---------- числа для показу ----------
const round2 = n => Math.round(n * 100) / 100;
export const formatMoney = n => round2(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const formatSigned = n => {
  const sign = n > 0.004 ? '+' : n < -0.004 ? '−' : '';
  return `${sign}${formatMoney(Math.abs(n))}`;
};
export const formatNumber = n => Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 3 });
export const formatExpr = expr => {
  const value = evalUtilityExpr(expr);
  if (!isNumber(value)) return String(expr ?? '');
  return isFormula(expr) ? formatMoney(value) : formatNumber(value);
};

// ---------- блоки квартири ----------
// Лічильник двозонний (світло день/ніч), звичайний (вода, газ) або сума за
// місяць (ЖЕК, інтернет). Ключ блоку — і ключ у місяці (`vals.{ключ}`).
export const CATEGORY_TYPES = Object.freeze({ METER2: 'meter2', METER: 'meter', SUM: 'sum' });

export const DEFAULT_CATEGORIES = Object.freeze({
  light: Object.freeze({ name: 'Світло', type: 'meter2', unit: 'кВт·год', order: 1, tone: 'light' }),
  water: Object.freeze({ name: 'Вода', type: 'meter', unit: 'м³', order: 2, tone: 'water' }),
  zhek: Object.freeze({ name: 'ЖЕК', type: 'sum', order: 3 }),
  inet: Object.freeze({ name: 'Інтернет', type: 'sum', order: 4 }),
});

// Блок діє в місяцях від `since` (доданий посеред року) і до `retiredFrom`
// (прибраний): закриті місяці рахуються з тими блоками, що були тоді. Поки
// «Прибрати» знімало визначення блоку цілком, зникали й нараховане за ним у
// минулих місяцях, і переплати, перенесені далі, — історія переписувалась.
export const isCategoryActive = (cat, mk) => !mk
  || ((!cat.since || mk >= cat.since) && (!cat.retiredFrom || mk < cat.retiredFrom));

// Без місяця — усі блоки, зокрема прибрані (заголовки експорту).
export const listCategories = (apartment, mk) => Object.entries(apartment?.cats || {})
  .filter(([, cat]) => cat && typeof cat === 'object' && cat.name)
  .map(([key, cat]) => ({ ...cat, key }))
  .filter(cat => isCategoryActive(cat, mk))
  .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || a.key.localeCompare(b.key));

export const zonesOf = cat => {
  if (!cat) return [];
  if (cat.type === CATEGORY_TYPES.METER2) {
    return [
      { zone: 'day', label: 'День', cur: `vals.${cat.key}.day.cur`, prev: `vals.${cat.key}.day.prev`, tariff: `vals.${cat.key}.tDay`, tariffLabel: 'Тариф · день' },
      { zone: 'night', label: 'Ніч', cur: `vals.${cat.key}.night.cur`, prev: `vals.${cat.key}.night.prev`, tariff: `vals.${cat.key}.tNight`, tariffLabel: 'Тариф · ніч' },
    ];
  }
  if (cat.type === CATEGORY_TYPES.METER) {
    return [{ zone: 'main', label: 'Показник', cur: `vals.${cat.key}.cur`, prev: `vals.${cat.key}.prev`, tariff: `vals.${cat.key}.t`, tariffLabel: 'Тариф' }];
  }
  return [];
};

// Те, що переноситься тапом з минулого місяця: тарифи, суми, бюджет.
// Показник «зараз» не переноситься ніколи — його знімають щомісяця.
export const listCarryFields = (apartment, mk) => {
  const fields = [];
  listCategories(apartment, mk).forEach(cat => {
    if (cat.type === CATEGORY_TYPES.SUM) {
      fields.push({ path: `vals.${cat.key}.e`, label: cat.name, cat });
    } else {
      zonesOf(cat).forEach(zone => fields.push({
        path: zone.tariff,
        label: `${cat.name} · ${zone.tariffLabel.toLowerCase()}`,
        cat,
        tariff: true,
      }));
    }
  });
  fields.push({ path: 'budget', label: 'Бюджет', budget: true });
  return fields;
};

export const buildNewApartment = ({ name = 'Нова квартира', order = Date.now(), date = todayIso() } = {}) => ({
  name,
  payDay: 19,
  order,
  cats: Object.fromEntries(Object.entries(DEFAULT_CATEGORIES).map(([key, cat]) => [key, { ...cat }])),
  init: { date, vals: { light: { day: { cur: 0 }, night: { cur: 0 } }, water: { cur: 0 } } },
});

// ---------- місяці ----------
export const listApartments = data => Object.entries(data?.apartments || {})
  .filter(([, apt]) => apt && typeof apt === 'object')
  .map(([id, apt]) => ({ ...apt, id }))
  .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || a.id.localeCompare(b.id));

export const listMonths = (data, aptId) => Object.entries(data?.months?.[aptId] || {})
  .filter(([mk, month]) => isMonthKey(mk) && month && typeof month === 'object')
  .map(([mk, month]) => ({ ...month, mk, aptId }))
  .sort((a, b) => (a.mk < b.mk ? -1 : a.mk > b.mk ? 1 : 0));

export const listClosedMonths = (data, aptId) => listMonths(data, aptId).filter(month => month.closed === true);

export const findPrevMonth = (data, aptId, mk) => {
  const earlier = listMonths(data, aptId).filter(month => month.mk < mk);
  return earlier[earlier.length - 1] || null;
};

// Дата показників нового місяця за замовчуванням: сьогодні, а для минулого
// місяця — його останній день (закриваючи вересень у листопаді, дата
// «17.11» читалась би як показники листопада).
export const defaultReadingDate = (mk, today = todayIso()) => {
  if (!isMonthKey(mk) || String(today).slice(0, 7) <= mk) return today;
  const [year, month] = mk.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${mk}-${String(lastDay).padStart(2, '0')}`;
};

// Місяць, який зараз заповнюють: відкритий (`closed` не стоїть) або — коли всі
// закриті — порожній наступний. Порожній існує лише на екрані: у базу він
// лягає з першим записом.
export const resolveOpenMonth = (data, aptId, { today = todayIso() } = {}) => {
  const months = listMonths(data, aptId);
  const open = months.find(month => month.closed !== true);
  if (open) return { ...open, virtual: false };
  const last = months[months.length - 1];
  const apt = data?.apartments?.[aptId];
  const mk = last ? nextMonthKey(last.mk) : String(apt?.init?.date || today).slice(0, 7);
  return { aptId, mk, date: defaultReadingDate(mk, today), closed: false, vals: {}, budget: null, carry: last ? null : false, extras: {}, virtual: true };
};

export const readField = (month, path) => getPath(month, path);

export const prevReading = (data, month, zone) => {
  const manual = getPath(month, zone.prev);
  if (hasValue(manual)) return { value: evalUtilityExpr(manual), source: 'manual' };
  const prev = findPrevMonth(data, month.aptId, month.mk);
  const prevValue = prev && getPath(prev, zone.cur);
  if (hasValue(prevValue)) return { value: evalUtilityExpr(prevValue), source: 'prev', mk: prev.mk };
  const apt = data?.apartments?.[month.aptId];
  const init = getPath(apt?.init, zone.cur);
  return { value: hasValue(init) ? evalUtilityExpr(init) : null, source: 'init', date: apt?.init?.date || '' };
};

export const listExtras = month => Object.entries(month?.extras || {})
  .filter(([, extra]) => extra && typeof extra === 'object')
  .map(([id, extra]) => ({ ...extra, id }))
  .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || a.id.localeCompare(b.id));

/**
 * Розрахунок місяця. Залишок минулого місяця (переплата чи борг) іде в бюджет
 * лише з явним «перенести» (`carry: true`): у таблиці власниця так само
 * вирішувала — врахувати з платежу чи перенести.
 */
export const computeMonth = (data, month, memo = new Map()) => {
  const memoKey = `${month.aptId}|${month.mk}|${month.virtual ? 'v' : ''}`;
  if (!month.virtual && memo.has(memoKey)) return memo.get(memoKey);
  const apt = data?.apartments?.[month.aptId] || {};
  const blocks = [];
  let cost = 0;
  listCategories(apt, month.mk).forEach(cat => {
    const block = { cat, zones: [], sum: 0, complete: true };
    if (cat.type === CATEGORY_TYPES.SUM) {
      const expr = getPath(month, `vals.${cat.key}.e`);
      const value = evalUtilityExpr(expr);
      block.expr = expr;
      block.value = value;
      if (isNumber(value)) block.sum = value;
      else block.complete = false;
    } else {
      zonesOf(cat).forEach(zone => {
        const prev = prevReading(data, month, zone);
        const cur = evalUtilityExpr(getPath(month, zone.cur));
        const tariff = evalUtilityExpr(getPath(month, zone.tariff));
        const row = { zone, prev, cur, tariff, use: null, sum: 0, complete: false };
        if (isNumber(cur) && isNumber(prev.value)) row.use = cur - prev.value;
        if (row.use !== null && row.use >= 0 && isNumber(tariff)) {
          row.sum = row.use * tariff;
          row.complete = true;
        }
        if (!row.complete) block.complete = false;
        block.sum += row.sum;
        block.zones.push(row);
      });
    }
    cost += block.sum;
    blocks.push(block);
  });
  const budgetValue = evalUtilityExpr(month.budget);
  const budget = isNumber(budgetValue) ? budgetValue : 0;
  const prevMonth = findPrevMonth(data, month.aptId, month.mk);
  const prevResult = prevMonth ? computeMonth(data, prevMonth, memo).result : 0;
  const carried = prevMonth && month.carry === true ? prevResult : 0;
  let adjustment = 0;
  const extras = listExtras(month).map(extra => {
    const value = evalUtilityExpr(extra.e);
    const signed = isNumber(value) ? (extra.kind === 'charge' ? -value : value) : 0;
    adjustment += signed;
    return { ...extra, value, signed };
  });
  const available = budget + carried;
  const result = {
    blocks,
    cost,
    budget,
    budgetSet: isNumber(budgetValue),
    prevMonth,
    prevResult,
    carried,
    adjustment,
    extras,
    available,
    result: available - cost + adjustment,
  };
  if (!month.virtual) memo.set(memoKey, result);
  return result;
};

export const listMissing = (month, computed) => {
  const missing = [];
  computed.blocks.forEach(block => {
    if (block.cat.type === CATEGORY_TYPES.SUM) {
      if (!isNumber(block.value)) missing.push(block.cat.name);
      return;
    }
    block.zones.forEach(row => {
      const name = block.cat.name + (block.zones.length > 1 ? ` ${row.zone.label.toLowerCase()}` : '');
      // «Було» з недописаною формулою (`10+`) лишає рядок без нарахування —
      // закрити такий місяць означало б мовчки пропустити лічильник.
      if (!isNumber(row.prev.value)) missing.push(`${name} — «було»`);
      if (!isNumber(row.cur)) missing.push(`${name} — показник`);
      else if (row.use < 0) missing.push(`${name} — менше, ніж було`);
      if (!isNumber(row.tariff)) missing.push(`${name} — тариф`);
    });
  });
  // Коригування з недописаною формулою (`250+`) не можна рахувати нулем:
  // місяць закрився б, а нарахування випало б з тексту для орендаря.
  computed.extras.forEach(extra => {
    if (!isNumber(extra.value)) missing.push(`коригування «${extra.label || 'без назви'}» — сума`);
  });
  if (!computed.budgetSet) missing.push('бюджет');
  if (computed.prevMonth && month.carry !== true && month.carry !== false) {
    missing.push(`переплата чи борг ${MONTHS_GEN[monthIndex(computed.prevMonth.mk)]}`);
  }
  return missing;
};

// «без змін» / «змінено · було …» — відносно минулого місяця цієї квартири.
export const fieldStatus = (data, month, path) => {
  const value = getPath(month, path);
  if (!hasValue(value)) return { kind: 'empty' };
  const parsed = evalUtilityExpr(value);
  if (!isNumber(parsed)) return { kind: 'invalid' };
  const prev = findPrevMonth(data, month.aptId, month.mk);
  const prevValue = prev ? getPath(prev, path) : undefined;
  if (hasValue(prevValue) && Math.abs(evalUtilityExpr(prevValue) - parsed) < 1e-9) return { kind: 'same', prev };
  return { kind: 'changed', prev, prevValue };
};

/**
 * Що запропонувати кнопкою «↻»: значення минулого місяця, а для тарифу ще й
 * інше значення, яке в цьому ж місяці вже стоїть в іншій квартирі (тариф
 * спільний — новий, вписаний в одній квартирі, решта бере тапом).
 */
export const listSuggestions = (data, month, field) => {
  const out = [];
  const prev = findPrevMonth(data, month.aptId, month.mk);
  const prevValue = prev ? getPath(prev, field.path) : undefined;
  if (hasValue(prevValue)) {
    out.push({ value: String(prevValue), label: `${formatExpr(prevValue)} — як у ${MONTHS_LOC[monthIndex(prev.mk)]}` });
  }
  if (field.tariff) {
    listApartments(data).forEach(apt => {
      if (apt.id === month.aptId) return;
      const other = data?.months?.[apt.id]?.[month.mk];
      const otherValue = other ? getPath(other, field.path) : undefined;
      if (!hasValue(otherValue) || !isNumber(evalUtilityExpr(otherValue))) return;
      if (out.some(item => evalUtilityExpr(item.value) === evalUtilityExpr(otherValue))) return;
      out.push({ value: String(otherValue), label: `${formatExpr(otherValue)} — як у ${apt.name || 'іншій квартирі'}`, other: true });
    });
  }
  return out;
};

export const paymentDateLabel = (apartment, mk) => {
  const day = Number(apartment?.payDay) || 19;
  return `${String(day).padStart(2, '0')}.${nextMonthKey(mk).slice(5, 7)}`;
};

// Текст для орендаря — той, що копіюється в Telegram.
export const buildTenantText = (apartment, month, computed) => {
  const lines = [`${apartment?.name || 'Квартира'} · ${monthName(month.mk)}${month.date ? ` (показники ${formatDm(month.date)})` : ''}`];
  computed.blocks.forEach(block => {
    if (block.cat.type === CATEGORY_TYPES.SUM) {
      lines.push(`${block.cat.name}: ${isNumber(block.value) ? `${formatMoney(block.value)} ₴` : '—'}`);
      return;
    }
    const parts = block.zones.map(row => {
      const prefix = block.zones.length > 1 ? `${row.zone.label.toLowerCase()} ` : '';
      if (!row.complete) return `${prefix}—`;
      return `${prefix}${formatNumber(row.prev.value)}→${formatNumber(row.cur)} = ${formatNumber(row.use)} ${block.cat.unit || ''} × ${formatNumber(row.tariff)} = ${formatMoney(row.sum)} ₴`;
    });
    lines.push(`${block.cat.name}: ${parts.join('; ')}`);
  });
  lines.push(`Разом комуналка: ${formatMoney(computed.cost)} ₴`);
  computed.extras.forEach(extra => lines.push(`${extra.label || 'Коригування'}: ${formatSigned(extra.signed)} ₴`));
  if (computed.carried) {
    const word = computed.carried >= 0 ? '+ переплата' : '− борг';
    lines.push(`Бюджет: ${formatMoney(computed.budget)} ₴ ${word} з ${MONTHS_GEN[monthIndex(computed.prevMonth.mk)]} ${formatMoney(Math.abs(computed.carried))} ₴ = ${formatMoney(computed.available)} ₴`);
  } else {
    lines.push(`Бюджет: ${formatMoney(computed.budget)} ₴`);
  }
  lines.push(computed.result >= 0 ? `Переплата: ${formatMoney(computed.result)} ₴` : `Борг: ${formatMoney(-computed.result)} ₴`);
  return lines.join('\n');
};
