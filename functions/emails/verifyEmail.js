'use strict';

/**
 * Лист «Підтвердіть пошту» — HTML і текстова версія.
 *
 * Той самий шаблон, що й затверджений мокап; розмітка спільна з листом зміни
 * пароля (`layout.js`), тут — лише слова й блок «Що далі» під роль.
 *
 * Модуль чистий — без firebase, без мережі, — тож його тестують `node --test`
 * і він же годиться для прев'ю.
 *
 * Мов дві: українська й англійська. Решта мов застосунку отримує англійську —
 * для того, хто обрав не українську, вона ближча (так само вирішено в
 * `src/utils/locales`). Новий рядок листа дописується в обидві.
 */

const {
  APP_URL,
  FONT,
  POLICY_URL,
  button,
  escapeHtml,
  fallbackLink,
  heading,
  lead,
  mixHex,
  normalizeEmailLanguage,
  note,
  renderShell,
  rule,
  signature,
  spacer,
  strong,
  wordmark,
} = require('./layout');

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

  const chip = variant.chip
    ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 18px"><tr>'
      + `<td class="km-chip" style="background:${mixHex(roleColor, '#FFFFFF', 0.12)};border-radius:999px;padding:6px 12px 6px 10px;font-family:${FONT};font-size:13px;line-height:16px;font-weight:600">`
      + `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${roleColor};vertical-align:middle;margin-right:7px"></span>`
      + `<span class="km-text" style="color:#1A1A1A;vertical-align:middle">${escapeHtml(variant.chip)}</span>`
      + '</td></tr></table>'
    : spacer(30);

  const steps = variant.steps
    .map(([title, text], index) => '<tr>'
      + '<td style="padding:0 0 16px 0;vertical-align:top;width:36px">'
      + `<div class="km-num" style="width:26px;height:26px;line-height:26px;border-radius:13px;background:#FCEBDC;color:#9A470A;font-family:${FONT};font-size:13px;font-weight:700;text-align:center">${index + 1}</div>`
      + `</td><td style="padding:2px 0 16px 0;vertical-align:top;font-family:${FONT}">`
      + `<div class="km-text" style="font-size:15px;line-height:22px;font-weight:600;color:#1A1A1A">${escapeHtml(title)}</div>`
      + `<div class="km-muted" style="font-size:14px;line-height:21px;color:#62665F">${escapeHtml(text)}</div>`
      + '</td></tr>')
    .join('');

  const cardHtml = wordmark()
    + chip
    + heading(t.h1)
    + lead(escapeHtml(t.lead).replace('{email}', strong(email)))
    + button(link, t.cta)
    + note(t.why)
    + rule(30, 22)
    + `<div class="km-muted" style="margin:0 0 14px;font-size:13px;line-height:18px;font-weight:600;color:#62665F">${escapeHtml(t.next)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${steps}</table>`
    + rule(8, 18)
    + fallbackLink(t.fallback, link)
    + signature(t.sign);

  const html = renderShell({
    lang,
    subject: t.subject,
    preheader: t.preheader,
    cardHtml,
    footerText: t.footer.replace('{email}', email),
    policyLabel: t.policy,
    extraDarkRules: roleColor ? `.km-chip{background:${mixHex(roleColor, '#1F1A15', 0.24)}!important}` : '',
    forceDark,
  });

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
    `${t.policy}: ${POLICY_URL}`,
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
