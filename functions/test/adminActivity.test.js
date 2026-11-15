'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const activity = require('../adminActivity');
const { ADMIN_EVENTS, FREQUENCIES } = require('../adminActivityCatalog');

const ADMIN = activity.RECIPIENT_UIDS[0];
const USER = 'userUid00000000000000000001';
const DONOR = 'donorUid0000000000000000001';
// 15.11.2026, 12:00 за Києвом (UTC+2) — не тихі години.
const NOON = Date.UTC(2026, 10, 15, 10, 0, 0);

const getPath = (data, path) => path.split('/').reduce((node, key) => (node == null ? undefined : node[key]), data);
const setPath = (data, path, value) => {
  const keys = path.split('/');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => {
    if (!node[key] || typeof node[key] !== 'object') node[key] = {};
    return node[key];
  }, data);
  if (value === null) delete parent[last];
  else parent[last] = value;
};

const makeDeps = ({ data = {}, now = NOON, settings, telegram = true } = {}) => {
  let seq = 0;
  const sent = { telegram: [], push: [] };
  if (settings) setPath(data, `adminNotificationSettings/${ADMIN}`, settings);
  const db = {
    get: async path => getPath(data, path) ?? null,
    set: async (path, value) => setPath(data, path, value),
    update: async updates => Object.entries(updates).forEach(([path, value]) => setPath(data, path, value)),
    push: async (path, value) => { seq += 1; setPath(data, `${path}/k${String(seq).padStart(4, '0')}`, value); },
    transaction: async (path, update) => {
      const next = update(getPath(data, path) ?? null);
      if (next === undefined) return { committed: false };
      setPath(data, path, next);
      return { committed: true };
    },
    queryEventsBetween: async (since, until) => Object.values(getPath(data, activity.EVENTS_PATH) || {})
      .filter(event => event.t > since && event.t <= until),
  };
  return {
    data,
    sent,
    deps: {
      db,
      now,
      forceFlush: true,
      readSettings: async uid => activity.normalizeSettings(getPath(data, `adminNotificationSettings/${uid}`)),
      isExcludedActor: async uid => activity.isStaffUid(uid),
      resolveTelegramChat: async uid => (telegram && uid === ADMIN ? '777' : null),
      sendTelegram: async (chatId, html, options) => { sent.telegram.push({ chatId, html, options }); },
      sendPush: async ({ tokens, data: payload }) => { sent.push.push({ tokens, payload }); return tokens.map(() => ({ success: true })); },
    },
  };
};

const settingsWith = (events, channels = { telegram: true, push: true }) => ({ events, channels, quietHours: true, updatedAt: 1 });
const user = { actor: USER, authType: 'app_user' };

test('каталог: унікальні ключі й відомі типові частоти', () => {
  const keys = ADMIN_EVENTS.map(event => event.key);
  assert.equal(new Set(keys).size, keys.length);
  ADMIN_EVENTS.forEach(event => assert.ok(FREQUENCIES.includes(event.defaultFrequency), event.key));
});

test('картка: нова, опублікована, прихована, правка — і щоденний вхід подій не дає', () => {
  assert.deepEqual(activity.classifyCardWrite({ cardId: USER, before: null, after: { name: 'A' }, actor: USER })
    .map(event => event.type), ['profile_created']);
  assert.deepEqual(activity.classifyCardWrite({ cardId: USER, before: { feedDate: false }, after: { feedDate: '2026-11-15' } })
    .map(event => event.type), ['profile_published']);
  assert.deepEqual(activity.classifyCardWrite({ cardId: USER, before: { feedDate: '2026-11-14' }, after: { feedDate: false } })
    .map(event => event.type), ['profile_hidden']);
  assert.deepEqual(activity.classifyCardWrite({ cardId: USER, before: { rev: 1 }, after: { rev: 2 } })
    .map(event => event.type), ['profile_edited']);
  // Вхід переставляє лише дату — це не подія.
  assert.deepEqual(activity.classifyCardWrite({ cardId: USER, before: { feedDate: '2026-11-14', rev: 1 }, after: { feedDate: '2026-11-15', rev: 1 } }), []);
});

test('реакції: нова, донорська після агентської, зняття — не подія', () => {
  assert.equal(activity.classifyReactionWrite({ kind: 'favorites', cardId: DONOR, before: null, after: true })[0].type, 'like');
  assert.equal(activity.classifyReactionWrite({ kind: 'dislikes', cardId: DONOR, before: null, after: 1 })[0].type, 'dislike');
  assert.equal(activity.classifyReactionWrite({ kind: 'favorites', cardId: DONOR, before: 'ag', after: 'ag,ed' })[0].meta.anketa, 'ed');
  assert.deepEqual(activity.classifyReactionWrite({ kind: 'favorites', cardId: DONOR, before: true, after: null }), []);
  assert.deepEqual(activity.classifyReactionWrite({ kind: 'favorites', cardId: DONOR, before: 'ag,ed', after: 'ag' }), []);
});

test('дотик до контакту — канал, що виріс; пошук — новий запит чи повтор', () => {
  const tap = activity.classifyContactWrite({ cardId: DONOR, before: { count: 1, channels: { phone: 1 } }, after: { count: 2, channels: { phone: 1, telegram: 1 } } });
  assert.deepEqual(tap[0].meta, { channel: 'telegram' });
  assert.deepEqual(activity.classifyContactWrite({ cardId: DONOR, before: { count: 2 }, after: { count: 2 } }), []);
  assert.equal(activity.classifySearchWrite({ before: null, after: { query: 'Ольга', count: 1 } })[0].meta.query, 'Ольга');
  assert.deepEqual(activity.classifySearchWrite({ before: { query: 'x', count: 3 }, after: { query: 'x', count: 3, updatedAt: 2 } }), []);
});

test('чернетка, доповнення, відгук, посилання, видалення акаунта', () => {
  assert.equal(activity.classifyDraftWrite({ cardId: 'c1', before: null, after: { a: 1 } })[0].type, 'draft_created');
  assert.equal(activity.classifyDraftWrite({ cardId: 'c1', before: { a: 1 }, after: { a: 2 } })[0].type, 'draft_updated');
  assert.equal(activity.classifyEditsWrite({ cardId: 'c1', before: null, after: { phone: { added: ['1'] } } })[0].meta.fields, 'phone');
  assert.equal(activity.classifyReviewWrite({ cardId: DONOR, before: null, after: { text: 'Дуже приємна' } })[0].type, 'public_review');
  assert.deepEqual(activity.classifyReviewWrite({ cardId: DONOR, before: { text: 'a' }, after: { text: 'b' } }), []);
  assert.equal(activity.classifyShareWrite({ before: null, after: { owner: USER } })[0].card, USER);
  assert.equal(activity.classifyAccountDeletion({ uid: USER, before: null, after: { requestedAt: 1 } })[0].allowSystem, true);
});

test('номер у тексті пошуку маскується до 4 останніх цифр — ще до запису в журнал', () => {
  assert.equal(activity.maskDigits('380 50 123 45 67'), '…4567');
  assert.equal(activity.maskDigits('Ольга Київ'), 'Ольга Київ');
  assert.equal(activity.classifySearchWrite({ before: null, after: { query: '+380501234567', count: 1 } })[0].meta.query, '…4567');
});

test('виключені — адміни, інспектор і тестові акаунти за uid, а не за поштою', () => {
  assert.equal(activity.isExcludedActorUid(activity.RECIPIENT_UIDS[0]), true);
  assert.equal(activity.isExcludedActorUid(activity.QA_UIDS[0]), true);
  assert.equal(activity.isExcludedActorUid(USER), false);
});

test('подію записує журнал; миттєва йде в Telegram і push', async () => {
  const { deps, data, sent } = makeDeps({
    data: { matchingCards: { [USER]: { name: ['Олена'], surnameShort: 'К.', role: 'ag' }, [DONOR]: { name: 'Марія', role: 'ed' } }, pushTokens: { [ADMIN]: { tokA: { at: 1 } } } },
    settings: settingsWith({ like: 'instant' }),
  });
  await activity.recordAdminEvents([{ type: 'like', card: DONOR, meta: {} }], user, deps);
  const events = Object.values(data.adminActivity.events);
  assert.equal(events.length, 1);
  assert.equal(events[0].actorInfo.name, 'Олена');
  assert.equal(sent.telegram.length, 1);
  assert.match(sent.telegram[0].html, /Олена К\. \(агенція\) → Марія \(донор ооцитів\)/);
  assert.equal(sent.push[0].payload.kind, 'admin');
});

test('дії адміна, інспектора й самих функцій не рахуються', async () => {
  const { deps, data } = makeDeps({ settings: settingsWith({ like: 'instant' }) });
  await activity.recordAdminEvents([{ type: 'like', card: DONOR }], { actor: ADMIN, authType: 'app_user' }, deps);
  await activity.recordAdminEvents([{ type: 'like', card: DONOR }], { actor: '', authType: 'admin', pathActor: USER }, deps);
  assert.equal(data.adminActivity?.events, undefined);
  // Видалення акаунта пише функція — але подію дає.
  await activity.recordAdminEvents([{ type: 'account_deleted', card: USER, actor: USER, allowSystem: true }], { authType: 'admin' }, deps);
  assert.equal(Object.keys(data.adminActivity.events).length, 1);
});

test('без автора від бази — автор зі шляху запису', async () => {
  const { deps, data } = makeDeps({ settings: settingsWith({}) });
  await activity.recordAdminEvents([{ type: 'like', card: DONOR }], { actor: '', authType: 'unknown', pathActor: USER }, deps);
  assert.equal(Object.values(data.adminActivity.events)[0].actor, USER);
});

test('автозбереження: та сама правка у вікні рахується раз', async () => {
  const { deps, data } = makeDeps({ settings: settingsWith({}) });
  await activity.recordAdminEvents([{ type: 'profile_edited', card: USER }], user, deps);
  await activity.recordAdminEvents([{ type: 'profile_edited', card: USER }], user, { ...deps, now: NOON + 60 * 1000 });
  assert.equal(Object.keys(data.adminActivity.events).length, 1);
  await activity.recordAdminEvents([{ type: 'profile_edited', card: USER }], user, { ...deps, now: NOON + 31 * 60 * 1000 });
  assert.equal(Object.keys(data.adminActivity.events).length, 2);
});

test('без налаштувань і з «вимкнено» — нічого не шле, але журнал пише', async () => {
  const { deps, data, sent } = makeDeps();
  await activity.recordAdminEvents([{ type: 'like', card: DONOR }], user, deps);
  assert.equal(Object.keys(data.adminActivity.events).length, 1);
  assert.equal(sent.telegram.length + sent.push.length, 0);
});

test('тихі години: Telegram без звуку, push не шлеться', async () => {
  const night = Date.UTC(2026, 10, 15, 22, 0, 0); // 00:00 за Києвом
  const { deps, sent } = makeDeps({ now: night, data: { pushTokens: { [ADMIN]: { tokA: { at: 1 } } } }, settings: settingsWith({ like: 'instant' }) });
  await activity.recordAdminEvents([{ type: 'like', card: DONOR }], user, deps);
  assert.equal(sent.telegram[0].options.silent, true);
  assert.equal(sent.push.length, 0);
});

test('погодинний дайджест: перший раз ставить відлік, далі збирає події за годину', async () => {
  const { deps, sent } = makeDeps({ settings: settingsWith({ like: 'hourly' }) });
  await activity.recordAdminEvents([{ type: 'like', card: DONOR }], user, deps);
  assert.equal(sent.telegram.length, 0); // відлік поставлено, ще рано
  await activity.recordAdminEvents([{ type: 'like', card: 'other' }], user, { ...deps, now: NOON + 20 * 60 * 1000 });
  assert.equal(sent.telegram.length, 0);
  await activity.recordAdminEvents([], user, { ...deps, now: NOON + 61 * 60 * 1000 });
  assert.equal(sent.telegram.length, 1);
  assert.match(sent.telegram[0].html, /Активність за годину/);
  assert.match(sent.telegram[0].html, /Лайк: 1/); // перша подія — до відліку
});

test('щоденний дайджест — після 9:00 за Києвом, раз на день', () => {
  const yesterdayEvening = Date.UTC(2026, 10, 14, 18, 0, 0);
  assert.equal(activity.isDigestDue('daily', yesterdayEvening, Date.UTC(2026, 10, 15, 5, 0, 0)), false); // 7:00
  assert.equal(activity.isDigestDue('daily', yesterdayEvening, Date.UTC(2026, 10, 15, 7, 30, 0)), true); // 9:30
  assert.equal(activity.isDigestDue('daily', Date.UTC(2026, 10, 15, 7, 30, 0), Date.UTC(2026, 10, 15, 15, 0, 0)), false);
});

test('Telegram не привʼязано — сповіщення каже про це, push іде', async () => {
  const { deps, sent } = makeDeps({ telegram: false, data: { pushTokens: { [ADMIN]: { tokA: { at: 1 } } } }, settings: settingsWith({ like: 'instant' }) });
  const outcome = await activity.recordAdminEvents([{ type: 'like', card: DONOR }], user, deps);
  assert.match(outcome, /telegram-not-linked/);
  assert.equal(sent.push.length, 1);
});

test('налаштування: невідомі ключі й частоти відкидаються', () => {
  const settings = activity.normalizeSettings({ events: { like: 'hourly', bogus: 'instant', dislike: 'weekly' }, channels: { telegram: true } });
  assert.deepEqual(settings.events, { like: 'hourly' });
  assert.deepEqual(settings.channels, { telegram: true, push: false });
});
