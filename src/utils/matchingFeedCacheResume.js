import { TTL_MS } from './cardIndex';

/**
 * Чи можна відкрити стрічку з кеша і звідки читати далі.
 *
 * Кеш стрічки — це список показаних id плюс стан пагінації, з яким його
 * отримано (`setQueryPagination`). Довіряти йому можна лише тоді, коли стан
 * записано за тієї самої умови, що й зараз: фільтри й роль читача визначають,
 * які картки джерела потрапили в деку, тож курсор, прочитаний під іншими
 * фільтрами, пропустив би картки, які тоді відсіялись, а тепер мають бути.
 *
 * Повертає:
 * - `usable` — стан чинний (та сама умова й не старший за TTL);
 * - `exhausted` — минулого разу джерело дочитали до кінця: бекенд питати нема
 *   про що, скільки б карток не лишилось на екрані — хоч нуль;
 * - `cursor` — пара (дата, id), з якої джерело читати далі, або `null`.
 */
export const resolveFeedCacheResume = ({
  pagination,
  signature,
  now = Date.now(),
  ttlMs = TTL_MS,
} = {}) => {
  const unusable = { usable: false, exhausted: false, cursor: null };
  if (!pagination || typeof pagination !== 'object') return unusable;
  if (!signature || pagination.signature !== signature) return unusable;
  const savedAt = Number(pagination.savedAt);
  if (!Number.isFinite(savedAt) || savedAt <= 0 || now - savedAt > ttlMs) return unusable;

  const cursor = normalizeFeedCursor(pagination.cursor);
  const exhausted = pagination.hasMore === false;
  // Незакінчена стрічка без курсора — це «читали, але не знаємо звідки далі»:
  // продовжувати нема з чого, і такий запис нічого не дає.
  if (!exhausted && !cursor) return unusable;
  return { usable: true, exhausted, cursor };
};

/**
 * Курсор джерела стрічки — пара (дата, id). Інші форми `lastKey` (зсув
 * індексного провайдера, `null`) курсором `matchingCards` не є.
 */
export const normalizeFeedCursor = cursor => {
  if (!cursor || typeof cursor !== 'object') return null;
  const date = String(cursor.date || '').trim();
  const userId = String(cursor.userId || '').trim();
  if (!date || !userId) return null;
  return { date, userId };
};
