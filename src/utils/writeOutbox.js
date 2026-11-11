/**
 * Черга записів на пристрої — оптимістичний запис, що переживає вкладку.
 *
 * Чому. Реакції й памʼятки вже писались оптимістично: спершу правка кеша
 * пристрою, потім запис у базу. Але сам запис жив лише в памʼяті вкладки:
 * SDK Realtime Database у вебі тримає незавершені записи в памʼяті й не
 * зберігає їх на диск. Без звʼязку людина ставила серце чи писала памʼятку,
 * закривала вкладку чи перезавантажувала сторінку — і записане зникало, хоч
 * екран показував його збереженим.
 *
 * Як. Запис спершу лягає сюди (`localStorage`, своя черга на кожного
 * читача), потім іде в базу одним `update` від кореня — так само атомарно,
 * як і раніше. Знімається з черги лише тоді, коли база його підтвердила;
 * після перезавантаження нескінчене досилається на першому ж вході того
 * самого читача (`startWriteOutbox`). Записи тут — «поставити значення за
 * шляхом», тож повтор безпечний.
 *
 * Відмова правил — остаточна: запис знімається, а правка пристрою
 * відкочується. Відкат описаний даними (`meta`), а не функцією: після
 * перезавантаження функції з попередньої вкладки вже немає, а дані є
 * (`registerOutboxRejectionHandler`). Збій без відмови (запис скасовано,
 * читач змінився посеред дороги) лишає запис у черзі до наступної спроби.
 *
 * Новіший запис того самого шляху витісняє старіший, поки той ще не
 * відправлено: інакше досилання після перезавантаження ставило б по черзі
 * серце, потім хрестик, потім знову серце — і кожен крок будив би слухачів.
 */

const STORAGE_KEY_PREFIX = 'km.writeOutbox.v1:';
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60 * 1000;

let sendPatch = null;
let activeUid = null;
let entries = [];
let retryTimer = null;
let retryAttempt = 0;
const inFlight = new Set();
const waiters = new Map();
const listeners = new Set();
const rejectionHandlers = new Map();

const storageKey = uid => `${STORAGE_KEY_PREFIX}${uid}`;

const readEntries = uid => {
  try {
    const raw = localStorage.getItem(storageKey(uid));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.entries)
      ? parsed.entries.filter(entry => entry?.id && entry.patch && typeof entry.patch === 'object')
      : [];
  } catch {
    return [];
  }
};

const persist = () => {
  if (!activeUid) return;
  try {
    if (entries.length) {
      localStorage.setItem(storageKey(activeUid), JSON.stringify({ entries }));
    } else {
      localStorage.removeItem(storageKey(activeUid));
    }
  } catch {
    // Без `localStorage` черга живе в памʼяті вкладки — як і було до неї.
  }
};

const notify = () => {
  listeners.forEach(listener => {
    try {
      listener();
    } catch {
      // слухач не мусить ламати чергу
    }
  });
};

const settleWaiter = (id, error) => {
  const waiter = waiters.get(id);
  if (!waiter) return;
  waiters.delete(id);
  if (error) waiter.reject(error);
  else waiter.resolve();
};

const errorText = error => `${error?.code || ''} ${error?.message || ''}`.toLowerCase();

/**
 * Відмова правил (і будь-яка інша відповідь бази «ні») — остаточна. Решта —
 * запис скасовано, звʼязок обірвано — лишає запис у черзі.
 */
export const isRetryableOutboxError = error => {
  const text = errorText(error);
  if (text.includes('permission') || text.includes('denied')) return false;
  return text.includes('write_cancelled')
    || text.includes('cancel')
    || text.includes('disconnect')
    || text.includes('network')
    || text.includes('unavailable')
    || text.includes('offline');
};

const scheduleRetry = () => {
  if (retryTimer || !entries.some(entry => !inFlight.has(entry.id))) return;
  const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** retryAttempt);
  retryAttempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    flushWriteOutbox();
  }, delay);
};

const removeEntry = id => {
  const before = entries.length;
  entries = entries.filter(entry => entry.id !== id);
  if (entries.length !== before) {
    persist();
    notify();
  }
};

const rejectEntry = (entry, error) => {
  // Хтось у цій вкладці чекає на відповідь — він і скаже людині про відмову
  // своїми словами. Ніхто не чекає — запис досланий з минулої вкладки, і
  // сказати про нього може лише слухач події (`replayed`).
  const replayed = !waiters.has(entry.id);
  removeEntry(entry.id);
  const handler = entry.meta?.type ? rejectionHandlers.get(entry.meta.type) : null;
  if (handler) {
    try {
      handler(entry.meta, error);
    } catch (handlerError) {
      console.warn('[writeOutbox] відкат відхиленого запису впав', handlerError);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WRITE_OUTBOX_REJECTED_EVENT, { detail: { meta: entry.meta || null, replayed } }));
  }
  settleWaiter(entry.id, error);
};

const sendEntry = entry => {
  const uid = activeUid;
  inFlight.add(entry.id);
  let sending;
  try {
    sending = Promise.resolve(sendPatch(entry.patch));
  } catch (error) {
    sending = Promise.reject(error);
  }
  sending.then(
    () => {
      inFlight.delete(entry.id);
      retryAttempt = 0;
      // Відповідь могла прийти вже після виходу: черга іншого читача цього
      // запису не знає, а свою пристрій уже записав на диск.
      if (uid === activeUid) removeEntry(entry.id);
      settleWaiter(entry.id);
    },
    error => {
      inFlight.delete(entry.id);
      // Відмова, що прийшла вже після виходу чи зміни читача, — це відмова
      // сесії, а не запису: без входу правила не пускають нікого. Запис
      // лишається в черзі свого читача до його наступного входу.
      if (uid !== activeUid) return;
      if (isRetryableOutboxError(error)) {
        scheduleRetry();
        return;
      }
      rejectEntry(entry, error);
    },
  );
};

/** Відправити все, що ще не в дорозі. */
export const flushWriteOutbox = () => {
  if (!sendPatch || !activeUid) return;
  entries
    .filter(entry => !inFlight.has(entry.id))
    .forEach(sendEntry);
};

/**
 * Як відправляти запис. `send(patch)` — `update` від кореня бази; його дає
 * `config.js`, щоб черга не тягнула Firebase у тести й не замикала імпорти
 * по колу.
 */
export const configureWriteOutbox = ({ send }) => {
  sendPatch = typeof send === 'function' ? send : null;
};

/**
 * Перемкнути чергу на читача, що увійшов, і дослати те, що лишилось з
 * минулої вкладки. Повторний виклик з тим самим читачем — лише досилання.
 */
export const startWriteOutbox = uid => {
  const next = uid ? String(uid) : null;
  if (next !== activeUid) {
    activeUid = next;
    entries = next ? readEntries(next) : [];
    inFlight.clear();
    retryAttempt = 0;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    notify();
  }
  flushWriteOutbox();
};

/**
 * Вихід: черга стирається, як і решта памʼяті пристрою про читача (`App`,
 * гілка `out`). У ній текст памʼяток і те, кого людина вподобала, а на
 * спільному пристрої наступний читач цього мати не мусить. Ціна —
 * незвідане без звʼязку пропадає, якщо вийти, не дочекавшись звʼязку: ту
 * саму ціну вже платять кеш анкети, реакцій і памʼяток.
 */
export const stopWriteOutbox = () => {
  startWriteOutbox(null);
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_KEY_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  } catch {
    // без `localStorage` стирати нічого
  }
};

/**
 * Поставити запис у чергу й одразу відправити.
 *
 * @param {object} options
 * @param {string} options.uid — хто пише (той, хто увійшов, а не власник
 *   мапи: адмін пише й у мапи спільного доступу).
 * @param {Object<string, *>} options.patch — шлях від кореня → значення
 *   (`null` знімає).
 * @param {object} [options.meta] — як відкотити правку пристрою, якщо база
 *   відмовить (`type` → `registerOutboxRejectionHandler`).
 * @returns {Promise<void>} — коли база підтвердила; відмова правил — помилка.
 */
export const enqueueOutboxWrite = ({ uid, patch, meta = null }) => {
  if (!uid || !patch || !Object.keys(patch).length) return Promise.resolve();
  if (String(uid) !== activeUid) startWriteOutbox(uid);
  const paths = new Set(Object.keys(patch));
  const superseded = [];
  // Новіше значення шляху витісняє старіше, поки те ще не відправлене.
  entries = entries
    .map(entry => {
      if (inFlight.has(entry.id)) return entry;
      const remaining = Object.fromEntries(Object.entries(entry.patch).filter(([path]) => !paths.has(path)));
      if (Object.keys(remaining).length === Object.keys(entry.patch).length) return entry;
      if (!Object.keys(remaining).length) {
        // Витіснений цілком: той, хто чекав на нього, отримує відповідь
        // нового запису — його значення стало остаточним.
        const waiter = waiters.get(entry.id);
        if (waiter) {
          waiters.delete(entry.id);
          superseded.push(waiter);
        }
        return null;
      }
      return { ...entry, patch: remaining };
    })
    .filter(Boolean);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const entry = { id, patch, meta, createdAt: Date.now() };
  entries = [...entries, entry];
  const delivered = new Promise((resolve, reject) => {
    waiters.set(id, {
      resolve: () => {
        superseded.forEach(waiter => waiter.resolve());
        resolve();
      },
      reject: error => {
        superseded.forEach(waiter => waiter.reject(error));
        reject(error);
      },
    });
  });
  persist();
  notify();
  if (sendPatch) sendEntry(entry);
  return delivered;
};

export const WRITE_OUTBOX_REJECTED_EVENT = 'km:write-outbox-rejected';

/** Відкат правки пристрою для записів одного типу `meta.type`. */
export const registerOutboxRejectionHandler = (type, handler) => {
  if (!type || typeof handler !== 'function') return;
  rejectionHandlers.set(type, handler);
};

/** Скільки записів ще не підтвердила база. */
export const getWriteOutboxPendingCount = () => entries.length;

export const subscribeWriteOutbox = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const __resetWriteOutboxForTests = () => {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempt = 0;
  sendPatch = null;
  activeUid = null;
  entries = [];
  inFlight.clear();
  waiters.clear();
  listeners.clear();
  rejectionHandlers.clear();
};

// Звʼязок повернувся — дослати те, що чекало на повтор після збою.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushWriteOutbox());
}
