'use strict';

/**
 * Cloud Functions KnowMe. Поки тут одна — власний лист підтвердження пошти.
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

const { onCall, HttpsError } = require('firebase-functions/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

const { ALLOWED_ORIGINS, MAIL_SENDER, REGION } = require('./config');
const { normalizeEmailLanguage, normalizeEmailRole, renderVerifyEmail } = require('./emails/verifyEmail');
const { buildVerifyEmailActionLink, extractOobCode } = require('./emails/actionLink');
const { decideGlobalSend, decideVerificationSend, emailQuotaKey } = require('./verificationQuota');
const { sendWithBrevo } = require('./mail/brevo');

initializeApp();

const BREVO_API_KEY = defineSecret('BREVO_API_KEY');

const QUOTA_ROOT = 'emailVerificationSends';

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
 * Три межі по черзі: акаунт, адреса, усі разом. Відмова будь-якої віддає
 * місця, вже зайняті попередніми. Межа людини — `resource-exhausted`
 * (застосунок стандартного листа не шле), стеля на всіх — `unavailable`
 * (застосунок шле стандартний лист Firebase із власними межами).
 */
const claimSendSlots = async (uid, email, now) => {
  const claimed = [];
  const releaseAll = () => Promise.all(claimed.map(release => release()));
  const steps = [
    [`${QUOTA_ROOT}/byUid/${uid}`, decideVerificationSend, 'resource-exhausted'],
    [`${QUOTA_ROOT}/byEmail/${emailQuotaKey(email)}`, decideVerificationSend, 'resource-exhausted'],
    [`${QUOTA_ROOT}/total`, decideGlobalSend, 'unavailable'],
  ];
  for (const [path, decide, refusal] of steps) {
    const { release, reason } = await claimSlot(path, decide, now);
    if (!release) {
      await releaseAll();
      logger.warn('verification email refused by quota', { uid, reason });
      throw new HttpsError(refusal, 'Too many verification emails. Try again later.', { reason });
    }
    claimed.push(release);
  }
  return releaseAll;
};

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
