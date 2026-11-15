'use strict';

/**
 * Сповіщення донорці, що її анкету вподобали (Telegram і push на пристрої).
 *
 * Що розкривається — **лише кількість**, без того, хто вподобав (рішення
 * власниці продукту, 14.11): у звичайній публікації реакції таємниця
 * (`utils/likedAudience.js`), і агенція, ставлячи серце, не погоджувалась,
 * щоб донорка знала її імʼя. «Вашу анкету вподобали. Усього вподобань: N» каже
 * донорці, що анкета працює, і нікого не називає.
 *
 * **Поки що рахуються лише серця двох повних адмінів** (`NOTIFYING_LIKER_UIDS`):
 * сценарій тестується на живих донорках, перш ніж відкрити його всім. Розширити —
 * значить змінити `isNotifyingLiker`, а не логіку нижче.
 *
 * Кому: картка — анкета акаунта (Auth-акаунт з таким uid існує; картки імпорту
 * `TG…`/`ID…` акаунта не мають), і серед її ролей є донорка (`ed`). Реакція на
 * анкету іншої ролі (`'ag'` у значенні — вподобано агентську анкету
 * донорки-агентки, `utils/anketaReactions.js`) сповіщення не дає.
 *
 * Скільки разів: на кожного, хто вподобав, — один раз назавжди
 * (`likeNotifications/{картка}/likers/{хто}`). Зняв серце й поставив знову —
 * нового сповіщення немає: інакше два дотики давали б «2 вподобання».
 *
 * Вузол `likeNotifications` і токени пристроїв на сервері читає лише ця
 * функція; `likeNotifications` у правилах немає (корінь закритий).
 *
 * Модуль — чиста логіка з підставними залежностями (`deps`), як `telegramAuth`.
 */

const LIKE_NOTIFICATIONS_ROOT = 'likeNotifications';
const PUSH_TOKENS_ROOT = 'pushTokens';
const FAVORITES_ROOT = 'multiData/favorites';
const NOTIFICATION_URL = 'https://knowme.pp.ua/my-profile';

// Ті самі два повні адміни, що й `ADMIN_UIDS` у `src/utils/accessLevel.js`.
// Інспектора (лише читання) тут немає навмисно: це тестовий акаунт, і його
// серця не мусять писати справжнім доноркам.
const NOTIFYING_LIKER_UIDS = Object.freeze(['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2']);

const isNotifyingLiker = uid => NOTIFYING_LIKER_UIDS.includes(uid);

/**
 * **Тестовий режим** (14.11, на прохання власниці продукту): поки він `true`,
 * **кожен** лайк адміна шле сповіщення (без «раз на того, хто вподобав»), а
 * кожен дизлайк адміна — тестовий push «Не цікаво». Так сценарій можна
 * перевіряти скільки завгодно разів на тій самій картці.
 *
 * Дизлайк іде **лише push**, не в Telegram: push отримує лише та, хто сама
 * ввімкнула сповіщення в «Моєму профілі», а бот написав би кожній донорці,
 * що входила через Telegram, — і справжня донорка дізналася б, що адмін
 * позначив її «Не цікаво».
 *
 * Перед відкриттям для всіх — `false`: лишається один раз від акаунта, а
 * дизлайки не шлють нічого.
 */
const ADMIN_TEST_MODE = true;

const DONOR_ROLE = 'ed';

const normalizeRoles = role => {
  const list = Array.isArray(role) ? role : String(role || '').split(',');
  return list.map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
};

// Список ролей анкет у значенні реакції (`utils/anketaReactions.js`):
// `'ed'`, `'ag'`, `'ed,ag'`. Будь-яке інше непорожнє значення (`true`, мітка
// часу) — реакція на людину цілком, тобто й на донорську анкету.
const ROLE_LIST_RE = /^[a-z]{2}(,[a-z]{2})*$/;

/** Чи покриває значення реакції донорську анкету. */
const reactionCoversDonor = value => {
  if (value === null || value === undefined || value === false || value === '') return false;
  if (typeof value === 'string' && ROLE_LIST_RE.test(value.trim())) {
    return value.trim().split(',').includes(DONOR_ROLE);
  }
  return true;
};

/**
 * Нове серце донорській анкеті: до запису значення її не покривало, після —
 * покриває. Не «на картці не було жодної реакції»: донорка-агентка, якій
 * спершу вподобали агентську анкету (`'ag'`), а потім і донорську, отримує
 * перехід `'ag'` → мітка часу (обидві анкети, `toggleAnketaReactionValue`), і
 * перевірка «чи було щось до запису» це серце пропускала.
 */
const isNewDonorReaction = (before, after) => !reactionCoversDonor(before) && reactionCoversDonor(after);

const LIKE_TEXTS = Object.freeze({
  title: 'Вашу анкету вподобали 💛',
  body: count => (count > 1
    ? `Вашу анкету на KnowMe вподобали. Усього вподобань: ${count}.`
    : 'Вашу анкету на KnowMe вподобали.'),
  telegram: count => `💛 ${count > 1
    ? `Вашу анкету на KnowMe вподобали. Усього вподобань: ${count}.`
    : 'Вашу анкету на KnowMe вподобали.'}\n\nХто саме — не показуємо: реакції в KnowMe анонімні.`,
  button: 'Відкрити KnowMe',
  // Лише тестовий режим: справжнім доноркам дизлайки не повідомляються.
  dislikeTitle: 'Тест: «Не цікаво»',
  dislikeBody: 'Адмін позначив вашу анкету «Не цікаво». Це тестове сповіщення.',
});

/**
 * Записує, що `likerId` вподобав картку, і віддає нову кількість — або `0`,
 * коли цей читач уже рахувався (повтор чи повтор події).
 */
const recordLike = async (cardId, likerId, { db, now }, { allowRepeat = false } = {}) => {
  let count = 0;
  const result = await db.transaction(`${LIKE_NOTIFICATIONS_ROOT}/${cardId}`, current => {
    const record = current && typeof current === 'object' ? current : {};
    const likers = record.likers && typeof record.likers === 'object' ? record.likers : {};
    if (likers[likerId]) {
      // Тестовий режим: повтор теж шле — з тією самою кількістю.
      count = allowRepeat ? Object.keys(likers).length : 0;
      return undefined;
    }
    const nextLikers = { ...likers, [likerId]: now };
    count = Object.keys(nextLikers).length;
    return { ...record, likers: nextLikers, count, lastAt: now };
  });
  return result.committed || allowRepeat ? count : 0;
};

/** Чат Telegram донорки: приватний чат бота = id акаунта Telegram. */
const findTelegramChatId = async (uid, { db }) => {
  const accounts = await db.queryByChild('telegramAccounts', 'uid', uid);
  const tgId = Object.keys(accounts || {}).find(key => accounts[key] && accounts[key].uid === uid);
  return tgId || null;
};

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Push на всі зареєстровані пристрої; мертві токени знімаються. */
const sendPushToAccount = async (uid, count, deps, data = null) => {
  const { db, sendPush } = deps;
  const tokensNode = await db.get(`${PUSH_TOKENS_ROOT}/${uid}`);
  const tokens = Object.keys(tokensNode && typeof tokensNode === 'object' ? tokensNode : {});
  if (!tokens.length) return { sent: 0, removed: 0 };
  // Лише `data`: показує сповіщення наш service worker (`src/service-worker.js`,
  // подія `push`), а не бібліотека Firebase у воркері, — тож блок
  // `notification` тут дав би на частині браузерів друге сповіщення.
  const responses = await sendPush({
    tokens,
    data: data || {
      kind: 'like',
      title: LIKE_TEXTS.title,
      body: LIKE_TEXTS.body(count),
      url: NOTIFICATION_URL,
      count: String(count),
    },
  });
  const dead = tokens.filter((token, index) => {
    const response = responses[index];
    return response && !response.success && INVALID_TOKEN_CODES.has(response.errorCode);
  });
  if (dead.length) {
    await db.update(Object.fromEntries(dead.map(token => [`${PUSH_TOKENS_ROOT}/${uid}/${token}`, null])));
  }
  return { sent: responses.filter(response => response && response.success).length, removed: dead.length };
};

/**
 * Обробка запису `multiData/favorites/{likerId}/{cardId}`. Повертає результат
 * для журналу (без особистих даних).
 */
const handleFavoriteWrite = async ({ likerId, cardId, before, after }, deps) => {
  if (!isNotifyingLiker(likerId)) return 'liker-not-enabled';
  if (!isNewDonorReaction(before, after)) return reactionCoversDonor(after) ? 'not-new' : 'other-anketa';
  if (likerId === cardId) return 'self';
  if (!(await deps.accountExists(cardId))) return 'no-account';
  const roles = normalizeRoles(await deps.db.get(`matchingCards/${cardId}/role`));
  if (!roles.includes(DONOR_ROLE)) return 'not-donor';

  const count = await recordLike(cardId, likerId, deps, { allowRepeat: ADMIN_TEST_MODE });
  if (!count) return 'already-counted';

  const outcomes = [];
  const chatId = await findTelegramChatId(cardId, deps).catch(() => null);
  if (chatId) {
    try {
      await deps.sendTelegram(chatId, LIKE_TEXTS.telegram(count), {
        inline_keyboard: [[{ text: LIKE_TEXTS.button, url: NOTIFICATION_URL }]],
      });
      outcomes.push('telegram');
    } catch (error) {
      // 403 — людина зупинила бота; повторювати нема чого.
      outcomes.push(`telegram-failed-${error.status || 'error'}`);
    }
  }
  try {
    const push = await sendPushToAccount(cardId, count, deps);
    if (push.sent) outcomes.push(`push-${push.sent}`);
    if (push.removed) outcomes.push(`push-removed-${push.removed}`);
  } catch (error) {
    outcomes.push('push-failed');
  }
  return outcomes.length ? outcomes.join(',') : 'no-channel';
};

/**
 * Обробка запису `multiData/dislikes/{likerId}/{cardId}` — лише в тестовому
 * режимі й лише push (див. `ADMIN_TEST_MODE`).
 */
const handleDislikeWrite = async ({ likerId, cardId, before, after }, deps) => {
  if (!ADMIN_TEST_MODE) return 'test-mode-off';
  if (!isNotifyingLiker(likerId)) return 'liker-not-enabled';
  if (!isNewDonorReaction(before, after)) return reactionCoversDonor(after) ? 'not-new' : 'other-anketa';
  if (likerId === cardId) return 'self';
  if (!(await deps.accountExists(cardId))) return 'no-account';
  const roles = normalizeRoles(await deps.db.get(`matchingCards/${cardId}/role`));
  if (!roles.includes(DONOR_ROLE)) return 'not-donor';
  try {
    const push = await sendPushToAccount(cardId, 0, deps, {
      kind: 'dislike',
      title: LIKE_TEXTS.dislikeTitle,
      body: LIKE_TEXTS.dislikeBody,
      url: NOTIFICATION_URL,
    });
    const outcomes = [];
    if (push.sent) outcomes.push(`push-${push.sent}`);
    if (push.removed) outcomes.push(`push-removed-${push.removed}`);
    return outcomes.length ? outcomes.join(',') : 'no-channel';
  } catch (error) {
    return 'push-failed';
  }
};

module.exports = {
  ADMIN_TEST_MODE,
  DISLIKES_ROOT: 'multiData/dislikes',
  FAVORITES_ROOT,
  handleDislikeWrite,
  LIKE_NOTIFICATIONS_ROOT,
  LIKE_TEXTS,
  NOTIFYING_LIKER_UIDS,
  PUSH_TOKENS_ROOT,
  findTelegramChatId,
  handleFavoriteWrite,
  isNewDonorReaction,
  isNotifyingLiker,
  reactionCoversDonor,
  recordLike,
  sendPushToAccount,
};
