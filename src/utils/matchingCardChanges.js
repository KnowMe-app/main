/**
 * Свіжість кешу карток за журналом змін, а не за годинником.
 *
 * Журнал `matchingCardChanges/{картка}` = час сервера останнього запису в
 * `matchingCards/{картка}` (його веде тригер функцій `recordMatchingCardChange`,
 * тож бачить кожен запис, хоч би хто писав). Пристрій памʼятає, до якої мітки
 * він журнал уже прочитав (`lastSync`, час **сервера**), і на відкритті стрічки
 * питає один раз: що змінилось відтоді. Тіла змінених карток з кешу
 * викидаються (`forgetCachedCardBodies`), тож усе, що в кеші лишилось, —
 * чинне на цю мить. Сторож стану (`useFreshFeedStateGate`) тоді не читає
 * незмінені кешовані картки зовсім: 10 запитів на тепле перезавантаження
 * стрічки → один запит журналу.
 *
 * Перша синхронізація пристрою (і довга перерва — понад `MAX_GAP_MS`) не знає,
 * що змінилось до неї: вона забуває всі тіла й лише ставить мітку. Те саме,
 * коли змін більше за стелю запиту: дочитувати журнал сторінками дорожче, ніж
 * один раз прочитати показане.
 *
 * Мітка — завжди час сервера з самого журналу (найбільше побачене значення);
 * годинник пристрою лише вирішує, чи перерва не задовга, і задає вікно першої
 * синхронізації. Перекриття `OVERLAP_MS` покриває запис, що ліг у кошик,
 * мітка якого раніша за вже побачену.
 *
 * Схованих карток журнал не знає (а перехід «видно → сховано» знає), і зміна
 * самої лише дати входу в `feedDate` туди не пишеться: картки поза стрічкою
 * й порядок стрічки досі тримає TTL кешу.
 */
export const CARD_CHANGES_STORAGE_PREFIX = 'km.matchingCardChanges.v1:';
export const CARD_CHANGES_PAGE_LIMIT = 2000;
// Більше за кошик часу журналу (15 хв, `functions/cardChanges.js`): запис
// лягає з міткою початку кошика, тож без цього перекриття губився б.
export const CARD_CHANGES_OVERLAP_MS = 20 * 60 * 1000;
export const CARD_CHANGES_FIRST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CARD_CHANGES_MAX_GAP_MS = 25 * 24 * 60 * 60 * 1000;

const storageKey = viewerId => `${CARD_CHANGES_STORAGE_PREFIX}${viewerId}`;

export const readCardChangesSyncState = viewerId => {
  if (!viewerId) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(viewerId)) || 'null');
    return parsed && Number.isFinite(parsed.lastSync) ? parsed : null;
  } catch {
    return null;
  }
};

const writeCardChangesSyncState = (viewerId, state) => {
  try {
    localStorage.setItem(storageKey(viewerId), JSON.stringify(state));
  } catch {
    // Памʼять пристрою недоступна — наступне відкриття почне спочатку.
  }
};

export const clearCardChangesSyncState = viewerId => {
  try {
    if (viewerId) localStorage.removeItem(storageKey(viewerId));
  } catch {
    // нічого
  }
};

/** Картки, змінені за цей показ сторінки: їхні обʼєкти в памʼяті вкладки старі. */
const changedThisSession = new Set();
export const wasCardChangedThisSession = id => changedThisSession.has(String(id));

const inFlight = new Map();

/**
 * @param {{
 *   viewerId: string,
 *   readChangesSince: (startAt: number, limit: number) => Promise<Array<{ id: string, at: number }>>,
 *   forgetCardBodies: (ids?: string[]) => void,
 *   now?: () => number,
 * }} deps
 * @returns {Promise<{ trusted: boolean, changedIds: Set<string> }>}
 *   `trusted` — кешу можна вірити без перевірки (крім `changedIds`).
 */
export const syncCardChanges = deps => {
  const { viewerId } = deps || {};
  if (!viewerId) return Promise.resolve({ trusted: false, changedIds: new Set() });
  if (inFlight.has(viewerId)) return inFlight.get(viewerId);
  const pending = runSync(deps).finally(() => inFlight.delete(viewerId));
  inFlight.set(viewerId, pending);
  return pending;
};

const runSync = async ({ viewerId, readChangesSince, forgetCardBodies, now = Date.now }) => {
  const state = readCardChangesSyncState(viewerId);
  const clientNow = now();
  const startOver = !state || clientNow - state.lastSync > CARD_CHANGES_MAX_GAP_MS;
  const startAt = startOver
    ? clientNow - CARD_CHANGES_FIRST_WINDOW_MS
    : state.lastSync - CARD_CHANGES_OVERLAP_MS;

  let rows;
  try {
    rows = await readChangesSince(startAt, CARD_CHANGES_PAGE_LIMIT);
  } catch (error) {
    console.warn('[cardChanges] журнал не прочитано, перевіряємо картки як раніше', error?.code || error);
    return { trusted: false, changedIds: new Set() };
  }
  const list = Array.isArray(rows) ? rows.filter(row => row?.id && Number.isFinite(row.at)) : [];
  const overflow = list.length >= CARD_CHANGES_PAGE_LIMIT;
  const maxSeen = list.reduce((max, row) => Math.max(max, row.at), 0);
  const changedIds = new Set(list.map(row => String(row.id)));
  changedIds.forEach(id => changedThisSession.add(id));

  const trusted = !startOver && !overflow;
  if (!trusted) {
    forgetCardBodies();
    forgetVerifiedFeedStates(viewerId);
  } else if (changedIds.size) {
    forgetCardBodies([...changedIds]);
    forgetVerifiedFeedStates(viewerId, changedIds);
  }
  flushVerifiedFeedStates();

  const lastSync = Math.max(state?.lastSync || 0, maxSeen || (startOver ? startAt : 0));
  writeCardChangesSyncState(viewerId, { lastSync });
  // Довіра вмикається й на першій синхронізації: перевірених станів тоді
  // немає зовсім (щойно забуті), а все, що ляже далі, прочитано з бази.
  markTrusted(viewerId);
  return { trusted, changedIds };
};



/*
 * Перевірений стан стрічки картки (`feedDate`, `audience`) на пристрої.
 *
 * Пишуть сюди **лише відповіді бази** — читання сторожа й сторінки, що щойно
 * прийшли (`createFeedStateReader` з `persist`), а не обʼєкти з памʼяті чи
 * кешу: стрічка сама кладе в кеш проєкції зі свого стану, і стара картка
 * повернулась би туди вже після того, як журнал її викинув. Журнал знімає
 * записи змінених карток, тож запис, що лишився, чинний — а вірить йому
 * сторож лише після вдалої синхронізації в цьому показі сторінки
 * (`isFeedStateTrusted`). Стеля — тиждень, страховка на запис, який журнал
 * не побачив.
 */
export const VERIFIED_FEED_STATE_PREFIX = 'km.matchingFeedState.v1:';
export const VERIFIED_FEED_STATE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFIED_FEED_STATE_MAX_ENTRIES = 3000;

let verifiedViewer = null;
let verifiedEntries = {};
let trustedViewer = null;
let saveTimer = null;

const verifiedKey = viewerId => `${VERIFIED_FEED_STATE_PREFIX}${viewerId}`;

const loadVerified = viewerId => {
  if (verifiedViewer === viewerId) return verifiedEntries;
  verifiedViewer = viewerId;
  try {
    const parsed = JSON.parse(localStorage.getItem(verifiedKey(viewerId)) || '{}');
    verifiedEntries = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    verifiedEntries = {};
  }
  return verifiedEntries;
};

const persistVerified = () => {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!verifiedViewer) return;
    const ids = Object.keys(verifiedEntries);
    if (ids.length > VERIFIED_FEED_STATE_MAX_ENTRIES) {
      ids
        .sort((a, b) => verifiedEntries[a].at - verifiedEntries[b].at)
        .slice(0, ids.length - VERIFIED_FEED_STATE_MAX_ENTRIES)
        .forEach(id => { delete verifiedEntries[id]; });
    }
    try {
      localStorage.setItem(verifiedKey(verifiedViewer), JSON.stringify(verifiedEntries));
    } catch {
      // переповнений `localStorage`: стан перечитається з бази
    }
  }, 50);
};

export const flushVerifiedFeedStates = () => {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!verifiedViewer) return;
  try {
    localStorage.setItem(verifiedKey(verifiedViewer), JSON.stringify(verifiedEntries));
  } catch {
    // нічого
  }
};

export const rememberVerifiedFeedState = (viewerId, cardId, state, { now = Date.now() } = {}) => {
  if (!viewerId || !cardId || !state) return;
  const entries = loadVerified(viewerId);
  entries[String(cardId)] = { s: { feedDate: state.feedDate ?? null, audience: state.audience ?? null }, at: now };
  persistVerified();
};

export const isFeedStateTrusted = viewerId => Boolean(viewerId) && trustedViewer === viewerId;

/** Перевірений стан — лише коли журнал у цьому показі сторінки синхронізовано. */
export const readVerifiedFeedState = (viewerId, cardId, { now = Date.now() } = {}) => {
  if (!isFeedStateTrusted(viewerId) || !cardId) return undefined;
  const entry = loadVerified(viewerId)[String(cardId)];
  if (!entry || now - entry.at > VERIFIED_FEED_STATE_MAX_AGE_MS) return undefined;
  return entry.s;
};

export const forgetVerifiedFeedStates = (viewerId, ids) => {
  if (!viewerId) return;
  const entries = loadVerified(viewerId);
  if (ids === undefined) {
    Object.keys(entries).forEach(id => { delete entries[id]; });
  } else {
    [...ids].forEach(id => { delete entries[String(id)]; });
  }
  persistVerified();
};

/** «Оновити стрічку»: знову вірити лише базі, аж до наступної синхронізації. */
export const distrustVerifiedFeedStates = viewerId => {
  if (trustedViewer === viewerId) trustedViewer = null;
  forgetVerifiedFeedStates(viewerId);
};

const markTrusted = viewerId => { trustedViewer = viewerId; };

export const __resetCardChangesSessionForTests = () => {
  changedThisSession.clear();
  inFlight.clear();
  verifiedViewer = null;
  verifiedEntries = {};
  trustedViewer = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
};
