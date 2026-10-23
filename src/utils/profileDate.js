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
