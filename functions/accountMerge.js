'use strict';

/**
 * Злиття акаунтів: один головний акаунт на людину, хоч скільки способів входу.
 *
 * Людина реєструється поштою, потім входить через Telegram чи Google — і
 * Firebase заводить їй другий uid з порожньою анкетою: Flow, реакції,
 * памʼятки й анкета лишаються в першому, а вхід новим способом відкриває
 * другий (16.11: привʼязали Telegram до акаунта з поштою, а телефон, що
 * входив через Telegram, так і лишився в новому акаунті без Flow).
 *
 * Модель — головний і другорядний акаунт:
 * - **головний** — той, з якого людина привʼязала інший спосіб входу (вона
 *   в ньому увійшла й довела, що другий теж її);
 * - **другорядний** лишається ідентифікатором: `accountAliases/{другорядний}`
 *   = `{ primary, at, via }`, і вхід у нього (`resolvePrimaryAccount`) видає
 *   токен головного — сесія перемикається сама, хоч би яким способом увійшли.
 *
 * Дані доливаються **лише туди, де в головному порожньо**: значення головного
 * не переписується ніколи (`fillMissing`). Дані другорядного не стираються —
 * лишаються копією, а його картку стрічки ховає `feedDate: false`, щоб у
 * стрічці й пошуку не було двох однакових анкет. Права (`accessLevel` тощо)
 * не переносяться: їх видає лише адмін.
 *
 * Доказ, що обидва акаунти одної людини, дає той, хто кличе: код із Telegram
 * поруч із сесією головного (`completeTelegramLogin` з `intent: 'link'`) або
 * свіжий ID-токен другорядного поруч із сесією головного (`mergeAccountInto`).
 * Вузол `accountAliases` пишуть і читають лише функції — у правилах його
 * немає, корінь закритий.
 *
 * Чиста логіка з підставними залежностями (`deps.read`, `deps.update`), щоб
 * перевіряти без мережі (`test/accountMerge.test.js`).
 */

const ALIASES_ROOT = 'accountAliases';
const TELEGRAM_ACCOUNTS_ROOT = 'telegramAccounts';
const MAX_ALIAS_HOPS = 5;
const MERGE_UPDATE_CHUNK = 400;

const ADMIN_UIDS = Object.freeze(['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2']);
const READONLY_ADMIN_UIDS = Object.freeze(['vtDxkDMjCwYuTDqTUnZsO29bpQr1']);
// Адмін та інспектор не стають другорядними: їхні права тримаються на uid.
const PROTECTED_UIDS = Object.freeze([...ADMIN_UIDS, ...READONLY_ADMIN_UIDS]);

// Вузли анкети: поле за полем, головне значення перемагає.
const PROFILE_FIELD_NODES = Object.freeze(['profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical']);
// Права видає лише адмін (`stripPrivilegedProfileFields` у застосунку).
const PRIVILEGED_TECHNICAL_FIELDS = Object.freeze(['accessLevel', 'canCreateProfiles', 'multiDataSourceUserIds']);
// З картки стрічки — лише те, чого більше ніде немає (`name` живе тільки в
// ній) і роль. Похідні поля (`surnameShort`, `rh`, `blood`, `avatar`…),
// публікація й версії перебудовує застосунок (`refreshOwnProfileAfterMerge`).
const CARD_FILL_FIELDS = Object.freeze(['name', 'role']);

// `multiData/{вузол}/{власник}/…` — що людина вела сама: Flow, реакції,
// памʼятки, «Відкласти», графік стимуляції, історія пошуку. Глибоке
// доливання: чого немає в головному — копіюється піддеревом.
const OWNER_MULTIDATA_NODES = Object.freeze([
  'flow',
  'favorites',
  'dislikes',
  'getInTouch',
  'writer',
  'comments',
  'contactViews',
  'stimulation',
  'stimulationSchedule',
  'stimulationShortcuts',
  'searchQueries',
  'likedAudience',
]);
// Вузли під uid, що беруться цілком, лише коли в головному їх немає.
const WHOLE_NODES = Object.freeze([
  'multiData/programs',
  'adminNotificationSettings',
]);

const isValidUid = uid => typeof uid === 'string' && /^[A-Za-z0-9]{20,128}$/.test(uid);
const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isEmptyValue = value => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.every(isEmptyValue);
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
};

/**
 * Записи, що доливають у `target` (шлях `basePath`) те, чого там немає, з
 * `source`. Значення `target` не переписується; на `depth` > 0 обидва
 * обʼєкти зливаються глибше (дві групи Flow з однаковою назвою — записи
 * обох), на 0 — поле береться цілком.
 */
const fillMissing = (basePath, target, source, { depth = 0, skip = [] } = {}) => {
  const updates = {};
  if (!isPlainObject(source)) return updates;
  const current = isPlainObject(target) ? target : {};
  Object.entries(source).forEach(([key, value]) => {
    if (skip.includes(key) || isEmptyValue(value)) return;
    const path = `${basePath}/${key}`;
    const existing = current[key];
    if (isEmptyValue(existing)) {
      updates[path] = value;
      return;
    }
    if (depth > 0 && isPlainObject(existing) && isPlainObject(value)) {
      Object.assign(updates, fillMissing(path, existing, value, { depth: depth - 1 }));
    }
  });
  return updates;
};

/** Головний акаунт для uid: ланцюжок `accountAliases`, без циклів. */
const resolvePrimaryUid = async (deps, uid) => {
  let current = uid;
  const seen = new Set([uid]);
  for (let hop = 0; hop < MAX_ALIAS_HOPS; hop += 1) {
    // eslint-disable-next-line no-await-in-loop
    const alias = await deps.read(`${ALIASES_ROOT}/${current}`);
    const next = alias && alias.primary;
    if (!isValidUid(next) || seen.has(next)) return current;
    seen.add(next);
    current = next;
  }
  return current;
};

const chunk = updates => {
  const entries = Object.entries(updates);
  const chunks = [];
  for (let i = 0; i < entries.length; i += MERGE_UPDATE_CHUNK) {
    chunks.push(Object.fromEntries(entries.slice(i, i + MERGE_UPDATE_CHUNK)));
  }
  return chunks;
};

/**
 * Збирає всі записи злиття: доливання в головний, позначку другорядного,
 * перепривʼязку Telegram і посилань, що вели на другорядний, і приховання
 * його картки. Нічого не пише.
 */
const buildMergeUpdates = async (deps, primaryUid, secondaryUid, { now, via }) => {
  const updates = {};
  const read = path => deps.read(path);

  for (const node of PROFILE_FIELD_NODES) {
    // eslint-disable-next-line no-await-in-loop
    const [target, source] = await Promise.all([read(`${node}/${primaryUid}`), read(`${node}/${secondaryUid}`)]);
    Object.assign(updates, fillMissing(`${node}/${primaryUid}`, target, source, {
      skip: node === 'profileTechnical' ? [...PRIVILEGED_TECHNICAL_FIELDS, 'userId'] : ['userId'],
    }));
  }

  const [primaryCard, secondaryCard] = await Promise.all([
    read(`matchingCards/${primaryUid}`),
    read(`matchingCards/${secondaryUid}`),
  ]);
  if (isPlainObject(secondaryCard)) {
    const fill = Object.fromEntries(CARD_FILL_FIELDS
      .filter(field => field in secondaryCard)
      .map(field => [field, secondaryCard[field]]));
    // Картки в головного немає — її заведе застосунок з долитої анкети.
    if (isPlainObject(primaryCard)) Object.assign(updates, fillMissing(`matchingCards/${primaryUid}`, primaryCard, fill));
    // Другорядну анкету ховаємо від усіх: інакше в стрічці й пошуку стояли б
    // дві анкети тієї самої людини.
    if (secondaryCard.feedDate !== false) updates[`matchingCards/${secondaryUid}/feedDate`] = false;
    if ('audience' in secondaryCard) updates[`matchingCards/${secondaryUid}/audience`] = null;
  }

  for (const node of OWNER_MULTIDATA_NODES) {
    // eslint-disable-next-line no-await-in-loop
    const [target, source] = await Promise.all([
      read(`multiData/${node}/${primaryUid}`),
      read(`multiData/${node}/${secondaryUid}`),
    ]);
    Object.assign(updates, fillMissing(`multiData/${node}/${primaryUid}`, target, source, { depth: 3 }));
  }

  for (const root of WHOLE_NODES) {
    // eslint-disable-next-line no-await-in-loop
    const [target, source] = await Promise.all([read(`${root}/${primaryUid}`), read(`${root}/${secondaryUid}`)]);
    if (isEmptyValue(target) && !isEmptyValue(source)) updates[`${root}/${primaryUid}`] = source;
  }

  // Telegram, що відкривав другорядний акаунт, тепер відкриває головний.
  const telegramAccounts = (await read(TELEGRAM_ACCOUNTS_ROOT)) || {};
  Object.entries(isPlainObject(telegramAccounts) ? telegramAccounts : {}).forEach(([tgId, account]) => {
    if (!account || account.uid !== secondaryUid) return;
    updates[`${TELEGRAM_ACCOUNTS_ROOT}/${tgId}/uid`] = primaryUid;
    updates[`${TELEGRAM_ACCOUNTS_ROOT}/${tgId}/previousUid`] = secondaryUid;
  });

  // Посилання, що вели на другорядний, ведуть одразу на головний.
  const aliases = (await read(ALIASES_ROOT)) || {};
  Object.entries(isPlainObject(aliases) ? aliases : {}).forEach(([uid, alias]) => {
    if (alias && alias.primary === secondaryUid && uid !== primaryUid) {
      updates[`${ALIASES_ROOT}/${uid}/primary`] = primaryUid;
    }
  });
  updates[`${ALIASES_ROOT}/${secondaryUid}`] = { primary: primaryUid, at: now, via };

  return updates;
};

/**
 * Зливає `secondaryUid` у `primaryUid`. Доказ, що обидва акаунти одної
 * людини, — справа того, хто кличе.
 * @returns {Promise<{ status: 'merged'|'already-merged'|'refused', reason?: string, primaryUid?: string, filled?: number }>}
 */
const mergeAccounts = async (deps, { primaryUid, secondaryUid, via = '', now = Date.now() }) => {
  if (!isValidUid(primaryUid) || !isValidUid(secondaryUid)) return { status: 'refused', reason: 'invalid' };
  if (PROTECTED_UIDS.includes(secondaryUid)) return { status: 'refused', reason: 'protected' };
  const primary = await resolvePrimaryUid(deps, primaryUid);
  if (primary === secondaryUid) return { status: 'refused', reason: 'cycle' };
  if (primary === (await resolvePrimaryUid(deps, secondaryUid))) {
    return { status: 'already-merged', primaryUid: primary };
  }
  const existing = await deps.read(`${ALIASES_ROOT}/${secondaryUid}`);
  // Другорядний уже веде на інший головний: перезливати чуже не беремось.
  if (existing && existing.primary) return { status: 'refused', reason: 'merged-elsewhere' };

  const updates = await buildMergeUpdates(deps, primary, secondaryUid, { now, via });
  for (const part of chunk(updates)) {
    // eslint-disable-next-line no-await-in-loop
    await deps.update(part);
  }
  const filled = Object.keys(updates).filter(path => path.includes(`/${primary}`)).length;
  return { status: 'merged', primaryUid: primary, filled };
};

/**
 * Старі привʼязки Telegram (до злиття) лишили `telegramAccounts/{tgId}` =
 * `{ uid: головний, previousUid: другорядний }` без злиття. Функція, що
 * перевіряє вхід, зливає їх, коли головний увійшов: доказ — та сама
 * привʼязка, яку записала функція після коду з Telegram.
 */
const listPendingTelegramMerges = async (deps, uid) => {
  const accounts = (await deps.read(TELEGRAM_ACCOUNTS_ROOT)) || {};
  const pending = [];
  for (const account of Object.values(isPlainObject(accounts) ? accounts : {})) {
    if (!account || account.uid !== uid || !isValidUid(account.previousUid) || account.previousUid === uid) continue;
    // eslint-disable-next-line no-await-in-loop
    const alias = await deps.read(`${ALIASES_ROOT}/${account.previousUid}`);
    if (!alias || !alias.primary) pending.push(account.previousUid);
  }
  return pending;
};

/**
 * Вхід у будь-який акаунт питає, чи він головний. Другорядний отримує токен
 * головного (`redirect`); головний, у якого лишилась незлита давня привʼязка
 * Telegram, — злиття (`merged`).
 */
const resolveAccountOnSignIn = async (deps, uid, { now = Date.now() } = {}) => {
  if (!isValidUid(uid)) return { status: 'primary' };
  const primary = await resolvePrimaryUid(deps, uid);
  if (primary !== uid) {
    // Головний видалили — лишаємось там, де увійшли, а не ведемо в нікуди.
    const primaryExists = deps.userExists ? await deps.userExists(primary) : true;
    if (primaryExists) {
      const token = await deps.createCustomToken(primary);
      return { status: 'redirect', token };
    }
    return { status: 'primary' };
  }
  const pending = await listPendingTelegramMerges(deps, uid);
  let merged = 0;
  for (const secondaryUid of pending) {
    // eslint-disable-next-line no-await-in-loop
    const result = await mergeAccounts(deps, { primaryUid: uid, secondaryUid, via: 'telegram-link', now });
    if (result.status === 'merged') merged += 1;
  }
  return merged ? { status: 'merged', merged } : { status: 'primary' };
};

module.exports = {
  ALIASES_ROOT,
  CARD_FILL_FIELDS,
  OWNER_MULTIDATA_NODES,
  PRIVILEGED_TECHNICAL_FIELDS,
  fillMissing,
  isEmptyValue,
  listPendingTelegramMerges,
  mergeAccounts,
  resolveAccountOnSignIn,
  resolvePrimaryUid,
};
