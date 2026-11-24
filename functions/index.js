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
const { onValueCreated, onValueWritten } = require('firebase-functions/database');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');
const { getFirestore } = require('firebase-admin/firestore');

const { ALLOWED_ORIGINS, DATABASE_REGION, MAIL_SENDER, REGION } = require('./config');
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
const { mergeAccounts, resolveAccountOnSignIn, unlinkMergedAccount } = require('./accountMerge');
const { renderAccountMergedEmail } = require('./emails/accountMerged');

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
    // Тригер бази стоїть у регіоні самої бази, а не функцій: інстанс
    // `webringitapp-default-rtdb` живе в us-central1, і Eventarc на
    // europe-west1 відповідає «pattern cannot match any databases in region».
    region: DATABASE_REGION,
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

// Залежності злиття акаунтів (`accountMerge.js`).
const accountMergeDeps = () => ({
  read: async path => (await getDatabase().ref(path).get()).val(),
  update: updates => getDatabase().ref().update(updates),
  createCustomToken: uid => getAuth().createCustomToken(uid),
  userExists: uid => getAuth().getUser(uid).then(() => true, error => {
    if (error && error.code === 'auth/user-not-found') return false;
    throw error;
  }),
  // Способи входу акаунта: порожній перелік — акаунт завів бот Telegram
  // (custom token), іншого входу в нього немає.
  listProviders: uid => getAuth().getUser(uid).then(user => (user.providerData || []).map(item => item.providerId)),
});

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
      const result = await completeTelegramLogin(data.nonce, data.code, {
        db: createAdminDb(getDatabase()),
        auth: getAuth(),
        now: Date.now(),
        callerUid: (request.auth && request.auth.uid) || null,
        intent: data.intent === 'link' ? 'link' : '',
        loginKey: typeof data.key === 'string' ? data.key : '',
      });
      if (result && result.status === 'linked') {
        const { previousUid, ...answer } = result;
        // Telegram відкривав інший акаунт: той стає другорядним, а його дані
        // доливаються в акаунт, з якого привʼязали (код із Telegram — доказ,
        // що обидва однієї людини). Збій злиття привʼязку не відкочує:
        // наступний вхід головного зіллє ще раз (`resolvePrimaryAccount`).
        if (previousUid) {
          const merge = await mergeAccounts(accountMergeDeps(), {
            primaryUid: request.auth.uid,
            secondaryUid: previousUid,
            via: 'telegram-link',
            requireBotOnlySecondary: true,
          }).catch(error => {
            logger.error('account merge after telegram link failed', { error: error.message });
            return { status: 'failed' };
          });
          answer.merged = merge.status === 'merged' || merge.status === 'already-merged';
        }
        return answer;
      }
      return result;
    } catch (error) {
      logger.error('telegram login completion failed', { error: error.message });
      throw new HttpsError('unavailable', 'Telegram login could not be completed.');
    }
  },
);

/**
 * Вхід у будь-який акаунт питає, чи він головний (`accountMerge.js`):
 * другорядний отримує custom token головного й застосунок перемикає сесію;
 * головний із незлитою давньою привʼязкою Telegram — злиття.
 */
exports.resolvePrimaryAccount = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    try {
      return await resolveAccountOnSignIn(accountMergeDeps(), uid);
    } catch (error) {
      logger.error('primary account resolve failed', { error: error.message });
      throw new HttpsError('unavailable', 'Account could not be resolved.');
    }
  },
);

// Свіжість входу в другорядний акаунт, яким доводять, що він свій. Коротка
// навмисно: токен довгої сесії (вкрадений, скажімо, з чужого браузера) має
// давній `auth_time` і злиття не відкриває — потрібен щойно введений пароль
// чи щойно пройдений вхід Google.
const MERGE_PROOF_MAX_AGE_MS = 5 * 60 * 1000;
// Доказом є лише вхід, який людина проходить сама: пароль чи Google. Сесія
// Telegram (custom token) тут не годиться — для неї є привʼязка з кодом.
const MERGE_PROOF_PROVIDERS = Object.freeze(['password', 'google.com']);

// Лист на пошту другорядного: про злиття людина дізнається з каналу, якого
// не тримає той, хто злиття запустив. Збій листа злиття не відкочує.
const sendAccountMergedEmail = async ({ secondaryUid, primaryUid, language }) => {
  try {
    const [secondaryUser, primaryUser] = await Promise.all([
      getAuth().getUser(secondaryUid).catch(() => null),
      getAuth().getUser(primaryUid).catch(() => null),
    ]);
    const email = secondaryUser && secondaryUser.email;
    if (!email) return false;
    const message = renderAccountMergedEmail({ email, primary: (primaryUser && primaryUser.email) || '', language });
    await sendWithBrevo({
      apiKey: BREVO_API_KEY.value(),
      sender: MAIL_SENDER,
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: ['account_merged', `lang_${message.language}`],
    });
    return true;
  } catch (error) {
    logger.warn('account merged email failed', { error: error.message, status: error.status });
    return false;
  }
};

/**
 * Злиття іншого акаунта в поточний. Доказ — ID-токен того акаунта, щойно
 * (≤ 5 хв) отриманий паролем чи Google, поруч із сесією головного; про злиття
 * йде лист на пошту другорядного.
 */
exports.mergeAccountInto = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    secrets: [BREVO_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 5,
  },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.');
    const idToken = String((request.data || {}).secondaryIdToken || '');
    let secondary;
    try {
      secondary = await getAuth().verifyIdToken(idToken, true);
    } catch (error) {
      throw new HttpsError('permission-denied', 'The other account could not be verified.');
    }
    const provider = secondary.firebase && secondary.firebase.sign_in_provider;
    if (!MERGE_PROOF_PROVIDERS.includes(provider)) {
      throw new HttpsError('permission-denied', 'Sign in to the other account with its password or Google.');
    }
    const authTime = Number(secondary.auth_time) * 1000;
    if (!authTime || Date.now() - authTime > MERGE_PROOF_MAX_AGE_MS) {
      throw new HttpsError('failed-precondition', 'Sign in to the other account again.', { reason: 'recent-login' });
    }
    if (secondary.uid === uid) return { status: 'already-merged' };
    try {
      const result = await mergeAccounts(accountMergeDeps(), { primaryUid: uid, secondaryUid: secondary.uid, via: 'id-token' });
      logger.info('accounts merged', { status: result.status, reason: result.reason || '' });
      if (result.status === 'merged') {
        await sendAccountMergedEmail({ secondaryUid: secondary.uid, primaryUid: result.primaryUid, language: (request.data || {}).language });
      }
      return { status: result.status, reason: result.reason || '' };
    } catch (error) {
      logger.error('account merge failed', { error: error.message });
      throw new HttpsError('unavailable', 'Accounts could not be merged.');
    }
  },
);

/**
 * Розʼєднання злитих акаунтів — лише повний адмін, на скаргу з листа
 * «Акаунти обʼєднано» (`accountMerge.js`, `unlinkMergedAccount`).
 */
exports.unlinkMergedAccount = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, memory: '256MiB', timeoutSeconds: 30, maxInstances: 2 },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid || !canPurgeAccounts(uid)) throw new HttpsError('permission-denied', 'Admins only.');
    const secondaryUid = String((request.data || {}).secondaryUid || '');
    try {
      const result = await unlinkMergedAccount(accountMergeDeps(), secondaryUid);
      logger.info('account unlinked', { status: result.status });
      return result;
    } catch (error) {
      logger.error('account unlink failed', { error: error.message });
      throw new HttpsError('unavailable', 'Accounts could not be separated.');
    }
  },
);

/**
 * Видалення акаунта — два кроки (`accountDeletion.js`).
 *
 * 1. `deleteOwnAccount` — людина в «Моєму профілі» («Видалити анкету»):
 *    анкета ховається (`feedDate: false`), посилання без входу гаснуть, запис
 *    лягає в чергу `accountDeletions`, а Auth-акаунт видаляється. Слідом — лист
 *    «Профіль видалено»; збій листа видалення не відкочує.
 * 2. `purgeDeletedAccount` — адмін на `AddNewProfile` (сповіщення горить, поки
 *    черга не порожня, `listPendingAccountDeletions`): спершу аналіз
 *    (`dryRun` — план без жодного запису, його бачить і інспектор), потім
 *    повне очищення бази від картки й усіх її звʼязків. Видаляє лише повний
 *    адмін і лише uid із черги — живий акаунт цим шляхом не стерти.
 *
 * Свіжість входу Firebase для callable не перевіряє, тож перевіряємо самі:
 * токен, виданий понад `RECENT_SIGN_IN_MS` тому, — відмова
 * `failed-precondition`, і застосунок просить увійти ще раз. Інакше вкладка,
 * забута відкритою на чужому компʼютері, була б кнопкою «стерти акаунт».
 */
const RECENT_SIGN_IN_MS = 24 * 60 * 60 * 1000;
const {
  ACCOUNT_DELETIONS_ROOT,
  canPurgeAccounts,
  canViewDeletionQueue,
  isProtectedUid,
  isValidUid,
  listAccountDeletionQueue,
  pickRecentSearchQueries,
  purgeAccountData,
  requestAccountDeletion,
} = require('./accountDeletion');
const { renderAccountDeletedEmail } = require('./emails/accountDeleted');

const LEGACY_DOC_COLLECTIONS = ['users', 'newUsers'];

const accountDeletionDeps = () => {
  const db = getDatabase();
  return {
    read: async path => (await db.ref(path).get()).val(),
    update: updates => db.ref().update(updates),
    deleteFiles: prefix => getStorage().bucket().deleteFiles({ prefix }),
    deleteAuthUser: id => getAuth().deleteUser(id),
    getAuthUser: id => getAuth().getUser(id),
    // Firestore-копії анкети (`users`, `newUsers`): застосунок їх більше не
    // читає, але дані там лежать. Немає бази Firestore — крок падає й
    // потрапляє у `failed`, решту очищення це не зупиняє.
    deleteLegacyDocs: async id => {
      const firestore = getFirestore();
      await Promise.all(LEGACY_DOC_COLLECTIONS.map(collection => firestore.collection(collection).doc(id).delete()));
    },
    // Для аналізу: скільки файлів під текою і які Firestore-копії справді є.
    countFiles: async prefix => {
      const [files] = await getStorage().bucket().getFiles({ prefix });
      return files.length;
    },
    listLegacyDocs: async id => {
      const firestore = getFirestore();
      const snapshots = await Promise.all(LEGACY_DOC_COLLECTIONS.map(collection => firestore.collection(collection).doc(id).get()));
      return snapshots.filter(snapshot => snapshot.exists).map(snapshot => snapshot.ref.path);
    },
  };
};

const sendAccountDeletedEmail = async ({ uid, email, language }) => {
  if (!email) return false;
  try {
    const message = renderAccountDeletedEmail({ email, language });
    await sendWithBrevo({
      apiKey: BREVO_API_KEY.value(),
      sender: MAIL_SENDER,
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: ['account_deleted', `lang_${message.language}`],
    });
    return true;
  } catch (error) {
    logger.warn('account deleted email failed', { uid, error: error.message, status: error.status });
    return false;
  }
};

exports.deleteOwnAccount = onCall(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
    secrets: [BREVO_API_KEY],
    memory: '256MiB',
    timeoutSeconds: 60,
    maxInstances: 3,
  },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in to delete your profile.');
    if (!isValidUid(uid) || isProtectedUid(uid)) {
      throw new HttpsError('permission-denied', 'This account cannot be deleted from the app.');
    }
    const authTime = Number(request.auth.token && request.auth.token.auth_time) * 1000;
    if (!authTime || Date.now() - authTime > RECENT_SIGN_IN_MS) {
      throw new HttpsError('failed-precondition', 'Sign in again to delete your profile.', { reason: 'recent-login' });
    }

    const language = normalizeEmailLanguage((request.data || {}).language);
    // Адресу беремо до видалення: після нього її вже ніде немає.
    const user = await getAuth().getUser(uid).catch(() => null);
    const email = user && user.email;

    let result;
    try {
      // Причина необовʼязкова й перевіряється всередині (лише відомі коди,
      // текст до 300 знаків): кривий запит видалення не зупиняє.
      result = await requestAccountDeletion(accountDeletionDeps(), uid, {
        reason: (request.data || {}).reason,
        reasonText: (request.data || {}).reasonText,
      });
    } catch (error) {
      logger.error('account deletion request failed', { uid, error: error.message });
      throw new HttpsError('internal', 'Profile could not be deleted.', { failed: ['request'] });
    }
    if (result.status === 'disabled') throw new HttpsError('permission-denied', 'This account is disabled.');

    const emailSent = await sendAccountDeletedEmail({ uid, email, language });
    logger.info('account deletion requested', { uid, emailSent });
    return { status: 'deleted', emailSent };
  },
);

exports.listPendingAccountDeletions = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, memory: '256MiB', timeoutSeconds: 30, maxInstances: 3 },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid || !canViewDeletionQueue(uid)) throw new HttpsError('permission-denied', 'Admins only.');
    const db = getDatabase();
    const queue = listAccountDeletionQueue((await db.ref(ACCOUNT_DELETIONS_ROOT).get()).val());
    // Імʼя й роль — з картки, яка ще лежить до очищення: адмінові треба знати,
    // кого саме він стирає, а не самий uid.
    const items = await Promise.all(queue.map(async entry => {
      const card = (await db.ref(`matchingCards/${entry.uid}`).get()).val() || {};
      // Останні запити пошуку — щоб кейс «шукала й не знайшла» було видно
      // поруч із причиною. Збій читання списку не валить.
      const searchQueries = await db.ref(`multiData/searchQueries/${entry.uid}`).get()
        .then(snapshot => snapshot.val())
        .catch(() => null);
      const current = value => (Array.isArray(value) ? value.filter(item => item != null).slice(-1)[0] : value);
      return {
        ...entry,
        name: [current(card.name), current(card.surnameShort)].filter(part => typeof part === 'string' && part).join(' '),
        role: Array.isArray(card.role) ? card.role.join(',') : (typeof card.role === 'string' ? card.role : ''),
        hasCard: Boolean(card && Object.keys(card).length),
        // Знімок у записі черги — перший: він пережив би й очищену історію.
        recentSearchQueries: entry.recentSearchQueries || pickRecentSearchQueries(searchQueries, 3),
      };
    }));
    return { items, canPurge: canPurgeAccounts(uid) };
  },
);

exports.purgeDeletedAccount = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, memory: '1GiB', timeoutSeconds: 300, maxInstances: 1 },
  async request => {
    const adminUid = request.auth && request.auth.uid;
    const dryRun = Boolean((request.data || {}).dryRun);
    // Аналіз нічого не пише — його бачить і інспектор; видалення — лише
    // повний адмін.
    const allowed = dryRun ? canViewDeletionQueue(adminUid) : canPurgeAccounts(adminUid);
    if (!adminUid || !allowed) throw new HttpsError('permission-denied', 'Full admins only.');
    const uid = String((request.data || {}).uid || '');
    if (!isValidUid(uid) || isProtectedUid(uid)) throw new HttpsError('invalid-argument', 'Invalid account id.');

    const db = getDatabase();
    const queued = (await db.ref(`${ACCOUNT_DELETIONS_ROOT}/${uid}`).get()).val();
    // Лише те, що людина сама попросила видалити: живий акаунт адмін цим
    // шляхом не зітре навіть помилковим дотиком.
    if (!queued) throw new HttpsError('not-found', 'This account is not waiting for deletion.');

    const result = await purgeAccountData({
      ...accountDeletionDeps(),
      log: (step, error) => logger.error('account purge step failed', { uid, step, dryRun, error: error.message }),
    }, uid, { dryRun });
    if (dryRun) {
      logger.info('account purge analysed', { uid, by: adminUid, steps: result.plan.steps.length, failed: result.failed });
      return { dryRun: true, plan: result.plan, failed: result.failed, draftIds: result.draftIds };
    }
    logger.info('account purged', { uid, by: adminUid, failed: result.failed, counts: result.counts });
    return { complete: result.complete, failed: result.failed, counts: result.counts, draftIds: result.draftIds };
  },
);

/**
 * Журнал змін карток стрічки (`cardChanges.js`): запис у
 * `matchingCards/{cardId}` — поля, всієї картки, її видалення — ставить
 * `matchingCardChanges/{cardId}` = 15-хвилинний кошик часу; сховані картки й
 * сама дата входу туди не потрапляють (`shouldRecordCardChange`). Пристрій читача питає журнал
 * один раз на відкриття стрічки й перечитує лише змінене. Тригер, а не
 * писачі: пропущений писач лишав би картку застарілою в кожного читача.
 */
const { MATCHING_CARDS_ROOT, recordCardChange } = require('./cardChanges');
const { syncFeedIndexEntry } = require('./feedIndex');

exports.recordMatchingCardChange = onValueWritten(
  {
    ref: `${MATCHING_CARDS_ROOT}/{cardId}`,
    // Тригер бази — у регіоні самої бази (див. `deliverPasswordResetEmail`).
    region: DATABASE_REGION,
    // Telegram — для сповіщень адміна про нові й опубліковані анкети.
    secrets: [TELEGRAM_BOT_TOKEN],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
    // Загублений запис журналу — це картка, яку пристрої вважатимуть
    // незмінною (зокрема сховану — видимою), тож збій запису не ковтається:
    // помилка йде нагору, і Eventarc повторює подію. Запис ідемпотентний
    // (той самий кошик часу або новіший), тож повтор нічого не псує.
    retry: true,
  },
  async event => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    const setValue = (path, value) => getDatabase().ref(path).set(value);
    try {
      await recordCardChange(event.params.cardId, { before, after, setValue });
    } catch (error) {
      logger.error('card change journal write failed', { cardId: event.params.cardId, error: error.message });
      throw error;
    }
    // Перелік опублікованих (`feedIndex.js`) — той самий тригер: він уже
    // бачить кожен запис картки. Збій так само йде на повтор: загублений
    // запис означав би опубліковану картку, якої пошук і стрічка донорки не
    // бачать, або сховану, яку вони вважають опублікованою.
    try {
      await syncFeedIndexEntry(event.params.cardId, { before, after, setValue });
    } catch (error) {
      logger.error('feed index write failed', { cardId: event.params.cardId, error: error.message });
      throw error;
    }
    // Після основної роботи: збій тут ковтається, а повтор події (на збій
    // вище) сюди ще не дійшов би — подія в журналі адміна не задвоїться.
    await recordActivity(adminActivity.classifyCardWrite({
      cardId: event.params.cardId, before, after, actor: event.authId || '',
    }), event, event.params.cardId);
  },
);

/**
 * Прапорець картки «є публічні відгуки» (`publicReviewFlag.js`): поява чи
 * зникнення відгуку в `comments/{profileId}` перераховує
 * `matchingCards/{profileId}/hasPublicReview`. Доти його писав клієнт і перед
 * видаленням читав, чи лишились інші відгуки, — без звʼязку те читання
 * висіло, і зняти чи поправити відгук через чергу пристрою було не можна.
 */
const {
  PUBLIC_COMMENTS_ROOT,
  MATCHING_CARDS_ROOT: REVIEW_FLAG_CARDS_ROOT,
  changesReview,
  changesReviewPresence,
  stampReviewsChange,
  syncPublicReviewFlag,
} = require('./publicReviewFlag');

exports.syncPublicReviewFlag = onValueWritten(
  {
    ref: `${PUBLIC_COMMENTS_ROOT}/{profileId}/{commentId}`,
    region: DATABASE_REGION,
    secrets: [TELEGRAM_BOT_TOKEN],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
    // Загублений прапорець — це відгук, якого стрічка не покаже (або порожня
    // доріжка там, де відгуків уже немає); перерахунок ідемпотентний.
    retry: true,
  },
  async event => {
    const before = event.data.before.val();
    const after = event.data.after.val();
    if (!changesReview(before, after)) return;
    const { profileId } = event.params;
    const updateCard = (id, updater) => getDatabase().ref(`${REVIEW_FLAG_CARDS_ROOT}/${id}`).transaction(updater);
    try {
      if (changesReviewPresence(before, after)) {
        await syncPublicReviewFlag(profileId, {
          readHasAny: async id => {
            const snapshot = await getDatabase().ref(`${PUBLIC_COMMENTS_ROOT}/${id}`).orderByKey().limitToFirst(1).get();
            return snapshot.exists();
          },
          updateCard,
        });
      }
      // Кожен запис відгуку — нова версія відгуків картки: від неї змінюється
      // картка, журнал змін каже про неї іншим пристроям, а їхній кеш
      // відгуків перечитується (`fetchPublicProfileCommentsCached`).
      await stampReviewsChange(profileId, { updateCard });
    } catch (error) {
      logger.error('public review flag sync failed', { profileId, error: error.message });
      throw error;
    }
    await recordActivity(adminActivity.classifyReviewWrite({ cardId: profileId, before, after }), event);
  },
);

/**
 * Версія позначок власника (`ownerMarks.js`): кожен запис памʼятки, реакції,
 * дати «Відкласти» чи переліку «лише для вподобаних» ставить
 * `multiData/ownerMarksAt/{власник}/{вид}`. Пристрій питає її раз на вкладку
 * й забуває застарілий кеш цього виду — інакше правку з іншого пристрою чи
 * від спільного власника він показував би лише через шість годин.
 * Тригер на вид, а не один на `multiData/{вид}/…`: інакше функція
 * прокидалась би на кожен запис доповнень, програм і решти `multiData`.
 */
const {
  OWNER_MARKS_ROOT,
  changesOwnerMark,
  stampOwnerMarkChange,
} = require('./ownerMarks');

// Імена — явними `exports.…`: `deploy-functions.yml` звіряє розгорнуті
// функції з рядками `exports.<імʼя>` цього файлу, і згенеровані в циклі
// експорти він не побачив би — деплой зупинився б як «функція є в проді,
// а в коді немає».
const recordOwnerMarkChange = kind => onValueWritten(
  {
    ref: `${OWNER_MARKS_ROOT}/${kind}/{ownerId}/{entryId}`,
    region: DATABASE_REGION,
    secrets: [TELEGRAM_BOT_TOKEN],
    memory: '256MiB',
    timeoutSeconds: 30,
    maxInstances: 10,
    // Загублена версія — це памʼятка чи реакція, яку інший пристрій покаже
    // старою до TTL; запис ідемпотентний (лише вгору).
    retry: true,
  },
  async event => {
    if (!changesOwnerMark(event.data.before.val(), event.data.after.val())) return;
    try {
      await stampOwnerMarkChange(event.params.ownerId, kind, {
        updateVersion: (path, updater) => getDatabase().ref(path).transaction(updater),
      });
    } catch (error) {
      logger.error('owner mark version write failed', { kind, ownerId: event.params.ownerId, error: error.message });
      throw error;
    }
    // Лайки, дизлайки й «Відкласти» — у журнал адміна (памʼятки — особисті, ні).
    const params = { cardId: event.params.entryId, before: event.data.before.val(), after: event.data.after.val(), now: Date.now() };
    let activity = [];
    if (kind === 'favorites' || kind === 'dislikes') activity = adminActivity.classifyReactionWrite({ kind, ...params });
    else if (kind === 'getInTouch') activity = adminActivity.classifyPostponeWrite(params);
    if (activity.length) await recordActivity(activity, event, event.params.ownerId);
  },
);

exports.recordOwnerCommentsChange = recordOwnerMarkChange('comments');
exports.recordOwnerFavoritesChange = recordOwnerMarkChange('favorites');
exports.recordOwnerDislikesChange = recordOwnerMarkChange('dislikes');
exports.recordOwnerGetInTouchChange = recordOwnerMarkChange('getInTouch');
exports.recordOwnerLikedAudienceChange = recordOwnerMarkChange('likedAudience');

/**
 * Сповіщення адміна про дії користувачів (`adminActivity.js`): журнал
 * `adminActivity/events`, миттєві сповіщення й дайджести за налаштуваннями
 * `adminNotificationSettings/{uid}` (сторінка `/notifications`). Звичайні
 * користувачі сповіщень не отримують. Збій тут не валить основну роботу
 * тригера й не йде на повтор: повтор задвоїв би подію в журналі.
 */
const { getMessaging } = require('firebase-admin/messaging');
const adminActivity = require('./adminActivity');

const buildActivityDeps = () => {
  const database = getDatabase();
  return {
    // Пауза перед повторним читанням контактів нової реєстрації (пошук дубля).
    sleep: ms => new Promise(resolve => { setTimeout(resolve, ms); }),
    db: {
      ...createAdminDb(database),
      update: updates => database.ref().update(updates),
      push: (path, value) => database.ref(path).push(value),
      // Увесь проміжок сторінками: відлік дайджесту вже посунуто, і подія,
      // що не влізла б в одну сторінку, не потрапила б ні в цей дайджест, ні
      // в наступний. Стеля — 20 сторінок (10 тис. подій) на дайджест.
      queryEventsBetween: async (since, until) => {
        const rows = [];
        let cursor = null;
        for (let page = 0; page < 20; page += 1) {
          const base = database.ref(adminActivity.EVENTS_PATH).orderByChild('t');
          const ranged = cursor ? base.startAfter(cursor.t, cursor.key) : base.startAfter(since);
          // eslint-disable-next-line no-await-in-loop
          const snapshot = await ranged.endAt(until).limitToFirst(500).get();
          let count = 0;
          snapshot.forEach(child => {
            count += 1;
            const value = child.val();
            rows.push(value);
            cursor = { t: value && value.t, key: child.key };
          });
          if (count < 500) break;
        }
        return rows;
      },
      // Прибирання — доки не вичищено весь прострочений проміжок, а не одна
      // порція на день: інакше на жвавій базі журнал з іменами жив би довше
      // обіцяних 30 днів. Стеля — 20 порцій за прогін.
      removeOlderThan: async (eventsCutoff, dedupCutoff) => {
        for (let round = 0; round < 20; round += 1) {
          // eslint-disable-next-line no-await-in-loop
          const old = await database.ref(adminActivity.EVENTS_PATH).orderByChild('t').endAt(eventsCutoff).limitToFirst(500).get();
          // eslint-disable-next-line no-await-in-loop
          const oldDedup = await database.ref(adminActivity.DEDUP_PATH).orderByValue().endAt(dedupCutoff).limitToFirst(500).get();
          const updates = {};
          old.forEach(child => { updates[`${adminActivity.EVENTS_PATH}/${child.key}`] = null; });
          oldDedup.forEach(child => { updates[`${adminActivity.DEDUP_PATH}/${child.key}`] = null; });
          if (!Object.keys(updates).length) break;
          // eslint-disable-next-line no-await-in-loop
          await database.ref().update(updates);
          if (old.numChildren() < 500 && oldDedup.numChildren() < 500) break;
        }
      },
      // Залишки сповіщень донорці (14.11): лічильники лайків і push-токени
      // не-адмінів. Push тепер отримують лише адміни, тож решта токенів —
      // мертвий вантаж; знімаються разом із щоденним прибиранням.
      removeLegacyNotificationData: async staffUids => {
        const tokens = (await database.ref('pushTokens').get()).val() || {};
        const updates = { likeNotifications: null };
        Object.keys(tokens).forEach(uid => { if (!staffUids.includes(uid)) updates[`pushTokens/${uid}`] = null; });
        await database.ref().update(updates);
      },
    },
    isExcludedActor: async uid => adminActivity.isExcludedActorUid(uid),
    resolveTelegramChat: async uid => {
      const accounts = (await database.ref('telegramAccounts').orderByChild('uid').equalTo(uid).get()).val() || {};
      return Object.keys(accounts).find(key => accounts[key] && accounts[key].uid === uid) || null;
    },
    sendTelegram: (chatId, html, { silent } = {}) => createTelegramSender(TELEGRAM_BOT_TOKEN.value())(chatId, html, null, { html: true, silent }),
    sendPush: async ({ tokens, data }) => {
      const result = await getMessaging().sendEachForMulticast({
        tokens,
        data,
        webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
      });
      return result.responses.map(response => ({ success: response.success, errorCode: response.error ? response.error.code : '' }));
    },
    now: Date.now(),
  };
};

/** Події одного запису бази → журнал і сповіщення. Ніколи не кидає. */
const recordActivity = async (events, event, pathActor = '') => {
  try {
    const outcome = await adminActivity.recordAdminEvents(
      events,
      { actor: event.authId || '', authType: event.authType || 'unknown', pathActor },
      buildActivityDeps(),
    );
    if (outcome !== 'none') logger.info('admin activity', { outcome });
  } catch (error) {
    logger.error('admin activity failed', { error: error.message });
  }
};

const ACTIVITY_TRIGGER_OPTIONS = {
  region: DATABASE_REGION,
  secrets: [TELEGRAM_BOT_TOKEN],
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 5,
};

const activityTrigger = (ref, classify, actorParam) => onValueWritten(
  { ...ACTIVITY_TRIGGER_OPTIONS, ref },
  async event => {
    const events = classify({ ...event.params, before: event.data.before.val(), after: event.data.after.val(), now: Date.now() });
    if (!events.length) return;
    await recordActivity(events, event, actorParam ? event.params[actorParam] : '');
  },
);

exports.recordAdminActivityEdits = activityTrigger(
  'multiData/edits/{cardId}/{editorId}', adminActivity.classifyEditsWrite, 'editorId',
);
exports.recordAdminActivityDrafts = activityTrigger(
  'multiData/profileMutations/{authorId}/{cardId}', adminActivity.classifyDraftWrite, 'authorId',
);
exports.recordAdminActivityContacts = activityTrigger(
  'multiData/contactViews/{viewerId}/{cardId}', adminActivity.classifyContactWrite, 'viewerId',
);
exports.recordAdminActivitySearches = activityTrigger(
  'multiData/searchQueries/{ownerId}/{queryKey}', adminActivity.classifySearchWrite, 'ownerId',
);
exports.recordAdminActivityShares = activityTrigger(
  'profileShares/{token}', adminActivity.classifyShareWrite, '',
);
exports.recordAdminActivityDeletions = activityTrigger(
  'accountDeletions/{uid}', adminActivity.classifyAccountDeletion, '',
);

/** Стан каналів для сторінки `/notifications`: Telegram привʼязано? скільки пристроїв? */
exports.adminNotificationStatus = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, memory: '256MiB', timeoutSeconds: 20 },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid || !adminActivity.isStaffUid(uid)) throw new HttpsError('permission-denied', 'Admins only.');
    return adminActivity.readNotificationStatus(uid, buildActivityDeps());
  },
);

/** «Звіт за тиждень зараз» на сторінці `/notifications`. */
exports.sendAdminWeeklyReport = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: [TELEGRAM_BOT_TOKEN], memory: '256MiB', timeoutSeconds: 60 },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid || !adminActivity.isStaffUid(uid)) throw new HttpsError('permission-denied', 'Admins only.');
    const outcomes = await adminActivity.sendWeeklyReportNow(uid, buildActivityDeps());
    return { outcomes };
  },
);

/** «Надіслати тестове» на сторінці `/notifications` — увімкненими каналами викликача. */
exports.sendAdminTestNotification = onCall(
  { region: REGION, cors: ALLOWED_ORIGINS, secrets: [TELEGRAM_BOT_TOKEN], memory: '256MiB', timeoutSeconds: 30 },
  async request => {
    const uid = request.auth && request.auth.uid;
    if (!uid || !adminActivity.isStaffUid(uid)) throw new HttpsError('permission-denied', 'Admins only.');
    const outcomes = await adminActivity.sendTestNotification(uid, buildActivityDeps());
    return { outcomes };
  },
);
