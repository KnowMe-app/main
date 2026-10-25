/**
 * Дати анкети — один формат на весь застосунок.
 *
 * Джерела пишуть їх по-різному: ISO з новіших записів, `дд.мм.рррр` і
 * `дд.мм.рр` з крапками або скісними. Показуємо завжди `дд.мм.рр`.
 *
 * Модуль окремий, бо читають його і рядок стрічки, і розкладка анкети, а вона
 * рядок сама ж і живить — тримати парсер у рядку означало б коло в імпортах.
 */

/**
 * Поля анкети, у яких лежить дата і тільки дата.
 *
 * Показуються вони людині крапками (`дд.мм.рррр`) у **кожному** полі
 * введення — і в анкеті адміна, і у формі чернетки та доповнення на
 * матчингу, — а в базу їдуть у `РРРР-ММ-ДД`. Перелік один на всі форми:
 * поки він жив у самій `ProfileForm`, форма чернетки його не знала й
 * показувала дату народження так, як та лежить, — задом наперед.
 */
export const PROFILE_DATE_FIELDS = new Set([
  'birth',
  'birthWife',
  'birthHusband',
  'lastDelivery',
  'opuDate',
  'getInTouch',
]);

const pad2 = value => String(value).padStart(2, '0');

export const resolveBirthDateFromAgeInput = (rawValue, currentDate = new Date()) => {
  const ageMatch = String(rawValue ?? '').trim().match(/\d+/);
  if (!ageMatch) return '';

  const age = Number.parseInt(ageMatch[0], 10);
  if (!Number.isFinite(age) || age < 15 || age > 90) return '';

  const currentYear =
    currentDate instanceof Date && !Number.isNaN(currentDate.getTime())
      ? currentDate.getFullYear()
      : new Date().getFullYear();

  return `01.01.${currentYear - age}`;
};

// «30р» у полі дати народження — це вік, а не недонабрана дата: так адмін
// записує людину, про яку відомо лише, скільки їй років. На blur він стає
// `01.01.<рік>` — тим самим принципом, що й поле `age`, і так само, як
// `getInTouch` розуміє «6м» чи «1р». Перше січня тут і є позначка «точної дати
// немає, лише вік». Голе число теж вік: двоцифрова «дата» датою не буває.
const BIRTH_AGE_SHORTHAND_PATTERN = /^(\d{1,2})\s*(?:р|рік|роки|років|y|yo|years?)?\.?$/i;

export const resolveBirthDateFromAgeShorthand = (rawValue, currentDate = new Date()) => {
  const match = String(rawValue ?? '').trim().match(BIRTH_AGE_SHORTHAND_PATTERN);
  if (!match) return '';
  return resolveBirthDateFromAgeInput(match[1], currentDate);
};

// «14т», «5м», «2р» у технічному інпуті — давність останніх пологів:
// стільки тижнів, місяців чи років тому. Записується дата, яка з цього
// виходить, — так само, як `getInTouch` перекладає «6м» у дату наперед.
// Роки — лише до 14: «15р» і більше читається як вік (дата народження,
// `resolveBirthDateFromAgeShorthand`), і стоїть та перевірка раніше.
const DELIVERY_AGO_PATTERN = /^(\d{1,3})\s*(т|тиж|t|w|м|міс|m|р|рік|роки|років|y)\.?$/i;
const DELIVERY_AGO_LIMITS = { week: 520, month: 240, year: 14 };

const resolveDeliveryAgoUnit = rawUnit => {
  const unit = rawUnit.toLowerCase();
  if (['т', 'тиж', 't', 'w'].includes(unit)) return 'week';
  if (['м', 'міс', 'm'].includes(unit)) return 'month';
  return 'year';
};

export const resolveLastDeliveryFromShorthand = (rawValue, currentDate = new Date()) => {
  const match = String(rawValue ?? '').trim().match(DELIVERY_AGO_PATTERN);
  if (!match) return '';

  const amount = Number.parseInt(match[1], 10);
  const unit = resolveDeliveryAgoUnit(match[2]);
  if (!amount || amount > DELIVERY_AGO_LIMITS[unit]) return '';

  const base =
    currentDate instanceof Date && !Number.isNaN(currentDate.getTime()) ? currentDate : new Date();
  let date;
  if (unit === 'week') {
    date = new Date(base.getFullYear(), base.getMonth(), base.getDate() - amount * 7);
  } else {
    // Місяцями, без переповнення: 31 травня мінус три місяці — це кінець
    // лютого, а не 3 березня.
    const months = unit === 'month' ? amount : amount * 12;
    const target = new Date(base.getFullYear(), base.getMonth() - months, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    date = new Date(target.getFullYear(), target.getMonth(), Math.min(base.getDate(), lastDay));
  }

  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
};

export const parseProfileDate = raw => {
  const value = String(raw || '').trim();
  if (!value) return null;
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return { d: match[3], mo: match[2], y: match[1] };
  match = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (match) return { d: pad2(match[1]), mo: pad2(match[2]), y: match[3] };
  match = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (match) return { d: pad2(match[1]), mo: pad2(match[2]), y: `20${match[3]}` };
  return null;
};

export const formatProfileDate = raw => {
  const parsed = parseProfileDate(raw);
  return parsed ? `${parsed.d}.${parsed.mo}.${parsed.y.slice(2)}` : '';
};

/** Чи існує така дата в календарі: «15.20.19» розбирається, але 20-го місяця немає. */
export const isRealProfileDate = parsed => {
  if (!parsed) return false;
  const day = Number(parsed.d);
  const month = Number(parsed.mo);
  const year = Number(parsed.y);
  if (!year || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(year, month, 0).getDate();
};

/**
 * Що не так із датою минулої події (останні пологи, перший день циклу), яка
 * вже лежить в анкеті: `''` — усе гаразд або поле порожнє, `'invalid'` — це
 * не дата, `'future'` — дата, що ще не настала.
 *
 * Такі значення в базі є, і всі — від поля, яке їх пропустило: маска
 * перетворювала «1.5.2019» на «15.20.19», а «2019» — на «20.19», і майбутній
 * рік ішов у базу без жодного слова. Картка їх мовчки не показує
 * (`deliveryRecency`), тож людина вважає поле заповненим, а читач бачить
 * порожнє місце. Ця перевірка дає формі сказати про це людині.
 */
export const readPastDateIssue = (raw, now = new Date()) => {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const parsed = parseProfileDate(value);
  if (!isRealProfileDate(parsed)) return 'invalid';
  const date = new Date(Number(parsed.y), Number(parsed.mo) - 1, Number(parsed.d));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date > today ? 'future' : '';
};

/**
 * Значення, яке може бути і кількістю, і датою.
 *
 * Так живе поле кесаревого: у частині анкет там число, у частині — дата
 * операції. Дата друкувалась сирою, в ISO, за два рядки від «останні
 * 11.03.26» — один екран, одна дата, два формати. Число лишається числом,
 * дата зводиться до того самого `дд.мм.рр`, решта не чіпається.
 */
export const formatProfileCountOrDate = raw => {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  return formatProfileDate(value) || value;
};
