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
 * Правок картки, схованої до й після, журнал не знає (будь-який перехід у
 * сховане й видалення — знає), і зміна самої лише дати входу в `feedDate`
 * туди не пишеться: їх і порядок стрічки досі тримає TTL кешу.
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

const runSync = async ({
  viewerId,
  readChangesSince,
  forgetCardBodies,
  forgetFeedStateMemo = () => {},
  readServerNow = async () => null,
  now = Date.now,
}) => {
  // Довіра — лише результат цієї синхронізації. Знята на старті, вона не
  // переживає збою чи повільного журналу з попереднього відкриття стрічки,
  // а памʼять читача стану забуває все, що брала з перевіреного стану:
  // рендер до синхронізації міг його туди підтягнути.
  if (trustedViewer === viewerId) trustedViewer = null;
  forgetFeedStateMemo({ persistedOnly: true });

  const state = readCardChangesSyncState(viewerId);
  const clientNow = now();
  const startOverByClock = !state || clientNow - state.lastSync > CARD_CHANGES_MAX_GAP_MS;
  const startAt = startOverByClock
    ? clientNow - CARD_CHANGES_FIRST_WINDOW_MS
    : state.lastSync - CARD_CHANGES_OVERLAP_MS;

  let rows;
  try {
    rows = await readChangesSince(startAt, CARD_CHANGES_PAGE_LIMIT);
  } catch (error) {
    console.warn('[cardChanges] журнал не прочитано, перевіряємо картки як раніше', error?.code || error);
    return { trusted: false, changedIds: new Set() };
  }
  // Час сервера (`.info/serverTimeOffset`, без читання бази): мітку не
  // можна ставити годинником пристрою. Пристрій, що на дві доби поспішає,
  // поставив би мітку в майбутнє сервера, і всі справжні зміни нижче неї
  // наступні синхронізації пропускали б, вважаючи кеш чинним.
  const serverNow = await readServerNow().catch(() => null);
  const startOver = startOverByClock
    || (Number.isFinite(serverNow) && state.lastSync > serverNow + CARD_CHANGES_OVERLAP_MS);

  const list = Array.isArray(rows) ? rows.filter(row => row?.id && Number.isFinite(row.at)) : [];
  const overflow = list.length >= CARD_CHANGES_PAGE_LIMIT;
  const maxSeen = list.reduce((max, row) => Math.max(max, row.at), 0);
  const changedIds = new Set(list.map(row => String(row.id)));
  changedIds.forEach(id => changedThisSession.add(id));

  const trusted = !startOver && !overflow;
  if (!trusted) {
    forgetCardBodies();
    forgetVerifiedFeedStates(viewerId);
    forgetVerifiedProjections(viewerId);
    forgetFeedStateMemo({ ids: changedIds });
  } else if (changedIds.size) {
    forgetCardBodies([...changedIds]);
    forgetVerifiedFeedStates(viewerId, changedIds);
    forgetVerifiedProjections(viewerId, changedIds);
    forgetFeedStateMemo({ ids: changedIds });
  }
  flushVerifiedFeedStates();
  flushVerifiedProjections();

  // Мітка — лише з часу сервера: найпізніше побачене в журналі, а на першій
  // синхронізації без записів — час сервера мінус перекриття. Не відомий час
  // сервера й записів немає — мітки не ставимо (наступне відкриття почне
  // знову), а довіри не даємо.
  const baseline = startOver
    ? Math.max(maxSeen, Number.isFinite(serverNow) ? serverNow - CARD_CHANGES_OVERLAP_MS : 0)
    : Math.max(state.lastSync, maxSeen);
  if (baseline > 0) {
    writeCardChangesSyncState(viewerId, { lastSync: baseline });
    // Довіра вмикається й на першій синхронізації: перевірених станів тоді
    // немає зовсім (щойно забуті), а все, що ляже далі, прочитано з бази.
    markTrusted(viewerId);
  }
  return { trusted: trusted && baseline > 0, changedIds };
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
  // `feedDate: false` залежить не лише від картки: «лише для вподобаних»
  // відкриває чи закриває реакція власниці (`multiData/favorites`), а відмову
  // правил (донорці) — права читача. Ні те, ні інше картки не міняє, тож
  // журнал про це не скаже — такі стани щоразу перевіряє база.
  if (state.feedDate === false || state.feedDate === 'false') {
    const entries = loadVerified(viewerId);
    if (entries[String(cardId)]) {
      delete entries[String(cardId)];
      persistVerified();
    }
    return;
  }
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
  // Записи «сховано» тут уже не пишуться (див. `rememberVerifiedFeedState`),
  // а збережені раніше не читаються: «лише для вподобаних» могли закрити без
  // жодного запису в картку.
  if (entry.s?.feedDate === false || entry.s?.feedDate === 'false') return undefined;
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
  forgetVerifiedProjections(viewerId);
};

const markTrusted = viewerId => { trustedViewer = viewerId; };

/**
 * Стрічку закрили: довіра не переживає її. Наступне відкриття бачить
 * перевірений стан лише після власної синхронізації журналу — інакше перший
 * рендер узяв би стан, якого журнал ще не підтвердив.
 */
export const revokeFeedStateTrust = viewerId => {
  if (!viewerId || trustedViewer === viewerId) trustedViewer = null;
};

export const __resetCardChangesSessionForTests = () => {
  projectionViewer = null;
  projectionEntries = {};
  if (projectionTimer) clearTimeout(projectionTimer);
  projectionTimer = null;
  changedThisSession.clear();
  inFlight.clear();
  verifiedViewer = null;
  verifiedEntries = {};
  trustedViewer = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
};

/*
 * Перевірені проєкції картки стрічки — щоб тіло кешу жило понад TTL, коли
 * журнал каже, що картку не міняли.
 *
 * Годинника запису (`cachedAt`) тут мало: стрічка сама кладе в кеш проєкції
 * зі свого стану (`rememberFeedSummaryCards`), і стара картка, викинута
 * журналом, повернулась би туди з новою міткою часу. Тому кожна проєкція, що
 * прийшла з бази, несе відбиток вмісту (`__verifiedHash`), і відбиток лягає
 * сюди. Довіра понад TTL — лише коли відбиток проєкції в кеші той самий, що
 * тут: журнал знімає записи змінених карток, а наступне читання з бази
 * поставить новий відбиток, якого стара копія не має.
 */
export const VERIFIED_PROJECTION_PREFIX = 'km.matchingVerifiedCards.v1:';
export const VERIFIED_PROJECTION_HASH_FIELD = '__verifiedHash';
const VERIFIED_PROJECTION_MAX_ENTRIES = 3000;

let projectionViewer = null;
let projectionEntries = {};
let projectionTimer = null;

const stableStringify = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};

/** Відбиток сирої картки з бази: однаковий для однакового вмісту. */
export const hashProjection = raw => {
  const text = stableStringify(raw ?? null);
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
  }
  return `${hash.toString(36)}.${text.length.toString(36)}`;
};

const projectionKey = viewerId => `${VERIFIED_PROJECTION_PREFIX}${viewerId}`;

const loadProjections = viewerId => {
  if (projectionViewer === viewerId) return projectionEntries;
  projectionViewer = viewerId;
  try {
    const parsed = JSON.parse(localStorage.getItem(projectionKey(viewerId)) || '{}');
    projectionEntries = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    projectionEntries = {};
  }
  return projectionEntries;
};

const writeProjectionsNow = () => {
  if (!projectionViewer) return;
  const ids = Object.keys(projectionEntries);
  if (ids.length > VERIFIED_PROJECTION_MAX_ENTRIES) {
    ids
      .sort((a, b) => projectionEntries[a].at - projectionEntries[b].at)
      .slice(0, ids.length - VERIFIED_PROJECTION_MAX_ENTRIES)
      .forEach(id => { delete projectionEntries[id]; });
  }
  try {
    localStorage.setItem(projectionKey(projectionViewer), JSON.stringify(projectionEntries));
  } catch {
    // переповнений `localStorage`: проєкції перечитаються з бази за TTL
  }
};

const persistProjections = () => {
  if (projectionTimer) return;
  projectionTimer = setTimeout(() => {
    projectionTimer = null;
    writeProjectionsNow();
  }, 50);
};

export const flushVerifiedProjections = () => {
  if (!projectionTimer) return;
  clearTimeout(projectionTimer);
  projectionTimer = null;
  writeProjectionsNow();
};

export const rememberVerifiedProjection = (viewerId, cardId, hash, { now = Date.now() } = {}) => {
  if (!viewerId || !cardId || !hash) return;
  loadProjections(viewerId)[String(cardId)] = { h: hash, at: now };
  persistProjections();
};

export const forgetVerifiedProjections = (viewerId, ids) => {
  if (!viewerId) return;
  const entries = loadProjections(viewerId);
  if (ids === undefined) {
    Object.keys(entries).forEach(id => { delete entries[id]; });
  } else {
    [...ids].forEach(id => { delete entries[String(id)]; });
  }
  persistProjections();
};

/**
 * Проєкція з кешу чинна понад TTL: журнал у цьому показі сторінки
 * синхронізовано, її відбиток — той, що прийшов з бази востаннє, і запис не
 * старший за тиждень (страховка на зміну, якої журнал не побачив).
 */
export const isProjectionVerified = (viewerId, cardId, card, { now = Date.now() } = {}) => {
  if (!isFeedStateTrusted(viewerId) || !cardId) return false;
  const hash = card?.[VERIFIED_PROJECTION_HASH_FIELD];
  if (!hash) return false;
  const entry = loadProjections(viewerId)[String(cardId)];
  return Boolean(entry) && entry.h === hash && now - entry.at <= VERIFIED_FEED_STATE_MAX_AGE_MS;
};
