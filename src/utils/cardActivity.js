import { getLanguageLocale } from './locales';
import { uiText } from './uiTranslations';

/**
 * Давність останньої дії по картці — для адміна в шапці рядка стрічки.
 *
 * «Дія» тут — останній вхід власниці (`profileTechnical/lastLogin`), а коли
 * входу немає (анкета заведена без акаунта входу або вхід ще не писався) —
 * дата реєстрації. Адмінові це відповідає на питання «наскільки ця картка
 * жива»: донорка, що заходила вчора, і анкета, якої не відкривали два роки, у
 * стрічці виглядали однаково.
 *
 * Формати різні навмисно не зведені: `lastLogin` у вузлі — ISO
 * (`TWIN_FIELD_SOURCES`), а `registrationDate` реєстрація пише крапками
 * (`buildAuthProfilePayload`, `todayDays`). Старі записи бувають і так, і так.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const DOTTED_DATE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/;

const pad = value => String(value).padStart(2, '0');

export const parseActivityDate = value => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  let year;
  let month;
  let day;
  const iso = text.match(ISO_DATE);
  const dotted = iso ? null : text.match(DOTTED_DATE);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (dotted) [, day, month, year] = dotted.map(Number);
  else return '';
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000) return '';
  return `${year}-${pad(month)}-${pad(day)}`;
};

/**
 * `{ date, kind }` з вузла `profileTechnical/{id}` або `null`. `createdAt` —
 * запасна дата реєстрації для анкет, заведених до `registrationDate`.
 */
export const pickCardActivity = technical => {
  if (!technical || typeof technical !== 'object') return null;
  const login = parseActivityDate(technical.lastLogin);
  if (login) return { date: login, kind: 'login' };
  const registration = parseActivityDate(technical.registrationDate) || parseActivityDate(technical.createdAt);
  return registration ? { date: registration, kind: 'registration' } : null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toLocalDayStart = isoDate => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).getTime();
};

const relativeFormats = new Map();
const getRelativeFormat = language => {
  const locale = getLanguageLocale(language);
  if (!relativeFormats.has(locale)) {
    relativeFormats.set(locale, new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' }));
  }
  return relativeFormats.get(locale);
};

/**
 * «сьогодні», «3 дн. тому», «2 міс. тому», «1 р. тому» — мовою інтерфейсу.
 * Кількість і слово дає `Intl.RelativeTimeFormat`, тож словник під числа
 * не потрібен у жодній із семи мов.
 */
export const formatActivityAgo = (isoDate, language, { now = Date.now() } = {}) => {
  if (!isoDate) return '';
  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const days = Math.max(0, Math.round((todayStart - toLocalDayStart(isoDate)) / DAY_MS));
  const format = getRelativeFormat(language);
  if (days < 31) return format.format(-days, 'day');
  if (days < 365) return format.format(-Math.floor(days / 30.44), 'month');
  return format.format(-Math.floor(days / 365.25), 'year');
};

/** Скільки днів тому — для тону підпису (давнє блідне). */
export const activityAgeDays = (isoDate, { now = Date.now() } = {}) => {
  if (!isoDate) return null;
  const today = new Date(now);
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.round((todayStart - toLocalDayStart(isoDate)) / DAY_MS));
};

const formatDotted = isoDate => {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
};

/** Підпис і підказка для рядка: `{ label, title }` або `null`. */
export const describeCardActivity = (activity, language, options = {}) => {
  if (!activity?.date) return null;
  const when = formatActivityAgo(activity.date, language, options);
  const date = formatDotted(activity.date);
  if (activity.kind === 'login') {
    return {
      label: uiText('Вхід {when}', language, { when }),
      title: uiText('Останній вхід: {date}', language, { date }),
    };
  }
  return {
    label: uiText('Реєстрація {when}', language, { when }),
    title: uiText('Входів не було, реєстрація: {date}', language, { date }),
  };
};
