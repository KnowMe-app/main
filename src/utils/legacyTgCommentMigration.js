import {
  addPublicProfileCommentAs,
  auth,
  deleteCommentByOwner,
  fetchOwnerCommentsSubtree,
  fetchPublicProfileCommentsStrict,
  readOwnerWriterMapStrict,
} from 'components/config';
import { getCurrentValue } from 'components/getCurrentValue';
import { isAdminUid } from './accessLevel';

/**
 * Відгуки про TG-картки лежать не там, де мали б.
 *
 * Картки з id виду `TG0001` заведені імпортом з таблиці: разом з анкетою в базу
 * поїхав і текст відгуку — але поїхав він у `multiData/comments/{ownerId}/{cardId}`,
 * тобто в **особисту** нотатку того, хто імпортував. А насправді це відгук
 * агенції про донорку: його писала не адміністраторка «собі на памʼять», і
 * бачити його мусить кожен, хто відкриє анкету, а не один власник нотатки.
 *
 * Публічні відгуки живуть у власному дереві `comments/{profileId}/{commentId}`
 * (див. `PUBLIC_COMMENTS_ROOT_PATH` у `config.js`) — туди цей модуль їх і
 * переносить, не заводячи ані третього сховища, ані окремої форми запису.
 *
 * Дві речі, яких перенос зробити не може, і тому вони вирішені явно:
 *
 *   — **автора немає в базі.** На момент відгуку людина акаунта не мала, тож
 *     справжнього `authorId` не існує. Підписати відгук адміном, який тисне
 *     кнопку, означало б приписати йому чужі слова, тому `authorId` тут
 *     синтетичний (`makeLegacyCommentAuthorId`), а імʼя береться з позначки
 *     `writer` — єдиного, що про автора відомо;
 *   — **міграція мусить бути повторюваною.** Її запускають з телефона, вона
 *     довга, і половина її може не доїхати. Тому синтетичний id виводиться з
 *     імені автора (той самий автор — той самий id, скільки б разів не
 *     запускали), а вже перенесений відгук упізнається за текстом
 *     (`normalizeCommentTextKey`) і вдруге не пишеться.
 */

/** `TG` великими й далі самі цифри — рівно те, чим імпорт назвав ці картки. */
export const TG_LEGACY_USER_ID_PATTERN = /^TG\d+$/;

export const isTgLegacyUserId = userId => TG_LEGACY_USER_ID_PATTERN.test(String(userId || '').trim());

/**
 * Синтетичний автор — не uid і не може ним стати.
 *
 * Firebase-Auth UID — це 28 символів [A-Za-z0-9], тож префікс із дефісом
 * гарантує, що синтетичний id не збігається з жодним живим акаунтом: ані
 * «власним» відгук не стане нікому, ані чужий акаунт не отримає чужих слів.
 */
export const LEGACY_COMMENT_AUTHOR_ID_PREFIX = 'legacy-tg-';

/**
 * Один автор — один id, і між запусками він не змінюється.
 *
 * Випадкове число дало б те саме («автор без акаунта»), але кожен повторний
 * запуск вигадував би нову людину, а два відгуки однієї агенції виглядали б як
 * два різні автори. Тому id виводиться з самого імені: воно і є тим, чим автор
 * тут відрізняється від інших.
 */
export const makeLegacyCommentAuthorId = seed => {
  const source = String(seed || '').trim().toLowerCase() || 'anonymous';
  // FNV-1a: коротка, стабільна й без залежностей — від неї потрібна лише
  // однакова відповідь на однаковий рядок, а не криптостійкість.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${LEGACY_COMMENT_AUTHOR_ID_PREFIX}${hash.toString(36)}${source.length.toString(36)}`;
};

/** Ключ звірки «цей текст уже перенесено»: пробіли й регістр тут не різниця. */
export const normalizeCommentTextKey = text => String(text || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/**
 * Позначка `writer` приїжджає і рядком, і масивом версій.
 *
 * Масив у полі анкети — це історія, і поточне значення в ній останнє
 * (`getCurrentValue`), а не «перше непорожнє». Стерта позначка означає, що
 * автора ми не знаємо, — і тоді відгук їде без імені, а не з попереднім.
 */
export const resolveWriterName = value => String(getCurrentValue(value) || '').trim();

/**
 * Власник, чиї імпортовані нотатки перевіряє міграція.
 *
 * Читати корінь `multiData/comments` не можна — правила дають лише піддерево
 * названого власника. Ним є `stFMfZ8CqQX05L8vK9Yse6FdYIh1` — власник, під
 * яким імпорт з таблиці складає і коментарі, і дизлайки
 * (`EXCEL_COMMENTS_OWNER_ID` в `AddNewProfile.jsx`), тобто найімовірніше місце,
 * де відгуки TG-карток і лежать. Інші власники навмисно не підтримуються:
 * TG-id сам по собі не доводить, що нотатка була частиною імпорту.
 */
export const LEGACY_IMPORT_COMMENT_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';

// The importer's subtree is the provenance marker.  Admin subtrees contain
// ordinary private notes and must never be inferred to be import data merely
// because their target card happens to have a TG id.
export const resolveMigrationOwnerIds = () => [LEGACY_IMPORT_COMMENT_OWNER_ID];

/**
 * План переносу — окремо від самого переносу.
 *
 * Рішення тут ухвалюються без жодного запиту, тому їх видно тестам поштучно:
 * що поїде, що вже публічне, що не TG, що порожнє. Запис лише виконує план.
 *
 * @param {Object} params
 * @param {Object} params.privateComments `{ ownerId: { cardId: { text, updatedAt } } }`
 * @param {Object} params.writers `{ ownerId: { cardId: writer } }`
 * @param {Object} params.existingPublicComments `{ profileId: [{ text }] }`
 */
export const planLegacyTgCommentMigration = ({
  privateComments = {},
  writers = {},
  existingPublicComments = {},
} = {}) => {
  const byProfileAndText = new Map();
  const skipped = { notTg: 0, emptyText: 0 };

  Object.entries(privateComments || {}).forEach(([ownerId, ownerComments]) => {
    // Only the fixed spreadsheet-import owner is a reliable legacy marker.
    // Notes under admins' ordinary owner IDs may be genuinely private.
    if (ownerId !== LEGACY_IMPORT_COMMENT_OWNER_ID) return;
    Object.entries(ownerComments || {}).forEach(([cardId, entry]) => {
      if (!isTgLegacyUserId(cardId)) {
        skipped.notTg += 1;
        return;
      }

      const text = String(entry?.text || '').trim();
      if (!text) {
        skipped.emptyText += 1;
        return;
      }

      const textKey = normalizeCommentTextKey(text);
      const key = `${cardId}::${textKey}`;
      const existing = byProfileAndText.get(key);
      if (existing) {
        // Той самий відгук у двох власників — це одна копія, а не дві: у
        // публічне дерево він їде один раз, а приватних оригіналів прибрати
        // треба обидва.
        existing.ownerIds.push(ownerId);
        return;
      }

      const writerName = resolveWriterName(writers?.[ownerId]?.[cardId]);
      byProfileAndText.set(key, {
        profileId: cardId,
        text,
        textKey,
        authorName: writerName,
        authorId: makeLegacyCommentAuthorId(writerName || cardId),
        createdAt: Number(entry?.updatedAt) > 0 ? Number(entry.updatedAt) : 0,
        ownerIds: [ownerId],
      });
    });
  });

  // Імʼя автора могло лишитись у позначці іншого власника — картку писала одна
  // людина, а нотатку з відгуком імпортували під іншим id.
  byProfileAndText.forEach(entry => {
    if (entry.authorName) return;
    const fallbackOwnerId = Object.keys(writers || {})
      .find(ownerId => resolveWriterName(writers[ownerId]?.[entry.profileId]));
    if (!fallbackOwnerId) return;
    entry.authorName = resolveWriterName(writers[fallbackOwnerId][entry.profileId]);
    entry.authorId = makeLegacyCommentAuthorId(entry.authorName);
  });

  const publicTextKeys = new Map();
  Object.entries(existingPublicComments || {}).forEach(([profileId, comments]) => {
    publicTextKeys.set(
      profileId,
      new Set((comments || []).map(comment => normalizeCommentTextKey(comment?.text))),
    );
  });

  const entries = [];
  const duplicates = [];
  [...byProfileAndText.values()]
    .sort((left, right) => (
      left.profileId.localeCompare(right.profileId) || left.textKey.localeCompare(right.textKey)
    ))
    .forEach(entry => {
      if (publicTextKeys.get(entry.profileId)?.has(entry.textKey)) duplicates.push(entry);
      else entries.push(entry);
    });

  return { entries, duplicates, skipped };
};

/** Картки, чиї відгуки перенос узагалі розглядає. */
export const listTgProfileIds = (privateComments = {}) => [...new Set(
  Object.values(privateComments || {})
    .flatMap(ownerComments => Object.keys(ownerComments || {}))
    .filter(isTgLegacyUserId),
)].sort();

const removePrivateOriginals = async entry => {
  const removed = [];
  for (const ownerId of entry.ownerIds) {
    // Послідовно й поштучно: видалення чужої нотатки — окреме право, і
    // провалене прибирання не мусить зупиняти перенос решти.
    // eslint-disable-next-line no-await-in-loop
    const done = await deleteCommentByOwner({ ownerId, cardId: entry.profileId });
    if (done) removed.push(ownerId);
  }
  return removed;
};

/**
 * Перенести відгуки TG-карток з особистих нотаток у публічні коментарі.
 *
 * @param {Object} params
 * @param {boolean} [params.removePrivate] прибирати приватний оригінал після переносу
 * @param {Function} [params.onProgress] `({ processed, total })`
 */
export const migrateLegacyTgCommentsToPublic = async ({
  removePrivate = true,
  onProgress,
} = {}) => {
  const viewerId = auth.currentUser?.uid;
  if (!viewerId) throw new Error('User not authenticated');
  // Перенос пише відгуки від чужого імені — це право самих лише адмінів, і
  // питати про нього базу посеред пачки записів пізно.
  if (!isAdminUid(viewerId)) throw new Error('Міграцію коментарів запускає лише адмін');

  const owners = resolveMigrationOwnerIds();
  const privateComments = {};
  const writers = {};
  const unreadableOwnerIds = [];

  await Promise.all(owners.map(async ownerId => {
    try {
      const [comments, writerMap] = await Promise.all([
        fetchOwnerCommentsSubtree(ownerId),
        readOwnerWriterMapStrict(ownerId),
      ]);
      privateComments[ownerId] = comments || {};
      writers[ownerId] = writerMap || {};
    } catch (error) {
      // Без обох піддерев походження й авторство не перевірені, тому жоден
      // запис цього власника не планується і тим більше не видаляється.
      console.warn('[legacyTgComments] піддерево власника не прочитано', { ownerId, error });
      unreadableOwnerIds.push(ownerId);
    }
  }));

  const profileIds = listTgProfileIds(privateComments);
  const existingPublicComments = profileIds.length
    ? await fetchPublicProfileCommentsStrict(profileIds)
    : {};

  const { entries, duplicates, skipped } = planLegacyTgCommentMigration({
    privateComments,
    writers,
    existingPublicComments,
  });

  const total = entries.length;
  const failures = [];
  let written = 0;
  let removed = 0;
  let processed = 0;

  for (const entry of entries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await addPublicProfileCommentAs({
        profileId: entry.profileId,
        text: entry.text,
        authorId: entry.authorId,
        authorName: entry.authorName,
        createdAt: entry.createdAt,
      });
      written += 1;
      // Приватний оригінал прибирається лише після вдалого публічного запису:
      // інакше невдалий перенос коштував би самого відгуку.
      // eslint-disable-next-line no-await-in-loop
      if (removePrivate) removed += (await removePrivateOriginals(entry)).length;
    } catch (error) {
      failures.push({ profileId: entry.profileId, message: error?.message || String(error) });
    }
    processed += 1;
    onProgress?.({ processed, total });
  }

  // Уже публічний відгук — це вдалий перенос, який колись не дочистив за собою
  // приватний оригінал. Дочищаємо тепер, нічого не переписуючи.
  for (const entry of duplicates) {
    // eslint-disable-next-line no-await-in-loop
    if (removePrivate) removed += (await removePrivateOriginals(entry)).length;
  }

  return {
    total,
    written,
    removed,
    alreadyPublic: duplicates.length,
    failed: failures.length,
    failures,
    skipped,
    profileIds,
    ownerIds: owners,
    unreadableOwnerIds,
  };
};

/**
 * Публічні відгуки з однієї картки в іншу — для дублікатів.
 *
 * Порівняння дублікатів переносить між картками поля анкети й особисту
 * нотатку, а публічні відгуки не переносило взагалі: злиття двох карток в одну
 * лишало відгуки на тій, яку закривають. Копія зберігає автора, імʼя й дату —
 * відгук не змінює ані авторства, ані місця в порядку, — а те, що на картці
 * вже є, вдруге не пишеться.
 */
export const copyPublicCommentsBetweenCards = async ({ sourceProfileId, targetProfileId }) => {
  const source = String(sourceProfileId || '').trim();
  const target = String(targetProfileId || '').trim();
  if (!source || !target) throw new Error('sourceProfileId і targetProfileId обовʼязкові');
  if (source === target) return { copied: 0, skipped: 0 };

  const viewerId = auth.currentUser?.uid;
  if (!viewerId) throw new Error('User not authenticated');
  if (!isAdminUid(viewerId)) throw new Error('Публічні коментарі між картками переносить лише адмін');

  const byProfile = await fetchPublicProfileCommentsStrict([source, target]);
  const targetKeys = new Set((byProfile[target] || []).map(comment => normalizeCommentTextKey(comment?.text)));

  let copied = 0;
  let skipped = 0;
  for (const comment of byProfile[source] || []) {
    const textKey = normalizeCommentTextKey(comment?.text);
    if (!textKey || targetKeys.has(textKey)) {
      skipped += 1;
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    await addPublicProfileCommentAs({
      profileId: target,
      text: comment.text,
      authorId: comment.authorId,
      authorName: comment.authorName,
      createdAt: comment.createdAt,
    });
    targetKeys.add(textKey);
    copied += 1;
  }

  return { copied, skipped };
};
