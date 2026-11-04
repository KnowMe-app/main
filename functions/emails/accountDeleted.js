'use strict';

/**
 * Лист «Профіль видалено» — підтвердження, що самовидалення справді відбулось.
 *
 * Кнопки в листі немає навмисно: акаунта вже немає, вести нема куди. Лист лише
 * каже, що сталося, і що робити, якщо це зробив не сам власник (відповісти на
 * лист — адреса відправника справжня).
 */

const {
  escapeHtml,
  heading,
  lead,
  normalizeEmailLanguage,
  renderShell,
  rule,
  signature,
  spacer,
  strong,
  wordmark,
} = require('./layout');

const COPY = {
  uk: {
    subject: 'Профіль видалено',
    preheader: 'Ваш профіль у KnowMe видалено.',
    h1: 'Профіль видалено',
    lead: 'Ваш профіль у KnowMe ({email}) видалено разом з анкетою, фото, реакціями й посиланнями. Дякуємо, що були частиною KnowMe.',
    again: 'Захочете повернутись — просто зареєструйтесь знову.',
    safety: 'Якщо ви не видаляли профіль, відповідайте на цей лист — ми розберемось.',
    sign: 'З повагою, команда KnowMe',
    footer: 'Ви отримали цей лист, бо профіль {email} у KnowMe було видалено.',
    policy: 'Політика конфіденційності',
  },
  en: {
    subject: 'Your profile has been deleted',
    preheader: 'Your KnowMe profile has been deleted.',
    h1: 'Profile deleted',
    lead: 'Your KnowMe profile ({email}) has been deleted together with its details, photos, reactions and links. Thank you for being part of KnowMe.',
    again: 'If you want to come back, just sign up again.',
    safety: 'If you didn’t delete your profile, reply to this email and we’ll look into it.',
    sign: 'Kind regards, the KnowMe team',
    footer: 'You’re receiving this because the profile {email} was deleted from KnowMe.',
    policy: 'Privacy policy',
  },
};

const renderAccountDeletedEmail = ({ email, language, forceDark = false } = {}) => {
  if (!email) throw new Error('renderAccountDeletedEmail: email is required');
  const lang = normalizeEmailLanguage(language);
  const t = COPY[lang];

  const cardHtml = wordmark()
    + spacer(30)
    + heading(t.h1)
    + lead(escapeHtml(t.lead).replace('{email}', strong(email)))
    + `<p class="km-body" style="margin:0 0 4px;font-size:16px;line-height:25px;color:#3A3A36">${escapeHtml(t.again)}</p>`
    + rule(26, 22)
    + `<p class="km-muted" style="margin:0 0 22px;font-size:14px;line-height:21px;color:#62665F">${escapeHtml(t.safety)}</p>`
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
    t.again,
    '',
    t.safety,
    '',
    t.sign,
  ].join('\n');

  return { subject: t.subject, html, text, language: lang };
};

module.exports = { renderAccountDeletedEmail };
