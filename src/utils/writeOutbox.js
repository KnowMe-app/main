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
const successHandlers = new Map();
// Записи, що справді лежать на диску. Лише про них відсутність ключа означає
// «дослано чи витіснено іншою вкладкою»; без `localStorage` запис живе в
// памʼяті вкладки, і викинути його за відсутнім ключем означало б загубити.
const diskIds = new Set();

// Кожен запис — окремий ключ (`…:{читач}:{id}`), а не один масив на читача.
// Дві вкладки того самого акаунта тримають кожна свою памʼять черги, і поки
// черга лежала одним ключем, друга вкладка, зберігаючи свій знімок, стирала з
// диска записи першої: памʼятка, написана без звʼязку в одній вкладці, зникала
// від дії в іншій. Окремий ключ вкладка пише й знімає лише свій.
const userPrefix = uid => `${STORAGE_KEY_PREFIX}${uid}:`;
const entryKey = (uid, id) => `${userPrefix(uid)}${id}`;

const isEntry = entry => Boolean(entry?.id && entry.patch && typeof entry.patch === 'object');

const readEntryFromDisk = (uid, id) => {
  try {
    const raw = localStorage.getItem(entryKey(uid, id));
    const parsed = raw ? JSON.parse(raw) : null;
    return isEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const readEntries = uid => {
  try {
    const prefix = userPrefix(uid);
    const fromKeys = Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .map(key => readEntryFromDisk(uid, key.slice(prefix.length)))
      .filter(Boolean);
    // Лише ці записи справді лежать окремими ключами — тільки про них
    // відсутній ключ означатиме «дослано іншою вкладкою» (`diskIds`).
    if (uid === activeUid) fromKeys.forEach(entry => diskIds.add(entry.id));
    // Черга з першої версії лежала одним масивом під `…:{читач}` —
    // переносимо її в окремі ключі. Масив знімається лише тоді, коли всі
    // ключі записались: біля стелі `localStorage` окремі ключі важать більше
    // за масив, і стерти масив до запису означало б загубити недослане.
    const legacyKey = `${STORAGE_KEY_PREFIX}${uid}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw)?.entries;
      const known = new Set(fromKeys.map(entry => entry.id));
      let allWritten = true;
      (Array.isArray(legacy) ? legacy : []).filter(isEntry).forEach(entry => {
        if (known.has(entry.id)) return;
        // Що не записалось, лишається в памʼяті вкладки без позначки «на
        // диску» (`writeEntryToDisk` ставить її лише на вдалому записі) — і
        // відправляється, а не відкидається як «дослане іншою вкладкою».
        if (!writeEntryToDisk(uid, entry)) allWritten = false;
        known.add(entry.id);
        fromKeys.push(entry);
      });
      if (allWritten) localStorage.removeItem(legacyKey);
    }
    return fromKeys.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
};

function writeEntryToDisk(uid, entry) {
  if (!uid || !entry) return false;
  try {
    localStorage.setItem(entryKey(uid, entry.id), JSON.stringify(entry));
    if (uid === activeUid) diskIds.add(entry.id);
    return true;
  } catch {
    // Без `localStorage` черга живе в памʼяті вкладки — як і було до неї.
    return false;
  }
}

const removeEntryFromDisk = (uid, id) => {
  if (!uid || !id) return;
  try {
    localStorage.removeItem(entryKey(uid, id));
    // Старий масив, який не вдалося зняти при переносі (стеля сховища),
    // мусить забути й цей запис — інакше наступний старт дослав би вже
    // записане вдруге поверх новішого значення.
    const legacyKey = `${STORAGE_KEY_PREFIX}${uid}`;
    const legacyRaw = localStorage.getItem(legacyKey);
    if (legacyRaw) {
      const rest = (JSON.parse(legacyRaw)?.entries || []).filter(entry => entry?.id !== id);
      if (rest.length) localStorage.setItem(legacyKey, JSON.stringify({ entries: rest }));
      else localStorage.removeItem(legacyKey);
    }
  } catch {
    // нічого
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

const removeEntry = (uid, id) => {
  // Диск — за читачем запису, а не за поточним: підтвердження буває вже
  // після зміни акаунта, і запис, лишений у черзі свого читача, на його
  // наступному вході досилався б удруге — поверх новішого значення, яке
  // той тим часом поставив з іншого пристрою.
  removeEntryFromDisk(uid, id);
  if (uid !== activeUid) return;
  diskIds.delete(id);
  const before = entries.length;
  entries = entries.filter(entry => entry.id !== id);
  if (entries.length !== before) notify();
};

const rejectEntry = (sentEntry, error) => {
  // Хтось у цій вкладці чекає на відповідь — він і скаже людині про відмову
  // своїми словами. Ніхто не чекає — запис досланий з минулої вкладки, і
  // сказати про нього може лише слухач події (`replayed`).
  const replayed = !waiters.has(sentEntry.id);
  // `meta` — свіжа, з диска чи памʼяті, а не знята на мить відправлення:
  // поки запис летів, підтвердження попереднього могло переписати, до чого
  // відкочувати (`updatePendingOutboxMeta`).
  const latest = readEntryFromDisk(activeUid, sentEntry.id)
    || entries.find(item => item.id === sentEntry.id);
  const entry = latest?.meta ? { ...sentEntry, meta: latest.meta } : sentEntry;
  removeEntry(activeUid, entry.id);
  const handler = entry.meta?.type ? rejectionHandlers.get(entry.meta.type) : null;
  if (handler) {
    try {
      handler(entry.meta, error, { patch: entry.patch });
    } catch (handlerError) {
      console.warn('[writeOutbox] відкат відхиленого запису впав', handlerError);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WRITE_OUTBOX_REJECTED_EVENT, { detail: { meta: entry.meta || null, replayed } }));
  }
  settleWaiter(entry.id, error);
};

const sendEntry = original => {
  const uid = activeUid;
  // Диск — спільна правда вкладок: іншою вкладкою запис могли вже дослати
  // (ключа немає) або витіснити частину його шляхів новішим значенням.
  const fromDisk = readEntryFromDisk(uid, original.id);
  if (!fromDisk && diskIds.has(original.id)) {
    diskIds.delete(original.id);
    entries = entries.filter(entry => entry.id !== original.id);
    notify();
    settleWaiter(original.id);
    return;
  }
  const entry = fromDisk || original;
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
      const replayed = !waiters.has(entry.id);
      removeEntry(uid, entry.id);
      const handler = entry.meta?.type ? successHandlers.get(entry.meta.type) : null;
      if (handler) {
        try {
          handler(entry.meta, { replayed, patch: entry.patch });
        } catch (handlerError) {
          console.warn('[writeOutbox] продовження підтвердженого запису впало', handlerError);
        }
      }
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
    diskIds.clear();
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
export const enqueueOutboxWrite = ({ uid, patch, meta = null, additive = false }) => {
  if (!uid || !patch || !Object.keys(patch).length) return Promise.resolve();
  if (String(uid) !== activeUid) startWriteOutbox(uid);
  // `additive` — запис, що додається до попередніх (лічильник через
  // `increment`), а не замінює їх: новіший не витісняє старішого й сам не
  // витісняється, інакше дотики, зроблені без звʼязку, рахувались би одним.
  const paths = new Set(additive ? [] : Object.keys(patch));
  const superseded = [];
  const coalesce = entry => {
    if (entry.additive) return entry;
    const remaining = Object.fromEntries(Object.entries(entry.patch).filter(([path]) => !paths.has(path)));
    if (Object.keys(remaining).length === Object.keys(entry.patch).length) return entry;
    if (!Object.keys(remaining).length) return null;
    return { ...entry, patch: remaining };
  };
  // Новіше значення шляху витісняє старіше, поки те ще не відправлене, — і
  // на диску теж: запис іншої вкладки, що чекає звʼязку, інакше дослався б
  // після цього й повернув старе значення.
  readEntries(activeUid)
    .filter(entry => !inFlight.has(entry.id) && !entries.some(own => own.id === entry.id))
    .forEach(entry => {
      const next = coalesce(entry);
      if (next === entry) return;
      if (next) writeEntryToDisk(activeUid, next);
      else removeEntryFromDisk(activeUid, entry.id);
    });
  entries = entries
    .map(entry => {
      if (inFlight.has(entry.id)) return entry;
      const next = coalesce(entry);
      if (next === entry) return entry;
      if (next) {
        writeEntryToDisk(activeUid, next);
        return next;
      }
      removeEntryFromDisk(activeUid, entry.id);
      // Витіснений цілком: той, хто чекав на нього, отримує відповідь
      // нового запису — його значення стало остаточним.
      const waiter = waiters.get(entry.id);
      if (waiter) {
        waiters.delete(entry.id);
        superseded.push(waiter);
      }
      return null;
    })
    .filter(Boolean);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const entry = additive
    ? { id, patch, meta, createdAt: Date.now(), additive: true }
    : { id, patch, meta, createdAt: Date.now() };
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
  writeEntryToDisk(activeUid, entry);
  notify();
  if (sendPatch) sendEntry(entry);
  return delivered;
};

export const WRITE_OUTBOX_REJECTED_EVENT = 'km:write-outbox-rejected';

/**
 * Відкат правки пристрою для записів одного типу `meta.type`. Кличеться з
 * `(meta, error, { patch })` — відкочувати лише шляхи, що лишились у `patch`:
 * витіснені належать новішому запису.
 */
export const registerOutboxRejectionHandler = (type, handler) => {
  if (!type || typeof handler !== 'function') return;
  rejectionHandlers.set(type, handler);
};

/**
 * Продовження підтвердженого запису для типу `meta.type`. Кличеться з
 * `{ replayed, patch }`: `replayed` — запис дослано з минулої вкладки, і
 * продовження, яке зробив би сам писач, ніхто вже не зробить; `patch` — що
 * справді відправлено. `meta` описує запис таким, яким його поставили, а
 * новіше значення могло витіснити частину шляхів: діяти можна лише на ті,
 * що лишились у `patch`.
 */
export const registerOutboxSuccessHandler = (type, handler) => {
  if (!type || typeof handler !== 'function') return;
  successHandlers.set(type, handler);
};

/**
 * Переписати `meta` записів, що ще чекають (і в цій вкладці, і на диску —
 * записи інших вкладок теж). Потрібне, коли підтвердження одного запису міняє,
 * до чого відкочувати наступні: «Відкласти» зберігає в `meta.previous`
 * підтверджене базою, і після підтвердження січня лютий, що ще чекає, мусить
 * відкочуватись до січня, а не до грудня, — зокрема досланий з минулої
 * вкладки, де памʼяті про записи вже немає.
 */
export const updatePendingOutboxMeta = (matches, update) => {
  if (!activeUid || typeof matches !== 'function' || typeof update !== 'function') return 0;
  let changed = 0;
  const apply = entry => {
    if (!entry?.meta || !matches(entry)) return entry;
    changed += 1;
    return { ...entry, meta: update(entry.meta) };
  };
  readEntries(activeUid).forEach(entry => {
    const next = apply(entry);
    if (next !== entry) writeEntryToDisk(activeUid, next);
  });
  entries = entries.map(apply);
  return changed;
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
  successHandlers.clear();
  diskIds.clear();
};

// Звʼязок повернувся — дослати те, що чекало на повтор після збою.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => flushWriteOutbox());
}
