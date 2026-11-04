'use strict';

/**
 * Самовидалення акаунта: що саме стирається й у якому порядку.
 *
 * Чому на сервері, а не в браузері: анкета акаунта лежить у пʼяти вузлах, а її
 * сліди — ще в двох десятках місць (`searchId`, `searchKey`, реакції, памʼятки,
 * посилання, фото, заявки на унікальність) і, головне, **у чужих даних**: лайк
 * агенції на цю картку лежить під агенцією, відгук цієї людини — під чужою
 * карткою. Правила бази власникові чуже не відкривають, а адмін-SDK правил не
 * питає, тож тут видалення повне й одним викликом, а правил під нього
 * викочувати не треба.
 *
 * Чистимо обидва боки:
 * - **своє** — анкета, власні `multiData/*\/{uid}`, фото, посилання;
 * - **чуже про цю людину** — реакції, позначки, нотатки, лічильники контактів,
 *   «лише для вподобаних», графіки інших власників, які називають її картку;
 * - **її сліди на чужих картках** — шари доповнень, записи журналу правок,
 *   публічні відгуки, які вона писала (разом з прапорцем `hasPublicReview`,
 *   якщо під карткою більше нічого не лишилось), права спільного доступу;
 * - **чернетки, які вона завела**: картка-чернетка без авторки нікому не
 *   належить, тож іде так само, як анкета, — з індексів, заявок і чужих
 *   реакцій теж. Але лише доведені сервером (`verifyDraftCardIds`): перелік
 *   чернеток пише клієнт, і повірити йому означало б дати стерти чужу анкету.
 *
 * Модуль чистий (без Firebase): `index.js` дає йому базу, сховище й Auth, а
 * `test/accountDeletion.test.js` перевіряє склад і порядок без мережі.
 */

// Ті самі, що в `src/utils/accessLevel.js`. Адмінів і спільний акаунт
// інспектора самовидалення не стосується: один дотик знищив би доступ до
// адмінки або тестовий акаунт усієї команди.
const PROTECTED_UIDS = Object.freeze([
  '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2',
  '0ghb1LphfASV0Y3b6J010v4CDyD2',
  'vtDxkDMjCwYuTDqTUnZsO29bpQr1',
]);

const PROFILE_NODE_ROOTS = Object.freeze([
  'matchingCards',
  'profileDetails',
  'profileContacts',
  'profileWorkflow',
  'profileTechnical',
]);

// `multiData/{вузол}/{власник}/{картка}`: що вела сама людина — знімається
// цілком (`{власник}` = uid), а що інші вели про видалені картки — точково
// (`{картка}` ∈ видалених). Обидва боки читаються одним обходом вузла.
const OWNER_CARD_NODES = Object.freeze([
  'favorites',
  'dislikes',
  'getInTouch',
  'writer',
  'comments',
  'contactViews',
  'stimulation',
  'stimulationSchedule',
  'stimulationShortcuts',
  'flow',
]);

// Решта вузлів, що лежать під самою людиною або під її карткою.
const OWNED_MULTIDATA_NODES = Object.freeze([
  ...OWNER_CARD_NODES,
  'likedAudience',
  'searchQueries',
  'programs',
  'profileShareSlots',
  'profileMutations',
  'profileMutationOwners',
  'profileMutationHistory',
  'edits',
  'editsByEditor',
  'editsHistory',
]);

// Пакет одного `update`: тисячі шляхів одним записом RTDB приймає, але
// відмова тоді забирає все разом. Порціями — і збій видно по кроку.
const UPDATE_CHUNK = 400;

const isValidUid = uid => typeof uid === 'string' && /^[A-Za-z0-9]{20,128}$/.test(uid);

const isProtectedUid = uid => PROTECTED_UIDS.includes(uid);

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const toIdSet = ids => (ids instanceof Set ? ids : new Set(ids));

/** Кандидати в чернетки людини (`multiData/profileMutations/{uid}/{картка}`) — ще не перевірені. */
const listDraftCardIds = drafts => Object.keys(isPlainObject(drafts) ? drafts : {})
  .filter(id => /^[A-Za-z0-9_-]{1,128}$/.test(id));

/**
 * Які з кандидатів справді чернетки цієї людини — і лише її.
 *
 * Запис `profileMutations/{uid}/{картка}` пише сам клієнт, і правила не
 * питають, чия це картка: будь-хто може завести «чернетку» під id чужої
 * анкети, а `profileMutationOwners` — перебити. Повіривши цьому переліку,
 * видалення стерло б чужу анкету, фото й чужі реакції на неї. Тому id
 * чернеткою вважається лише тоді, коли сервер сам це довів:
 * - запис має форму чернетки (`operation: 'create'`, `createdBy` і `cardId`
 *   збігаються);
 * - це не акаунт, не службовий uid і не сама людина;
 * - під id немає жодного вузла готової анкети — у чернетки їх немає, а в
 *   прийнятої чи заведеної адміном картки є;
 * - немає Auth-акаунта з таким id;
 * - ніхто інший не має чернетки з тим самим id (обхід усього
 *   `profileMutations`): інакше чужа спільна чернетка пішла б разом з цією.
 * Не пройшов — знімається лише власний запис людини (`profileMutations/{uid}`
 * іде в `buildOwnedPaths` цілком), а картка й усе навколо лишаються.
 */
const verifyDraftCardIds = async (deps, uid, drafts) => {
  const candidates = listDraftCardIds(drafts);
  if (!candidates.length) return [];
  const allMutations = await deps.read('multiData/profileMutations');
  const verified = [];
  for (const id of candidates) {
    const record = drafts[id];
    if (id === uid || isProtectedUid(id)) continue;
    if (!isPlainObject(record) || record.operation !== 'create' || record.createdBy !== uid || record.cardId !== id) continue;
    const sharedWithOthers = Object.entries(isPlainObject(allMutations) ? allMutations : {})
      .some(([creator, cards]) => creator !== uid && isPlainObject(cards) && Object.prototype.hasOwnProperty.call(cards, id));
    if (sharedWithOthers) continue;
    // eslint-disable-next-line no-await-in-loop
    const nodes = await Promise.all(PROFILE_NODE_ROOTS.map(root => deps.read(`${root}/${id}`)));
    if (nodes.some(value => value !== null && value !== undefined)) continue;
    let isAccount = true;
    try {
      // eslint-disable-next-line no-await-in-loop
      await deps.getAuthUser(id);
    } catch (error) {
      if (error && error.code === 'auth/user-not-found') isAccount = false;
    }
    if (isAccount) continue;
    verified.push(id);
  }
  return verified;
};

/** Шляхи, які видаляються цілком. */
const buildOwnedPaths = (uid, cardIds = [uid]) => {
  const cards = [...toIdSet([uid, ...cardIds])];
  return [
    ...cards.flatMap(id => PROFILE_NODE_ROOTS.map(root => `${root}/${id}`)),
    ...OWNED_MULTIDATA_NODES.map(node => `multiData/${node}/${uid}`),
    ...cards.flatMap(id => [
      `multiData/profileMutationOwners/${id}`,
      `multiData/profileMutationHistory/${id}`,
      `multiData/edits/${id}`,
      `multiData/editsHistory/${id}`,
      `multiData/programs/${id}`,
      // Публічні відгуки про людину: картки, до якої вони, більше немає.
      `comments/${id}`,
    ]),
    // Legacy-копія анкети: застосунок її не читає, але дані там ще лежать, і
    // «профіль видалено» мусить означати й її.
    `users/${uid}`,
    `usersIndex/${uid}`,
    // Межі відправок листів підтвердження цього акаунта.
    `emailVerificationSends/byUid/${uid}`,
  ];
};

/**
 * Знімає видалені id з одного значення поля `searchId` (`id | [id, ...]`).
 * `undefined` — значення не змінилось.
 */
const stripIdsFromSearchIdValue = (value, ids) => {
  if (typeof value === 'string') return ids.has(value) ? null : undefined;
  if (Array.isArray(value)) {
    if (!value.some(item => ids.has(item))) return undefined;
    const rest = value.filter(item => item != null && !ids.has(item));
    if (!rest.length) return null;
    return rest.length === 1 ? rest[0] : rest;
  }
  return undefined;
};

/**
 * `searchId`: ключ — саме значення, поле лежить у ньому, і за тим самим
 * значенням може стояти чужа анкета, тож знімається id, а не ключ. Записи
 * старої форми (рядок чи масив прямо під ключем) — так само.
 */
const buildSearchIdUpdates = (searchIdRoot, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(searchIdRoot || {}).forEach(([valueKey, entry]) => {
    if (isPlainObject(entry)) {
      Object.entries(entry).forEach(([field, value]) => {
        const next = stripIdsFromSearchIdValue(value, ids);
        if (next !== undefined) updates[`searchId/${valueKey}/${field}`] = next;
      });
      return;
    }
    const next = stripIdsFromSearchIdValue(entry, ids);
    if (next !== undefined) updates[`searchId/${valueKey}`] = next;
  });
  return updates;
};

/**
 * Бакети `{корінь}/{індекс}/{бакет}/{id}` — і `searchKey/users`, і зрізи
 * доступу `searchKeySets/{набір}/{індекс}/{бакет}/{id}` (там на рівень
 * глибше). Обходимо будь-яку глибину до трьох рівнів над id.
 */
const buildBucketUpdates = (root, prefix, cardIds, depth) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  const walk = (node, path, level) => {
    if (!isPlainObject(node)) return;
    if (level === depth) {
      Object.keys(node).forEach(key => {
        if (ids.has(key)) updates[`${path}/${key}`] = null;
      });
      return;
    }
    Object.entries(node).forEach(([key, child]) => walk(child, `${path}/${key}`, level + 1));
  };
  walk(root, prefix, 0);
  return updates;
};

const buildSearchKeyUpdates = (usersRoot, cardIds) => buildBucketUpdates(usersRoot, 'searchKey/users', cardIds, 2);

const buildSearchKeySetUpdates = (setsRoot, cardIds) => buildBucketUpdates(setsRoot, 'searchKeySets', cardIds, 3);

/** Заявки на унікальність, які тримають видалені картки (`profileIdentityClaims/{ключ}` = id). */
const buildIdentityClaimUpdates = (claimsRoot, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(claimsRoot || {}).forEach(([key, owner]) => {
    if (ids.has(owner)) updates[`multiData/profileIdentityClaims/${key}`] = null;
  });
  return updates;
};

/**
 * Позначки інших власників про видалені картки: `{вузол}/{власник}/{картка}`.
 * Стара, перевернута форма `getInTouch` (`{власник}/{значення}/{картка}: true`)
 * лежить на рівень глибше — її теж знімаємо, інакше дата дзвінка на картку,
 * якої немає, висіла б у списку «кому дзвонити».
 */
const buildOwnerCardUpdates = (node, nodeRoot, uid, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(nodeRoot || {}).forEach(([ownerId, cards]) => {
    if (ownerId === uid || !isPlainObject(cards)) return;
    Object.entries(cards).forEach(([key, value]) => {
      if (ids.has(key)) {
        updates[`multiData/${node}/${ownerId}/${key}`] = null;
        return;
      }
      if (node === 'getInTouch' && isPlainObject(value)) {
        Object.keys(value).forEach(nested => {
          if (ids.has(nested)) updates[`multiData/${node}/${ownerId}/${key}/${nested}`] = null;
        });
      }
    });
  });
  return updates;
};

/**
 * `likedAudience/{читач}/{власниця}`: свій перелік як читача знімає
 * `buildOwnedPaths`, а тут — записи, якими видалена власниця відкривала себе
 * іншим.
 */
const buildLikedAudienceUpdates = (likedRoot, uid, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(likedRoot || {}).forEach(([viewerId, owners]) => {
    if (viewerId === uid || !isPlainObject(owners)) return;
    Object.keys(owners).forEach(ownerId => {
      if (ids.has(ownerId)) updates[`multiData/likedAudience/${viewerId}/${ownerId}`] = null;
    });
  });
  return updates;
};

/** Шари доповнень людини на чужих картках (`edits/{картка}/{редактор}`). */
const buildEditsUpdates = (editsRoot, uid, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(editsRoot || {}).forEach(([cardId, editors]) => {
    if (ids.has(cardId) || !isPlainObject(editors)) return;
    if (Object.prototype.hasOwnProperty.call(editors, uid)) updates[`multiData/edits/${cardId}/${uid}`] = null;
  });
  return updates;
};

/** Чужі переліки доповнень, що називають видалені картки (`editsByEditor/{редактор}/{картка}`). */
const buildEditsByEditorUpdates = (root, uid, cardIds) => buildOwnerCardUpdates('editsByEditor', root, uid, cardIds);

/** Записи журналу правок, які людина лишила на чужих картках. */
const buildEditsHistoryUpdates = (historyRoot, uid, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(historyRoot || {}).forEach(([cardId, entries]) => {
    if (ids.has(cardId) || !isPlainObject(entries)) return;
    Object.entries(entries).forEach(([entryId, entry]) => {
      if (isPlainObject(entry) && entry.editorUserId === uid) {
        updates[`multiData/editsHistory/${cardId}/${entryId}`] = null;
      }
    });
  });
  return updates;
};

/**
 * Публічні відгуки, які людина писала під чужими картками, і відповіді на
 * них. Прапорець `hasPublicReview` картки правило бази тримає рівним
 * `comments/{id}.hasChildren()`, тож коли під карткою не лишилось нічого,
 * знімаємо й його — інакше картка обіцяла б відгук, якого немає.
 */
const buildPublicCommentUpdates = (commentsRoot, uid, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(commentsRoot || {}).forEach(([profileId, comments]) => {
    if (ids.has(profileId) || !isPlainObject(comments)) return;
    const ownIds = Object.keys(comments).filter(commentId => isPlainObject(comments[commentId]) && comments[commentId].authorId === uid);
    if (!ownIds.length) return;
    ownIds.forEach(commentId => {
      updates[`comments/${profileId}/${commentId}`] = null;
      updates[`replies/${commentId}`] = null;
    });
    if (ownIds.length === Object.keys(comments).length) {
      updates[`matchingCards/${profileId}/hasPublicReview`] = null;
    }
  });
  return updates;
};

/** Чужий спільний доступ до реакцій людини (`profileTechnical/{хто}/multiDataSourceUserIds/{uid}`). */
const buildSharedAccessUpdates = (technicalRoot, uid, cardIds) => {
  const ids = toIdSet(cardIds);
  const updates = {};
  Object.entries(technicalRoot || {}).forEach(([ownerId, technical]) => {
    if (ids.has(ownerId) || !isPlainObject(technical)) return;
    const sources = technical.multiDataSourceUserIds;
    if (!isPlainObject(sources)) return;
    Object.keys(sources).forEach(sourceId => {
      if (sourceId === uid) updates[`profileTechnical/${ownerId}/multiDataSourceUserIds/${sourceId}`] = null;
    });
  });
  return updates;
};

/** Привʼязки Telegram до цього акаунта (`telegramAccounts/{tgId}`). */
const buildTelegramUpdates = (accountsRoot, uid) => {
  const updates = {};
  Object.entries(accountsRoot || {}).forEach(([tgId, account]) => {
    if (!isPlainObject(account)) return;
    if (account.uid === uid) updates[`telegramAccounts/${tgId}`] = null;
    else if (account.previousUid === uid) updates[`telegramAccounts/${tgId}/previousUid`] = null;
  });
  return updates;
};

/** Токени посилань із слотів власниці (`multiData/profileShareSlots/{uid}/{0–4}`). */
const listShareTokens = slots => {
  const values = Array.isArray(slots) ? slots : Object.values(slots || {});
  return values
    .map(slot => (typeof slot === 'string' ? slot : slot && slot.token))
    .filter(token => typeof token === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(token));
};

const chunkUpdates = updates => {
  const entries = Object.entries(updates);
  const chunks = [];
  for (let index = 0; index < entries.length; index += UPDATE_CHUNK) {
    chunks.push(Object.fromEntries(entries.slice(index, index + UPDATE_CHUNK)));
  }
  return chunks;
};

const AUTH_NOT_FOUND = 'auth/user-not-found';

/**
 * Повне видалення. Помилка одного кроку не зупиняє решту — краще стерти все,
 * що можна, ніж лишити половину; про кожен збій кроку повертаємо назву.
 *
 * Акаунт входу на початку **вимикається** (`disabled`): поки сервер стирає,
 * ні новий вхід, ні оновлення токена на іншому пристрої не запишуть анкету
 * назад. Видаляється він лише тоді, коли стерлись власні вузли: інакше
 * людина лишилась би з даними, до яких більше не може увійти, — тоді акаунт
 * вмикаємо назад, і повтор можливий. Що акаунта справді немає, перевіряємо
 * окремим читанням (`getAuthUser` → `auth/user-not-found`), а не довіряємо
 * самій відповіді на видалення.
 *
 * @param {object} deps
 * @param {(path: string) => Promise<any>} deps.read
 * @param {(updates: object) => Promise<void>} deps.update
 * @param {(prefix: string) => Promise<void>} deps.deleteFiles
 * @param {(uid: string, disabled: boolean) => Promise<void>} deps.setAuthDisabled
 * @param {(uid: string) => Promise<void>} deps.deleteAuthUser
 * @param {(uid: string) => Promise<any>} deps.getAuthUser
 * @param {(uid: string) => Promise<void>} [deps.deleteLegacyDocs]
 * @param {string} uid
 */
const deleteAccountData = async (deps, uid) => {
  const { read, update, deleteFiles } = deps;
  const failed = [];
  const counts = {};
  const step = async (name, run) => {
    try {
      await run();
    } catch (error) {
      failed.push(name);
      if (deps.log) deps.log(name, error);
    }
  };
  const apply = async (name, updates) => {
    const chunks = chunkUpdates(updates);
    counts[name] = Object.keys(updates).length;
    for (const chunk of chunks) {
      // eslint-disable-next-line no-await-in-loop
      await update(chunk);
    }
  };
  const sweep = (name, path, build) => step(name, async () => apply(name, build(await read(path))));

  await step('authDisable', () => deps.setAuthDisabled(uid, true));

  // Спершу те, що треба прочитати, поки воно ще лежить.
  const slots = await read(`multiData/profileShareSlots/${uid}`).catch(() => null);
  const drafts = await read(`multiData/profileMutations/${uid}`).catch(() => null);
  const shareTokens = listShareTokens(slots);
  let draftIds = [];
  await step('drafts', async () => { draftIds = await verifyDraftCardIds(deps, uid, drafts); });
  const cardIds = new Set([uid, ...draftIds]);

  await sweep('searchId', 'searchId', root => buildSearchIdUpdates(root, cardIds));
  await sweep('searchKey', 'searchKey/users', root => buildSearchKeyUpdates(root, cardIds));
  await sweep('searchKeySets', 'searchKeySets', root => buildSearchKeySetUpdates(root, cardIds));
  await sweep('identityClaims', 'multiData/profileIdentityClaims', root => buildIdentityClaimUpdates(root, cardIds));
  for (const node of OWNER_CARD_NODES) {
    // eslint-disable-next-line no-await-in-loop
    await sweep(node, `multiData/${node}`, root => buildOwnerCardUpdates(node, root, uid, cardIds));
  }
  await sweep('likedAudience', 'multiData/likedAudience', root => buildLikedAudienceUpdates(root, uid, cardIds));
  await sweep('edits', 'multiData/edits', root => buildEditsUpdates(root, uid, cardIds));
  await sweep('editsByEditor', 'multiData/editsByEditor', root => buildEditsByEditorUpdates(root, uid, cardIds));
  await sweep('editsHistory', 'multiData/editsHistory', root => buildEditsHistoryUpdates(root, uid, cardIds));
  await sweep('publicComments', 'comments', root => buildPublicCommentUpdates(root, uid, cardIds));
  await sweep('sharedAccess', 'profileTechnical', root => buildSharedAccessUpdates(root, uid, cardIds));
  await sweep('telegram', 'telegramAccounts', root => buildTelegramUpdates(root, uid));
  await step('profileShares', async () => {
    const updates = {};
    shareTokens.forEach(token => { updates[`profileShares/${token}`] = null; });
    await apply('profileShares', updates);
  });
  await step('nodes', async () => {
    const updates = {};
    buildOwnedPaths(uid, [...cardIds]).forEach(path => { updates[path] = null; });
    await apply('nodes', updates);
  });
  await step('storage', async () => {
    for (const id of cardIds) {
      // eslint-disable-next-line no-await-in-loop
      await deleteFiles(`avatar/${id}/`);
    }
    for (const token of shareTokens) {
      // eslint-disable-next-line no-await-in-loop
      await deleteFiles(`profileShares/${token}/`);
    }
  });
  if (deps.deleteLegacyDocs) await step('legacyDocs', () => deps.deleteLegacyDocs(uid));

  if (failed.includes('nodes')) {
    await step('authEnable', () => deps.setAuthDisabled(uid, false));
    return { failed, counts, deletedAuth: false };
  }

  await step('auth', async () => {
    try {
      await deps.deleteAuthUser(uid);
    } catch (error) {
      // Повтор після часткового збою: акаунта вже немає — це й потрібно.
      if (!error || error.code !== AUTH_NOT_FOUND) throw error;
    }
    let stillExists = true;
    try {
      await deps.getAuthUser(uid);
    } catch (error) {
      if (error && error.code === AUTH_NOT_FOUND) stillExists = false;
      else throw error;
    }
    if (stillExists) throw new Error('auth user still exists after deleteUser');
  });

  return { failed, counts, deletedAuth: !failed.includes('auth') };
};

module.exports = {
  OWNED_MULTIDATA_NODES,
  OWNER_CARD_NODES,
  PROFILE_NODE_ROOTS,
  PROTECTED_UIDS,
  buildEditsHistoryUpdates,
  buildEditsUpdates,
  buildIdentityClaimUpdates,
  buildLikedAudienceUpdates,
  buildOwnedPaths,
  buildOwnerCardUpdates,
  buildPublicCommentUpdates,
  buildSearchIdUpdates,
  buildSearchKeySetUpdates,
  buildSearchKeyUpdates,
  buildSharedAccessUpdates,
  buildTelegramUpdates,
  deleteAccountData,
  isProtectedUid,
  isValidUid,
  listDraftCardIds,
  listShareTokens,
  verifyDraftCardIds,
};
