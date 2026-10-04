import { normalizeFeedDateValue } from './profileFieldDerive';

/**
 * Стрічка адміна — за свіжістю картки, а не за `feedDate`.
 *
 * Звичайна стрічка бере з `matchingCards` лише картки з `feedDate`, тобто
 * опубліковані: у базі їх кілька сотень на понад двадцять тисяч карток. Для
 * читача це і є стрічка. Адмінові ж треба бачити, хто щойно зареєструвався чи
 * зайшов, — а нові анкети `feedDate` здебільшого ще не мають і до його стрічки
 * не доходили взагалі.
 *
 * Порядок адміна — найсвіжіша з дат картки: вхід, реєстрація/створення,
 * публікація. Вона
 * лежить окремим індексом `adminRecent/{id}` = `РРРР-ММ-ДД`, і пише його той
 * самий писач, що перебудовує картку (`syncAdminRecentIndex`). Перша версія
 * зливала три індекси на клієнті поверх сирих дат — і ламалась саме на тому,
 * що база сортує сирі значення: мітки часу випадали з `startAt('')`, дати
 * крапками стояли за днем, а не за календарем, понад вікно однакових дат
 * гортання впиралось у стелю. Нормалізоване значення й один запит
 * `orderByValue` з межею (дата, id) знімають усе це разом: порядок і розрив
 * нічиїх робить база. Взяти два поля без цього матеріалізованого індексу не
 * можна: Realtime Database упорядковує один запит лише за одним ключем і не
 * вміє обчислювати максимум `lastLogin` та `registrationDate`.
 */

export const ADMIN_RECENT_ROOT = 'adminRecent';
export const ADMIN_RECENT_META_PATH = 'adminRecentMeta/backfilledAt';

// `registrationDate` — канонічний запасний час реєстрації у
// `profileTechnical`. Legacy-поля створення лишаються для ще не перенесених
// записів, а `feedDate` — бо публікація може бути новішою і за реєстрацію, і за
// останній збережений вхід.
const RECENT_DATE_FIELDS = [
  'lastLogin2',
  'lastLogin',
  'registrationDate',
  'createdAt2',
  'createdAt',
  'feedDate',
];

/** Дата як `РРРР-ММ-ДД` — з ISO-дати, ISO з часом, `ДД.ММ.РРРР` чи мітки часу. */
export const toRecentDate = value => {
  if (Array.isArray(value)) return value.map(toRecentDate).filter(Boolean).sort().pop() || '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  return normalizeFeedDateValue(text.slice(0, 10)) || normalizeFeedDateValue(text);
};

/**
 * Найсвіжіша з дат картки. Дата з майбутнього не береться: помилка введення чи
 * годинник пристрою поставили б таку картку над усіма назавжди.
 */
export const resolveRecentDate = (record, today = '') => RECENT_DATE_FIELDS
  .map(field => toRecentDate(record?.[field]))
  .filter(date => date && (!today || date <= today))
  .sort()
  .pop() || '';
