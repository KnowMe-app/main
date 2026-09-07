/**
 * Дати анкети — один формат на весь застосунок.
 *
 * Джерела пишуть їх по-різному: ISO з новіших записів, `дд.мм.рррр` і
 * `дд.мм.рр` з крапками або скісними. Показуємо завжди `дд.мм.рр`.
 *
 * Модуль окремий, бо читають його і рядок стрічки, і розкладка анкети, а вона
 * рядок сама ж і живить — тримати парсер у рядку означало б коло в імпортах.
 */

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
