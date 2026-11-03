'use strict';

const crypto = require('crypto');

/**
 * Вхід і реєстрація через Telegram-бота — основний спосіб входу KnowMe.
 *
 * Чому бот, а не SMS: для донорок і СМ телефон — це Telegram, пошта — для
 * ділового листування, і реєстрація поштою їм чужа. SMS Firebase платна з
 * кожного повідомлення (Україна — серед найдорожчих) і ще й мішень SMS
 * pumping. Бот віддає **підтверджений** номер акаунта Telegram безкоштовно:
 * кнопка `request_contact` надсилає контакт самого відправника, і
 * `contact.user_id === from.id` доводить, що номер його, а не пересланий.
 *
 * Потік:
 * 1. Застосунок генерує одноразовий `nonce` (128 біт) і відкриває
 *    `t.me/<бот>?start=<nonce>`. Сам `nonce` у базі не лежить — лише його
 *    sha256 (`telegramLogins/{hash}`): прочитавши вузол, сесію не вкрадеш.
 * 2. `/start <nonce>` — бот привʼязує спробу до акаунта Telegram і просить
 *    поділитися номером.
 * 3. Контакт — бот знаходить чи заводить акаунт Firebase
 *    (`telegramAccounts/{tgId}` → uid), випускає custom token і кладе його в
 *    спробу.
 * 4. Бот показує людині одноразовий код із шести цифр. Застосунок питає
 *    `completeTelegramLogin` з тим самим `nonce` **і цим кодом**, забирає
 *    токен рівно один раз і входить `signInWithCustomToken`.
 *
 * Чому код, а не самий `nonce`: посилання на бота може згенерувати будь-хто й
 * підсунути чужій людині («підтвердіть номер»). Без коду номер ділила б
 * жертва, а сесію забирав би браузер того, хто згенерував посилання. Код
 * бачить лише власник акаунта Telegram, і ввести його мусить той браузер, що
 * чекає, — рівень SMS-коду. П'ять хибних спроб спалюють вхід.
 *
 * Усі вузли пише лише функція (Admin SDK); у `database.rules.json` їх немає,
 * тож клієнтам вони закриті коренем — викочувати правила не треба.
 *
 * Модуль — чиста логіка з підставними залежностями (`deps`), щоб його можна
 * було перевірити без мережі (`test/telegramAuth.test.js`).
 */

const LOGIN_TTL_MS = 10 * 60 * 1000;
const LOGINS_ROOT = 'telegramLogins';
const LOGINS_BY_TG_ROOT = 'telegramLoginsByTg';
const ACCOUNTS_ROOT = 'telegramAccounts';
const APP_URL = 'https://knowme.pp.ua/login';
const MAX_CODE_ATTEMPTS = 5;

const defaultRandomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashCode = (key, code) => crypto.createHash('sha256').update(`${key}:${code}`).digest('hex');
const normalizeCode = code => String(code || '').replace(/\D/g, '');

// base64url від 16 байт — 22 знаки; Telegram пускає в `start` до 64 знаків
// [A-Za-z0-9_-]. Довшого чи коротшого застосунок не шле.
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

const isValidNonce = nonce => typeof nonce === 'string' && NONCE_PATTERN.test(nonce);

const hashNonce = nonce => crypto.createHash('sha256').update(String(nonce)).digest('hex');

const parseStartPayload = text => {
  const match = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/.exec(String(text || '').trim());
  if (!match) return null;
  return match[1] || '';
};

// Номер — так само, як його пише застосунок: самі цифри, без «+».
const normalizeTelegramPhone = value => String(value || '').replace(/\D/g, '');

const isExpired = (record, now) => !record || !Number.isFinite(record.createdAt) || now - record.createdAt > LOGIN_TTL_MS;

const BOT_TEXTS = Object.freeze({
  askContact:
    'Вхід у KnowMe (knowme.pp.ua).\n\n'
    + 'Натисніть кнопку «📱 Поділитися номером» нижче — так ми підтвердимо, що це ви. '
    + 'Пароль і пошта не потрібні.\n\n'
    + 'Якщо ви не відкривали KnowMe щойно — нічого не натискайте.',
  shareButton: '📱 Поділитися номером',
  // Окремим повідомленням, бо прибрати клавіатуру «Поділитися номером» і
  // дати кнопку посилання одне повідомлення не може: `reply_markup` один.
  contactReceived: '✅ Номер підтверджено.',
  // Код — у `<code>`: Telegram копіює моноширинний текст одним дотиком, а
  // сторінка входу вставляє його з буфера кнопкою «Вставити код». Код у
  // кнопку повернення не кладеться навмисно: тоді його не треба було б
  // вводити там, де вхід почали, і він перестав би захищати від підсунутого
  // посилання на бота (docs/telegram-login.md). Решта тексту — без `<`, `>`
  // і `&`, тож HTML-розмітка її не ламає.
  done: code => `Ваш код для входу в KnowMe: <code>${code}</code>\n\n`
    + 'Що далі: натисніть «Скопіювати код», потім «Повернутися в KnowMe» '
    + 'нижче (або перейдіть у браузер, де ви натиснули «Увійти через Telegram») '
    + 'і там «Вставити код».\n\n'
    + '⚠️ Нікому не повідомляйте цей код — навіть якщо просять «підтвердити номер». '
    + 'Хто його знає, той увійде у ваш акаунт.',
  alreadyDone: 'Код для входу вже надіслано вище. Поверніться в KnowMe й введіть його.',
  returnButton: 'Повернутися в KnowMe',
  copyButton: 'Скопіювати код',
  foreignContact: 'Надішліть, будь ласка, свій номер кнопкою «📱 Поділитися номером», а не чужий контакт.',
  noLogin: 'Щоб увійти, відкрийте KnowMe і натисніть «Увійти через Telegram».',
  expired: 'Час на вхід минув. Відкрийте KnowMe і натисніть «Увійти через Telegram» ще раз.',
  claimed: 'Це посилання для входу вже використано. Відкрийте KnowMe і натисніть «Увійти через Telegram» ще раз.',
  failed: 'Не вдалося завершити вхід. Спробуйте ще раз за хвилину.',
});

const contactKeyboard = () => ({
  keyboard: [[{ text: BOT_TEXTS.shareButton, request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
});

const openAppButton = () => ({
  inline_keyboard: [[{ text: 'Відкрити KnowMe', url: APP_URL }]],
});

// Після коду людина мусить повернутись на сайт, а в Telegram посилання на
// нього не було — лише текст «введіть на сторінці». Кнопка веде на `/login`:
// спроба лежить у `localStorage` браузера, тож і нова вкладка показує поле
// для коду (`src/utils/telegramAuth.js`).
const returnToAppButton = () => ({
  inline_keyboard: [[{ text: BOT_TEXTS.returnButton, url: APP_URL }]],
});

// Кнопка «Скопіювати код» (`copy_text`, Bot API 7.11): дотик до самого коду
// копіює його не в кожному клієнті й не кожна людина про це знає, а кнопку
// видно. Під нею — повернення на сайт, де «Вставити код» бере його з буфера.
const codeButtons = code => ({
  inline_keyboard: [
    [{ text: `📋 ${BOT_TEXTS.copyButton} ${code}`, copy_text: { text: String(code) } }],
    [{ text: BOT_TEXTS.returnButton, url: APP_URL }],
  ],
});

/**
 * Привʼязує спробу входу до акаунта Telegram. Спробу, яку вже взяв інший
 * акаунт Telegram, не переписує: інакше чужий `/start` з тим самим посиланням
 * перехопив би вхід.
 */
const handleStart = async ({ nonce, tgId, chatId }, { db, sendMessage, now }) => {
  if (!isValidNonce(nonce)) {
    await sendMessage(chatId, BOT_TEXTS.noLogin, openAppButton());
    return 'no-login';
  }
  const key = hashNonce(nonce);
  let outcome = 'pending';
  await db.transaction(`${LOGINS_ROOT}/${key}`, current => {
    if (current && current.tgId && current.tgId !== tgId) {
      outcome = 'claimed';
      return undefined;
    }
    if (current && current.status === 'ready') {
      outcome = 'ready';
      return undefined;
    }
    outcome = 'pending';
    return { tgId, chatId, status: 'pending', createdAt: (current && current.createdAt) || now };
  });
  if (outcome === 'claimed') {
    await sendMessage(chatId, BOT_TEXTS.claimed, openAppButton());
    return outcome;
  }
  if (outcome === 'ready') {
    await sendMessage(chatId, BOT_TEXTS.alreadyDone, returnToAppButton());
    return outcome;
  }
  await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, { key, at: now });
  await sendMessage(chatId, BOT_TEXTS.askContact, contactKeyboard());
  return outcome;
};

/**
 * Акаунт Firebase за акаунтом Telegram. Новий заводиться з автоматичним uid
 * (28 знаків — `isAccountProfileCard` впізнає його як анкету акаунта).
 * Дві одночасні спроби одного акаунта Telegram не заводять двох акаунтів:
 * перемагає перший запис мапи, зайвий акаунт видаляється.
 */
const resolveAccount = async ({ tgId, displayName }, { db, auth, now }) => {
  const existing = await db.get(`${ACCOUNTS_ROOT}/${tgId}`);
  if (existing && existing.uid) {
    try {
      await auth.getUser(existing.uid);
      return { uid: existing.uid, isNew: false };
    } catch (error) {
      if (error && error.code !== 'auth/user-not-found') throw error;
      // Акаунт видалили з консолі — мапа вказує в нікуди, заводимо новий.
      await db.set(`${ACCOUNTS_ROOT}/${tgId}`, null);
    }
  }
  const created = await auth.createUser(displayName ? { displayName } : {});
  let winnerUid = created.uid;
  await db.transaction(`${ACCOUNTS_ROOT}/${tgId}`, current => {
    if (current && current.uid) {
      winnerUid = current.uid;
      return undefined;
    }
    winnerUid = created.uid;
    return { uid: created.uid, createdAt: now };
  });
  if (winnerUid !== created.uid) {
    await auth.deleteUser(created.uid).catch(() => {});
    return { uid: winnerUid, isNew: false };
  }
  return { uid: created.uid, isNew: true };
};

const handleContact = async ({ message, tgId, chatId }, deps) => {
  const { db, auth, sendMessage, now } = deps;
  const contact = message.contact || {};
  if (String(contact.user_id || '') !== tgId) {
    await sendMessage(chatId, BOT_TEXTS.foreignContact, contactKeyboard());
    return 'foreign-contact';
  }
  const pointer = await db.get(`${LOGINS_BY_TG_ROOT}/${tgId}`);
  if (!pointer || !pointer.key) {
    await sendMessage(chatId, BOT_TEXTS.noLogin, openAppButton());
    return 'no-login';
  }
  const loginPath = `${LOGINS_ROOT}/${pointer.key}`;
  const login = await db.get(loginPath);
  if (!login || login.tgId !== tgId || login.status !== 'pending' || isExpired(login, now)) {
    await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, null);
    await sendMessage(chatId, BOT_TEXTS.expired, openAppButton());
    return 'expired';
  }

  const phone = normalizeTelegramPhone(contact.phone_number);
  const from = message.from || {};
  const firstName = String(contact.first_name || from.first_name || '').trim();
  const lastName = String(contact.last_name || from.last_name || '').trim();
  const username = String(from.username || '').trim();
  const displayName = [firstName, lastName].filter(Boolean).join(' ').slice(0, 100);

  const { uid, isNew } = await resolveAccount({ tgId, displayName }, deps);
  const token = await auth.createCustomToken(uid);
  const code = (deps.randomCode || defaultRandomCode)();

  await db.set(loginPath, {
    tgId,
    status: 'ready',
    createdAt: login.createdAt,
    readyAt: now,
    uid,
    token,
    codeHash: hashCode(pointer.key, code),
    attempts: 0,
    isNew,
    profile: { phone, firstName, lastName, username },
  });
  await db.set(`${LOGINS_BY_TG_ROOT}/${tgId}`, null);
  await sendMessage(chatId, BOT_TEXTS.contactReceived, { remove_keyboard: true });
  await sendMessage(chatId, BOT_TEXTS.done(code), codeButtons(code), { html: true });
  return isNew ? 'registered' : 'signed-in';
};

/**
 * Одне оновлення від Telegram. Відповідає лише в приватному чаті з ботом:
 * у групі контакт і `/start` не означають входу.
 */
const handleTelegramUpdate = async (update, deps) => {
  const message = update && update.message;
  if (!message || !message.chat || message.chat.type !== 'private' || !message.from) return 'ignored';
  const tgId = String(message.from.id);
  const chatId = message.chat.id;

  try {
    if (message.contact) return await handleContact({ message, tgId, chatId }, deps);
    const nonce = parseStartPayload(message.text);
    if (nonce !== null) return await handleStart({ nonce, tgId, chatId }, deps);
    await deps.sendMessage(chatId, BOT_TEXTS.noLogin, openAppButton());
    return 'hint';
  } catch (error) {
    await deps.sendMessage(chatId, BOT_TEXTS.failed).catch(() => {});
    throw error;
  }
};

/**
 * Застосунок забирає вхід. Токен віддається лише з кодом, який бот показав
 * власникові акаунта Telegram, і рівно один раз: спроба видаляється
 * транзакцією. Хибний код рахується; на `MAX_CODE_ATTEMPTS` спроба згорає.
 */
const completeTelegramLogin = async (nonce, codeInput, { db, now }) => {
  if (!isValidNonce(nonce)) return { status: 'invalid' };
  const key = hashNonce(nonce);
  const path = `${LOGINS_ROOT}/${key}`;
  const record = await db.get(path);
  if (!record) return { status: 'pending', started: false };
  if (isExpired(record, now)) {
    await db.set(path, null);
    if (record.tgId) await db.set(`${LOGINS_BY_TG_ROOT}/${record.tgId}`, null);
    return { status: 'expired' };
  }
  if (record.status !== 'ready') return { status: 'pending', started: true };

  const code = normalizeCode(codeInput);
  if (!code) return { status: 'code-required' };

  let outcome = 'gone';
  let claimed = null;
  let attemptsLeft = 0;
  await db.transaction(path, current => {
    // Обробник кличуть кілька разів, тож підсумок рахується щоразу заново.
    claimed = null;
    attemptsLeft = 0;
    if (current === null) {
      // Перший виклик бачить локальний кеш, а у функції він порожній, хоч
      // запис щойно прочитано. `undefined` тут скасовував транзакцію без
      // сервера, і правильний код відповідав «час минув» — на кожному вході.
      // `null` у `null` сервер з наявним записом відхиляє й кличе обробник
      // уже з даними; зниклий запис так і лишається зниклим.
      outcome = 'gone';
      return null;
    }
    if (current.status !== 'ready') {
      outcome = 'gone';
      return undefined;
    }
    if (current.codeHash === hashCode(key, code)) {
      outcome = 'ready';
      claimed = current;
      return null;
    }
    const attempts = (Number(current.attempts) || 0) + 1;
    attemptsLeft = Math.max(0, MAX_CODE_ATTEMPTS - attempts);
    if (attemptsLeft === 0) {
      outcome = 'expired';
      return null;
    }
    outcome = 'wrong-code';
    return { ...current, attempts };
  });
  if (outcome === 'ready' && claimed) {
    return {
      status: 'ready',
      token: claimed.token,
      isNew: Boolean(claimed.isNew),
      profile: claimed.profile || {},
    };
  }
  if (outcome === 'wrong-code') return { status: 'wrong-code', attemptsLeft };
  return { status: 'expired' };
};

/**
 * Обгортка RTDB Admin SDK під інтерфейс `deps.db`: модулю досить get/set/
 * transaction, а тест підставляє памʼять.
 */
const createAdminDb = database => ({
  get: async path => (await database.ref(path).get()).val(),
  set: (path, value) => database.ref(path).set(value),
  transaction: async (path, update) => {
    const result = await database.ref(path).transaction(update);
    return { committed: result.committed };
  },
});

const createTelegramSender = (token, fetchImpl = fetch) => async (chatId, text, replyMarkup, options = {}) => {
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(options.html ? { parse_mode: 'HTML' } : {}),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    }),
  });
  if (!response.ok) {
    // Токен бота в помилку не потрапляє — лише статус.
    const error = new Error(`Telegram sendMessage failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
};

// Порівняння секрету вебхука за сталий час.
const isWebhookSecretValid = (received, expected) => {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  ACCOUNTS_ROOT,
  BOT_TEXTS,
  LOGINS_BY_TG_ROOT,
  LOGINS_ROOT,
  LOGIN_TTL_MS,
  MAX_CODE_ATTEMPTS,
  completeTelegramLogin,
  createAdminDb,
  createTelegramSender,
  handleTelegramUpdate,
  hashNonce,
  isValidNonce,
  isWebhookSecretValid,
  normalizeTelegramPhone,
  parseStartPayload,
};
