'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LOGIN_TTL_MS,
  MAX_CODE_ATTEMPTS,
  completeTelegramLogin,
  handleTelegramUpdate,
  hashNonce,
  isWebhookSecretValid,
  normalizeTelegramPhone,
  parseStartPayload,
  sweepExpiredLogins,
} = require('../telegramAuth');

const NONCE = 'AbCdEfGhIjKlMnOpQrStUv';
const TG_ID = 555;

const memoryDb = () => {
  const data = new Map();
  return {
    data,
    get: async path => (data.has(path) ? structuredClone(data.get(path)) : null),
    set: async (path, value) => {
      if (value === null) data.delete(path);
      else data.set(path, structuredClone(value));
    },
    // Як справжня RTDB: перший виклик обробника транзакції бачить локальний
    // кеш, а в функції без слухачів він порожній — `null`, хоч на сервері
    // запис є. Повернений `undefined` тут-таки скасовує транзакцію; будь-що
    // інше сервер відхиляє (хеш не збігся) і кличе обробник уже з даними.
    transaction: async (path, update) => {
      const actual = data.has(path) ? structuredClone(data.get(path)) : null;
      const guess = update(null);
      if (guess === undefined) return { committed: false };
      if (actual === null) {
        if (guess === null) data.delete(path);
        else data.set(path, structuredClone(guess));
        return { committed: true };
      }
      const next = update(actual);
      if (next === undefined) return { committed: false };
      if (next === null) data.delete(path);
      else data.set(path, structuredClone(next));
      return { committed: true };
    },
  };
};

const fakeAuth = () => {
  const users = new Set();
  let counter = 0;
  return {
    users,
    createUser: async () => {
      counter += 1;
      const uid = `uid${String(counter).padStart(25, '0')}`;
      users.add(uid);
      return { uid };
    },
    getUser: async uid => {
      if (!users.has(uid)) {
        const error = new Error('no user');
        error.code = 'auth/user-not-found';
        throw error;
      }
      return { uid };
    },
    deleteUser: async uid => { users.delete(uid); },
    createCustomToken: async uid => `token-for-${uid}`,
  };
};

const setup = (now = 1_000_000) => {
  const sent = [];
  const deps = {
    db: memoryDb(),
    auth: fakeAuth(),
    sendMessage: async (chatId, text, markup) => { sent.push({ chatId, text, markup }); },
    now,
    randomCode: () => '123456',
  };
  return { deps, sent };
};

const privateMessage = (extra, fromId = TG_ID) => ({
  message: { chat: { id: fromId, type: 'private' }, from: { id: fromId, first_name: 'Оксана', username: 'oksana_k' }, ...extra },
});

const contactFrom = (userId, phone = '+380 50 123 45 67') => privateMessage({
  contact: { user_id: userId, phone_number: phone, first_name: 'Оксана', last_name: 'Коваль' },
});

test('/start розбирає payload і відкидає інші команди', () => {
  assert.equal(parseStartPayload(`/start ${NONCE}`), NONCE);
  assert.equal(parseStartPayload('/start'), '');
  assert.equal(parseStartPayload('/start@KnowMeBot abc'), 'abc');
  assert.equal(parseStartPayload('привіт'), null);
});

test('номер — самі цифри, як його пише застосунок', () => {
  assert.equal(normalizeTelegramPhone('+380 (50) 123-45-67'), '380501234567');
});

test('секрет вебхука перевіряється цілком', () => {
  assert.equal(isWebhookSecretValid('abc', 'abc'), true);
  assert.equal(isWebhookSecretValid('abd', 'abc'), false);
  assert.equal(isWebhookSecretValid('', ''), false);
});

test('повний потік: /start → контакт → застосунок забирає токен один раз', async () => {
  const { deps, sent } = setup();
  assert.equal(await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps), 'pending');
  assert.equal(sent[0].markup.keyboard[0][0].request_contact, true);
  // Сирий nonce у базі не лежить — лише хеш.
  assert.ok([...deps.db.data.keys()].every(key => !key.includes(NONCE)));

  assert.deepEqual(await completeTelegramLogin(NONCE, '', deps), { status: 'pending', started: true });

  assert.equal(await handleTelegramUpdate(contactFrom(TG_ID), deps), 'registered');
  // Код бачить лише власник акаунта Telegram — у повідомленні бота.
  assert.match(sent[sent.length - 1].text, /123456/);
  // Після коду треба повернутись на сайт — повідомлення з кодом несе одну
  // кнопку туди з кодом у фрагменті (без nonce), а клавіатуру «Поділитися
  // номером» прибирає попереднє.
  const doneMarkup = sent[sent.length - 1].markup.inline_keyboard;
  assert.equal(doneMarkup.length, 1);
  assert.equal(doneMarkup[0].length, 1);
  assert.equal(doneMarkup[0][0].url, 'https://knowme.pp.ua/login#tgcode=123456');
  assert.ok(!doneMarkup[0][0].url.includes(NONCE));
  assert.equal(sent[sent.length - 2].markup.remove_keyboard, true);
  // Без коду браузер, що чекає, токена не отримує.
  assert.deepEqual(await completeTelegramLogin(NONCE, '', deps), { status: 'code-required' });
  const ready = await completeTelegramLogin(NONCE, '123 456', deps);
  assert.equal(ready.status, 'ready');
  assert.equal(ready.isNew, true);
  assert.match(ready.token, /^token-for-uid/);
  assert.deepEqual(ready.profile, { phone: '380501234567', firstName: 'Оксана', lastName: 'Коваль', username: 'oksana_k' });

  // Другий запит з тим самим nonce сесії не отримує.
  assert.notEqual((await completeTelegramLogin(NONCE, '123456', deps)).status, 'ready');
});

test('другий вхід того самого акаунта Telegram — той самий uid, не новий акаунт', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  await handleTelegramUpdate(contactFrom(TG_ID), deps);
  const first = await completeTelegramLogin(NONCE, '123456', deps);

  const second = 'ZyXwVuTsRqPoNmLkJiHgFe';
  await handleTelegramUpdate(privateMessage({ text: `/start ${second}` }), deps);
  assert.equal(await handleTelegramUpdate(contactFrom(TG_ID), deps), 'signed-in');
  const again = await completeTelegramLogin(second, '123456', deps);
  assert.equal(again.isNew, false);
  assert.equal(again.token, first.token);
  assert.equal(deps.auth.users.size, 1);
});

test('пересланий чужий контакт входу не дає', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  assert.equal(await handleTelegramUpdate(contactFrom(999), deps), 'foreign-contact');
  assert.deepEqual(await completeTelegramLogin(NONCE, '', deps), { status: 'pending', started: true });
});

test('спробу, яку взяв один акаунт Telegram, інший не перехоплює', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  assert.equal(await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }, 777), deps), 'claimed');
  const foreign = contactFrom(777);
  foreign.message.from = { id: 777 };
  foreign.message.chat = { id: 777, type: 'private' };
  assert.equal(await handleTelegramUpdate(foreign, deps), 'no-login');
});

test('прострочена спроба не дає входу', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  const later = { ...deps, now: deps.now + LOGIN_TTL_MS + 1 };
  assert.equal(await handleTelegramUpdate(contactFrom(TG_ID), later), 'expired');
  assert.equal((await completeTelegramLogin(NONCE, '123456', later)).status, 'expired');
  assert.equal(deps.db.data.has(`telegramLogins/${hashNonce(NONCE)}`), false);
});

test('група — не вхід', async () => {
  const { deps, sent } = setup();
  const update = { message: { chat: { id: -1, type: 'group' }, from: { id: TG_ID }, text: `/start ${NONCE}` } };
  assert.equal(await handleTelegramUpdate(update, deps), 'ignored');
  assert.equal(sent.length, 0);
});

test('недійсний nonce у застосунку — invalid', async () => {
  const { deps } = setup();
  assert.deepEqual(await completeTelegramLogin('short', '123456', deps), { status: 'invalid' });
});

test('підсунуте посилання: хто згенерував nonce, без коду жертви не входить, а перебір коду спалює вхід', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  await handleTelegramUpdate(contactFrom(TG_ID), deps);
  for (let i = 1; i < MAX_CODE_ATTEMPTS; i += 1) {
    assert.deepEqual(await completeTelegramLogin(NONCE, '000000', deps), { status: 'wrong-code', attemptsLeft: MAX_CODE_ATTEMPTS - i });
  }
  assert.equal((await completeTelegramLogin(NONCE, '000000', deps)).status, 'expired');
  // Навіть правильний код після цього не дає входу.
  assert.notEqual((await completeTelegramLogin(NONCE, '123456', deps)).status, 'ready');
});

test('у базі лежить хеш коду, а не сам код', async () => {
  const { deps } = setup();
  deps.randomCode = () => '987654';
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  await handleTelegramUpdate(contactFrom(TG_ID), deps);
  const record = deps.db.data.get(`telegramLogins/${hashNonce(NONCE)}`);
  assert.ok(!JSON.stringify(record).includes('987654'));
});

test('код у листі бота — у <code> з parse_mode HTML, щоб копіювався дотиком', async () => {
  const { createTelegramSender } = require('../telegramAuth');
  const calls = [];
  const send = createTelegramSender('t', async (url, init) => { calls.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ ok: true }) }; });
  await send(1, 'Ваш код: <code>123456</code>', undefined, { html: true });
  await send(1, 'інше');
  assert.equal(calls[0].parse_mode, 'HTML');
  assert.equal(calls[1].parse_mode, undefined);
});

test('привʼязка: акаунт пошти починає, бот дає код, і Telegram веде в цей акаунт', async () => {
  const { deps, sent } = setup();
  const LINK_NONCE = 'L'.repeat(22);
  // Без входу привʼязку не почати.
  assert.equal((await completeTelegramLogin(LINK_NONCE, '', { ...deps, intent: 'link' })).status, 'invalid');
  await completeTelegramLogin(LINK_NONCE, '', { ...deps, intent: 'link', callerUid: 'email-uid' });
  await handleTelegramUpdate(privateMessage({ text: `/start ${LINK_NONCE}` }), deps);
  assert.match(sent[sent.length - 1].text, /Привʼязка Telegram/);
  assert.equal(await handleTelegramUpdate(contactFrom(Number(TG_ID)), deps), 'link-ready');
  const done = sent[sent.length - 1];
  assert.match(done.text, /Код для привʼязки/);
  assert.match(done.markup.inline_keyboard[0][0].url, /^https:\/\/knowme\.pp\.ua\/my-profile#tgcode=\d{6}$/);
  // Акаунта Telegram не заведено.
  assert.equal(await deps.db.get(`telegramAccounts/${TG_ID}`), null);
  // Чужий акаунт кодом не скористається й спроб не спалить.
  assert.equal((await completeTelegramLogin(LINK_NONCE, '123456', { ...deps, callerUid: 'other' })).status, 'invalid');
  const linked = await completeTelegramLogin(LINK_NONCE, '123456', { ...deps, callerUid: 'email-uid' });
  assert.equal(linked.status, 'linked');
  assert.equal((await deps.db.get(`telegramAccounts/${TG_ID}`)).uid, 'email-uid');
});

test('привʼязка переписує старий акаунт Telegram і памʼятає його', async () => {
  const { deps } = setup();
  await deps.db.set(`telegramAccounts/${TG_ID}`, { uid: 'tg-uid', createdAt: 1 });
  const LINK_NONCE = 'M'.repeat(22);
  await completeTelegramLogin(LINK_NONCE, '', { ...deps, intent: 'link', callerUid: 'email-uid' });
  await handleTelegramUpdate(privateMessage({ text: `/start ${LINK_NONCE}` }), deps);
  await handleTelegramUpdate(contactFrom(Number(TG_ID)), deps);
  const linked = await completeTelegramLogin(LINK_NONCE, '123456', { ...deps, callerUid: 'email-uid' });
  assert.equal(linked.hadOtherAccount, true);
  const mapping = await deps.db.get(`telegramAccounts/${TG_ID}`);
  assert.equal(mapping.uid, 'email-uid');
  assert.equal(mapping.previousUid, 'tg-uid');
});

test('номер без коду акаунта не заводить: акаунт зʼявляється лише з правильним кодом', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  assert.equal(await handleTelegramUpdate(contactFrom(TG_ID), deps), 'registered');
  // Людина поділилась номером і не ввела код — у Auth нічого («(anonymous)»
  // без входу більше не буває).
  assert.equal(deps.auth.users.size, 0);
  assert.equal(await deps.db.get(`telegramAccounts/${TG_ID}`), null);
  const ready = await completeTelegramLogin(NONCE, '123456', deps);
  assert.equal(ready.status, 'ready');
  assert.equal(deps.auth.users.size, 1);
});

test('номер із Telegram лишається біля uid, навіть якщо анкету так і не записали', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  await handleTelegramUpdate(contactFrom(TG_ID), deps);
  const ready = await completeTelegramLogin(NONCE, '123456', deps);
  const account = await deps.db.get(`telegramAccounts/${TG_ID}`);
  assert.match(ready.token, new RegExp(account.uid));
  assert.deepEqual(account.contact, {
    phone: '380501234567', firstName: 'Оксана', lastName: 'Коваль', username: 'oksana_k', at: 1_000_000,
  });
});

test('новий акаунт одразу має контакти в анкеті, наявних не переписує', async () => {
  const { deps } = setup();
  await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps);
  await handleTelegramUpdate(contactFrom(TG_ID), deps);
  await completeTelegramLogin(NONCE, '123456', deps);
  const { uid } = await deps.db.get(`telegramAccounts/${TG_ID}`);
  assert.deepEqual(await deps.db.get(`profileContacts/${uid}`), { phone: '380501234567', telegram: 'oksana_k' });

  await deps.db.set(`profileContacts/${uid}`, { phone: '380000000000' });
  const second = 'ZyXwVuTsRqPoNmLkJiHgFe';
  await handleTelegramUpdate(privateMessage({ text: `/start ${second}` }), deps);
  await handleTelegramUpdate(contactFrom(TG_ID), deps);
  await completeTelegramLogin(second, '123456', deps);
  assert.deepEqual(await deps.db.get(`profileContacts/${uid}`), { phone: '380000000000' });
});

test('прибирання: прострочені спроби й вказівники на них зникають, живі лишаються', async () => {
  const now = 10_000_000;
  const data = {
    telegramLogins: {
      old: { status: 'ready', createdAt: now - LOGIN_TTL_MS - 6 * 60 * 1000, profile: { phone: '380' } },
      grace: { status: 'pending', createdAt: now - LOGIN_TTL_MS - 60 * 1000 },
      fresh: { status: 'pending', createdAt: now - 1000 },
      broken: { status: 'pending' },
    },
    telegramLoginsByTg: {
      1: { key: 'old' },
      2: { key: 'fresh' },
      3: { key: 'missing' },
    },
  };
  const db = {
    get: async path => {
      const [root, key] = path.split('/');
      return key ? (data[root] || {})[key] ?? null : data[root] ?? null;
    },
    set: async (path, value) => {
      const [root, key] = path.split('/');
      if (value === null) delete data[root][key];
      else data[root][key] = value;
    },
  };
  assert.equal(await sweepExpiredLogins({ db, now }), 2);
  // Запас після строку: браузерний годинник може відставати, тож щойно
  // прострочену спробу ще не чіпаємо.
  assert.deepEqual(Object.keys(data.telegramLogins).sort(), ['fresh', 'grace']);
  assert.deepEqual(Object.keys(data.telegramLoginsByTg), ['2']);
});

test('збій прибирання вхід не зупиняє', async () => {
  const { deps } = setup();
  const realGet = deps.db.get;
  deps.db.get = async path => {
    if (path === 'telegramLogins' || path === 'telegramLoginsByTg') throw new Error('boom');
    return realGet(path);
  };
  assert.equal(await handleTelegramUpdate(privateMessage({ text: `/start ${NONCE}` }), deps), 'pending');
});
