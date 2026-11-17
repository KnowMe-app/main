'use strict';

/**
 * Лист «Акаунти обʼєднано» — іде на пошту другорядного акаунта після злиття
 * (`accountMerge.js`, `mergeAccountInto`).
 *
 * Злиття перемикає вхід у цей акаунт на інший, тож людина мусить дізнатись про
 * це з каналу, якого не контролює той, хто злиття запустив: якщо зливала не
 * вона (вкрадена сесія), відповідь на лист дає адмінові підставу розʼєднати
 * акаунти (`unlinkMergedAccount`).
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
    subject: 'Акаунти KnowMe обʼєднано',
    preheader: 'Вхід у цей акаунт тепер відкриває інший ваш акаунт.',
    h1: 'Акаунти обʼєднано',
    lead: 'Акаунт KnowMe ({email}) обʼєднано з іншим вашим акаунтом ({primary}). Його анкету, Flow, реакції й памʼятки перенесено туди, а вхід у нього тепер відкриває той акаунт.',
    safety: 'Якщо ви цього не робили, відповідайте на цей лист — ми розʼєднаємо акаунти.',
    sign: 'З повагою, команда KnowMe',
    footer: 'Ви отримали цей лист, бо акаунт {email} у KnowMe обʼєднано з іншим.',
    policy: 'Політика конфіденційності',
  },
  en: {
    subject: 'Your KnowMe accounts were merged',
    preheader: 'Signing in to this account now opens your other account.',
    h1: 'Accounts merged',
    lead: 'The KnowMe account ({email}) was merged with your other account ({primary}). Its profile, Flow, reactions and notes were moved there, and signing in to it now opens that account.',
    safety: 'If you didn’t do this, reply to this email and we’ll separate the accounts.',
    sign: 'Kind regards, the KnowMe team',
    footer: 'You’re receiving this because the KnowMe account {email} was merged with another one.',
    policy: 'Privacy policy',
  },
};

const renderAccountMergedEmail = ({ email, primary = '', language, forceDark = false } = {}) => {
  if (!email) throw new Error('renderAccountMergedEmail: email is required');
  const lang = normalizeEmailLanguage(language);
  const t = COPY[lang];
  const primaryLabel = primary || '—';

  const cardHtml = wordmark()
    + spacer(30)
    + heading(t.h1)
    + lead(escapeHtml(t.lead).replace('{email}', strong(email)).replace('{primary}', strong(primaryLabel)))
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
    t.lead.replace('{email}', email).replace('{primary}', primaryLabel),
    '',
    t.safety,
    '',
    t.sign,
  ].join('\n');

  return { subject: t.subject, html, text, language: lang };
};

module.exports = { renderAccountMergedEmail };
