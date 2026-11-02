'use strict';

/**
 * Лист «Підтвердіть пошту» — HTML і текстова версія.
 *
 * Це той самий шаблон, що й мокап, затверджений перед роботою: таблиці й
 * інлайн-стилі, бо поштові клієнти (Gmail, Outlook) зовнішніх стилів не
 * читають, а `<style>` частина з них викидає. Тому кожен колір стоїть двічі:
 * інлайном для світлої теми й класом у `<style>` для темної — її беруть Apple
 * Mail, iOS і Outlook; Gmail перефарбовує лист сам.
 *
 * Модуль чистий — без firebase, без мережі, — тож його тестують `node --test`
 * і він же годиться для прев'ю.
 *
 * Мов дві: українська й англійська. Решта мов застосунку отримує англійську —
 * для того, хто обрав не українську, вона ближча (так само вирішено в
 * `src/utils/locales`). Новий рядок листа дописується в обидві.
 */

const APP_URL = 'https://knowme.pp.ua';

const ROLE_COLORS = Object.freeze({
  // Ті самі кольори, що в `src/components/matchingRoleColors.js`.
  ed: '#C95B83',
  sm: '#8A5EC2',
  ip: '#3F9B8E',
  ag: '#4D86C9',
  cl: '#4A9BC9',
});

const EMAIL_ROLES = Object.freeze(Object.keys(ROLE_COLORS));

const COPY = {
  uk: {
    subject: 'Підтвердіть пошту для KnowMe',
    preheader: 'Один дотик, і акаунт KnowMe готовий.',
    h1: 'Вітаємо в KnowMe!',
    lead: 'Акаунт створено. Залишилось підтвердити, що адреса {email} належить вам.',
    cta: 'Підтвердити пошту',
    why: 'Підтверджена пошта допоможе повернути акаунт, якщо ви забудете пароль.',
    next: 'Що далі',
    fallback: 'Кнопка не відкривається? Скопіюйте посилання в браузер:',
    sign: 'Команда KnowMe',
    footer: 'Ви отримали цей лист, бо адресу {email} вказали під час реєстрації в KnowMe. Якщо це були не ви, просто проігноруйте його.',
    policy: 'Політика конфіденційності',
    generic: {
      chip: '',
      steps: [
        ['Заповніть анкету', 'Почніть з основного: імʼя, місто й телефон.'],
        ['Додайте фото', 'Перше фото стане головним у стрічці.'],
        ['Опублікуйте', 'Анкету побачать ті, кому вона цікава.'],
      ],
    },
    roles: {
      ed: {
        chip: 'Анкета донора ооцитів',
        steps: [
          ['Заповніть анкету', 'Для публікації вистачить девʼяти основних полів.'],
          ['Додайте фото', 'Перше фото стане головним у стрічці.'],
          ['Опублікуйте анкету', 'Її побачать агенції, клініки й батьки, а ви їхні програми.'],
        ],
      },
      sm: {
        chip: 'Анкета сурогатної мами',
        steps: [
          ['Заповніть анкету', 'Коротко про здоровʼя, пологи й умови програми.'],
          ['Додайте фото', 'Перше фото стане головним у стрічці.'],
          ['Опублікуйте анкету', 'Її побачать агенції й батьки, а ви їхні програми.'],
        ],
      },
      ip: {
        chip: 'Біологічні батьки',
        steps: [
          ['Розкажіть про себе', 'Як до вас звертатись, місто й кілька слів «Про нас».'],
          ['Вкажіть, кого шукаєте', 'Донорку, сурогатну маму, агенцію чи клініку.'],
          ['Гортайте стрічку', 'Анкети й програми, які відповідають вашому запиту.'],
        ],
      },
      ag: {
        chip: 'Акаунт агенції',
        steps: [
          ['Заповніть картку агенції', 'Назва, контактна особа, місто й телефон.'],
          ['Додайте програми', 'Винагорода, вимоги до кандидаток і що покривається.'],
          ['Опублікуйте', 'Донори й сурогатні мами побачать ваші програми в стрічці.'],
        ],
      },
      cl: {
        chip: 'Акаунт клініки',
        steps: [
          ['Заповніть картку клініки', 'Назва, контактна особа, місто й телефон.'],
          ['Додайте програми', 'Винагорода, вимоги до кандидаток і що покривається.'],
          ['Опублікуйте', 'Донори й сурогатні мами побачать ваші програми в стрічці.'],
        ],
      },
    },
  },
  en: {
    subject: 'Confirm your email for KnowMe',
    preheader: 'One tap and your KnowMe account is ready.',
    h1: 'Welcome to KnowMe!',
    lead: 'Your account is ready. Please confirm that {email} is your address.',
    cta: 'Confirm email',
    why: 'A confirmed email lets you get back into your account if you forget your password.',
    next: 'What’s next',
    fallback: 'Button not working? Copy this link into your browser:',
    sign: 'The KnowMe team',
    footer: 'You’re receiving this because {email} was used to sign up for KnowMe. If that wasn’t you, just ignore this email.',
    policy: 'Privacy policy',
    generic: {
      chip: '',
      steps: [
        ['Fill in your profile', 'Start with the basics: name, city and phone.'],
        ['Add photos', 'Your first photo becomes the main one in the feed.'],
        ['Publish', 'People who are looking for you will see your profile.'],
      ],
    },
    roles: {
      ed: {
        chip: 'Egg donor profile',
        steps: [
          ['Fill in your profile', 'Nine key fields are enough to publish.'],
          ['Add photos', 'Your first photo becomes the main one in the feed.'],
          ['Publish your profile', 'Agencies, clinics and parents will see it, and you’ll see their programs.'],
        ],
      },
      sm: {
        chip: 'Surrogate profile',
        steps: [
          ['Fill in your profile', 'A short form about health, births and program terms.'],
          ['Add photos', 'Your first photo becomes the main one in the feed.'],
          ['Publish your profile', 'Agencies and parents will see it, and you’ll see their programs.'],
        ],
      },
      ip: {
        chip: 'Intended parents',
        steps: [
          ['Tell us about yourselves', 'How to address you, your city and a few words “About us”.'],
          ['Say who you’re looking for', 'An egg donor, a surrogate, an agency or a clinic.'],
          ['Browse the feed', 'Profiles and programs that match your search.'],
        ],
      },
      ag: {
        chip: 'Agency account',
        steps: [
          ['Fill in the agency card', 'Name, contact person, city and phone.'],
          ['Add your programs', 'Compensation, requirements and what’s covered.'],
          ['Publish', 'Donors and surrogates will see your programs in the feed.'],
        ],
      },
      cl: {
        chip: 'Clinic account',
        steps: [
          ['Fill in the clinic card', 'Name, contact person, city and phone.'],
          ['Add your programs', 'Compensation, requirements and what’s covered.'],
          ['Publish', 'Donors and surrogates will see your programs in the feed.'],
        ],
      },
    },
  },
};

/** Мова листа: українська лишається українською, решта — англійська. */
const normalizeEmailLanguage = value => (String(value || '').trim().toLowerCase().startsWith('uk') ? 'uk' : 'en');

/**
 * Роль для листа. Роль картки буває рядком, масивом («і донорка, і агенція») і
 * рядком через кому; поточна — **остання** (так її читає стрічка,
 * `resolveViewerCurrentRole`). Невідома роль — це загальний варіант листа, а не
 * помилка: лист однаково мусить піти.
 */
const normalizeEmailRole = value => {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const known = list
    .map(item => String(item || '').trim().toLowerCase())
    .filter(item => EMAIL_ROLES.includes(item));
  return known.length ? known[known.length - 1] : '';
};

const escapeHtml = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Колір `hex`, змішаний з `baseHex` у пропорції `amount` (0–1). */
const mixHex = (hex, baseHex, amount) => {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(baseHex.slice(1), 16);
  const channel = (shift) => Math.round(((a >> shift) & 255) * amount + ((b >> shift) & 255) * (1 - amount));
  const value = (1 << 24) + (channel(16) << 16) + (channel(8) << 8) + channel(0);
  return `#${value.toString(16).slice(1).toUpperCase()}`;
};

const FONT = "'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * @param {object} options
 * @param {string} options.email   — адреса, яку підтверджують
 * @param {string} options.link    — посилання з кнопки (`/auth/action?...`)
 * @param {string} [options.language]
 * @param {string|string[]} [options.role]
 * @param {boolean} [options.forceDark] — лише для прев'ю: темна версія без теми клієнта
 * @returns {{ subject: string, preheader: string, html: string, text: string, language: string, role: string }}
 */
const renderVerifyEmail = ({ email, link, language, role, forceDark = false } = {}) => {
  if (!email) throw new Error('renderVerifyEmail: email is required');
  if (!link) throw new Error('renderVerifyEmail: link is required');

  const lang = normalizeEmailLanguage(language);
  const roleCode = normalizeEmailRole(role);
  const t = COPY[lang];
  const variant = roleCode ? t.roles[roleCode] : t.generic;
  const roleColor = roleCode ? ROLE_COLORS[roleCode] : '';
  const policyUrl = `${APP_URL}/policy`;
  const safeLink = escapeHtml(link);
  const safeEmail = escapeHtml(email);
  const emailStrong = `<b class="km-text" style="color:#1A1A1A;font-weight:600">${safeEmail}</b>`;

  const darkRules = [
    '.km-bg{background:#14100C!important}',
    '.km-card{background:#1F1A15!important;border-color:#3A3128!important}',
    '.km-text{color:#FFF8EC!important}',
    '.km-body{color:#E9E1D3!important}',
    '.km-muted{color:#B8AE9F!important}',
    '.km-rule{border-color:#3A3128!important}',
    '.km-num{background:#3A2614!important;color:#F5A24B!important}',
    '.km-link{color:#F5A24B!important}',
    '.km-dot span{color:#F08A2C!important}',
    roleColor ? `.km-chip{background:${mixHex(roleColor, '#1F1A15', 0.24)}!important}` : '',
  ].join('');

  const chip = variant.chip
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 18px"><tr>'
      + `<td class="km-chip" style="background:${mixHex(roleColor, '#FFFFFF', 0.12)};border-radius:999px;padding:6px 12px 6px 10px;font-family:${FONT};font-size:13px;line-height:16px;font-weight:600">`
      + `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${roleColor};vertical-align:middle;margin-right:7px"></span>`
      + `<span class="km-text" style="color:#1A1A1A;vertical-align:middle">${escapeHtml(variant.chip)}</span>`
      + '</td></tr></table>'
    : '<div style="height:30px;line-height:30px;font-size:0">&nbsp;</div>';

  const steps = variant.steps
    .map(([title, text], index) => '<tr>'
      + '<td style="padding:0 0 16px 0;vertical-align:top;width:36px">'
      + `<div class="km-num" style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#FCEBDC;color:#9A470A;font-family:${FONT};font-size:13px;font-weight:700;text-align:center">${index + 1}</div>`
      + `</td><td style="padding:2px 0 16px 0;vertical-align:top;font-family:${FONT}">`
      + `<div class="km-text" style="font-size:15px;line-height:22px;font-weight:600;color:#1A1A1A">${escapeHtml(title)}</div>`
      + `<div class="km-muted" style="font-size:14px;line-height:21px;color:#62665F">${escapeHtml(text)}</div>`
      + '</td></tr>')
    .join('');

  // Прехедер — рядок під темою у списку вхідних. Пробіли нульової ширини після
  // нього не дають клієнтові дописати туди початок тексту листа.
  const preheaderPad = '&#8199;&#847;'.repeat(40);

  const html = '<!doctype html>'
    + `<html lang="${lang}" xmlns="http://www.w3.org/1999/xhtml">`
    + '<head>'
    + '<meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="x-apple-disable-message-reformatting">'
    + '<meta name="color-scheme" content="light dark">'
    + '<meta name="supported-color-schemes" content="light dark">'
    + `<title>${escapeHtml(t.subject)}</title>`
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&display=swap" rel="stylesheet">'
    + '<style>'
    + 'body{margin:0;padding:0;-webkit-text-size-adjust:100%}'
    + 'a{text-decoration:none}'
    + '@media (max-width:600px){'
    + '.km-outer{padding:16px 10px 28px!important}'
    + '.km-card{padding:28px 22px 24px!important;border-radius:16px!important}'
    + '.km-h1{font-size:26px!important;line-height:32px!important}'
    + '.km-btn,.km-btn td{width:100%!important}'
    + '.km-btn a{display:block!important;box-sizing:border-box;text-align:center}'
    + '}'
    + `@media (prefers-color-scheme:dark){${darkRules}}`
    + '[data-ogsc] .km-card{background:#1F1A15!important}'
    + (forceDark ? darkRules : '')
    + '</style>'
    + '</head>'
    + '<body class="km-bg" style="margin:0;padding:0;background:#F3F0EB">'
    + `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F3F0EB;opacity:0">${escapeHtml(t.preheader)}${preheaderPad}</div>`
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="km-bg" style="background:#F3F0EB">'
    + '<tr><td align="center" class="km-outer" style="padding:32px 16px 40px">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">'
    + `<tr><td class="km-card" style="background:#FFFFFF;border:1px solid #E8E5E0;border-radius:20px;padding:36px 40px 32px;font-family:${FONT}">`
    + `<div class="km-text km-dot" style="font-family:${FONT};font-size:22px;line-height:26px;font-weight:700;letter-spacing:-0.4px;color:#1A1A1A">KnowMe<span style="color:#C9600F">.</span></div>`
    + chip
    + `<h1 class="km-text km-h1" style="margin:0 0 12px;font-family:${FONT};font-size:30px;line-height:36px;font-weight:700;letter-spacing:-0.5px;color:#1A1A1A">${escapeHtml(t.h1)}</h1>`
    + `<p class="km-body" style="margin:0 0 26px;font-size:16px;line-height:25px;color:#3A3A36">${escapeHtml(t.lead).replace('{email}', emailStrong)}</p>`
    + '<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="km-btn"><tr>'
    + '<td align="center" bgcolor="#C9600F" style="border-radius:12px;background:#C9600F">'
    + `<a href="${safeLink}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:17px;line-height:20px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:12px">${escapeHtml(t.cta)}</a>`
    + '</td></tr></table>'
    + `<p class="km-muted" style="margin:14px 0 0;font-size:14px;line-height:21px;color:#62665F">${escapeHtml(t.why)}</p>`
    + '<div class="km-rule" style="border-top:1px solid #EEEAE4;margin:30px 0 22px;font-size:0;line-height:0">&nbsp;</div>'
    + `<div class="km-muted" style="margin:0 0 14px;font-size:13px;line-height:18px;font-weight:600;color:#62665F">${escapeHtml(t.next)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`
    + '<div class="km-rule" style="border-top:1px solid #EEEAE4;margin:8px 0 18px;font-size:0;line-height:0">&nbsp;</div>'
    + `<p class="km-muted" style="margin:0 0 6px;font-size:13px;line-height:19px;color:#62665F">${escapeHtml(t.fallback)}</p>`
    + `<p style="margin:0 0 22px;font-size:13px;line-height:19px;word-break:break-all"><a href="${safeLink}" target="_blank" class="km-link" style="color:#9A470A;text-decoration:underline">${safeLink}</a></p>`
    + `<p class="km-text" style="margin:0;font-size:15px;line-height:22px;font-weight:600;color:#1A1A1A">${escapeHtml(t.sign)}</p>`
    + '</td></tr>'
    + `<tr><td style="padding:20px 8px 0;font-family:${FONT};text-align:center">`
    + `<p class="km-muted" style="margin:0 0 8px;font-size:12px;line-height:18px;color:#8A867F">${escapeHtml(t.footer).replace('{email}', safeEmail)}</p>`
    + `<p style="margin:0;font-size:12px;line-height:18px"><a href="${policyUrl}" target="_blank" class="km-link" style="color:#9A470A;text-decoration:underline">${escapeHtml(t.policy)}</a></p>`
    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>';

  // Текстова версія: її показують клієнти без HTML, і з нею лист рідше
  // потрапляє в спам.
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
    `${t.next}:`,
    ...variant.steps.map(([title, line], index) => `${index + 1}. ${title}. ${line}`),
    '',
    t.sign,
    '',
    t.footer.replace('{email}', email),
    `${t.policy}: ${policyUrl}`,
  ].join('\n');

  return { subject: t.subject, preheader: t.preheader, html, text, language: lang, role: roleCode };
};

module.exports = {
  APP_URL,
  EMAIL_ROLES,
  normalizeEmailLanguage,
  normalizeEmailRole,
  renderVerifyEmail,
};
