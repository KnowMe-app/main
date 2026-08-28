// Сховище історії пошуку — multiData/searchQueries/{ownerId}/{queryKey}.
//
// Раніше кожен виконаний пошук ішов у `push()`, тож база наповнювалась рядами
// на кшталт "Arma", "Arman", "Armand", "Armando" — по одному запису на кожну
// паузу в наборі тексту, з випадковим ключем і без жодної позначки часу в
// значенні. Тепер ключ рахується з самого тексту запиту: другий рядок для того
// самого запиту стає структурно неможливим, а значення тримає і текст, і час,
// і скільки разів цей запит повторювали.
//
//   multiData/searchQueries/{ownerId}/{queryKey} = {
//     query: string, createdAt: number, updatedAt: number, count: number
//   }

export const SEARCH_QUERY_MAX_LENGTH = 500;
// Один символ — це не пошук, а залишок від стертого тексту.
export const SEARCH_QUERY_MIN_LENGTH = 2;
// Ключ RTDB обмежений 768 байтами; довший текст лишається у значенні, а ключ
// обрізається і добирає хвіст-хеш, щоб два різні довгі запити не злились.
const MAX_KEY_BYTES = 700;
const TRUNCATED_KEY_BYTES = 640;

// Символи, які RTDB у ключі не приймає (плюс `%`, інакше екранування не було б
// однозначним, і керівні символи).
// eslint-disable-next-line no-control-regex
const ILLEGAL_KEY_CHARS = /[.#$/[\]%\u0000-\u001F\u007F]/g;

const utf8Length = value => (typeof TextEncoder === 'function'
  ? new TextEncoder().encode(value).length
  : Buffer.byteLength(value, 'utf8'));

const escapeKeyChar = char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`;

// FNV-1a: короткий детермінований хвіст для обрізаних ключів. Це не захист і не
// підпис — лише спосіб не склеїти два довгі запити зі спільним початком.
const shortHash = value => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

const cutToBytes = (value, maxBytes) => {
  let result = value;
  while (result.length > 0 && utf8Length(result) > maxBytes) {
    result = result.slice(0, -1);
  }
  return result;
};

export const normalizeSearchQuery = value =>
  String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX_LENGTH);

// `!запит` — це синтаксис пошуку по локальному кешу, а не запит про людину;
// локальна історія його теж не запамʼятовує.
export const shouldStoreSearchQuery = value => {
  const normalized = normalizeSearchQuery(value);
  return normalized.length >= SEARCH_QUERY_MIN_LENGTH && !normalized.startsWith('!');
};

// Ключ рахується з тексту в нижньому регістрі, тож "Armando" і "armando" — це
// один рядок, а не два.
export const encodeSearchQueryKey = query => {
  const normalized = normalizeSearchQuery(query).toLowerCase();
  if (!normalized) return '';

  const escaped = normalized.replace(ILLEGAL_KEY_CHARS, escapeKeyChar);
  if (utf8Length(escaped) <= MAX_KEY_BYTES) return escaped;
  return `${cutToBytes(escaped, TRUNCATED_KEY_BYTES)}~${shortHash(normalized)}`;
};

export const decodeSearchQueryKey = key =>
  String(key ?? '').replace(/%([0-9A-Fa-f]{2})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';

// Перші вісім символів push-ключа — це час створення в мілісекундах. Для
// міграції це єдине джерело часу, яке лишилось у старих рядах.
export const decodePushKeyTimestamp = key => {
  const text = String(key ?? '');
  if (!text.startsWith('-') || text.length < 9) return null;
  let timestamp = 0;
  for (let index = 1; index <= 8; index += 1) {
    const digit = PUSH_CHARS.indexOf(text[index]);
    if (digit < 0) return null;
    timestamp = timestamp * 64 + digit;
  }
  return timestamp;
};

// Ланцюг набору тексту: "Arma" → "Arman" → "Armando" за кілька секунд — це один
// пошук, а не три. Довший запит поглинає свій щойно збережений початок.
export const SEARCH_QUERY_TYPING_WINDOW_MS = 15000;

export const isTypingContinuation = (previousQuery, nextQuery, gapMs) => {
  const previous = normalizeSearchQuery(previousQuery).toLowerCase();
  const next = normalizeSearchQuery(nextQuery).toLowerCase();
  if (!previous || !next || previous === next) return false;
  if (!Number.isFinite(gapMs) || gapMs < 0 || gapMs > SEARCH_QUERY_TYPING_WINDOW_MS) return false;
  return next.startsWith(previous) || previous.startsWith(next);
};

export const SEARCH_QUERIES_ROOT_PATH = 'multiData/searchQueries';

const readEntryText = value => (typeof value === 'string' ? value : (value?.query ?? ''));

// Уже перенесений ряд несе власний `createdAt` — міграція його не переписує.
const readEntryCreatedAt = value => {
  const createdAt = Number(value?.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
  return null;
};

const readEntryTime = (key, value) => {
  if (value && typeof value === 'object') {
    const updatedAt = Number(value.updatedAt);
    if (Number.isFinite(updatedAt) && updatedAt > 0) return updatedAt;
    const createdAt = Number(value.createdAt);
    if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;
  }
  return decodePushKeyTimestamp(key) ?? 0;
};

// Чистий крок планування для scripts/migrateSearchQueries.js: старі push-ряди
// зводяться до одного ряду на запит із ключем від тексту, ланцюги набору
// схлопуються, а все, що лишилось від старої форми, йде в патч як null.
export const buildSearchQueryMigrationPlan = (allSearchQueries = {}) => {
  const updates = {};
  const report = [];

  Object.entries(allSearchQueries || {}).forEach(([ownerId, entries]) => {
    const rows = Object.entries(entries || {})
      .map(([key, value]) => ({
        key,
        text: normalizeSearchQuery(readEntryText(value)),
        at: readEntryTime(key, value),
        createdAt: readEntryCreatedAt(value),
        count: Number(value?.count) > 0 ? Number(value.count) : 1,
      }))
      .filter(row => row.text)
      .sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));

    const kept = [];
    rows.forEach(row => {
      const previous = kept[kept.length - 1];
      if (previous && isTypingContinuation(previous.text, row.text, row.at - previous.at)) {
        // Початок ланцюга зникає, але його час лишається часом першого пошуку.
        kept[kept.length - 1] = { ...row, firstAt: previous.firstAt };
        return;
      }
      kept.push({ ...row, firstAt: row.createdAt ?? row.at });
    });

    const byKey = new Map();
    kept.forEach(row => {
      const queryKey = encodeSearchQueryKey(row.text);
      if (!queryKey) return;
      const existing = byKey.get(queryKey);
      if (!existing) {
        byKey.set(queryKey, {
          query: row.text,
          createdAt: row.firstAt || row.at,
          updatedAt: row.at,
          count: row.count,
        });
        return;
      }
      existing.query = row.text;
      existing.createdAt = Math.min(existing.createdAt || row.at, row.firstAt || row.at);
      existing.updatedAt = Math.max(existing.updatedAt || 0, row.at);
      existing.count += row.count;
    });

    const staleKeys = Object.keys(entries || {}).filter(key => !byKey.has(key));
    staleKeys.forEach(key => { updates[`${SEARCH_QUERIES_ROOT_PATH}/${ownerId}/${key}`] = null; });
    byKey.forEach((value, queryKey) => {
      updates[`${SEARCH_QUERIES_ROOT_PATH}/${ownerId}/${queryKey}`] = value;
    });

    report.push({
      ownerId,
      before: Object.keys(entries || {}).length,
      after: byKey.size,
      removed: staleKeys.length,
    });
  });

  return { updates, report };
};
