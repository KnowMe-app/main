import {
  addPublicProfileCommentAs,
  auth,
  deleteCommentByOwner,
  fetchOwnerCommentsSubtree,
  fetchPublicProfileCommentsStrict,
  readOwnerWriterMapStrict,
} from 'components/config';
import { getCurrentValue } from 'components/getCurrentValue';
import { ADMIN_UIDS, isAdminUid } from './accessLevel';

/**
 * Відгуки про картки, заведені імпортом, лежать не там, де мали б.
 *
 * Картки з id виду `TG0001` і `ID0001` заведені імпортом з таблиці: разом з
 * анкетою в базу поїхав і текст відгуку — але поїхав він у
 * `multiData/comments/{ownerId}/{cardId}`, тобто в **особисту** нотатку того,
 * хто імпортував. А насправді це відгук агенції про донорку: його писала не
 * адміністраторка «собі на памʼять», і бачити його мусить кожен, хто відкриє
 * анкету, а не один власник нотатки.
 *
 * Публічні відгуки живуть у власному дереві `comments/{profileId}/{commentId}`
 * (див. `PUBLIC_COMMENTS_ROOT_PATH` у `config.js`) — туди цей модуль їх і
 * переносить, не заводячи ані третього сховища, ані окремої форми запису.
 *
 * Партія карток задається префіксом id (`TG`, `ID`), і це параметр, а не дві
 * копії коду: партії відрізняються самим лише префіксом, тож друга копія
 * розійшлася б з першою на першій же правці.
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

/** Партії карток, заведених імпортом: префікс id і далі самі цифри. */
export const LEGACY_IMPORT_ID_PREFIXES = Object.freeze(['TG', 'ID']);

export const DEFAULT_LEGACY_IMPORT_ID_PREFIX = LEGACY_IMPORT_ID_PREFIXES[0];

/**
 * Префікс іде в регулярку, тож приймається лише те, що нею бути не може:
 * самі великі літери. Інакше довільний рядок з `.` чи `|` мовчки розширив би
 * перенос на картки, яких ніхто не називав.
 */
export const makeLegacyImportUserIdPattern = prefix => {
  const normalized = String(prefix || '').trim();
  if (!/^[A-Z]+$/.test(normalized)) {
    throw new Error(`Префікс партії має бути з великих літер, а не «${prefix}»`);
  }
  return new RegExp(`^${normalized}\\d+$`);
};

export const isLegacyImportUserId = (userId, prefix = DEFAULT_LEGACY_IMPORT_ID_PREFIX) => (
  makeLegacyImportUserIdPattern(prefix).test(String(userId || '').trim())
);

/**
 * Синтетичний автор — не uid і не може ним стати.
 *
 * Firebase-Auth UID — це 28 символів [A-Za-z0-9], тож префікс із дефісом
 * гарантує, що синтетичний id не збігається з жодним живим акаунтом: ані
 * «власним» відгук не стане нікому, ані чужий акаунт не отримає чужих слів.
 *
 * Партії картки в цьому префіксі немає навмисно: та сама агенція писала і про
 * TG-картки, і про ID-картки, і в обох партіях це одна людина, а не дві.
 */
export const LEGACY_COMMENT_AUTHOR_ID_PREFIX = 'legacy-author-';

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

/**
 * Автор партії — коли автора немає в самих нотатках.
 *
 * `writer` доводить походження нотатки, але записує його не кожен імпорт:
 * партія з таблиці (`handleExcelProfilesUpload`) кладе картку, коментар і
 * дизлайк, і жодної позначки. Проте походження в неї доведене інакше й
 * надійніше за позначку: ці нотатки лежать у піддереві імпортера
 * (`LEGACY_IMPORT_COMMENT_OWNER_ID`) — тому самому, куди імпорт їх і поклав, —
 * а особисті нотатки адміністраторки живуть під її власним uid, якого міграція
 * не читає взагалі (`resolveMigrationOwnerIds`).
 *
 * Тож автор такої партії — сама партія: відгук підписується її префіксом, а не
 * вигаданим імʼям і не адміном, який тиснув кнопку. Партія без запису тут
 * лишається під гейтом: TG-картки позначку мають, і підміняти її нема чого.
 */
export const LEGACY_IMPORT_BATCH_WRITERS = Object.freeze({ ID: 'ID' });

export const resolveBatchWriterName = prefix => (
  LEGACY_IMPORT_BATCH_WRITERS[String(prefix || '').trim()] || ''
);

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
 * Власники, чиї нотатки перевіряє міграція.
 *
 * Читати корінь `multiData/comments` не можна — правила дають лише піддерево
 * названого власника, — тож список власників мусить бути явним. У ньому:
 * той, хто тисне кнопку; обидва адміни; і `stFMfZ8CqQX05L8vK9Yse6FdYIh1` —
 * власник, під яким імпорт з таблиці складає і коментарі, і дизлайки
 * (`EXCEL_COMMENTS_OWNER_ID` в `AddNewProfile.jsx`), тобто найімовірніше місце,
 * де відгуки імпортованих карток і лежать.
 */
export const LEGACY_IMPORT_COMMENT_OWNER_ID = 'stFMfZ8CqQX05L8vK9Yse6FdYIh1';

// Лише піддерево імпортера доводить походження відгуку. Адмінські піддерева
// містять також звичайні приватні нотатки й не мають потрапляти до міграції.
export const resolveMigrationOwnerIds = () => [LEGACY_IMPORT_COMMENT_OWNER_ID];

// `writer` записується під uid користувача, який зберігав анкету, а не
// обов'язково під власником імпортованого коментаря. Тому джерела метаданих
// автора ширші за безпечне джерело самих коментарів.
export const resolveMigrationWriterOwnerIds = (extraOwnerIds = [], viewerId = '') => [...new Set([
  LEGACY_IMPORT_COMMENT_OWNER_ID,
  String(viewerId || '').trim(),
  ...ADMIN_UIDS,
  ...(extraOwnerIds || []).map(id => String(id || '').trim()),
].filter(Boolean))];

/**
 * План переносу — окремо від самого переносу.
 *
 * Рішення тут ухвалюються без жодного запиту, тому їх видно тестам поштучно:
 * що поїде, що вже публічне, що не з цієї партії, що порожнє. Запис лише
 * виконує план.
 *
 * @param {Object} params
 * @param {Object} params.privateComments `{ ownerId: { cardId: { text, updatedAt } } }`
 * @param {Object} params.writers `{ ownerId: { cardId: writer } }`
 * @param {Object} params.existingPublicComments `{ profileId: [{ text }] }`
 * @param {string} [params.prefix] префікс партії карток (`TG`, `ID`)
 */
export const planLegacyImportCommentMigration = ({
  privateComments = {},
  writers = {},
  existingPublicComments = {},
  prefix = DEFAULT_LEGACY_IMPORT_ID_PREFIX,
  allowMissingWriter = false,
} = {}) => {
  const pattern = makeLegacyImportUserIdPattern(prefix);
  const batchWriterName = resolveBatchWriterName(prefix);
  const byProfileAndText = new Map();
  const skipped = { otherPrefix: 0, emptyText: 0, unverifiedWriter: 0 };
  // Не лише лічильник: відкинуте показується людині, яка вирішує, публікувати
  // його чи ні. Саме число «пропущено 25» цього рішення ухвалити не дає.
  const unverified = [];

  Object.entries(privateComments || {}).forEach(([ownerId, ownerComments]) => {
    Object.entries(ownerComments || {}).forEach(([cardId, entry]) => {
      if (!pattern.test(String(cardId || '').trim())) {
        skipped.otherPrefix += 1;
        return;
      }

      const text = String(entry?.text || '').trim();
      if (!text) {
        skipped.emptyText += 1;
        return;
      }

      // Сам префікс картки не доводить, що нотатка приїхала з імпорту.
      // `writer` — збережена імпортером ознака джерела; без неї приватний
      // текст може бути звичайною особистою нотаткою й публікувати його не можна.
      //
      // Але доказ цей є не в кожної партії: імпорт з таблиці
      // (`handleExcelProfilesUpload`) записує картку, коментар і дизлайк — і
      // жодного `writer`. Такій партії автора дає вона сама
      // (`LEGACY_IMPORT_BATCH_WRITERS`) — походження там доводить піддерево
      // імпортера, а не позначка. Партія без такого запису лишається під
      // гейтом, і знімає його не код, а людина: `allowMissingWriter`
      // ставиться лише після підтвердження, у якому видно самі тексти.
      const writerName = resolveWriterName(writers?.[ownerId]?.[cardId]) || batchWriterName;
      if (!writerName && !allowMissingWriter) {
        skipped.unverifiedWriter += 1;
        unverified.push({ profileId: cardId, ownerId, text });
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

  return { entries, duplicates, skipped, unverified };
};

/** Картки партії, чиї відгуки перенос узагалі розглядає. */
export const listLegacyImportProfileIds = (
  privateComments = {},
  prefix = DEFAULT_LEGACY_IMPORT_ID_PREFIX,
) => {
  const pattern = makeLegacyImportUserIdPattern(prefix);
  return [...new Set(
    Object.values(privateComments || {})
      .flatMap(ownerComments => Object.keys(ownerComments || {}))
      .filter(cardId => pattern.test(String(cardId || '').trim())),
  )].sort();
};

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
 * Відмова бази — найімовірніша причина невдалого переносу, і причина ця не в
 * коді: правило `comments/$profileId/$commentId/authorId` пускає чужого автора
 * лише адміну, а правила викочуються **руками** (`firebase deploy --only
 * database`). Поки вони не в проді, кожен запис відповідає `PERMISSION_DENIED`,
 * і сказати це людині мусить сам перенос — інакше звіт «перенесено 0/1» не
 * пояснює нічого.
 */
export const isPermissionDeniedFailure = failure => (
  /permission[_\s]?denied/i.test(`${failure?.code || ''} ${failure?.message || ''}`)
);

/**
 * Перенести відгуки імпортованих карток з особистих нотаток у публічні.
 *
 * @param {Object} params
 * @param {string} [params.prefix] префікс партії карток (`TG`, `ID`)
 * @param {string[]} [params.ownerIds] додаткові власники метаданих `writer`
 * @param {boolean} [params.removePrivate] прибирати приватний оригінал після переносу
 * @param {boolean} [params.allowMissingWriter] публікувати й нотатки без `writer`
 * @param {Function} [params.confirmMissingWriter] `({ count, samples })` → чи публікувати такі
 * @param {Function} [params.onProgress] `({ processed, total })`
 */
export const migrateLegacyImportCommentsToPublic = async ({
  prefix = DEFAULT_LEGACY_IMPORT_ID_PREFIX,
  ownerIds = [],
  removePrivate = true,
  allowMissingWriter = false,
  confirmMissingWriter,
  onProgress,
} = {}) => {
  // Кидається до першого запиту: хибний префікс мусить упасти тут, а не
  // обернутись тихим «переносити нічого».
  makeLegacyImportUserIdPattern(prefix);
  const viewerId = auth.currentUser?.uid;
  if (!viewerId) throw new Error('User not authenticated');
  // Перенос пише відгуки від чужого імені — це право самих лише адмінів, і
  // питати про нього базу посеред пачки записів пізно.
  if (!isAdminUid(viewerId)) throw new Error('Міграцію коментарів запускає лише адмін');

  const owners = resolveMigrationOwnerIds(ownerIds, viewerId);
  const writerOwners = resolveMigrationWriterOwnerIds(ownerIds, viewerId);
  const privateComments = {};
  const unreadableOwnerIds = [];

  await Promise.all(owners.map(async ownerId => {
    try {
      const comments = await fetchOwnerCommentsSubtree(ownerId);
      privateComments[ownerId] = comments || {};
    } catch (error) {
      // Чужий власник читається лише адміном, і відмова тут — не поломка
      // міграції, а відповідь «сюди тобі не можна». Решта власників їде далі.
      console.warn('[legacyImportComments] піддерево власника не прочитано', { ownerId, error });
      unreadableOwnerIds.push(ownerId);
    }
  }));

  // Помилка читання тут не є «writer відсутній»: без надійної атрибуції
  // міграція не повинна ані публікувати, ані видаляти приватний оригінал.
  const writerMaps = await Promise.all(writerOwners.map(readOwnerWriterMapStrict));
  const writers = {
    [LEGACY_IMPORT_COMMENT_OWNER_ID]: Object.assign({}, ...writerMaps),
  };

  const profileIds = listLegacyImportProfileIds(privateComments, prefix);
  const existingPublicComments = profileIds.length
    ? await fetchPublicProfileCommentsStrict(profileIds)
    : {};

  const planFor = allowed => planLegacyImportCommentMigration({
    privateComments,
    writers,
    existingPublicComments,
    prefix,
    allowMissingWriter: allowed,
  });

  let plan = planFor(allowMissingWriter);
  let includedWithoutWriter = allowMissingWriter;

  // Партія без жодного `writer` — це не «переносити нічого», а питання до
  // людини: опублікувати ці нотатки чи ні. Питається воно один раз на прогін,
  // уже з прочитаними даними, і показує самі тексти — бо рішення тут саме про
  // них, а не про число.
  if (!allowMissingWriter && plan.unverified.length && confirmMissingWriter) {
    const approved = await confirmMissingWriter({
      prefix,
      count: plan.unverified.length,
      samples: plan.unverified.slice(0, 3).map(({ profileId, text }) => ({ profileId, text })),
    });
    if (approved) {
      plan = planFor(true);
      includedWithoutWriter = true;
    }
  }

  const { entries, duplicates, skipped } = plan;

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
      // Код відмови зберігається окремо від тексту: саме за ним звіт відрізняє
      // «правила не викочені» від решти помилок.
      failures.push({
        profileId: entry.profileId,
        code: error?.code || '',
        message: error?.message || String(error),
      });
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
    prefix,
    includedWithoutWriter,
    unverified: plan.unverified.length,
    total,
    written,
    removed,
    alreadyPublic: duplicates.length,
    failed: failures.length,
    failures,
    permissionDenied: failures.some(isPermissionDeniedFailure),
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
