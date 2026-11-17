import {
  CATEGORY_TYPES,
  buildNewApartment,
  evalUtilityExpr,
  isMonthKey,
  isNumber,
  listApartments,
  listCategories,
  monthName,
  todayIso,
} from './utilitiesModel';

/*
 * Імпорт комуналки з JSON (17.11, на прохання власниці продукту).
 *
 * Форматів два:
 *
 * 1. Простий — його зручно скласти з таблиці вручну чи попросити згенерувати:
 *    { "apartments": [ { "name": "кв. 645", "payDay": 19,
 *        "init": { "date": "2026-05-01", "light": { "day": 1059, "night": 553 }, "water": 37 },
 *        "months": [ { "month": "2026-05", "date": "2026-05-22", "closed": true,
 *          "light": { "day": 1288, "night": 647, "tariffDay": 4.32, "tariffNight": 2.16 },
 *          "water": { "reading": 44, "tariff": 63.792 },
 *          "zhek": "1340-571.13", "inet": 250, "budget": 3500, "carry": false,
 *          "extras": [ { "label": "Різниця оплати", "amount": "24000-23730.87", "kind": "credit" } ] } ] } ] }
 *    Суми й тарифи можна писати числом або формулою, як у полі екрана.
 *
 * 2. Сирий — знімок `multiData/utilities/{uid}` (`apartments` і `months`
 *    обʼєктами), тобто резервна копія.
 *
 * Квартира впізнається за назвою: збіг — місяці лягають у наявну квартиру
 * (місяць, що вже є, замінюється цілком), інакше заводиться нова з
 * типовими блоками. Налаштувань наявної квартири імпорт не чіпає. Результат —
 * одна латка відносно кореня власника (`apartments/…`, `months/…/…`), тож
 * весь імпорт — один крок «Назад».
 */

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const normalizeName = name => String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Значення поля місяця — рядок, як його пише екран (формула лишається формулою).
const toExpr = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  const text = String(value).trim();
  return text || null;
};

const isValidExpr = value => value === null || isNumber(evalUtilityExpr(value));

const toNumberOrNull = value => {
  const parsed = evalUtilityExpr(value);
  return isNumber(parsed) ? parsed : null;
};

const isIsoDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const newId = (prefix, index) => `${prefix}${Date.now().toString(36)}${index.toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Простий місяць → форма, у якій екран тримає місяць у базі.
const buildMonthFromSimple = (raw, cats, warnings, label) => {
  const month = { vals: {} };
  if (isIsoDate(raw.date)) month.date = raw.date;
  else if (raw.date) warnings.push(`${label}: дата «${raw.date}» не у форматі РРРР-ММ-ДД — пропущено`);
  month.closed = raw.closed === true;
  if (month.closed) month.closedAt = Date.now();
  if (raw.carry === true || raw.carry === false) month.carry = raw.carry;
  const budget = toExpr(raw.budget);
  if (budget !== null) {
    if (isValidExpr(budget)) month.budget = budget;
    else warnings.push(`${label}: бюджет «${budget}» — не число`);
  }
  cats.forEach(cat => {
    const source = raw[cat.key];
    if (source === undefined || source === null) return;
    const vals = {};
    const put = (path, value, what) => {
      const expr = toExpr(value);
      if (expr === null) return;
      if (!isValidExpr(expr)) {
        warnings.push(`${label}: ${cat.name} — ${what} «${expr}» не число`);
        return;
      }
      const keys = path.split('.');
      let node = vals;
      keys.slice(0, -1).forEach(key => { node[key] = node[key] || {}; node = node[key]; });
      node[keys[keys.length - 1]] = expr;
    };
    if (cat.type === CATEGORY_TYPES.SUM) {
      put('e', isPlainObject(source) ? (source.amount ?? source.sum ?? source.e) : source, 'сума');
    } else if (cat.type === CATEGORY_TYPES.METER2) {
      if (!isPlainObject(source)) return;
      put('day.cur', source.day, 'показник день');
      put('night.cur', source.night, 'показник ніч');
      put('day.prev', source.dayPrev, '«було» день');
      put('night.prev', source.nightPrev, '«було» ніч');
      put('tDay', source.tariffDay, 'тариф день');
      put('tNight', source.tariffNight, 'тариф ніч');
    } else {
      if (isPlainObject(source)) {
        put('cur', source.reading ?? source.cur, 'показник');
        put('prev', source.prev, '«було»');
        put('t', source.tariff ?? source.t, 'тариф');
      } else {
        put('cur', source, 'показник');
      }
    }
    if (Object.keys(vals).length) month.vals[cat.key] = vals;
  });
  const known = new Set(['month', 'date', 'closed', 'carry', 'budget', 'extras', ...cats.map(cat => cat.key)]);
  Object.keys(raw).filter(key => !known.has(key)).forEach(key => {
    warnings.push(`${label}: поле «${key}» не відповідає жодному блоку квартири — пропущено`);
  });
  if (Array.isArray(raw.extras)) {
    const extras = {};
    raw.extras.forEach((extra, index) => {
      if (!isPlainObject(extra)) return;
      const amount = toExpr(extra.amount ?? extra.e);
      if (amount === null || !isValidExpr(amount)) {
        warnings.push(`${label}: коригування «${extra.label || index + 1}» — сума не число, пропущено`);
        return;
      }
      extras[`x${index + 1}`] = {
        label: String(extra.label || '').slice(0, 120),
        e: amount,
        kind: extra.kind === 'charge' ? 'charge' : 'credit',
        order: index + 1,
      };
    });
    if (Object.keys(extras).length) month.extras = extras;
  }
  if (!Object.keys(month.vals).length) delete month.vals;
  return month;
};

const buildInitFromSimple = (rawInit, cats) => {
  const init = { date: isIsoDate(rawInit?.date) ? rawInit.date : todayIso(), vals: {} };
  cats.forEach(cat => {
    const source = rawInit?.[cat.key];
    if (source === undefined || source === null) return;
    if (cat.type === CATEGORY_TYPES.METER2 && isPlainObject(source)) {
      const day = toNumberOrNull(source.day);
      const night = toNumberOrNull(source.night);
      init.vals[cat.key] = { day: { cur: day ?? 0 }, night: { cur: night ?? 0 } };
    } else if (cat.type === CATEGORY_TYPES.METER) {
      const value = toNumberOrNull(isPlainObject(source) ? (source.reading ?? source.cur) : source);
      init.vals[cat.key] = { cur: value ?? 0 };
    }
  });
  return init;
};

// Сирий знімок → той самий простий список квартир, але з готовими місяцями.
const fromRawSnapshot = snapshot => Object.entries(snapshot.apartments || {})
  .filter(([, apt]) => isPlainObject(apt) && apt.name)
  .map(([id, apt]) => ({ raw: true, id, apartment: apt, months: isPlainObject(snapshot.months?.[id]) ? snapshot.months[id] : {} }));

/**
 * Розбір файлу й план імпорту відносно поточних даних власника.
 * @returns {{ error?: string, patch: Object, summary: Array, warnings: string[] }}
 */
export const planUtilitiesImport = (text, currentData = {}, { now = Date.now() } = {}) => {
  let parsed;
  try {
    parsed = JSON.parse(String(text || '').replace(/^﻿/, ''));
  } catch (error) {
    return { error: 'Файл не схожий на JSON — перевірте дужки й коми', patch: {}, summary: [], warnings: [] };
  }
  if (!isPlainObject(parsed) || !parsed.apartments) {
    return { error: 'У файлі немає «apartments» — квартир для імпорту', patch: {}, summary: [], warnings: [] };
  }
  const warnings = [];
  const entries = Array.isArray(parsed.apartments)
    ? parsed.apartments.map(apt => ({ raw: false, apartment: apt }))
    : fromRawSnapshot(parsed);
  if (!entries.length) {
    return { error: 'У файлі немає жодної квартири з назвою', patch: {}, summary: [], warnings: [] };
  }

  const existing = listApartments(currentData);
  const byName = new Map(existing.map(apt => [normalizeName(apt.name), apt]));
  let order = existing.reduce((max, apt) => Math.max(max, Number(apt.order) || 0), 0);
  const patch = {};
  const summary = [];

  entries.forEach((entry, index) => {
    const source = entry.apartment;
    if (!isPlainObject(source) || !String(source.name || '').trim()) {
      warnings.push(`Квартира №${index + 1} без назви — пропущено`);
      return;
    }
    const name = String(source.name).trim().slice(0, 80);
    const match = byName.get(normalizeName(name));
    const aptId = match ? match.id : newId('a', index);
    let cats;
    if (match) {
      cats = listCategories(match);
    } else {
      order += 1;
      const fresh = buildNewApartment({ name, order, date: todayIso(new Date(now)) });
      if (entry.raw) {
        Object.assign(fresh, {
          payDay: Number(source.payDay) >= 1 && Number(source.payDay) <= 28 ? Number(source.payDay) : fresh.payDay,
          cats: isPlainObject(source.cats) ? source.cats : fresh.cats,
          init: isPlainObject(source.init) ? source.init : fresh.init,
        });
      } else {
        if (Number(source.payDay) >= 1 && Number(source.payDay) <= 28) fresh.payDay = Number(source.payDay);
        fresh.init = buildInitFromSimple(source.init, listCategories({ cats: fresh.cats }));
      }
      patch[`apartments/${aptId}`] = fresh;
      byName.set(normalizeName(name), { ...fresh, id: aptId });
      cats = listCategories({ cats: fresh.cats });
    }

    const months = {};
    if (entry.raw) {
      Object.entries(entry.months).forEach(([mk, month]) => {
        if (isMonthKey(mk) && isPlainObject(month)) months[mk] = month;
        else warnings.push(`${name}: місяць «${mk}» пропущено — ключ не РРРР-ММ`);
      });
    } else if (Array.isArray(source.months)) {
      source.months.forEach((rawMonth, monthIndex) => {
        if (!isPlainObject(rawMonth)) return;
        const mk = String(rawMonth.month || '').trim();
        if (!isMonthKey(mk)) {
          warnings.push(`${name}: місяць №${monthIndex + 1} без «month» у форматі РРРР-ММ — пропущено`);
          return;
        }
        months[mk] = buildMonthFromSimple(rawMonth, cats, warnings, `${name}, ${monthName(mk)}`);
      });
    }

    const replaced = [];
    Object.entries(months).forEach(([mk, month]) => {
      if (match && currentData?.months?.[aptId]?.[mk]) replaced.push(mk);
      patch[`months/${aptId}/${mk}`] = month;
    });
    summary.push({ aptId, name, isNew: !match, monthCount: Object.keys(months).length, replaced: replaced.sort() });
  });

  if (!Object.keys(patch).length) {
    return { error: 'Нічого імпортувати: жодної квартири чи місяця не розпізнано', patch: {}, summary, warnings };
  }
  return { patch, summary, warnings };
};

// Зразок простого формату — його показує екран і з нього легко почати.
export const UTILITIES_IMPORT_SAMPLE = JSON.stringify({
  apartments: [{
    name: 'кв. 645',
    payDay: 19,
    init: { date: '2026-05-01', light: { day: 1059, night: 553 }, water: 37 },
    months: [{
      month: '2026-05',
      date: '2026-05-22',
      closed: true,
      light: { day: 1288, night: 647, tariffDay: 4.32, tariffNight: 2.16 },
      water: { reading: 44, tariff: 63.792 },
      zhek: '1340-571.13',
      inet: 250,
      budget: 3500,
      carry: false,
      extras: [{ label: 'Різниця оплати', amount: '24000-23730.87', kind: 'credit' }],
    }],
  }],
}, null, 2);
