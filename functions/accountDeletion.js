'use strict';

/**
 * Самовидалення акаунта: що саме стирається й у якому порядку.
 *
 * Чому на сервері, а не в браузері: анкета акаунта лежить у пʼяти вузлах, а її
 * сліди — ще в двох десятках місць (`searchId`, `searchKey`, реакції, памʼятки,
 * посилання, фото, заявки на унікальність). Частину з них правила бази
 * власникові не відкривають — `searchId` перелічує лише адмін, — тож браузер
 * міг би стерти анкету, лишивши її номер у пошуку, який і далі вів би на
 * порожній id. Адмін-SDK правил не питає, тож тут видалення повне й одним
 * викликом, а правил під нього викочувати не треба.
 *
 * Модуль чистий (без Firebase): `index.js` дає йому базу й сховище, а
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

// `multiData/{вузол}/{uid}` — усе, що власник вів сам (реакції, памʼятки,
// дати, програми, слоти посилань, чернетки), і все, що лежить під його карткою
// (шари доповнень, журнали).
const OWNED_MULTIDATA_NODES = Object.freeze([
  'favorites',
  'dislikes',
  'likedAudience',
  'getInTouch',
  'writer',
  'comments',
  'contactViews',
  'searchQueries',
  'stimulation',
  'stimulationSchedule',
  'stimulationShortcuts',
  'flow',
  'programs',
  'profileShareSlots',
  'profileMutations',
  'profileMutationOwners',
  'profileMutationHistory',
  'edits',
  'editsByEditor',
  'editsHistory',
]);

const isValidUid = uid => typeof uid === 'string' && /^[A-Za-z0-9]{20,128}$/.test(uid);

const isProtectedUid = uid => PROTECTED_UIDS.includes(uid);

/** Шляхи, які видаляються цілком, — один `update` з `null`. */
const buildOwnedPaths = uid => [
  ...PROFILE_NODE_ROOTS.map(root => `${root}/${uid}`),
  ...OWNED_MULTIDATA_NODES.map(node => `multiData/${node}/${uid}`),
  // Публічні відгуки про людину: картки, до якої вони, більше немає.
  `comments/${uid}`,
  // Legacy-копії анкети: застосунок їх не читає, але дані там ще лежать, і
  // «профіль видалено» мусить означати й їх.
  `users/${uid}`,
];

/**
 * Знімає id з одного значення поля `searchId` (`id | [id, ...]`).
 * `undefined` — значення не змінилось.
 */
const stripIdFromSearchIdValue = (value, uid) => {
  if (value === uid) return null;
  if (Array.isArray(value)) {
    if (!value.includes(uid)) return undefined;
    const rest = value.filter(item => item !== uid && item != null);
    if (!rest.length) return null;
    return rest.length === 1 ? rest[0] : rest;
  }
  return undefined;
};

/**
 * Оновлення для `searchId`: ключ — саме значення, поле лежить у ньому, і за тим
 * самим значенням може стояти чужа анкета, тож знімається id, а не ключ.
 * Записи старої форми (рядок чи масив прямо під ключем) — так само.
 */
const buildSearchIdUpdates = (searchIdRoot, uid) => {
  const updates = {};
  Object.entries(searchIdRoot || {}).forEach(([valueKey, entry]) => {
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.entries(entry).forEach(([field, value]) => {
        const next = stripIdFromSearchIdValue(value, uid);
        if (next !== undefined) updates[`searchId/${valueKey}/${field}`] = next;
      });
      return;
    }
    const next = stripIdFromSearchIdValue(entry, uid);
    if (next !== undefined) updates[`searchId/${valueKey}`] = next;
  });
  return updates;
};

/**
 * `searchKey/users/{індекс}/{бакет}/{uid}` — анкети акаунтів живуть у
 * власному корені (`docs/searchKey-index.md`), тож обходиться лише він.
 */
const buildSearchKeyUpdates = (usersRoot, uid) => {
  const updates = {};
  Object.entries(usersRoot || {}).forEach(([indexName, buckets]) => {
    if (!buckets || typeof buckets !== 'object') return;
    Object.entries(buckets).forEach(([bucket, ids]) => {
      if (ids && typeof ids === 'object' && Object.prototype.hasOwnProperty.call(ids, uid)) {
        updates[`searchKey/users/${indexName}/${bucket}/${uid}`] = null;
      }
    });
  });
  return updates;
};

/** Заявки на унікальність, які тримає ця картка (`profileIdentityClaims/{ключ}` = id). */
const buildIdentityClaimUpdates = (claimsRoot, uid) => {
  const updates = {};
  Object.entries(claimsRoot || {}).forEach(([key, owner]) => {
    if (owner === uid) updates[`multiData/profileIdentityClaims/${key}`] = null;
  });
  return updates;
};

/**
 * Обернений перелік «лише для вподобаних»: власниця писала
 * `multiData/likedAudience/{читач}/{власниця}` кожному, кого вподобала.
 */
const buildLikedAudienceUpdates = (favorites, uid) => {
  const updates = {};
  Object.keys(favorites || {}).forEach(readerId => {
    if (/^[A-Za-z0-9_-]{1,128}$/.test(readerId)) {
      updates[`multiData/likedAudience/${readerId}/${uid}`] = null;
    }
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

/**
 * Повне видалення. Помилка одного кроку не зупиняє решту — краще стерти все,
 * що можна, ніж лишити половину; але про кожен збій кроку повертаємо назву,
 * і Auth-акаунт видаляється лише тоді, коли база стерлась: інакше людина
 * лишилась би з даними, до яких більше не може увійти.
 *
 * @param {object} deps
 * @param {(path: string) => Promise<any>} deps.read
 * @param {(updates: object) => Promise<void>} deps.update
 * @param {(prefix: string) => Promise<void>} deps.deleteFiles
 * @param {(uid: string) => Promise<void>} deps.deleteAuthUser
 * @param {string} uid
 */
const deleteAccountData = async (deps, uid) => {
  const { read, update, deleteFiles, deleteAuthUser } = deps;
  const failed = [];
  const step = async (name, run) => {
    try {
      await run();
    } catch (error) {
      failed.push(name);
      if (deps.log) deps.log(name, error);
    }
  };

  // Спершу те, що треба прочитати, поки воно ще лежить.
  const favorites = await read(`multiData/favorites/${uid}`).catch(() => null);
  const slots = await read(`multiData/profileShareSlots/${uid}`).catch(() => null);
  const shareTokens = listShareTokens(slots);

  await step('searchId', async () => {
    const updates = buildSearchIdUpdates(await read('searchId'), uid);
    if (Object.keys(updates).length) await update(updates);
  });
  await step('searchKey', async () => {
    const updates = buildSearchKeyUpdates(await read('searchKey/users'), uid);
    if (Object.keys(updates).length) await update(updates);
  });
  await step('identityClaims', async () => {
    const updates = buildIdentityClaimUpdates(await read('multiData/profileIdentityClaims'), uid);
    if (Object.keys(updates).length) await update(updates);
  });
  await step('likedAudience', async () => {
    const updates = buildLikedAudienceUpdates(favorites, uid);
    if (Object.keys(updates).length) await update(updates);
  });
  await step('profileShares', async () => {
    if (!shareTokens.length) return;
    const updates = {};
    shareTokens.forEach(token => { updates[`profileShares/${token}`] = null; });
    await update(updates);
  });
  await step('nodes', async () => {
    const updates = {};
    buildOwnedPaths(uid).forEach(path => { updates[path] = null; });
    await update(updates);
  });
  await step('storage', async () => {
    await deleteFiles(`avatar/${uid}/`);
    for (const token of shareTokens) {
      // eslint-disable-next-line no-await-in-loop
      await deleteFiles(`profileShares/${token}/`);
    }
  });

  const databaseCleared = !failed.includes('nodes');
  if (databaseCleared) {
    await step('auth', () => deleteAuthUser(uid));
  }

  return { failed, deletedAuth: databaseCleared && !failed.includes('auth') };
};

module.exports = {
  OWNED_MULTIDATA_NODES,
  PROFILE_NODE_ROOTS,
  PROTECTED_UIDS,
  buildIdentityClaimUpdates,
  buildLikedAudienceUpdates,
  buildOwnedPaths,
  buildSearchIdUpdates,
  buildSearchKeyUpdates,
  deleteAccountData,
  isProtectedUid,
  isValidUid,
  listShareTokens,
};
