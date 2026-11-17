'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fillMissing,
  mergeAccounts,
  resolveAccountOnSignIn,
  resolvePrimaryUid,
} = require('../accountMerge');

const PRIMARY = 'PrimaryAccountUid0000000001';
const SECONDARY = 'TelegramAccountUid000000002';
const OTHER = 'OtherAccountUid000000000003';
const ADMIN = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';

// База в памʼяті: дерево обʼєктів, `update` — багатошляховий запис RTDB.
const createDb = (initial = {}) => {
  const root = JSON.parse(JSON.stringify(initial));
  const segments = path => path.split('/').filter(Boolean);
  const read = async path => {
    let node = root;
    for (const key of segments(path)) {
      if (!node || typeof node !== 'object') return null;
      node = node[key];
    }
    return node === undefined ? null : JSON.parse(JSON.stringify(node));
  };
  const write = (path, value) => {
    const keys = segments(path);
    let node = root;
    keys.slice(0, -1).forEach(key => {
      if (!node[key] || typeof node[key] !== 'object') node[key] = {};
      node = node[key];
    });
    if (value === null) delete node[keys[keys.length - 1]];
    else node[keys[keys.length - 1]] = JSON.parse(JSON.stringify(value));
  };
  const updates = [];
  return {
    root,
    updates,
    deps: {
      read,
      update: async patch => {
        updates.push(patch);
        Object.entries(patch).forEach(([path, value]) => write(path, value));
      },
      createCustomToken: async uid => `token-for-${uid}`,
    },
  };
};

const seed = () => ({
  profileDetails: {
    [PRIMARY]: { city: 'Київ', about: '' },
    [SECONDARY]: { city: 'Львів', about: 'Про мене', height: '170' },
  },
  profileContacts: {
    [PRIMARY]: { email: 'me@example.com' },
    [SECONDARY]: { phone: '380501234567', telegram: 'oksana' },
  },
  profileTechnical: {
    [SECONDARY]: { accessLevel: 'matching:view', lastLogin: '2026-11-16' },
  },
  matchingCards: {
    [PRIMARY]: { role: 'ag', feedDate: '2026-11-10' },
    [SECONDARY]: { name: 'Оксана', role: 'ed', feedDate: '2026-11-16', audience: 'liked' },
  },
  multiData: {
    flow: {
      [PRIMARY]: { food: { a: { sum: 10 } } },
      [SECONDARY]: { food: { b: { sum: 5 } }, rent: { c: { sum: 100 } } },
    },
    favorites: {
      [PRIMARY]: { card1: 'ed' },
      [SECONDARY]: { card1: true, card2: 1700000000000 },
    },
  },
  telegramAccounts: { 777: { uid: SECONDARY, createdAt: 1 } },
});

test('доливає лише туди, де в головному порожньо', () => {
  assert.deepEqual(
    fillMissing('p', { a: 'x', b: '', c: ['1', ''] }, { a: 'y', b: 'z', c: ['2'], d: 'w', e: '' }),
    { 'p/b': 'z', 'p/d': 'w' },
  );
});

test('злиття: дані другорядного доливаються, головні не переписуються', async () => {
  const { root, deps } = createDb(seed());
  const result = await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: SECONDARY, via: 'telegram-link', now: 5 });
  assert.equal(result.status, 'merged');

  assert.deepEqual(root.profileDetails[PRIMARY], { city: 'Київ', about: 'Про мене', height: '170' });
  assert.deepEqual(root.profileContacts[PRIMARY], { email: 'me@example.com', phone: '380501234567', telegram: 'oksana' });
  // Права видає лише адмін — не переносяться.
  assert.deepEqual(root.profileTechnical[PRIMARY], { lastLogin: '2026-11-16' });
  // Flow: дві групи з однаковою назвою — записи обох, нова група — цілком.
  assert.deepEqual(root.multiData.flow[PRIMARY], {
    food: { a: { sum: 10 }, b: { sum: 5 } },
    rent: { c: { sum: 100 } },
  });
  // Реакція головного перемагає, відсутня — доливається.
  assert.deepEqual(root.multiData.favorites[PRIMARY], { card1: 'ed', card2: 1700000000000 });
  // Імʼя з картки другорядного (лише в картці), роль головного лишається.
  assert.equal(root.matchingCards[PRIMARY].name, 'Оксана');
  assert.equal(root.matchingCards[PRIMARY].role, 'ag');
  assert.equal(root.matchingCards[PRIMARY].feedDate, '2026-11-10');
  // Другорядна картка схована від усіх, дані другорядного лишаються копією.
  assert.equal(root.matchingCards[SECONDARY].feedDate, false);
  assert.equal(root.matchingCards[SECONDARY].audience, undefined);
  assert.equal(root.profileDetails[SECONDARY].city, 'Львів');
  // Telegram відкриває головний, а другорядний веде на головний.
  assert.deepEqual(root.telegramAccounts[777], { uid: PRIMARY, previousUid: SECONDARY, createdAt: 1 });
  assert.deepEqual(root.accountAliases[SECONDARY], { primary: PRIMARY, at: 5, via: 'telegram-link' });
});

test('вхід у другорядний видає токен головного', async () => {
  const { deps } = createDb(seed());
  await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: SECONDARY });
  assert.deepEqual(await resolveAccountOnSignIn(deps, SECONDARY), { status: 'redirect', token: `token-for-${PRIMARY}` });
  assert.deepEqual(await resolveAccountOnSignIn(deps, PRIMARY), { status: 'primary' });
});

test('повторне злиття нічого не пише, цикл і адмін-другорядний відмовляють', async () => {
  const { deps, updates } = createDb(seed());
  await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: SECONDARY });
  const count = updates.length;
  assert.equal((await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: SECONDARY })).status, 'already-merged');
  assert.deepEqual(await mergeAccounts(deps, { primaryUid: SECONDARY, secondaryUid: PRIMARY }), { status: 'refused', reason: 'cycle' });
  assert.deepEqual(await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: ADMIN }), { status: 'refused', reason: 'protected' });
  assert.equal(updates.length, count);
});

test('злиття в другорядний іде в його головний, і посилання не ланцюжаться', async () => {
  const { root, deps } = createDb(seed());
  await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: SECONDARY });
  // Людина ще раз привʼязала інший вхід — з другорядного (стара сесія).
  await mergeAccounts(deps, { primaryUid: SECONDARY, secondaryUid: OTHER });
  assert.equal(root.accountAliases[OTHER].primary, PRIMARY);
  assert.equal(await resolvePrimaryUid(deps, OTHER), PRIMARY);
});

test('давня привʼязка Telegram без злиття зливається на вході головного', async () => {
  const data = seed();
  data.telegramAccounts = { 777: { uid: PRIMARY, previousUid: SECONDARY, linkedAt: 2 } };
  const { root, deps } = createDb(data);
  assert.deepEqual(await resolveAccountOnSignIn(deps, PRIMARY), { status: 'merged', merged: 1 });
  assert.equal(root.accountAliases[SECONDARY].primary, PRIMARY);
  assert.equal(root.accountAliases[SECONDARY].via, 'telegram-link');
  assert.equal(root.profileContacts[PRIMARY].phone, '380501234567');
  // Удруге — нічого.
  assert.deepEqual(await resolveAccountOnSignIn(deps, PRIMARY), { status: 'primary' });
});

test('видалений головний не перемикає — сесія лишається в другорядному', async () => {
  const { deps } = createDb(seed());
  await mergeAccounts(deps, { primaryUid: PRIMARY, secondaryUid: SECONDARY });
  const gone = { ...deps, userExists: async uid => uid !== PRIMARY };
  assert.deepEqual(await resolveAccountOnSignIn(gone, SECONDARY), { status: 'primary' });
});
