'use strict';

/**
 * Cloud Functions KnowMe: власні листи Firebase Auth — підтвердження пошти
 * (`sendVerificationEmail`) і зміна пароля (`sendPasswordResetEmail`).
 *
 * Чому не стандартний лист Firebase: його текст у консолі не редагується
 * (лише тема, відправник і адреса для відповіді), і людина отримувала сірий
 * англомовний рядок з довгим посиланням на `firebaseapp.com`. Тепер Firebase
 * лише видає одноразовий код (`generateEmailVerificationLink`), а лист —
 * шаблон KnowMe (`emails/verifyEmail.js`) — іде через поштовий сервіс (Brevo) від
 * імені `knowme.pp.ua`, і кнопка веде на сторінку застосунку `/auth/action`.
 *
 * Застосунок кличе функцію сам (`src/utils/emailVerification.js`), а коли вона
 * не відповіла — не розгорнута, сервіс відмовив, — шле стандартний лист
 * Firebase. Тобто без цієї функції реєстрація працює як раніше.
 *
 * Деплой — руками, як і правила бази: `docs/email-verification.md`.
 */

const { onCall, onRequest, HttpsError } = require('firebase-functions/https');
const { onValueCreated } = require('firebase-functions/database');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const { ALLOWED_ORIGINS, MAIL_SENDER, REGION } = require('./config');
const { normalizeEmailLanguage, normalizeEmailRole, renderVerifyEmail } = require('./emails/verifyEmail');
const { renderPasswordResetEmail } = require('./emails/passwordReset');
const { buildActionLink, buildVerifyEmailActionLink, extractOobCode } = require('./emails/actionLink');
const {
  decideGlobalSend,
  decideIpSend,
  decideResetGlobalSend,
  decideVerificationSend,
  emailQuotaKey,
  ipQuotaKey,
} = require('./verificationQuota');
const { sendWithBrevo } = require('./mail/brevo');
const {
  completeTelegramLogin,
  createAdminDb,
  createTelegramSender,
  handleTelegramUpdate,
  isWebhookSecretValid,
} = require('./telegramAuth');

initializeApp();

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

const QUOTA_ROOT = 'emailVerificationSends';
// Заявки на лист зміни пароля (адмін-SDK; правилами вузол закритий, як і корінь).
const RESET_OUTBOX = 'emailOutbox/passwordReset';

/**
 * Займає місце в одній межі відправок (`verificationQuota.js`). Повертає
 * `null`, коли межу вичерпано, інакше — функцію, що віддає місце назад: лист,
 * який не пішов, межу не мусить їсти — інакше п'ять збоїв сервісу за добу
 * лишали б людину без жодного листа (на `resource-exhausted` застосунок
 * навмисно не шле й стандартного).
 */
const claimSlot = async (path, decide, now) => {
  const ref = getDatabase().ref(path);
  let previous = null;
  let decision = null;
  const result = await ref.transaction(current => {
    previous = current;
    decision = decide(current, now);
    return decision.allowed ? decision.next : undefined;
  });
  if (!result.committed) return { release: null, reason: decision ? decision.reason : 'unknown' };
  const release = () => ref
    .transaction(current => (current && current.lastAt === now ? previous || null : undefined))
    .catch(error => logger.warn('verification quota release failed', { path, error: error.message }));
  return { release, reason: '' };
};

/**
 * Межі по черзі. Відмова будь-якої віддає місця, вже зайняті попередніми. Межа
 * людини — `resource-exhausted` (застосунок стандартного листа не шле), стеля
 * на всіх — `unavailable` (застосунок шле стандартний лист Firebase із
 * власними межами).
 * @param {Array<[string, Function, string]>} steps — [шлях, рішення, код відмови]
 */
const claimSteps = async (steps, now, logContext) => {
  const claimed = [];
  const releaseAll = () => Promise.all(claimed.map(release => release()));
  for (const [path, decide, refusal] of steps) {
    const { release, reason } = await claimSlot(path, decide, now);
    if (!release) {
      await releaseAll();
      logger.warn('auth email refused by quota', { ...logContext, reason });
      throw new HttpsError(refusal, 'Too many emails. Try again later.', { reason });
    }
    claimed.push(release);
  }
  return releaseAll;
};

/** Три межі листа підтвердження: акаунт, адреса, усі разом. */
const claimSendSlots = (uid, email, now) => claimSteps([
  [`${QUOTA_ROOT}/byUid/${uid}`, decideVerificationSend, 'resource-exhausted'],
  [`${QUOTA_ROOT}/byEmail/${emailQuotaKey(email)}`, decideVerificationSend, 'resource-exhausted'],
  [`${QUOTA_ROOT}/total`, decideGlobalSend, 'unavailable'],
], now, { uid, kind: 'verify' });

/** Поточна роль з картки стрічки — коли застосунок її не передав (меню «Підтвердити email»). */
const readCardRole = async uid => {
  try {
    const snapshot = await getDatabase().ref(`matchingCards/${uid}/role`).get();
    return normalizeEmailRole(snapshot.val());
  } catch (error) {
    logger.warn('card role read failed', { uid, error: error.message });
    return '';
  }
};

exports.sendVerificationEmail = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    secrets: [BREVO_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 5,
  },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to request a verification email.');

    const user = await getAuth().getUser(uid);
    if (!user.email) throw new HttpsError('failed-precondition', 'This account has no email address.');
    if (user.emailVerified) return { status: 'already-verified' };

    const data = request.data || {};
    const language = normalizeEmailLanguage(data.language);
    const role = normalizeEmailRole(data.role) || await readCardRole(uid);

    const now = Date.now();
    const releaseSlots = await claimSendSlots(uid, user.email, now);

    try {
      const generated = await getAuth().generateEmailVerificationLink(user.email);
      const oobCode = extractOobCode(generated);
      if (!oobCode) throw new Error('generated link has no oobCode');

      const link = buildVerifyEmailActionLink({ oobCode, language });
      const message = renderVerifyEmail({ email: user.email, link, language, role });

      const sent = await sendWithBrevo({
        apiKey: BREVO_API_KEY.value(),
        sender: MAIL_SENDER,
        to: user.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: ['verify_email', `lang_${message.language}`],
      });

      // Адресу в журнал не пишемо: uid досить, щоб знайти людину.
      logger.info('verification email sent', { uid, language: message.language, role: message.role, id: sent && sent.messageId });
      return { status: 'sent' };
    } catch (error) {
      await releaseSlots();
      // Повідомлення помилки адреси не несе (`mail/brevo.js`), лише статус і назву.
      logger.error('verification email failed', { uid, error: error.message, status: error.status });
      throw new HttpsError('unavailable', 'Verification email could not be sent.');
    }
  },
);

// Звичайна адреса пошти; решту перевіряє сам Firebase.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * IP читача. Береться **остання** адреса з `X-Forwarded-For`: першу може
 * вписати сам клієнт і так обійти межу на IP, а останню дописує фронтенд
 * Google. Скільки адрес у ланцюжку, пише журнал (`xffParts`, без самих
 * адрес) — якщо Google колись почне дописувати ще й свою, це буде видно.
 */
const readClientIp = rawRequest => {
  const forwarded = String((rawRequest && rawRequest.headers && rawRequest.headers['x-forwarded-for']) || '');
  const parts = forwarded.split(',').map(part => part.trim()).filter(Boolean);
  return { ip: parts.length ? parts[parts.length - 1] : (rawRequest && rawRequest.ip) || '', xffParts: parts.length };
};

const NO_ACCOUNT_CODES = new Set(['auth/user-not-found', 'auth/email-not-found']);

/**
 * Лист «Зміна пароля». Його просять **без входу** («Забули пароль?»), тож три
 * правила, і кожне закриває свою дірку:
 *
 * - **відповідь не каже, чи є акаунт.** Без акаунта — `sent`, як і з ним; межі
 *   (зокрема денна стеля листів зміни пароля — своя, окремо від листів
 *   підтвердження) займаються **до** перевірки акаунта, а відповідь триває
 *   щонайменше `RESET_MIN_RESPONSE_MS` — інакше різниця в часі (лист іде лише
 *   тоді, коли акаунт є) відповідала б на те саме питання;
 * - **жодна межа не лишає людину без листа.** Вичерпана межа — це
 *   `unavailable`, а не відмова: застосунок тоді шле стандартний лист Firebase
 *   (з його власними межами). Поки межа адреси відповідала
 *   `resource-exhausted`, будь-хто міг п'ятьма запитами на добу заблокувати
 *   чуже відновлення пароля; межа IP так само могла б зачепити всіх за одним
 *   NAT чи за адресою фронтенду;
 * - межі (адреса, IP, усі разом) стережуть не людину, а **наш** лист: бюджет
 *   Brevo і репутацію домену `knowme.pp.ua`. Тому їх не повертаємо й без
 *   акаунта — перебір адрес не мусить бути безкоштовним.
 *
 * Кнопка веде на `/auth/action?mode=resetPassword`, де `AuthActionPage` питає
 * новий пароль.
 */
// Поріг із запасом над звичайною відправкою через Brevo (~0,5–1 с): гілка з
// листом і гілка без акаунта мусять закінчуватись в один і той самий момент.
const RESET_MIN_RESPONSE_MS = 2500;
const waitUntil = deadline => new Promise(resolve => setTimeout(resolve, Math.max(0, deadline - Date.now())));

exports.sendPasswordResetEmail = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    secrets: [BREVO_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 5,
  },
  async request => {
    const startedAt = Date.now();
    const data = request.data || {};
    const email = String(data.email || '').trim().toLowerCase();
    if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new HttpsError('invalid-argument', 'A valid email is required.');
    }
    const language = normalizeEmailLanguage(data.language);
    const now = Date.now();
    const { ip, xffParts } = readClientIp(request.rawRequest);
    logger.info('password reset requested', { language, xffParts, hasIp: Boolean(ip) });

    // Однаковий кінець для будь-якої гілки: не раніше за поріг часу.
    const respond = async result => {
      await waitUntil(startedAt + RESET_MIN_RESPONSE_MS);
      if (result instanceof Error) throw result;
      return result;
    };

    try {
      await claimSteps([
        ...(ip ? [[`${QUOTA_ROOT}/resetByIp/${ipQuotaKey(ip)}`, decideIpSend, 'unavailable']] : []),
        [`${QUOTA_ROOT}/resetByEmail/${emailQuotaKey(email)}`, decideVerificationSend, 'unavailable'],
      ], now, { kind: 'reset' });
    } catch (error) {
      return respond(error);
    }

    try {
      await claimSteps([[`${QUOTA_ROOT}/resetTotal`, decideResetGlobalSend, 'unavailable']], now, { kind: 'reset' });
    } catch (error) {
      return respond(error);
    }

    // Чи є акаунт, тут не питаємо зовсім: і посилання, і Brevo — робота лише
    // для наявного акаунта, і поки відповідь чекала на неї, повільний Brevo
    // (поріг часу лише нижня межа) казав про акаунт затримкою. Тепер обидві
    // гілки однаково кладуть заявку в чергу, а лист шле `deliverPasswordResetEmail`.
    try {
      await getDatabase().ref(RESET_OUTBOX).push({ email, language, at: now });
    } catch (error) {
      logger.error('password reset enqueue failed', { error: error.message });
      return respond(new HttpsError('unavailable', 'Password reset email could not be sent.'));
    }
    return respond({ status: 'sent' });
  },
);

/**
 * Черга листів зміни пароля: заявку кладе `sendPasswordResetEmail`, а тут —
 * уже поза відповіддю гостеві — перевіряється акаунт і йде лист. Заявка
 * знімається одразу (вона несе адресу). Збій тут до застосунку не доходить,
 * тож стандартного листа Firebase на нього не буде — це ціна того, що
 * відповідь не залежить від акаунта; місце в денній стелі такий збій займає.
 */
exports.deliverPasswordResetEmail = onValueCreated(
  {
    ref: `${RESET_OUTBOX}/{requestId}`,
    region: REGION,
    secrets: [BREVO_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 5,
  },
  async event => {
    const { email, language } = event.data.val() || {};
    await event.data.ref.remove().catch(error => logger.warn('reset outbox cleanup failed', { error: error.message }));
    if (!email) return;

    let generated;
    try {
      generated = await getAuth().generatePasswordResetLink(email);
    } catch (error) {
      if (NO_ACCOUNT_CODES.has(error.code)) return;
      logger.error('password reset link failed', { error: error.message, code: error.code });
      return;
    }

    try {
      const oobCode = extractOobCode(generated);
      if (!oobCode) throw new Error('generated link has no oobCode');
      const link = buildActionLink({ mode: 'resetPassword', oobCode, language });
      const message = renderPasswordResetEmail({ email, link, language });
      const sent = await sendWithBrevo({
        apiKey: BREVO_API_KEY.value(),
        sender: MAIL_SENDER,
        to: email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: ['reset_password', `lang_${message.language}`],
      });
      logger.info('password reset email sent', { language: message.language, id: sent && sent.messageId });
    } catch (error) {
      logger.error('password reset email failed', { error: error.message, status: error.status });
    }
  },
);

/**
 * Вхід через Telegram (`telegramAuth.js`).
 *
 * `telegramWebhook` — адреса, яку бот отримує в `setWebhook` разом із
 * `secret_token`: Telegram шле його в заголовку, і без нього запит відкидається
 * (інакше будь-хто міг би підкинути «контакт» від чужого імені). Відповідь
 * завжди 200, коли секрет збігся: на помилку Telegram повторює те саме
 * оновлення, і збій перетворився б на зливу повторів.
 *
 * `completeTelegramLogin` кличуть без входу — входу ще немає. Право забрати
 * токен дає `nonce`, який застосунок згенерував сам, разом із кодом, який бот
 * показав власникові акаунта Telegram (захист від підсунутого посилання).
 */
const TELEGRAM_BOT_TOKEN = defineSecret('TELEGRAM_BOT_TOKEN');
const TELEGRAM_WEBHOOK_SECRET = defineSecret('TELEGRAM_WEBHOOK_SECRET');

exports.telegramWebhook = onRequest(
  {
    region: REGION,
    secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 5,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).end();
      return;
    }
    if (!isWebhookSecretValid(req.get('X-Telegram-Bot-Api-Secret-Token'), TELEGRAM_WEBHOOK_SECRET.value())) {
      res.status(403).end();
      return;
    }
    try {
      const outcome = await handleTelegramUpdate(req.body, {
        db: createAdminDb(getDatabase()),
        auth: getAuth(),
        sendMessage: createTelegramSender(TELEGRAM_BOT_TOKEN.value()),
        now: Date.now(),
      });
      // Номер і імʼя в журнал не пишемо: досить результату.
      logger.info('telegram update handled', { outcome });
    } catch (error) {
      logger.error('telegram update failed', { error: error.message, status: error.status });
    }
    res.status(200).send('ok');
  },
);

exports.completeTelegramLogin = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    memory: '256MiB',
    timeoutSeconds: 15,
    maxInstances: 10,
  },
  async request => {
    const data = request.data || {};
    try {
      // `intent: 'link'` — привʼязка Telegram до акаунта, у який уже увійшли
      // (`request.auth`); вхід без акаунта її не почне й не завершить.
      return await completeTelegramLogin(data.nonce, data.code, {
        db: createAdminDb(getDatabase()),
        now: Date.now(),
        callerUid: (request.auth && request.auth.uid) || null,
        intent: data.intent === 'link' ? 'link' : '',
      });
    } catch (error) {
      logger.error('telegram login completion failed', { error: error.message });
      throw new HttpsError('unavailable', 'Telegram login could not be completed.');
    }
  },
);
