'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NOTIFYING_LIKER_UIDS,
  handleFavoriteWrite,
  isNewLike,
  likeTargetsDonorAnketa,
} = require('../likeNotifications');

const ADMIN = NOTIFYING_LIKER_UIDS[0];
const DONOR = 'donorUid0000000000000000001';

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

const makeDeps = ({ data = {}, accounts = [DONOR], pushResults } = {}) => {
  const sent = { telegram: [], push: [] };
  const db = {
    get: async path => getPath(data, path) ?? null,
    set: async (path, value) => setPath(data, path, value),
    update: async updates => Object.entries(updates).forEach(([path, value]) => setPath(data, path, value)),
    transaction: async (path, update) => {
      const next = update(getPath(data, path) ?? null);
      if (next === undefined) return { committed: false };
      setPath(data, path, next);
      return { committed: true };
    },
    queryByChild: async (path, child, value) => Object.fromEntries(
      Object.entries(getPath(data, path) || {}).filter(([, entry]) => entry && entry[child] === value),
    ),
  };
  return {
    data,
    sent,
    deps: {
      db,
      now: 1000,
      accountExists: async uid => accounts.includes(uid),
      sendTelegram: async (chatId, text) => { sent.telegram.push({ chatId, text }); },
      sendPush: async ({ tokens, data: payload }) => {
        sent.push.push({ tokens, payload });
        return pushResults ? pushResults(tokens) : tokens.map(() => ({ success: true }));
      },
    },
  };
};

const donorData = () => ({
  matchingCards: { [DONOR]: { role: 'ed' } },
  telegramAccounts: { 555: { uid: DONOR } },
  pushTokens: { [DONOR]: { tokA: { at: 1 }, tokB: { at: 2 } } },
});

test('нове серце — лише поява значення', () => {
  assert.equal(isNewLike(null, true), true);
  assert.equal(isNewLike(undefined, 1700000000000), true);
  assert.equal(isNewLike(true, 1700000000000), false);
  assert.equal(isNewLike(true, null), false);
});

test('серце на агентську анкету донорки-агентки — не про донорку', () => {
  assert.equal(likeTargetsDonorAnketa(true), true);
  assert.equal(likeTargetsDonorAnketa(1700000000000), true);
  assert.equal(likeTargetsDonorAnketa('ed'), true);
  assert.equal(likeTargetsDonorAnketa('ag'), false);
});

test('серце адміна — Telegram і push, з кількістю й без того, хто вподобав', async () => {
  const { deps, sent, data } = makeDeps({ data: donorData() });
  const outcome = await handleFavoriteWrite({ likerId: ADMIN, cardId: DONOR, before: null, after: true }, deps);
  assert.equal(outcome, 'telegram,push-2');
  assert.equal(sent.telegram[0].chatId, '555');
  assert.match(sent.telegram[0].text, /вподобали/);
  assert.doesNotMatch(sent.telegram[0].text, new RegExp(ADMIN));
  assert.deepEqual(sent.push[0].tokens, ['tokA', 'tokB']);
  assert.equal(sent.push[0].payload.count, '1');
  assert.equal(data.likeNotifications[DONOR].count, 1);
});

test('другий адмін — «усього вподобань: 2»; повтор того самого — тиша', async () => {
  const { deps, sent } = makeDeps({ data: donorData() });
  await handleFavoriteWrite({ likerId: NOTIFYING_LIKER_UIDS[0], cardId: DONOR, before: null, after: true }, deps);
  await handleFavoriteWrite({ likerId: NOTIFYING_LIKER_UIDS[1], cardId: DONOR, before: null, after: true }, deps);
  assert.match(sent.telegram[1].text, /Усього вподобань: 2/);
  const again = await handleFavoriteWrite({ likerId: NOTIFYING_LIKER_UIDS[0], cardId: DONOR, before: null, after: 5 }, deps);
  assert.equal(again, 'already-counted');
  assert.equal(sent.telegram.length, 2);
});

test('серце не адміна поки нічого не шле', async () => {
  const { deps, sent, data } = makeDeps({ data: donorData() });
  const outcome = await handleFavoriteWrite({ likerId: 'agencyUid000000000000000001', cardId: DONOR, before: null, after: true }, deps);
  assert.equal(outcome, 'liker-not-enabled');
  assert.equal(sent.telegram.length + sent.push.length, 0);
  assert.equal(data.likeNotifications, undefined);
});

test('не донорка й картка без акаунта — без сповіщення', async () => {
  const agency = makeDeps({ data: { ...donorData(), matchingCards: { [DONOR]: { role: 'ag' } } } });
  assert.equal(await handleFavoriteWrite({ likerId: ADMIN, cardId: DONOR, before: null, after: true }, agency.deps), 'not-donor');
  const imported = makeDeps({ data: donorData(), accounts: [] });
  assert.equal(await handleFavoriteWrite({ likerId: ADMIN, cardId: 'TG0001', before: null, after: true }, imported.deps), 'no-account');
});

test('донорка-агентка: роль масивом рахується', async () => {
  const { deps } = makeDeps({ data: { ...donorData(), matchingCards: { [DONOR]: { role: ['ag', 'ed'] } } } });
  assert.equal(await handleFavoriteWrite({ likerId: ADMIN, cardId: DONOR, before: null, after: 'ed' }, deps), 'telegram,push-2');
});

test('мертвий токен push знімається', async () => {
  const { deps, data } = makeDeps({
    data: donorData(),
    pushResults: tokens => tokens.map(token => (token === 'tokA'
      ? { success: false, errorCode: 'messaging/registration-token-not-registered' }
      : { success: true })),
  });
  const outcome = await handleFavoriteWrite({ likerId: ADMIN, cardId: DONOR, before: null, after: true }, deps);
  assert.equal(outcome, 'telegram,push-1,push-removed-1');
  assert.deepEqual(Object.keys(data.pushTokens[DONOR]), ['tokB']);
});

test('збій Telegram не зупиняє push', async () => {
  const { deps } = makeDeps({ data: donorData() });
  deps.sendTelegram = async () => { const error = new Error('blocked'); error.status = 403; throw error; };
  const outcome = await handleFavoriteWrite({ likerId: ADMIN, cardId: DONOR, before: null, after: true }, deps);
  assert.equal(outcome, 'telegram-failed-403,push-2');
});
