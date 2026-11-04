'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildIdentityClaimUpdates,
  buildOwnedPaths,
  buildSearchIdUpdates,
  buildSearchKeyUpdates,
  deleteAccountData,
  isProtectedUid,
  listShareTokens,
} = require('../accountDeletion');
const { renderAccountDeletedEmail } = require('../emails/accountDeleted');

const UID = 'abcdefghijklmnopqrst1234';

test('searchId: знімається id, а чужі анкети під тим самим значенням лишаються', () => {
  const updates = buildSearchIdUpdates({
    '380671112233': { phone: UID },
    'олена': { name: ['AA0001', UID], surname: 'AA0731' },
    'oksana': { name: [UID, 'AA1', 'AA2'] },
    'legacy': UID,
    'other': { phone: 'AA0002' },
  }, UID);
  assert.deepEqual(updates, {
    'searchId/380671112233/phone': null,
    'searchId/олена/name': 'AA0001',
    'searchId/oksana/name': ['AA1', 'AA2'],
    'searchId/legacy': null,
  });
});

test('searchKey і заявки на унікальність: лише записи цієї картки', () => {
  assert.deepEqual(buildSearchKeyUpdates({
    role: { ed: { [UID]: true, other: true }, ag: { other: true } },
    age: { a26_30: { [UID]: true } },
  }, UID), {
    'searchKey/users/role/ed/abcdefghijklmnopqrst1234': null,
    'searchKey/users/age/a26_30/abcdefghijklmnopqrst1234': null,
  });
  assert.deepEqual(buildIdentityClaimUpdates({ k1: UID, k2: 'AA1' }, UID), {
    'multiData/profileIdentityClaims/k1': null,
  });
});

test('видаляються вузли анкети, власні multiData й legacy-копія', () => {
  const paths = buildOwnedPaths(UID);
  ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'users', 'comments']
    .forEach(root => assert.ok(paths.includes(`${root}/${UID}`), root));
  assert.ok(paths.includes(`multiData/favorites/${UID}`));
  assert.ok(paths.includes(`multiData/programs/${UID}`));
});

test('адмінів і інспектора видалити не можна', () => {
  assert.ok(isProtectedUid('3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'));
  assert.ok(isProtectedUid('vtDxkDMjCwYuTDqTUnZsO29bpQr1'));
  assert.ok(!isProtectedUid(UID));
});

test('токени посилань беруться зі слотів', () => {
  assert.deepEqual(listShareTokens({ 0: { token: 'tokentokentoken1' }, 2: { token: 'bad token' } }), ['tokentokentoken1']);
});

const fakeDeps = (data, overrides = {}) => {
  const updates = [];
  const files = [];
  const auth = [];
  return {
    updates,
    files,
    auth,
    deps: {
      read: async path => data[path] ?? null,
      update: async next => { updates.push(next); },
      deleteFiles: async prefix => { files.push(prefix); },
      deleteAuthUser: async id => { auth.push(id); },
      ...overrides,
    },
  };
};

test('повне видалення: база, фото, посилання, а наприкінці — акаунт', async () => {
  const { deps, updates, files, auth } = fakeDeps({
    [`multiData/favorites/${UID}`]: { readerA: true },
    [`multiData/profileShareSlots/${UID}`]: { 0: { token: 'tokentokentoken1' } },
    searchId: { '380': { phone: UID } },
  });
  const result = await deleteAccountData(deps, UID);
  assert.deepEqual(result, { failed: [], deletedAuth: true });
  const merged = Object.assign({}, ...updates);
  assert.equal(merged['searchId/380/phone'], null);
  assert.equal(merged[`multiData/likedAudience/readerA/${UID}`], null);
  assert.equal(merged['profileShares/tokentokentoken1'], null);
  assert.equal(merged[`profileDetails/${UID}`], null);
  assert.deepEqual(files, [`avatar/${UID}/`, 'profileShares/tokentokentoken1/']);
  assert.deepEqual(auth, [UID]);
});

test('збій запису вузлів лишає акаунт: людина ще може увійти й повторити', async () => {
  const { deps, auth } = fakeDeps({}, {
    update: async next => {
      if (Object.prototype.hasOwnProperty.call(next, `profileDetails/${UID}`)) throw new Error('boom');
    },
  });
  const result = await deleteAccountData(deps, UID);
  assert.deepEqual(result, { failed: ['nodes'], deletedAuth: false });
  assert.deepEqual(auth, []);
});

test('лист «Профіль видалено» — без кнопки, мовою людини', () => {
  const uk = renderAccountDeletedEmail({ email: 'a@example.com', language: 'uk' });
  assert.equal(uk.subject, 'Профіль видалено');
  assert.match(uk.html, /<html lang="uk"/);
  assert.doesNotMatch(uk.html, /class="km-btn"/);
  assert.ok(uk.text.includes('a@example.com'));
  assert.equal(renderAccountDeletedEmail({ email: 'a@example.com', language: 'de' }).subject, 'Your profile has been deleted');
});
