/**
 * Сповіщення адміна про дії користувачів — каталог для сторінки `/notifications`.
 *
 * Серверна копія ключів і типових частот — `functions/adminActivityCatalog.js`
 * (на деплой функцій `src/` не їде); збіг стереже
 * `__tests__/adminNotificationCatalog.test.js`. Новий вид події — рядок тут,
 * рядок там і класифікатор у `functions/adminActivity.js`.
 *
 * Рекомендована частота (`defaultFrequency`) — те, що ставить «Рекомендовано»:
 * рідкісне й важливе (нова анкета, публікація, відгук, видалення) — одразу;
 * часте, що цікаве сумою (лайки, контакти, доповнення) — щогодини;
 * фон для оцінки (дизлайки, правки, пошук) — раз на день; шумне — вимкнено.
 */

export const NOTIFICATION_FREQUENCIES = [
  { key: 'off', label: 'Вимк.', hint: 'Не надсилати (у журналі подія однаково буде)' },
  { key: 'instant', label: 'Одразу', hint: 'Окремим повідомленням щойно сталося' },
  { key: 'hourly', label: 'Щогодини', hint: 'Зведенням раз на годину' },
  { key: 'daily', label: 'Раз на день', hint: 'Зведенням щоранку після 9:00' },
];

export const NOTIFICATION_GROUPS = [
  {
    key: 'people',
    title: 'Нові люди й анкети',
    description: 'Хто приходить у застосунок і чи доходить до публікації.',
    events: [
      { key: 'profile_created', emoji: '🆕', label: 'Нова анкета', description: 'Реєстрація нового акаунта або картка, заведена вручну.', defaultFrequency: 'instant' },
      { key: 'profile_published', emoji: '📣', label: 'Анкету опубліковано', description: 'Анкета зʼявилась у стрічці — людина дійшла до кінця.', defaultFrequency: 'instant' },
      { key: 'profile_hidden', emoji: '🙈', label: 'Анкету приховано', description: 'Людина зняла анкету зі стрічки. Варто дізнатись чому.', defaultFrequency: 'daily' },
      { key: 'account_deleted', emoji: '🗑', label: 'Акаунт видалено', description: 'Людина видалила акаунт — у черзі очищення бази.', defaultFrequency: 'instant' },
    ],
  },
  {
    key: 'work',
    title: 'Робота з картками',
    description: 'Як люди заповнюють анкети й дописують чужі.',
    events: [
      { key: 'profile_edited', emoji: '✏️', label: 'Правка власної анкети', description: 'Збереження, що змінює показане іншим. Серія правок за 30 хв — одна подія.', defaultFrequency: 'daily' },
      { key: 'card_suggestion', emoji: '🧩', label: 'Доповнення чужої картки', description: 'Хтось запропонував правку чи дописав контакт до чужої картки.', defaultFrequency: 'hourly' },
      { key: 'draft_created', emoji: '📝', label: 'Нова чернетка картки', description: 'Користувач почав заводити нову картку.', defaultFrequency: 'hourly' },
      { key: 'draft_updated', emoji: '🖊', label: 'Правка чернетки', description: 'Автозбереження чернетки. Шумно — вимкнено за замовчуванням.', defaultFrequency: 'off' },
    ],
  },
  {
    key: 'interest',
    title: 'Реакції й інтерес',
    description: 'Чи знаходять люди одне одного — головний показник матчингу.',
    events: [
      { key: 'like', emoji: '❤️', label: 'Лайк', description: 'Хтось вподобав анкету.', defaultFrequency: 'hourly' },
      { key: 'dislike', emoji: '✖️', label: 'Дизлайк («Не цікаво»)', description: 'Анкету відхилили. Багато дизлайків одній анкеті — сигнал її доопрацювати.', defaultFrequency: 'daily' },
      { key: 'contact_tap', emoji: '📞', label: 'Дотик до контакту', description: 'Натиснули дзвінок, Telegram, Viber чи інший контакт — найближче до реальної угоди.', defaultFrequency: 'hourly' },
      { key: 'postpone', emoji: '⏰', label: '«Відкласти» картку', description: 'Картку відклали, щоб повернутись пізніше.', defaultFrequency: 'daily' },
      { key: 'public_review', emoji: '💬', label: 'Публічний відгук', description: 'Новий відгук під анкетою. Його бачать усі — варто глянути одразу.', defaultFrequency: 'instant' },
    ],
  },
  {
    key: 'discovery',
    title: 'Пошук і поширення',
    description: 'Що люди шукають і як діляться анкетами поза застосунком.',
    events: [
      { key: 'search', emoji: '🔎', label: 'Пошук', description: 'Запит у пошуку стрічки. Номери телефонів у повідомленні скорочено до 4 цифр.', defaultFrequency: 'daily' },
      { key: 'share_link_created', emoji: '🔗', label: 'Посилання на анкету', description: 'Власниця створила посилання на анкету для людей без акаунта.', defaultFrequency: 'daily' },
    ],
  },
];

export const NOTIFICATION_EVENTS = NOTIFICATION_GROUPS.flatMap(group => group.events);
export const NOTIFICATION_EVENT_BY_KEY = Object.fromEntries(NOTIFICATION_EVENTS.map(event => [event.key, event]));

const IMPORTANT_EVENTS = ['profile_created', 'profile_published', 'account_deleted', 'public_review'];

/** Готові набори: одним дотиком замість п’ятнадцяти. */
export const NOTIFICATION_PRESETS = [
  {
    key: 'recommended',
    label: 'Рекомендовано',
    description: 'Важливе одразу, активність зведеннями',
    build: () => Object.fromEntries(NOTIFICATION_EVENTS.map(event => [event.key, event.defaultFrequency])),
  },
  {
    key: 'important',
    label: 'Лише важливе',
    description: 'Нові й опубліковані анкети, відгуки, видалення',
    build: () => Object.fromEntries(NOTIFICATION_EVENTS.map(event => [event.key, IMPORTANT_EVENTS.includes(event.key) ? 'instant' : 'off'])),
  },
  {
    key: 'daily',
    label: 'Один лист на день',
    description: 'Усе одним зведенням щоранку',
    build: () => Object.fromEntries(NOTIFICATION_EVENTS.map(event => [event.key, event.key === 'draft_updated' ? 'off' : 'daily'])),
  },
  {
    key: 'none',
    label: 'Вимкнути все',
    description: 'Лише журнал на цій сторінці',
    build: () => Object.fromEntries(NOTIFICATION_EVENTS.map(event => [event.key, 'off'])),
  },
];

/** Який набір збігається з поточними налаштуваннями (для підсвітки кнопки). */
export const matchPreset = events => NOTIFICATION_PRESETS.find(preset => {
  const expected = preset.build();
  return NOTIFICATION_EVENTS.every(event => (events[event.key] || 'off') === expected[event.key]);
})?.key || '';

export const DEFAULT_NOTIFICATION_SETTINGS = () => ({
  events: NOTIFICATION_PRESETS[0].build(),
  channels: { telegram: true, push: false },
  quietHours: true,
});

/** Збережене з бази → повна форма для сторінки (невідоме відкидається). */
export const normalizeNotificationSettings = raw => {
  if (!raw || typeof raw !== 'object') return null;
  const events = {};
  NOTIFICATION_EVENTS.forEach(event => {
    const value = raw.events && raw.events[event.key];
    events[event.key] = NOTIFICATION_FREQUENCIES.some(freq => freq.key === value) ? value : 'off';
  });
  return {
    events,
    channels: { telegram: raw.channels?.telegram === true, push: raw.channels?.push === true },
    quietHours: raw.quietHours !== false,
  };
};

const ROLE_LABELS = { ed: 'донор ооцитів', sm: 'сурогатна мати', ip: 'біологічні батьки', pp: 'біологічні батьки', ag: 'агенція', cl: 'клініка' };

export const describeActivityPerson = info => {
  if (!info) return '';
  const name = [info.name, info.surname].filter(Boolean).join(' ').trim();
  const role = info.role ? ROLE_LABELS[info.role] || info.role : '';
  if (name && role) return `${name} (${role})`;
  return name || (role ? `без імені (${role})` : '');
};

const CONTACT_CHANNEL_LABELS = { phone: 'дзвінок', call: 'дзвінок', telegram: 'Telegram', viber: 'Viber', whatsapp: 'WhatsApp', email: 'пошта' };

/** Подробиця події для журналу на сторінці. */
export const describeActivityDetail = event => {
  const meta = event?.meta || {};
  switch (event?.type) {
    case 'profile_created': return meta.account ? 'новий акаунт' : 'картка заведена вручну';
    case 'contact_tap': return meta.channel ? CONTACT_CHANNEL_LABELS[meta.channel] || meta.channel : '';
    case 'search': return meta.query ? `«${meta.query}»` : '';
    case 'card_suggestion': return meta.fields || '';
    case 'public_review': return meta.text ? `«${meta.text}»` : '';
    case 'postpone': return meta.until ? `до ${String(meta.until).split('-').reverse().join('.')}` : '';
    default: return '';
  }
};
