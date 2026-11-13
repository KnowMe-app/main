/**
 * Перелік опублікованих карток (`matchingFeedIndex`, веде тригер функцій —
 * `functions/feedIndex.js`): `id → { date, roles }` для кожної картки з датою в
 * стрічці, близько 15 КБ на всю базу.
 *
 * Він відповідає на два питання без читання жодної картки:
 * - пошук: які зі знайдених id опубліковані — їх показують першими й
 *   читають порцією, решту — потім і теж порціями (`splitSearchHitsByFeed`);
 * - стрічка через індекс фільтра (умовчання донорки — самі агенції): хто з
 *   кандидатів у стрічці й у якому порядку за датою
 *   (`orderCandidatesByFeed`), а роль — з самого переліку, без бакета
 *   `searchKey`.
 *
 * Свіжість — за загальним правилом кеша матчингу: памʼять вкладки й пристрою
 * (шість годин), а журнал змін карток забуває перелік, щойно про якусь
 * картку каже, що її змінено (`forgetPublishedFeedIndex` у синхронізації
 * журналу): публікація чи приховування — це запис картки, і журнал його бачить.
 * Перелік без позначки повного заповнення (`_built`) не вживається зовсім:
 * тригер пише лише картки, змінені після розгортання, і неповний перелік
 * мовчки ховав би решту стрічки. Збій читання — `null`, і кожен читач
 * повертається на шлях, яким ішов доти.
 */
export const PUBLISHED_FEED_INDEX_STORAGE_KEY = 'km.matchingFeedIndex.v1';
export const PUBLISHED_FEED_INDEX_TTL_MS = 6 * 60 * 60 * 1000;
const BUILT_KEY = '_built';

let readRemote = null;
let memo = null;
let inFlight = null;

export const configurePublishedFeedIndex = ({ read } = {}) => {
  readRemote = typeof read === 'function' ? read : null;
};

const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** Сирий вузол → перелік, або `null`, коли він неповний чи битий. */
export const parsePublishedFeedIndex = raw => {
  if (!raw || typeof raw !== 'object' || !raw[BUILT_KEY]) return null;
  const entries = new Map();
  Object.entries(raw).forEach(([id, value]) => {
    if (!id || id.startsWith('_') || !value || !isDate(value.d)) return;
    const roles = String(value.r || '').split(',').map(role => role.trim()).filter(Boolean);
    entries.set(id, { date: value.d, roles });
  });
  return { entries, builtAt: Number(raw[BUILT_KEY]) || 0 };
};

const signatureOf = entries => {
  // Короткий відбиток: кеш списків стрічки (`matchingIndexQueries`) звіряє
  // з ним, чи список зібрано з того самого переліку.
  let hash = 0;
  [...entries.keys()].sort().forEach(id => {
    const { date, roles } = entries.get(id);
    const text = `${id}:${date}:${roles.join(',')};`;
    for (let i = 0; i < text.length; i += 1) hash = ((hash * 31) + text.charCodeAt(i)) | 0;
  });
  return `${entries.size}:${(hash >>> 0).toString(36)}`;
};

const withSignature = parsed => (parsed ? { ...parsed, signature: signatureOf(parsed.entries) } : null);

const readStored = (now = Date.now()) => {
  try {
    const stored = JSON.parse(localStorage.getItem(PUBLISHED_FEED_INDEX_STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object' || now - Number(stored.at) > PUBLISHED_FEED_INDEX_TTL_MS) return null;
    return withSignature(parsePublishedFeedIndex(stored.raw));
  } catch {
    return null;
  }
};

const writeStored = (raw, now = Date.now()) => {
  try {
    localStorage.setItem(PUBLISHED_FEED_INDEX_STORAGE_KEY, JSON.stringify({ at: now, raw }));
  } catch {
    // Немає місця — лишається памʼять вкладки.
  }
};

/** Перелік або `null` (немає, неповний, збій чи без мережі). */
export const readPublishedFeedIndex = async () => {
  if (memo) return memo;
  const stored = readStored();
  if (stored) {
    memo = stored;
    return memo;
  }
  if (!readRemote) return null;
  if (!inFlight) {
    inFlight = (async () => {
      try {
        const raw = await readRemote();
        const parsed = withSignature(parsePublishedFeedIndex(raw));
        if (parsed) {
          writeStored(raw);
          memo = parsed;
        }
        return parsed;
      } catch (error) {
        console.warn('[feedIndex] перелік опублікованих не прочитано', error?.code || error);
        return null;
      } finally {
        inFlight = null;
      }
    })();
  }
  return inFlight;
};

/** Журнал змін каже, що якусь картку змінено, або вихід з акаунта. */
export const forgetPublishedFeedIndex = () => {
  memo = null;
  try {
    localStorage.removeItem(PUBLISHED_FEED_INDEX_STORAGE_KEY);
  } catch {
    // нічого
  }
};

const ROLE_BUCKETS = new Set(['ed', 'sm', 'ag', 'ip', 'pp', 'cl']);

/** Бакети ролі картки так, як їх кладе індекс `searchKey/users/role`. */
export const roleBucketsOf = roles => {
  const list = (roles || []).map(role => String(role || '').toLowerCase()).filter(Boolean);
  if (!list.length) return ['no'];
  return [...new Set(list.map(role => (ROLE_BUCKETS.has(role) ? role : '?')))];
};

/** Новіші першими, у межах дня — id за спаданням (як `fetchMatchingCardsPage`). */
export const compareByFeedDate = (index, a, b) => {
  const da = index.entries.get(a)?.date || '';
  const db = index.entries.get(b)?.date || '';
  return db.localeCompare(da) || String(b).localeCompare(String(a));
};

/**
 * Розділити знайдені id: опубліковані (новіші першими) і решта (у порядку
 * індексу). Решта несе й сховані — їх відсіє перевірка стану на показі.
 */
export const splitSearchHitsByFeed = (index, ids) => {
  const published = [];
  const others = [];
  (ids || []).forEach(id => {
    if (index?.entries?.has(id)) published.push(id);
    else others.push(id);
  });
  published.sort((a, b) => compareByFeedDate(index, a, b));
  return { published, others };
};

export const __resetPublishedFeedIndexForTests = () => {
  memo = null;
  inFlight = null;
  readRemote = null;
};
