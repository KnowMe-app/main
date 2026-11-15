'use strict';

/**
 * Сповіщення адміна про дії користувачів (14.11, на прохання власниці
 * продукту): нові анкети, правки, доповнення чужих карток, чернетки, лайки й
 * дизлайки, дотики до контактів, відгуки, пошук, посилання, видалення акаунта.
 * Звичайні користувачі сповіщень не отримують зовсім — ні про лайки, ні про
 * що інше (доти донорці писали «вашу анкету вподобали»; це прибрано).
 *
 * Як це працює:
 * - **Тригери бази** класифікують запис (`classify…`) і віддають події сюди.
 *   Автора дає сама подія бази (`event.authId`): так рахується лише те, що
 *   зробив справжній користувач, а не адмін, інспектор, тестові акаунти
 *   тестові акаунти (`QA_UIDS`) чи самі функції (`isExcludedActorUid`).
 * - **Журнал** `adminActivity/events/{push}` — кожна подія, 30 днів. Його
 *   показує сторінка `/notifications`, і з нього складаються дайджести.
 * - **Налаштування** кожного адміна — `adminNotificationSettings/{uid}`:
 *   частота кожного виду (вимкнено / одразу / щогодини / раз на день), канали
 *   (Telegram, push) і тихі години. Немає налаштувань — немає сповіщень
 *   (журнал пишеться однаково).
 * - **Дайджести без планувальника.** Окремої функції за розкладом немає:
 *   кожна подія (і кожен запис картки, зокрема щоденний вхід) перевіряє, чи
 *   не настав час дайджесту, і забирає його транзакцією (`claimDigest`), тож
 *   двічі він не піде. Ціна — дайджест приходить із першою подією після того,
 *   як мине година (чи після 9:00 за Києвом для щоденного); зате ні Cloud
 *   Scheduler, ні його прав у CI не треба, а без подій і слати нічого.
 *
 * Модуль — чиста логіка з підставними залежностями (`deps`), як `telegramAuth`.
 */

const { ADMIN_EVENT_BY_KEY, FREQUENCIES } = require('./adminActivityCatalog');

const EVENTS_PATH = 'adminActivity/events';
const DEDUP_PATH = 'adminActivity/dedup';
const DIGEST_PATH = 'adminActivity/digestState';
const SETTINGS_ROOT = 'adminNotificationSettings';
const PUSH_TOKENS_ROOT = 'pushTokens';
const APP_URL = 'https://knowme.pp.ua';
const NOTIFICATIONS_URL = `${APP_URL}/notifications`;

// Ті самі uid, що й `ADMIN_UIDS` / `READONLY_ADMIN_UIDS` у `src/utils/accessLevel.js`.
const FULL_ADMIN_UIDS = Object.freeze(['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2']);
const INSPECTOR_UID = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
// Отримують сповіщення лише повні адміни. Інспектор — тестовий акаунт: його
// налаштування зберігаються (сторінку видно), але реальна активність людей
// йому не шлеться.
const RECIPIENT_UIDS = FULL_ADMIN_UIDS;
const STAFF_UIDS = Object.freeze([...FULL_ADMIN_UIDS, INSPECTOR_UID]);
// Тестові акаунти (CLAUDE.md, «Звичайні тестові акаунти») — переліком uid, а
// не за поштою `@example.com`: пошту при реєстрації ніхто не перевіряє, і
// будь-хто з такою адресою інакше зник би з журналу адміна. Новий тестовий
// акаунт — новий рядок тут.
const QA_UIDS = Object.freeze([
  'o8wZo0ZHOJhaE3QH2pS1nAzMnV03', // knowme.qa.10191547.a — донорка
  'EfOJemQREjZmYybk76WIK3G9aIx2', // knowme.qa.10191547.b — агенція A
  'rMCqyZH6hRfFckRzo5XTj2s9Fgr2', // knowme.qa.10191547.c — агенція B
  'yaKVDu4G0xM3RFdtrUkRyUaSPFf1', // knowme.qa.10191547.d — донорка
  'SmXhwjGkJNRzthWIbd8tACHM1ai1', // km-qa-ed — донорка
  '8Y4ikBttvEPd49d2lfKxLbRK4H12', // km-qa-ip — біологічні батьки
  'EQkVFJtUFMbOR8DlPqftmxpP2523', // km-qa-ag — агенція
]);
const isExcludedActorUid = uid => STAFF_UIDS.includes(uid) || QA_UIDS.includes(uid);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const RETENTION_MS = 30 * DAY;
const DEDUP_RETENTION_MS = DAY;
const DAILY_DIGEST_HOUR = 9;
const QUIET_FROM_HOUR = 22;
const QUIET_TO_HOUR = 8;
const DIGEST_MAX_LINES = 25;
const KYIV_TZ = 'Europe/Kyiv';
const FLUSH_THROTTLE_MS = 5 * 60 * 1000;
let lastFlushAt = 0;

const ROLE_LABELS = Object.freeze({
  ed: 'донор ооцитів', sm: 'сурогатна мати', ip: 'біологічні батьки', pp: 'біологічні батьки', ag: 'агенція', cl: 'клініка',
});

// --- допоміжне --------------------------------------------------------------

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isFeedDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const truthy = value => value !== null && value !== undefined && value !== false && value !== '';

const escapeHtml = text => String(text ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Поточне значення поля-історії (масив версій — поточна остання). */
const currentValue = value => {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      if (value[index] !== null && value[index] !== undefined) return value[index];
    }
    return '';
  }
  return value ?? '';
};

const normalizeRoles = role => (Array.isArray(role) ? role : String(role || '').split(','))
  .map(item => String(item || '').trim().toLowerCase()).filter(Boolean);

const kyivParts = timestamp => {
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: KYIV_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const get = type => (parts.find(part => part.type === type) || {}).value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), time: `${get('hour')}:${get('minute')}` };
};

const kyivWeekday = timestamp => new Intl.DateTimeFormat('en-US', { timeZone: KYIV_TZ, weekday: 'short' }).format(new Date(timestamp));
const kyivShortDate = timestamp => {
  const { date } = kyivParts(timestamp);
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
};

const isQuietTime = timestamp => {
  const { hour } = kyivParts(timestamp);
  return hour >= QUIET_FROM_HOUR || hour < QUIET_TO_HOUR;
};

/** Номер телефону в тексті пошуку — лише останні 4 цифри: текст їде через Telegram. */
const maskDigits = text => String(text || '').replace(/\+?\d[\d\s()-]{6,}\d/g, match => {
  const digits = match.replace(/\D/g, '');
  return `…${digits.slice(-4)}`;
});

const clip = (text, max) => {
  const value = String(text || '').trim().replace(/\s+/g, ' ');
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

// --- класифікатори записів (чисті) -----------------------------------------

/** Запис картки стрічки `matchingCards/{cardId}`. */
const classifyCardWrite = ({ cardId, before, after, actor }) => {
  if (!isPlainObject(after)) return [];
  if (!isPlainObject(before)) {
    return [{ type: 'profile_created', card: cardId, meta: { account: actor === cardId } }];
  }
  const events = [];
  if (!isFeedDate(before.feedDate) && isFeedDate(after.feedDate)) events.push({ type: 'profile_published', card: cardId });
  if (isFeedDate(before.feedDate) && after.feedDate === false) events.push({ type: 'profile_hidden', card: cardId });
  // `rev` міняє лише збереження, що міняє показане читачеві (вхід і службові
  // записи — ні), тож це і є «правка анкети».
  if (truthy(after.rev) && after.rev !== before.rev) events.push({ type: 'profile_edited', card: cardId });
  return events;
};

// Які анкети покриває значення реакції: `'ed,ag'` — перелік, будь-яке інше
// непорожнє (`true`, мітка часу) — людину цілком (`*`).
const ROLE_LIST_RE = /^[a-z]{2}(,[a-z]{2})*$/;
const reactionCoverage = value => {
  if (!truthy(value)) return [];
  if (typeof value === 'string' && ROLE_LIST_RE.test(value.trim())) return value.trim().split(',');
  return ['*'];
};

/** Лайк чи дизлайк: реакція почала покривати анкету, якої не покривала. */
const classifyReactionWrite = ({ kind, cardId, before, after }) => {
  const was = reactionCoverage(before);
  const now = reactionCoverage(after);
  if (!now.length || was.includes('*')) return [];
  const added = now.includes('*') ? ['*'] : now.filter(role => !was.includes(role));
  if (!added.length) return [];
  const anketa = added.includes('*') ? '' : added.join(',');
  return [{ type: kind === 'dislikes' ? 'dislike' : 'like', card: cardId, meta: anketa ? { anketa } : {} }];
};

/** «Відкласти»: нова майбутня дата в `getInTouch`. */
const classifyPostponeWrite = ({ cardId, before, after, now }) => {
  if (!isFeedDate(after) || after === before) return [];
  if (after <= kyivParts(now).date) return [];
  return [{ type: 'postpone', card: cardId, meta: { until: after } }];
};

const CONTACT_CHANNEL_LABELS = Object.freeze({
  phone: 'дзвінок', call: 'дзвінок', telegram: 'Telegram', viber: 'Viber', whatsapp: 'WhatsApp',
  instagram: 'Instagram', facebook: 'Facebook', email: 'пошта', tiktok: 'TikTok',
});

/** Дотик до контакту: лічильник `contactViews/{читач}/{картка}/count` виріс. */
const classifyContactWrite = ({ cardId, before, after }) => {
  const prevCount = Number(isPlainObject(before) ? before.count : 0) || 0;
  const nextCount = Number(isPlainObject(after) ? after.count : 0) || 0;
  if (nextCount <= prevCount) return [];
  const prevChannels = isPlainObject(before) && isPlainObject(before.channels) ? before.channels : {};
  const nextChannels = isPlainObject(after) && isPlainObject(after.channels) ? after.channels : {};
  const channel = Object.keys(nextChannels).find(key => (Number(nextChannels[key]) || 0) > (Number(prevChannels[key]) || 0)) || '';
  return [{ type: 'contact_tap', card: cardId, meta: channel ? { channel } : {} }];
};

/** Пошук: новий рядок історії або повтор того самого запиту. */
const classifySearchWrite = ({ before, after }) => {
  if (!isPlainObject(after) || typeof after.query !== 'string') return [];
  const prevCount = Number(isPlainObject(before) ? before.count : 0) || 0;
  const nextCount = Number(after.count) || 1;
  if (isPlainObject(before) && nextCount <= prevCount) return [];
  // Номери — скороченими ще до запису: журнал живе 30 днів і читається з
  // браузера адміна, а повний номер там нічого не дає.
  return [{ type: 'search', card: '', meta: { query: maskDigits(clip(after.query, 80)) } }];
};

/** Доповнення чужої картки: шар редактора `multiData/edits/{картка}/{редактор}`. */
const classifyEditsWrite = ({ cardId, before, after }) => {
  if (!isPlainObject(after)) return [];
  if (JSON.stringify(before ?? null) === JSON.stringify(after)) return [];
  const fields = Object.keys(after).filter(key => !key.startsWith('_') && !['updatedAt', 'createdAt', 'at'].includes(key));
  return [{ type: 'card_suggestion', card: cardId, meta: { fields: fields.slice(0, 6).join(', ') } }];
};

/** Чернетка `multiData/profileMutations/{автор}/{картка}`. */
const classifyDraftWrite = ({ cardId, before, after }) => {
  if (!isPlainObject(after)) return [];
  if (!isPlainObject(before)) return [{ type: 'draft_created', card: cardId }];
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [{ type: 'draft_updated', card: cardId }];
};

/** Публічний відгук `comments/{картка}/{відгук}` — лише новий. */
const classifyReviewWrite = ({ cardId, before, after }) => {
  if (isPlainObject(before) || !isPlainObject(after)) return [];
  return [{ type: 'public_review', card: cardId, meta: { text: clip(after.text, 140) } }];
};

/** Посилання на анкету `profileShares/{token}` — лише нове. */
const classifyShareWrite = ({ before, after }) => {
  if (isPlainObject(before) || !isPlainObject(after)) return [];
  return [{ type: 'share_link_created', card: String(after.owner || '') }];
};

/** Запит на видалення акаунта `accountDeletions/{uid}` — його пише сама функція. */
const classifyAccountDeletion = ({ uid, before, after }) => {
  if (isPlainObject(before) || !isPlainObject(after)) return [];
  return [{ type: 'account_deleted', card: uid, actor: uid, allowSystem: true }];
};

// --- налаштування ------------------------------------------------------------

const normalizeSettings = raw => {
  if (!isPlainObject(raw)) return null;
  const events = {};
  Object.entries(isPlainObject(raw.events) ? raw.events : {}).forEach(([key, value]) => {
    if (ADMIN_EVENT_BY_KEY[key] && FREQUENCIES.includes(value)) events[key] = value;
  });
  const channels = isPlainObject(raw.channels) ? raw.channels : {};
  return {
    events,
    channels: { telegram: channels.telegram === true, push: channels.push === true },
    quietHours: raw.quietHours !== false,
    // Тижневий звіт зʼявився пізніше за налаштування: збереженого без поля
    // читаємо за рештою — хто обрав «Вимкнути все», той і звіту не просив.
    weeklyReport: typeof raw.weeklyReport === 'boolean'
      ? raw.weeklyReport
      : Object.values(events).some(value => value !== 'off'),
  };
};

const frequencyFor = (settings, type) => (settings && settings.events[type]) || 'off';

// --- опис подій --------------------------------------------------------------

const describePerson = info => {
  if (!info) return '';
  const name = [info.name, info.surname].filter(Boolean).join(' ').trim();
  const role = info.role ? ROLE_LABELS[info.role] || info.role : '';
  if (name && role) return `${name} (${role})`;
  return name || (role ? `анкета без імені (${role})` : '');
};

const detailLine = event => {
  const meta = event.meta || {};
  switch (event.type) {
    case 'profile_created': return meta.account ? 'Зареєструвався новий акаунт' : 'Картку завели вручну';
    case 'contact_tap': return meta.channel ? `Канал: ${CONTACT_CHANNEL_LABELS[meta.channel] || meta.channel}` : '';
    case 'search': return meta.query ? `Запит: «${maskDigits(meta.query)}»` : '';
    case 'card_suggestion': return meta.fields ? `Поля: ${meta.fields}` : '';
    case 'public_review': return meta.text ? `«${meta.text}»` : '';
    case 'postpone': return meta.until ? `До ${meta.until.split('-').reverse().join('.')}` : '';
    case 'like':
    case 'dislike': return meta.anketa ? `Анкета: ${normalizeRoles(meta.anketa).map(role => ROLE_LABELS[role] || role).join(', ')}` : '';
    default: return '';
  }
};

const cardLink = event => (event.card && event.type !== 'account_deleted' ? `${APP_URL}/edit/${encodeURIComponent(event.card)}` : NOTIFICATIONS_URL);

/** Хто й кого — однією фразою (для дайджесту й push). */
const summarizeEvent = event => {
  const who = describePerson(event.actorInfo) || 'користувач';
  const whom = event.card && event.card !== event.actor ? describePerson(event.cardInfo) || 'картка' : '';
  return whom ? `${who} → ${whom}` : who;
};

const buildInstantMessage = event => {
  const def = ADMIN_EVENT_BY_KEY[event.type];
  const detail = detailLine(event);
  const lines = [
    `${def.emoji} <b>${escapeHtml(def.label)}</b>`,
    escapeHtml(summarizeEvent(event)),
    detail ? escapeHtml(detail) : '',
  ].filter(Boolean);
  const html = `${lines.join('\n')}\n<a href="${escapeHtml(cardLink(event))}">Відкрити</a>`;
  const push = {
    kind: 'admin',
    title: `${def.emoji} ${def.label}`,
    body: [summarizeEvent(event), detail].filter(Boolean).join(' · ').slice(0, 240),
    url: cardLink(event),
  };
  return { html, push };
};

// Telegram приймає до 4096 знаків тексту; лишаємо запас на розмітку посилання.
const TELEGRAM_TEXT_BUDGET = 3800;

/**
 * Зведення. Рядків — не більше `DIGEST_MAX_LINES` і не довше бюджету Telegram:
 * 25 відгуків з іменами давали ~7 тис. знаків, Telegram такий лист відкидав,
 * а відлік дайджесту вже пішов далі — і адмін не отримував того проміжку
 * зовсім. Тепер найновіші рядки беруться, доки влазять, решта — «…і ще N».
 */
const buildDigestMessage = (events, frequency) => {
  const title = frequency === 'daily' ? 'Активність за добу' : 'Активність за годину';
  const counts = {};
  events.forEach(event => { counts[event.type] = (counts[event.type] || 0) + 1; });
  const summary = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `${ADMIN_EVENT_BY_KEY[type].emoji} ${ADMIN_EVENT_BY_KEY[type].label}: ${count}`);
  const head = `📊 <b>${title}</b> · подій: ${events.length}\n${escapeHtml(summary.join('\n'))}\n`;
  const footer = `<a href="${NOTIFICATIONS_URL}">Усі події</a>`;
  const hiddenNote = count => `…і ще ${count} (старіші)`;
  // Запас під «…і ще N» і посилання — щоб хвіст точно вліз.
  let budget = TELEGRAM_TEXT_BUDGET - head.length - footer.length - hiddenNote(events.length).length - 4;
  const picked = [];
  for (let index = events.length - 1; index >= 0 && picked.length < DIGEST_MAX_LINES; index -= 1) {
    const event = events[index];
    const def = ADMIN_EVENT_BY_KEY[event.type];
    const detail = detailLine(event);
    // Обрізаємо текст до заміни `&`/`<`/`>` на сутності: обрізаний посеред
    // `&amp;` рядок робив увесь лист невалідним HTML, і Telegram його відкидав.
    const line = escapeHtml(clip(`${kyivParts(event.t).time} ${def.emoji} ${summarizeEvent(event)}${detail ? ` — ${detail}` : ''}`, 300));
    if (line.length + 1 > budget) break;
    budget -= line.length + 1;
    picked.unshift(line);
  }
  const hidden = events.length - picked.length;
  // Без обрізання готового HTML: воно рвало б сутності й теги. Підсумок видів
  // обмежений самим каталогом (15 рядків), рядки подій — бюджетом вище.
  const html = [head, ...picked, hidden > 0 ? hiddenNote(hidden) : '', footer]
    .filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n');
  const push = { kind: 'admin-digest', title: `📊 ${title}`, body: summary.slice(0, 4).join(' · ').slice(0, 240), url: NOTIFICATIONS_URL };
  return { html, push };
};

/**
 * Тижневий звіт (щопонеділка): скільки подій кожного виду за 7 днів проти
 * попередніх 7, воронка «нові → опубліковані», скільки людей діяли, кому
 * найбільше інтересу (лайки й дотики до контактів) і що шукали. Рахує всі
 * події журналу незалежно від того, які з них адмін отримує окремо.
 */
const WEEKLY_REPORT_TYPES = [
  'profile_created', 'profile_published', 'profile_hidden', 'account_deleted',
  'profile_edited', 'card_suggestion', 'draft_created', 'draft_updated',
  'like', 'dislike', 'contact_tap', 'postpone', 'public_review', 'search', 'share_link_created',
];

const buildWeeklyReport = (events, now) => {
  const weekStart = now - 7 * DAY;
  const thisWeek = events.filter(event => event.t > weekStart && event.t <= now);
  const lastWeek = events.filter(event => event.t > weekStart - 7 * DAY && event.t <= weekStart);
  const count = (list, type) => list.filter(event => event.type === type).length;
  const delta = (current, previous) => {
    if (current === previous) return '=';
    return current > previous ? `↑${current - previous}` : `↓${previous - current}`;
  };
  const rows = WEEKLY_REPORT_TYPES
    .map(type => ({ type, current: count(thisWeek, type), previous: count(lastWeek, type) }))
    .filter(row => row.current || row.previous)
    .map(row => `${ADMIN_EVENT_BY_KEY[row.type].emoji} ${ADMIN_EVENT_BY_KEY[row.type].label}: <b>${row.current}</b> (${delta(row.current, row.previous)})`);

  // Воронка — по когорті: опубліковані з тих карток, що зʼявились цього ж
  // тижня. Публікація старої анкети чи повторна після приховування — не
  // конверсія нових (інакше одна нова й дві старі давали 200%).
  const createdCards = new Set(thisWeek.filter(event => event.type === 'profile_created' && event.card).map(event => event.card));
  const created = count(thisWeek, 'profile_created');
  const published = new Set(thisWeek
    .filter(event => event.type === 'profile_published' && createdCards.has(event.card))
    .map(event => event.card)).size;
  const actors = new Set(thisWeek.map(event => event.actor).filter(Boolean)).size;
  const previousActors = new Set(lastWeek.map(event => event.actor).filter(Boolean)).size;

  const interest = new Map();
  thisWeek.filter(event => (event.type === 'like' || event.type === 'contact_tap') && event.card).forEach(event => {
    const entry = interest.get(event.card) || { likes: 0, contacts: 0, info: event.cardInfo };
    if (event.type === 'like') entry.likes += 1; else entry.contacts += 1;
    interest.set(event.card, entry);
  });
  const topCards = [...interest.values()]
    .sort((a, b) => (b.likes + b.contacts * 2) - (a.likes + a.contacts * 2))
    .slice(0, 5)
    .map(entry => `• ${escapeHtml(clip(describePerson(entry.info) || 'картка', 70))} — ❤️ ${entry.likes} · 📞 ${entry.contacts}`);

  const searches = new Map();
  thisWeek.filter(event => event.type === 'search' && event.meta && event.meta.query).forEach(event => {
    const query = String(event.meta.query).toLowerCase();
    searches.set(query, (searches.get(query) || 0) + 1);
  });
  const topSearches = [...searches.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([query, times]) => `«${escapeHtml(clip(maskDigits(query), 40))}» ×${times}`);

  const title = `Тиждень ${kyivShortDate(weekStart + HOUR)}–${kyivShortDate(now)}`;
  const lines = [
    `📈 <b>${title}</b>`,
    `Діяли людей: <b>${actors}</b> (${delta(actors, previousActors)}) · подій: ${thisWeek.length}`,
    '',
    ...(thisWeek.length ? rows : ['Подій за тиждень не було.']),
  ];
  if (createdCards.size) {
    lines.push('', `Воронка: нових анкет ${createdCards.size} → з них опубліковано ${published} (${Math.round((published / createdCards.size) * 100)}%)`);
  }
  if (topCards.length) lines.push('', '<b>Найбільше інтересу</b>', ...topCards);
  if (topSearches.length) lines.push('', `<b>Шукали</b>: ${topSearches.join(', ')}`);
  lines.push('', `<a href="${NOTIFICATIONS_URL}">Журнал подій</a>`);
  const html = lines.join('\n');
  const push = {
    kind: 'admin-weekly',
    title: `📈 ${title}`,
    body: `Діяли людей: ${actors} · нових анкет: ${created} · лайків: ${count(thisWeek, 'like')} · контактів: ${count(thisWeek, 'contact_tap')}`,
    url: NOTIFICATIONS_URL,
  };
  return { html, push };
};

// --- доставка ----------------------------------------------------------------

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** Push на всі пристрої адміна; мертві токени знімаються. */
const sendPushToAccount = async (uid, data, { db, sendPush }) => {
  const tokensNode = await db.get(`${PUSH_TOKENS_ROOT}/${uid}`);
  const tokens = Object.keys(isPlainObject(tokensNode) ? tokensNode : {});
  if (!tokens.length) return { sent: 0, removed: 0 };
  // Лише `data`: показує сповіщення наш service worker (`src/service-worker.js`,
  // подія `push`), тож блок `notification` дав би друге сповіщення.
  const responses = await sendPush({ tokens, data });
  const dead = tokens.filter((token, index) => {
    const response = responses[index];
    return response && !response.success && INVALID_TOKEN_CODES.has(response.errorCode);
  });
  if (dead.length) await db.update(Object.fromEntries(dead.map(token => [`${PUSH_TOKENS_ROOT}/${uid}/${token}`, null])));
  return { sent: responses.filter(response => response && response.success).length, removed: dead.length };
};

/** Один лист адмінові всіма увімкненими каналами. Збій каналу не валить решту. */
const deliverToAdmin = async (uid, settings, message, deps, { quiet = false } = {}) => {
  const outcomes = [];
  if (settings.channels.telegram) {
    try {
      const chatId = await deps.resolveTelegramChat(uid);
      if (chatId) {
        await deps.sendTelegram(chatId, message.html, { silent: quiet });
        outcomes.push('telegram');
      } else {
        outcomes.push('telegram-not-linked');
      }
    } catch (error) {
      outcomes.push(`telegram-failed-${error.status || 'error'}`);
    }
  }
  // Уночі push не будить телефон зовсім, а Telegram приходить без звуку.
  if (settings.channels.push && !quiet) {
    try {
      const push = await sendPushToAccount(uid, Object.fromEntries(Object.entries(message.push).map(([k, v]) => [k, String(v)])), deps);
      outcomes.push(push.sent ? `push-${push.sent}` : 'push-no-devices');
    } catch (error) {
      outcomes.push('push-failed');
    }
  }
  return outcomes;
};

// --- конвеєр подій -----------------------------------------------------------

const createSettingsReader = (ttlMs = 60 * 1000) => {
  const cache = new Map();
  return async (uid, deps) => {
    const hit = cache.get(uid);
    if (hit && deps.now - hit.at < ttlMs) return hit.value;
    const value = normalizeSettings(await deps.db.get(`${SETTINGS_ROOT}/${uid}`));
    cache.set(uid, { at: deps.now, value });
    return value;
  };
};
const readSettings = createSettingsReader();

const readPersonInfo = async (id, deps) => {
  if (!id) return null;
  const card = await deps.db.get(`matchingCards/${id}`).catch(() => null);
  if (!isPlainObject(card)) return null;
  const roles = normalizeRoles(card.role);
  return {
    name: clip(currentValue(card.name), 40),
    surname: clip(currentValue(card.surnameShort), 6),
    role: roles[roles.length - 1] || '',
  };
};

/** Однакова подія у вікні `dedupMs` рахується раз. */
const passesDedup = async (event, actor, deps) => {
  const window = ADMIN_EVENT_BY_KEY[event.type].dedupMs || 0;
  if (!window) return true;
  const key = `${event.type}~${actor || '-'}~${event.card || '-'}`.replace(/[.#$/[\]]/g, '_');
  const result = await deps.db.transaction(`${DEDUP_PATH}/${key}`, previous => {
    if (Number(previous) && deps.now - Number(previous) < window) return undefined;
    return deps.now;
  });
  return result.committed;
};

/**
 * Записує події одного запису бази в журнал, шле миттєві й перевіряє
 * дайджести. Повертає підсумок для журналу функцій (без особистих даних).
 */
const recordAdminEvents = async (events, { actor, authType, pathActor = '' }, deps) => {
  const outcomes = [];
  // Запис самих функцій (Admin SDK) чи без входу — не дія користувача. Коли
  // база не назвала автора (`unknown`, старіше середовище), береться власник
  // зі шляху запису (`favorites/{хто}/…`): писати під чужий uid правила не дають.
  const systemWrite = authType === 'admin' || authType === 'unauthenticated';
  const userActor = authType === 'app_user' ? actor : '';
  for (const raw of events) {
    const def = ADMIN_EVENT_BY_KEY[raw.type];
    if (!def) continue;
    const eventActor = raw.actor || userActor || pathActor || '';
    if (!raw.allowSystem && (systemWrite || !eventActor)) { outcomes.push(`${raw.type}:system`); continue; }
    // eslint-disable-next-line no-await-in-loop
    if (!raw.allowSystem && await deps.isExcludedActor(eventActor)) { outcomes.push(`${raw.type}:staff`); continue; }
    // eslint-disable-next-line no-await-in-loop
    if (!(await passesDedup(raw, eventActor, deps))) { outcomes.push(`${raw.type}:dedup`); continue; }
    // eslint-disable-next-line no-await-in-loop
    const [actorInfo, cardInfo] = await Promise.all([
      readPersonInfo(eventActor, deps),
      raw.card && raw.card !== eventActor ? readPersonInfo(raw.card, deps) : Promise.resolve(null),
    ]);
    const event = {
      t: deps.now,
      type: raw.type,
      actor: eventActor,
      card: raw.card || '',
      meta: raw.meta || {},
      actorInfo: actorInfo || null,
      cardInfo: raw.card === eventActor ? actorInfo || null : cardInfo || null,
    };
    // eslint-disable-next-line no-await-in-loop
    await deps.db.push(EVENTS_PATH, event);
    outcomes.push(raw.type);

    for (const uid of RECIPIENT_UIDS) {
      // eslint-disable-next-line no-await-in-loop
      const settings = await (deps.readSettings || readSettings)(uid, deps);
      if (frequencyFor(settings, event.type) !== 'instant') continue;
      // eslint-disable-next-line no-await-in-loop
      const delivered = await deliverToAdmin(uid, settings, buildInstantMessage(event), deps, { quiet: settings.quietHours && isQuietTime(deps.now) });
      outcomes.push(...delivered.map(item => `${raw.type}>${item}`));
    }
  }
  // Перевірка дайджестів — щонайбільше раз на 5 хвилин на екземпляр функції:
  // тригер картки спрацьовує й на кожен щоденний вхід, і без межі кожен
  // такий запис коштував би ще кілька транзакцій.
  if (deps.forceFlush || deps.now - lastFlushAt >= FLUSH_THROTTLE_MS) {
    lastFlushAt = deps.now;
    await flushDueDigests(deps).catch(() => outcomes.push('digest-failed'));
  }
  return outcomes.join(',') || 'none';
};

// --- дайджести й прибирання --------------------------------------------------

const WEEKLY_REPORT_SLACK_MS = 7 * DAY + 12 * HOUR;

const isDigestDue = (frequency, lastAt, now) => {
  if (frequency === 'hourly') return now - lastAt >= HOUR;
  if (frequency === 'weekly') {
    // Щопонеділка після 9:00 за Києвом. Дайджести приходять із першою подією
    // (планувальника немає), тож якщо в понеділок подій не було, звіт піде
    // першою подією після 7,5 доби від попереднього.
    const today = kyivParts(now);
    const mondayMorning = kyivWeekday(now) === 'Mon' && today.hour >= DAILY_DIGEST_HOUR && kyivParts(lastAt).date !== today.date;
    return mondayMorning || now - lastAt >= WEEKLY_REPORT_SLACK_MS;
  }
  const today = kyivParts(now);
  return today.hour >= DAILY_DIGEST_HOUR && kyivParts(lastAt).date !== today.date;
};

/**
 * Забирає дайджест транзакцією. Перший раз лише ставить відлік (нічого не
 * шле): інакше перший дайджест приніс би все з початку журналу.
 * @returns {Promise<number|null>} мітка попереднього дайджесту або `null`.
 */
const claimDigest = async (path, frequency, deps) => {
  let previous = null;
  const result = await deps.db.transaction(path, current => {
    const lastAt = Number(isPlainObject(current) ? current.lastAt : 0) || 0;
    if (!lastAt) { previous = null; return { lastAt: deps.now }; }
    if (!isDigestDue(frequency, lastAt, deps.now)) return undefined;
    previous = lastAt;
    return { lastAt: deps.now };
  });
  return result.committed ? previous : null;
};

const flushDueDigests = async deps => {
  for (const uid of RECIPIENT_UIDS) {
    // eslint-disable-next-line no-await-in-loop
    const settings = await (deps.readSettings || readSettings)(uid, deps);
    if (!settings) continue;
    for (const frequency of ['hourly', 'daily']) {
      const types = Object.keys(settings.events).filter(type => settings.events[type] === frequency);
      if (!types.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const since = await claimDigest(`${DIGEST_PATH}/${uid}/${frequency}`, frequency, deps);
      if (since === null) continue;
      // eslint-disable-next-line no-await-in-loop
      const events = (await deps.db.queryEventsBetween(since, deps.now)).filter(event => types.includes(event.type));
      if (!events.length) continue;
      // eslint-disable-next-line no-await-in-loop
      await deliverToAdmin(uid, settings, buildDigestMessage(events, frequency), deps, {
        quiet: frequency === 'hourly' && settings.quietHours && isQuietTime(deps.now),
      });
    }
  }
  for (const uid of RECIPIENT_UIDS) {
    // eslint-disable-next-line no-await-in-loop
    const settings = await (deps.readSettings || readSettings)(uid, deps);
    if (!settings || !settings.weeklyReport) continue;
    // eslint-disable-next-line no-await-in-loop
    const since = await claimDigest(`${DIGEST_PATH}/${uid}/weekly`, 'weekly', deps);
    if (since === null) continue;
    // eslint-disable-next-line no-await-in-loop
    await sendWeeklyReport(uid, settings, deps, { quiet: settings.quietHours && isQuietTime(deps.now) });
  }
  // Раз на добу — прибрати журнал старший за 30 днів і старі ключі дублів.
  const cleanupSince = await claimDigest(`${DIGEST_PATH}/_cleanup`, 'daily', deps);
  if (cleanupSince !== null && deps.db.removeOlderThan) {
    await deps.db.removeOlderThan(deps.now - RETENTION_MS, deps.now - DEDUP_RETENTION_MS);
  }
  if (cleanupSince !== null && deps.db.removeLegacyNotificationData) {
    await deps.db.removeLegacyNotificationData(STAFF_UIDS).catch(() => {});
  }
};

// Автоматичний звіт поважає тихі години (може настати й уночі: перша подія
// після 22:00 у понеділок чи запасні 7,5 доби); «Надіслати зараз» — ні.
const sendWeeklyReport = async (uid, settings, deps, { quiet = false } = {}) => {
  const events = await deps.db.queryEventsBetween(deps.now - 14 * DAY, deps.now);
  return deliverToAdmin(uid, settings, buildWeeklyReport(events, deps.now), deps, { quiet });
};

/** «Звіт за тиждень зараз» на сторінці сповіщень — увімкненими каналами викликача. */
const sendWeeklyReportNow = async (uid, deps) => {
  const settings = normalizeSettings(await deps.db.get(`${SETTINGS_ROOT}/${uid}`))
    || { channels: { telegram: true, push: true }, events: {}, quietHours: false, weeklyReport: true };
  return sendWeeklyReport(uid, settings, deps);
};

// --- callables ---------------------------------------------------------------

const isStaffUid = uid => STAFF_UIDS.includes(uid);

/** Стан каналів для сторінки налаштувань: чи привʼязано Telegram, скільки пристроїв. */
const readNotificationStatus = async (uid, deps) => {
  const [chatId, tokens] = await Promise.all([
    deps.resolveTelegramChat(uid).catch(() => null),
    deps.db.get(`${PUSH_TOKENS_ROOT}/${uid}`).catch(() => null),
  ]);
  return {
    telegramLinked: Boolean(chatId),
    pushDevices: Object.keys(isPlainObject(tokens) ? tokens : {}).length,
    receivesActivity: RECIPIENT_UIDS.includes(uid),
  };
};

const sendTestNotification = async (uid, deps) => {
  const settings = normalizeSettings(await deps.db.get(`${SETTINGS_ROOT}/${uid}`))
    || { channels: { telegram: true, push: true }, events: {}, quietHours: false };
  const message = {
    html: '🔔 <b>Тестове сповіщення KnowMe</b>\nКанал працює — так виглядатимуть сповіщення про активність.',
    push: { kind: 'admin-test', title: '🔔 Тестове сповіщення', body: 'Канал працює — так виглядатимуть сповіщення про активність.', url: NOTIFICATIONS_URL },
  };
  return deliverToAdmin(uid, settings, message, deps, { quiet: false });
};

module.exports = {
  EVENTS_PATH,
  DEDUP_PATH,
  DIGEST_PATH,
  SETTINGS_ROOT,
  QA_UIDS,
  RECIPIENT_UIDS,
  STAFF_UIDS,
  RETENTION_MS,
  buildDigestMessage,
  buildWeeklyReport,
  buildInstantMessage,
  classifyAccountDeletion,
  classifyCardWrite,
  classifyContactWrite,
  classifyDraftWrite,
  classifyEditsWrite,
  classifyPostponeWrite,
  classifyReactionWrite,
  classifyReviewWrite,
  classifySearchWrite,
  classifyShareWrite,
  createSettingsReader,
  flushDueDigests,
  isDigestDue,
  isQuietTime,
  isExcludedActorUid,
  isStaffUid,
  maskDigits,
  normalizeSettings,
  readNotificationStatus,
  recordAdminEvents,
  sendTestNotification,
  sendWeeklyReportNow,
};
