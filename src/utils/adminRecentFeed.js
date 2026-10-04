import { normalizeFeedDateValue } from './profileFieldDerive';

/**
 * Стрічка адміна — за свіжістю картки, а не за `feedDate`.
 *
 * Звичайна стрічка бере з `matchingCards` лише картки з `feedDate`, тобто
 * опубліковані: у базі їх кілька сотень на понад двадцять тисяч карток. Для
 * читача це і є стрічка. Адмінові ж треба бачити, хто щойно зареєструвався чи
 * зайшов, — а нові анкети `feedDate` здебільшого ще не мають і до його стрічки
 * не доходили взагалі. Тож порядок адміна — найсвіжіша з трьох дат картки:
 * останній вхід і створення (`profileTechnical`, обидві проіндексовані) і дата
 * публікації (`matchingCards/feedDate`). Третя потрібна, щоб опублікована
 * картка без технічних дат не зникла з адмінської стрічки.
 *
 * Злити три впорядковані індекси в один порядок без читання всіх карток можна
 * так само, як це робить пейджер стрічки: кожен індекс читається вікном від
 * курсора вниз, а з обʼєднання береться лише те, що свіжіше за найнижчу дату
 * повного вікна, — нижче неї котрийсь індекс міг ще чогось не віддати.
 */

export const ADMIN_RECENT_DATE_FIELDS = Object.freeze(['lastLogin', 'createdAt', 'feedDate']);

/** Дата як `РРРР-ММ-ДД` — з ISO-дати, ISO з часом, `ДД.ММ.РРРР` чи мітки часу. */
export const toRecentDate = value => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
  }
  const text = String(value ?? '').trim();
  if (!text) return '';
  return normalizeFeedDateValue(text.slice(0, 10)) || normalizeFeedDateValue(text);
};

/** Найсвіжіша з дат картки, яку знає запис. */
export const resolveRecentDate = record => ADMIN_RECENT_DATE_FIELDS
  .map(field => toRecentDate(record?.[field]))
  .filter(Boolean)
  .sort()
  .pop() || '';

const isAfterCursor = (candidate, cursor) => {
  if (!cursor?.date) return true;
  if (candidate.date !== cursor.date) return candidate.date < cursor.date;
  return Boolean(cursor.userId) && candidate.userId < cursor.userId;
};

const byRecentDesc = (a, b) => b.date.localeCompare(a.date) || b.userId.localeCompare(a.userId);

/**
 * Сторінка з обʼєднаних вікон.
 *
 * `records` — `{ id: { lastLogin, createdAt, feedDate } }` з усіх вікон разом.
 * `streams` — по запису на індекс: `dates` (дати, які віддало вікно) і `full`
 * (вікно віддало стільки, скільки просили, тобто нижче може бути ще).
 *
 * Нижче найнижчої дати повного вікна порядок не доведений: картка з такою
 * датою могла лишитись за межею того вікна. Тож береться лише свіжіше за неї,
 * а рівне їй — тільки коли вікно вже на стелі (`atCap`) і розширити нема куди.
 * Замало доведеного — `needsWiderWindow`: вікна треба розширити.
 */
export const pickRecentPage = ({ records = {}, streams = [], cursor = null, limit = 10, atCap = false }) => {
  const threshold = streams.reduce((highest, stream) => {
    if (!stream?.full) return highest;
    const lowest = (stream.dates || []).map(toRecentDate).filter(Boolean).sort()[0] || '';
    return lowest > highest ? lowest : highest;
  }, '');

  const candidates = Object.entries(records)
    .map(([userId, record]) => ({ userId, date: resolveRecentDate(record) }))
    .filter(candidate => candidate.date && isAfterCursor(candidate, cursor));

  const proven = candidates
    .filter(candidate => !threshold || candidate.date > threshold || (atCap && candidate.date === threshold))
    .sort(byRecentDesc);

  const anyFull = streams.some(stream => stream?.full);
  return {
    page: proven.slice(0, limit),
    hasMore: proven.length > limit || anyFull,
    needsWiderWindow: proven.length < limit && anyFull && !atCap,
  };
};
