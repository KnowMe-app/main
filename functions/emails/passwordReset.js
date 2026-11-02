'use strict';

/**
 * Лист «Зміна пароля» — HTML і текстова версія.
 *
 * Стандартний лист Firebase на «Забули пароль?» приходив англійською, з темою,
 * яку в консолі вже не змінити (редагування шаблонів проєкту заблоковано), і з
 * посиланням на `firebaseapp.com`. Цей лист — той самий бренд, що й лист
 * підтвердження (`layout.js`), а кнопка веде на `/auth/action` застосунку, де
 * людина задає новий пароль (`AuthActionPage`, режим `resetPassword`).
 *
 * Лист не каже, чи акаунт існує, — він іде лише тоді, коли існує, а відповідь
 * функції однакова в обох випадках (`index.js`).
 */

const {
  POLICY_URL,
  button,
  escapeHtml,
  fallbackLink,
  heading,
  lead,
  normalizeEmailLanguage,
  note,
  renderShell,
  rule,
  signature,
  spacer,
  strong,
  wordmark,
} = require('./layout');

const COPY = {
  uk: {
    subject: 'Зміна пароля в KnowMe',
    preheader: 'Посилання, щоб задати новий пароль.',
    h1: 'Новий пароль',
    lead: 'Ми отримали запит на зміну пароля для акаунта {email}. Натисніть кнопку й задайте новий пароль.',
    cta: 'Задати новий пароль',
    why: 'Посилання одноразове. Якщо воно вже не діє, попросіть новий лист на екрані входу: «Забули пароль?».',
    safety: 'Якщо ви не просили змінити пароль, просто проігноруйте цей лист: пароль лишиться тим самим, і ніхто інший його не змінить.',
    fallback: 'Кнопка не відкривається? Скопіюйте посилання в браузер:',
    sign: 'Команда KnowMe',
    footer: 'Ви отримали цей лист, бо для адреси {email} попросили змінити пароль у KnowMe.',
    policy: 'Політика конфіденційності',
  },
  en: {
    subject: 'Reset your KnowMe password',
    preheader: 'A link to set a new password.',
    h1: 'New password',
    lead: 'We received a request to reset the password for {email}. Tap the button to set a new one.',
    cta: 'Set a new password',
    why: 'The link works once. If it has stopped working, request a new email on the sign-in screen: “Forgot password?”.',
    safety: 'If you didn’t ask to reset your password, just ignore this email: your password stays the same and nobody else can change it.',
    fallback: 'Button not working? Copy this link into your browser:',
    sign: 'The KnowMe team',
    footer: 'You’re receiving this because a password reset was requested for {email} on KnowMe.',
    policy: 'Privacy policy',
  },
};

/**
 * @param {object} options
 * @param {string} options.email
 * @param {string} options.link — `/auth/action?mode=resetPassword&...`
 * @param {string} [options.language]
 * @param {boolean} [options.forceDark]
 */
const renderPasswordResetEmail = ({ email, link, language, forceDark = false } = {}) => {
  if (!email) throw new Error('renderPasswordResetEmail: email is required');
  if (!link) throw new Error('renderPasswordResetEmail: link is required');

  const lang = normalizeEmailLanguage(language);
  const t = COPY[lang];

  const cardHtml = wordmark()
    + spacer(30)
    + heading(t.h1)
    + lead(escapeHtml(t.lead).replace('{email}', strong(email)))
    + button(link, t.cta)
    + note(t.why)
    + rule(30, 22)
    + `<p class="km-muted" style="margin:0 0 22px;font-size:14px;line-height:21px;color:#62665F">${escapeHtml(t.safety)}</p>`
    + fallbackLink(t.fallback, link)
    + signature(t.sign);

  const html = renderShell({
    lang,
    subject: t.subject,
    preheader: t.preheader,
    cardHtml,
    footerText: t.footer.replace('{email}', email),
    policyLabel: t.policy,
    forceDark,
  });

  const text = [
    'KnowMe',
    '',
    t.h1,
    t.lead.replace('{email}', email),
    '',
    `${t.cta}: ${link}`,
    '',
    t.why,
    '',
    t.safety,
    '',
    t.sign,
    '',
    t.footer.replace('{email}', email),
    `${t.policy}: ${POLICY_URL}`,
  ].join('\n');

  return { subject: t.subject, preheader: t.preheader, html, text, language: lang };
};

module.exports = { renderPasswordResetEmail };
