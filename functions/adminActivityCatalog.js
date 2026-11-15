'use strict';

/**
 * Каталог подій для сповіщень адміна — серверна копія.
 *
 * Та сама таблиця живе в `src/utils/adminNotificationCatalog.js` (з підписами
 * для сторінки налаштувань); збіг ключів і типових частот стереже
 * `src/utils/__tests__/adminNotificationCatalog.test.js`. Двох копій не
 * уникнути: на деплой функцій їде сама тека `functions/`, без `src/`.
 *
 * `defaultFrequency` — рекомендація для кнопки «Рекомендовано»: рідкісне й
 * важливе одразу, часте — дайджестом, шумне — вимкнено. `dedupMs` — вікно, у
 * якому однакова подія (той самий вид, той самий автор, та сама картка)
 * рахується один раз: автозбереження форм пише на кожен blur, і без цього
 * одна правка анкети давала б десяток подій.
 */
const FREQUENCIES = Object.freeze(['off', 'instant', 'hourly', 'daily']);

const MINUTE = 60 * 1000;

const ADMIN_EVENTS = Object.freeze([
  { key: 'profile_created', emoji: '🆕', label: 'Нова анкета', defaultFrequency: 'instant', dedupMs: 0 },
  { key: 'profile_published', emoji: '📣', label: 'Анкету опубліковано', defaultFrequency: 'instant', dedupMs: 10 * MINUTE },
  { key: 'profile_hidden', emoji: '🙈', label: 'Анкету приховано', defaultFrequency: 'daily', dedupMs: 10 * MINUTE },
  { key: 'account_deleted', emoji: '🗑', label: 'Акаунт видалено', defaultFrequency: 'instant', dedupMs: 0 },
  { key: 'profile_edited', emoji: '✏️', label: 'Правка власної анкети', defaultFrequency: 'daily', dedupMs: 30 * MINUTE },
  { key: 'card_suggestion', emoji: '🧩', label: 'Доповнення чужої картки', defaultFrequency: 'hourly', dedupMs: 30 * MINUTE },
  { key: 'draft_created', emoji: '📝', label: 'Нова чернетка картки', defaultFrequency: 'hourly', dedupMs: 0 },
  { key: 'draft_updated', emoji: '🖊', label: 'Правка чернетки', defaultFrequency: 'off', dedupMs: 30 * MINUTE },
  { key: 'like', emoji: '❤️', label: 'Лайк', defaultFrequency: 'hourly', dedupMs: 0 },
  { key: 'dislike', emoji: '✖️', label: 'Дизлайк («Не цікаво»)', defaultFrequency: 'daily', dedupMs: 0 },
  { key: 'contact_tap', emoji: '📞', label: 'Дотик до контакту', defaultFrequency: 'hourly', dedupMs: 2 * MINUTE },
  { key: 'postpone', emoji: '⏰', label: '«Відкласти» картку', defaultFrequency: 'daily', dedupMs: 10 * MINUTE },
  { key: 'public_review', emoji: '💬', label: 'Публічний відгук', defaultFrequency: 'instant', dedupMs: 0 },
  { key: 'search', emoji: '🔎', label: 'Пошук', defaultFrequency: 'daily', dedupMs: 10 * MINUTE },
  { key: 'share_link_created', emoji: '🔗', label: 'Посилання на анкету', defaultFrequency: 'daily', dedupMs: 0 },
]);

const ADMIN_EVENT_BY_KEY = Object.freeze(Object.fromEntries(ADMIN_EVENTS.map(event => [event.key, event])));

module.exports = { ADMIN_EVENTS, ADMIN_EVENT_BY_KEY, FREQUENCIES };
