import { getExtraLocale } from './locales';
/**
 * Останні пологи — це «як давно», а не «коли саме».
 *
 * Точна дата пологів у видачі нічого не вирішує: питання, на яке дивиться
 * читач, — чи встигла жінка відновитись, тобто скільки місяців минуло. Дата ж
 * при цьому називає подію з життя конкретної людини, і стоїть вона у відкритій
 * усім картці — тож замість `19.07.24` картка каже `14 міс`.
 *
 * Межа переходу на роки — два роки. Далі місяці перестають щось означати
 * («31 міс» ніхто не перекладає в голові), і рахунок іде роками, донизу:
 * два роки й одинадцять місяців — це «2 роки», а не «3».
 *
 * Модуль окремий і чистий, бо читають його троє: рядок стрічки, плитка
 * розгорнутої анкети і тести. Дата парситься тим самим `parseProfileDate`,
 * яким її читає решта застосунку, — другий парсер розійшовся б із ним на
 * `дд.мм.рр`.
 */

import { parseProfileDate } from './profileDate';
import { parseDeliveryDateInput } from './deliveryDateInput';

const MONTHS_IN_YEAR = 12;

/** Після двох років місяці вже не читаються — далі рахунок іде роками. */
export const DELIVERY_RECENCY_YEARS_THRESHOLD_MONTHS = 24;

/**
 * Скільки повних місяців минуло від дати. `null` — дата нечитабельна.
 *
 * День місяця враховується: 31 січня → 1 березня це один місяць, а не два.
 * Майбутня дата (описка в анкеті) дає `null`, а не відʼємне число: «мінус три
 * місяці від пологів» — це не відповідь, а вигляд помилки.
 */
// Дата пологів буває й неповною — місяць («2019-05») чи рік («2019»): так
// її кладе поле «Останні пологи», коли людина дня не назвала
// (`deliveryDateInput`). Місяць рахується від першого числа, рік — від
// середини: 1 липня. Для поточного року середина — це середина вже минулої
// його частини: поки липень не настав, «2026» від 1 липня була б майбутнім, і
// картка мовчала про дату, яку поле щойно прийняло.
const readDateParts = (raw, now) => {
  const parsed = parseProfileDate(raw);
  if (parsed) return { year: Number(parsed.y), month: Number(parsed.mo), day: Number(parsed.d) };
  const value = String(raw ?? '').trim();
  if (!/^\d{4}(-\d{2})?$/.test(value)) return null;
  const partial = parseDeliveryDateInput(value, now);
  if (partial.reason) return null;
  if (partial.precision !== 'year') return { year: partial.y, month: partial.m, day: 1 };
  const month = partial.y === now.getFullYear() ? Math.min(7, Math.floor(now.getMonth() / 2) + 1) : 7;
  return { year: partial.y, month, day: 1 };
};

export const monthsSinceDate = (raw, now = new Date()) => {
  const parts = readDateParts(raw, now);
  if (!parts) return null;

  const { year, month, day } = parts;
  if (!year || !month || !day) return null;

  const months = (now.getFullYear() - year) * MONTHS_IN_YEAR + (now.getMonth() + 1 - month);
  const withDay = now.getDate() < day ? months - 1 : months;
  return withDay < 0 ? null : withDay;
};

const UK_YEAR_FORMS = ['рік', 'роки', 'років'];

// Українська форма числівника: 1 рік, 2 роки, 5 років — і 11–14 років, які
// виламуються з правила останньої цифри.
const ukYearWord = years => {
  const tens = years % 100;
  if (tens >= 11 && tens <= 14) return UK_YEAR_FORMS[2];
  const ones = years % 10;
  if (ones === 1) return UK_YEAR_FORMS[0];
  if (ones >= 2 && ones <= 4) return UK_YEAR_FORMS[1];
  return UK_YEAR_FORMS[2];
};

const isUk = language => String(language || '').toLowerCase().startsWith('uk');

/**
 * «14 міс», «2 роки», «<1 міс» — те, що стає на місце дати.
 *
 * Порожній рядок означає «сказати нема чого»: викликач тоді не малює комірку
 * взагалі, замість того щоб показати підпис без значення.
 */
export const formatDeliveryRecency = (raw, language, now = new Date()) => {
  const months = monthsSinceDate(raw, now);
  if (months === null) return '';

  const words = getExtraLocale(language)?.sentences.recency;
  if (months < 1) return isUk(language) ? '<1 міс' : words ? words.lessThanMonth : '<1 mo';

  if (months < DELIVERY_RECENCY_YEARS_THRESHOLD_MONTHS) {
    return isUk(language) ? `${months} міс` : words ? words.months(months) : `${months} mo`;
  }

  const years = Math.floor(months / MONTHS_IN_YEAR);
  if (words) return words.years(years);
  return isUk(language) ? `${years} ${ukYearWord(years)}` : `${years} ${years === 1 ? 'year' : 'years'}`;
};
