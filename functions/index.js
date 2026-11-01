'use strict';

/**
 * Cloud Functions KnowMe. Поки тут одна — власний лист підтвердження пошти.
 *
 * Чому не стандартний лист Firebase: його текст у консолі не редагується
 * (лише тема, відправник і адреса для відповіді), і людина отримувала сірий
 * англомовний рядок з довгим посиланням на `firebaseapp.com`. Тепер Firebase
 * лише видає одноразовий код (`generateEmailVerificationLink`), а лист —
 * шаблон KnowMe (`emails/verifyEmail.js`) — іде через поштовий сервіс від
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

const { ALLOWED_ORIGINS, MAIL_FROM, REGION } = require('./config');
const { normalizeEmailLanguage, normalizeEmailRole, renderVerifyEmail } = require('./emails/verifyEmail');
const { buildVerifyEmailActionLink, extractOobCode } = require('./emails/actionLink');
const { decideVerificationSend } = require('./verificationQuota');
const { sendWithResend } = require('./mail/resend');

initializeApp();

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');

const quotaRef = uid => getDatabase().ref(`emailVerificationSends/${uid}`);

/**
 * Займає місце в межі відправок. Повертає функцію, що віддає його назад:
 * лист, який не пішов, межу не мусить їсти — інакше п'ять збоїв сервісу за
 * добу лишали б людину без жодного листа (на `resource-exhausted` застосунок
 * навмисно не шле й стандартного).
 */
const claimSendSlot = async (uid, now) => {
  let decision = null;
  let previous = null;
  const result = await quotaRef(uid).transaction(current => {
    previous = current;
    decision = decideVerificationSend(current, now);
    return decision.allowed ? decision.next : undefined;
  });
  if (!result.committed) {
    throw new HttpsError('resource-exhausted', 'Too many verification emails. Try again later.', {
      reason: decision ? decision.reason : 'unknown',
    });
  }
  return () => quotaRef(uid)
    .transaction(current => (current && current.lastAt === now ? previous || null : undefined))
    .catch(error => logger.warn('verification quota release failed', { uid, error: error.message }));
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
    secrets: [RESEND_API_KEY],
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
    const releaseSlot = await claimSendSlot(uid, now);

    try {
      const generated = await getAuth().generateEmailVerificationLink(user.email);
      const oobCode = extractOobCode(generated);
      if (!oobCode) throw new Error('generated link has no oobCode');

      const link = buildVerifyEmailActionLink({ oobCode, language });
      const message = renderVerifyEmail({ email: user.email, link, language, role });

      const sent = await sendWithResend({
        apiKey: RESEND_API_KEY.value(),
        from: MAIL_FROM,
        to: user.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        idempotencyKey: `verify-${uid}-${now}`,
        tags: [
          { name: 'category', value: 'verify_email' },
          { name: 'language', value: message.language },
        ],
      });

      // Адресу в журнал не пишемо: uid досить, щоб знайти людину.
      logger.info('verification email sent', { uid, language: message.language, role: message.role, id: sent && sent.id });
      return { status: 'sent' };
    } catch (error) {
      await releaseSlot();
      logger.error('verification email failed', { uid, error: error.message, status: error.status });
      throw new HttpsError('unavailable', 'Verification email could not be sent.');
    }
  },
);
