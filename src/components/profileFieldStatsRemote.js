import { get, ref } from 'firebase/database';
import { noteRealtimeDemand } from 'utils/realtimeConnectionManager';
import { database } from './config';

/*
 * Статистика заповнення полів (`profileFieldStats`) для чіпів «Додати поле» у
 * формі картки адміна. Пише її workflow `profile-field-stats.yml` раз на
 * тиждень, тож читається вона раз на добу з пристрою (`localStorage`) і раз на
 * вкладку з бази. Немає вузла чи впало читання — `null`: чіпи стоять у порядку
 * форми, а не зникають.
 */

const STORAGE_KEY = 'km.profileFieldStats.v1';
const TTL_MS = 24 * 60 * 60 * 1000;
// Порожню відповідь (вузла ще немає) — лише годину: інакше перший запуск
// workflow доїхав би до форми аж наступного дня.
const EMPTY_TTL_MS = 60 * 60 * 1000;

let inFlight = null;

const readStored = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    const ttl = parsed?.stats ? TTL_MS : EMPTY_TTL_MS;
    if (parsed && Date.now() - Number(parsed.savedAt || 0) < ttl) return { stats: parsed.stats || null };
  } catch {
    // Пошкоджений запис — як відсутній.
  }
  return null;
};

const writeStored = stats => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ savedAt: Date.now(), stats }));
  } catch {
    // Сховище переповнене чи заборонене — наступного разу прочитаємо знову.
  }
};

export const loadProfileFieldStats = () => {
  const stored = readStored();
  if (stored) return Promise.resolve(stored.stats);
  if (!inFlight) {
    noteRealtimeDemand();
    // `Promise.resolve().then` — щоб синхронний збій чи заглушка `get` без
    // промісу (тести форми) лишались відмовою читання, а не падінням рендера.
    inFlight = Promise.resolve()
      .then(() => get(ref(database, 'profileFieldStats')))
      .then(snapshot => {
        const stats = snapshot?.exists?.() ? snapshot.val() : null;
        // Порожня відповідь теж памʼятається (на годину): поки workflow не
        // запускали, вузла немає, і питати його на кожному відкритті нема чого.
        writeStored(stats);
        return stats;
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
};
