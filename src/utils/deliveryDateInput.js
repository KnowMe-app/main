/**
 * Дата останніх пологів, набрана як завгодно, — і що в ній розпізнано.
 *
 * Поле лишається текстовим, але набране не форматується на кожному натисканні:
 * стара маска (`formatDate`) їла набрану крапку, і «1.5.2019» ставало
 * «15.20.19», «2019» — «20.19». Із трьох СМ 23.10 правильної дати не лишила
 * жодна. Тепер людина пише як звикла, розбір іде тут, а під полем видно, що
 * саме розпізнано й скільки від того минуло, — перевірка очима: «пологи 6 міс
 * тому — вірно?». Майбутня дата в межах вагітності — це очікувані пологи
 * («через 12 тиж.»), далі — описка в році.
 *
 * Точність буває трьох рівнів: день («12.05.2019»), місяць («05.2019»,
 * «травень 2019», «6 місяців тому») і рік («2019»). У базу йде рівно та
 * точність, яку людина дала: `2019-05-12`, `2019-05`, `2019` — день, якого
 * ніхто не казав, не вигадується.
 */

// Назви місяців мовами інтерфейсу: підказка під полем пропонує «Mai 2019»,
// «mei 2019», «mayo 2019», — і розбір мусить приймати те, що сам радить.
// Іспанське «ago» (серпень) стоїть лише повним «agos…»: голе «ago» — це
// англійське «тому».
const MONTH_STEMS = [
  [1, ['січ', 'янв', 'jan', 'ene']],
  [2, ['лют', 'фев', 'feb']],
  [3, ['берез', 'мар', 'mar', 'mär', 'maa']],
  [4, ['квіт', 'апр', 'apr', 'abr']],
  [5, ['трав', 'мая', 'май', 'may', 'mai', 'mei']],
  [6, ['черв', 'июн', 'jun']],
  [7, ['лип', 'июл', 'jul']],
  [8, ['серп', 'авг', 'aug', 'agos']],
  [9, ['верес', 'сен', 'sep']],
  [10, ['жовт', 'окт', 'oct', 'okt']],
  [11, ['листоп', 'нояб', 'nov']],
  [12, ['груд', 'дек', 'dec', 'dez', 'dic']],
];

/** Скільки років назад пологи ще правдоподібні. */
export const DELIVERY_MAX_YEARS_AGO = 45;
/** Скільки наперед — очікувані пологи (вагітність), а не описка в році. */
export const DELIVERY_MAX_DAYS_AHEAD = 300;

const pad2 = value => String(value).padStart(2, '0');

const monthFromWord = word => {
  const lower = word.toLowerCase();
  const found = MONTH_STEMS.find(([, stems]) => stems.some(stem => lower.startsWith(stem)));
  return found ? found[0] : 0;
};

const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

// Рік із двох цифр: «19» — 2019, «98» — 1998. Межа — наступний рік від
// сьогодні, бо пологи можуть бути й очікуваними.
const expandYear = (raw, now) => {
  const value = Number(raw);
  if (String(raw).length === 4) return value;
  const pivot = (now.getFullYear() + 1) % 100;
  return value <= pivot ? 2000 + value : 1900 + value;
};

const make = (y, m, d, precision) => {
  if (!y || y < 1900 || y > 2200) return null;
  if (precision !== 'year' && (m < 1 || m > 12)) return null;
  if (precision === 'day' && (d < 1 || d > daysInMonth(y, m))) return null;
  return { y, m: precision === 'year' ? 0 : m, d: precision === 'day' ? d : 0, precision };
};

const isYearLike = (raw, now) => /^\d{4}$/.test(raw) && Number(raw) >= 1900 && Number(raw) <= now.getFullYear() + 1;

// «6 місяців тому», «2 роки тому», «півроку тому», «через 10 тижнів».
const parseRelative = (text, now) => {
  const match = text.match(/^(?:через\s+)?(\d+|пів|пол|half)\s*-?\s*(р(?:ік|оки|оків|оку)|год|лет|year|years|міс|мес|month|months|тиж|нед|week|weeks)\S*(?:\s+(тому|назад|ago))?$/i);
  if (!match) return null;
  const [, amountRaw, unitRaw, agoWord] = match;
  const future = /^через/i.test(text);
  if (!future && !agoWord) return null;
  const amount = /^\d+$/.test(amountRaw) ? Number(amountRaw) : 0.5;
  const unit = unitRaw.toLowerCase();
  const sign = future ? 1 : -1;
  // Тижні називають день: «через 10 тижнів» — це конкретна дата, і місяцем
  // вона ставала б на тиждень-другий ближчою, а «через 1 тиждень» — поточним
  // місяцем, тобто «пологи 0 міс тому».
  if (/^(тиж|нед|week)/.test(unit)) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + sign * Math.round(amount * 7));
    return make(date.getFullYear(), date.getMonth() + 1, date.getDate(), 'day');
  }
  // Місяці й роки рахуються самими місяцями, без дня: `setMonth` від 31
  // жовтня мінус вісім місяців переповнював лютий і давав березень.
  const months = /^(р|год|лет|year)/.test(unit) ? Math.round(amount * 12) : Math.round(amount);
  const index = now.getFullYear() * 12 + now.getMonth() + sign * months;
  return make(Math.floor(index / 12), (index % 12) + 1, 0, 'month');
};

const parseWithMonthWord = (tokens, now) => {
  const monthIndex = tokens.findIndex(token => /\p{L}/u.test(token) && monthFromWord(token));
  if (monthIndex < 0) return null;
  const month = monthFromWord(tokens[monthIndex]);
  const before = tokens.slice(0, monthIndex).filter(token => /^\d+$/.test(token));
  const after = tokens.slice(monthIndex + 1).filter(token => /^\d+$/.test(token));
  // Рік — чотири цифри, де б вони не стояли: «May 12 2019» — це 12 травня
  // 2019, а не травень 2012. Без чотирьох цифр рік — останнє коротке число
  // після місяця («May 12 19», «травень 19»).
  const year4 = after.find(token => token.length === 4) || before.find(token => token.length === 4);
  const shortAfter = after.filter(token => token.length <= 2);
  const yearRaw = year4 || shortAfter[shortAfter.length - 1];
  if (!yearRaw) return { reason: 'noYear' };
  const year = expandYear(yearRaw, now);
  const dayRaw = before.find(token => token.length <= 2)
    || (year4 ? shortAfter[0] : shortAfter.length > 1 ? shortAfter[0] : undefined);
  if (dayRaw) return make(year, month, Number(dayRaw), 'day');
  return make(year, month, 0, 'month');
};

const parseDigitsOnly = (digits, now) => {
  if (digits.length === 8) {
    const dmy = make(Number(digits.slice(4)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)), 'day');
    if (dmy) return dmy;
    return make(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6)), 'day');
  }
  if (digits.length === 6) {
    const dmy = make(expandYear(digits.slice(4), now), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)), 'day');
    if (dmy) return dmy;
    if (isYearLike(digits.slice(2), now)) return make(Number(digits.slice(2)), Number(digits.slice(0, 2)), 0, 'month');
    return null;
  }
  if (digits.length === 4) {
    if (isYearLike(digits, now)) return make(Number(digits), 0, 0, 'year');
    return make(expandYear(digits.slice(2), now), Number(digits.slice(0, 2)), 0, 'month');
  }
  return null;
};

const parseParts = (parts, now) => {
  const numbers = parts.map(Number);
  if (parts.length === 3) {
    // Рік першим: «2019-05-12», «2019.5.12».
    if (parts[0].length === 4) return make(numbers[0], numbers[1], numbers[2], 'day');
    if (parts[2].length !== 4 && parts[2].length !== 2) return null;
    return make(expandYear(parts[2], now), numbers[1], numbers[0], 'day');
  }
  if (parts.length === 2) {
    if (parts[0].length === 4) return make(numbers[0], numbers[1], 0, 'month');
    if (parts[1].length === 4) return make(numbers[1], numbers[0], 0, 'month');
    // «05.19» — місяць і рік: 19-го місяця не буває. «12.05» і «15.05» —
    // день і місяць без року: так пишуть дату частіше, ніж «грудень 2005».
    if (parts[1].length === 2 && numbers[1] > 12 && numbers[0] >= 1 && numbers[0] <= 12) {
      return make(expandYear(parts[1], now), numbers[0], 0, 'month');
    }
    return { reason: 'noYear' };
  }
  return null;
};

/**
 * Розбір набраного: `{ y, m, d, precision }` або `{ reason }` — `'empty'`,
 * `'invalid'` (не дата), `'noYear'` (день і місяць без року).
 */
export const parseDeliveryDateInput = (raw, now = new Date()) => {
  const text = String(raw ?? '').trim().toLowerCase().replace(/[’'`]/g, '');
  if (!text) return { reason: 'empty' };

  const relative = parseRelative(text.replace(/\s+/g, ' '), now);
  if (relative) return relative;

  // «2019年5月12日», «2019年5月», «2019年» — японська й китайська.
  const cjk = text.replace(/\s+/g, '').match(/^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/u);
  if (cjk) {
    const [, y, m, d] = cjk;
    if (d) return make(Number(y), Number(m), Number(d), 'day') || { reason: 'invalid' };
    if (m) return make(Number(y), Number(m), 0, 'month') || { reason: 'invalid' };
    return isYearLike(y, now) ? make(Number(y), 0, 0, 'year') : { reason: 'invalid' };
  }

  const tokens = text.split(/[^\p{L}\d]+/u).filter(Boolean);
  if (tokens.some(token => /\p{L}/u.test(token))) {
    const meaningful = tokens.filter(token => !/^(р|рік|року|г|год|года|year)$/.test(token));
    const withWord = parseWithMonthWord(meaningful, now);
    if (withWord) return withWord;
    // «2019 рік», «2019 р.»
    const digitsOnly = meaningful.filter(token => /^\d+$/.test(token));
    if (digitsOnly.length === 1 && digitsOnly.length === meaningful.length && isYearLike(digitsOnly[0], now)) {
      return make(Number(digitsOnly[0]), 0, 0, 'year');
    }
    return { reason: 'invalid' };
  }

  const parsed = tokens.length === 1 ? parseDigitsOnly(tokens[0], now) : parseParts(tokens, now);
  if (parsed && parsed.reason) return parsed;
  return parsed || { reason: 'invalid' };
};

const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Перший день, який дата може означати: для місяця — перше число, для року — 1 липня. */
const anchorDate = parsed => new Date(
  parsed.y,
  parsed.precision === 'year' ? 6 : parsed.m - 1,
  parsed.precision === 'day' ? parsed.d : 1,
);

/**
 * Розбір плюс перевірка правдоподібності для пологів: `{ ok: true, ...,
 * future, weeksAhead }` або `{ ok: false, reason }` — до причин розбору
 * додаються `'tooFar'` (майбутнє далі за вагітність) і `'tooOld'`.
 */
export const readDeliveryDate = (raw, now = new Date()) => {
  const parsed = parseDeliveryDateInput(raw, now);
  if (parsed.reason) return { ok: false, reason: parsed.reason };
  const today = startOfDay(now);
  // Поточний місяць чи рік — не майбутнє, навіть якщо їхній «якір» попереду.
  const sameMonth = parsed.precision === 'month' && parsed.y === today.getFullYear() && parsed.m === today.getMonth() + 1;
  const sameYear = parsed.precision === 'year' && parsed.y === today.getFullYear();
  const date = sameMonth || sameYear ? today : anchorDate(parsed);
  const days = Math.round((date - today) / 86400000);
  if (days > DELIVERY_MAX_DAYS_AHEAD) return { ok: false, reason: 'tooFar' };
  if (today.getFullYear() - parsed.y > DELIVERY_MAX_YEARS_AGO) return { ok: false, reason: 'tooOld' };
  return { ok: true, ...parsed, future: days > 0, weeksAhead: days > 0 ? Math.max(1, Math.ceil(days / 7)) : 0 };
};

/** Як дату класти в базу: точність та, яку дала людина. */
export const toStoredDeliveryDate = parsed => {
  if (!parsed) return '';
  if (parsed.precision === 'day') return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
  if (parsed.precision === 'month') return `${parsed.y}-${pad2(parsed.m)}`;
  return String(parsed.y);
};

/** Як дату показувати в полі: `12.05.2019`, `05.2019`, `2019`. */
export const formatDeliveryDateForInput = parsed => {
  if (!parsed) return '';
  if (parsed.precision === 'day') return `${pad2(parsed.d)}.${pad2(parsed.m)}.${parsed.y}`;
  if (parsed.precision === 'month') return `${pad2(parsed.m)}.${parsed.y}`;
  return String(parsed.y);
};
