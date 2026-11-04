'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEditsHistoryUpdates,
  buildEditsUpdates,
  buildIdentityClaimUpdates,
  buildLikedAudienceUpdates,
  buildOwnedPaths,
  buildOwnerCardUpdates,
  buildPublicCommentUpdates,
  buildSearchIdUpdates,
  buildSearchKeySetUpdates,
  buildSearchKeyUpdates,
  buildSharedAccessUpdates,
  buildTelegramUpdates,
  deleteAccountData,
  isProtectedUid,
  listShareTokens,
  verifyDraftCardIds,
} = require('../accountDeletion');
const { renderAccountDeletedEmail } = require('../emails/accountDeleted');

const UID = 'abcdefghijklmnopqrst1234';
const DRAFT = '-Ndraft1';
const IDS = new Set([UID, DRAFT]);

test('searchId: знімаються видалені id, а чужі анкети під тим самим значенням лишаються', () => {
  const updates = buildSearchIdUpdates({
    '380671112233': { phone: UID },
    'олена': { name: ['AA0001', UID], surname: 'AA0731' },
    'oksana': { name: [UID, 'AA1', DRAFT, 'AA2'] },
    'legacy': UID,
    'other': { phone: 'AA0002' },
  }, IDS);
  assert.deepEqual(updates, {
    'searchId/380671112233/phone': null,
    'searchId/олена/name': 'AA0001',
    'searchId/oksana/name': ['AA1', 'AA2'],
    'searchId/legacy': null,
  });
});

test('searchKey, зрізи доступу й заявки на унікальність: лише записи видалених карток', () => {
  assert.deepEqual(buildSearchKeyUpdates({
    role: { ed: { [UID]: true, other: true }, ag: { other: true } },
    age: { a26_30: { [UID]: true } },
  }, IDS), {
    [`searchKey/users/role/ed/${UID}`]: null,
    [`searchKey/users/age/a26_30/${UID}`]: null,
  });
  assert.deepEqual(buildSearchKeySetUpdates({ owner__1: { role: { ed: { [UID]: true, x: true } } } }, IDS), {
    [`searchKeySets/owner__1/role/ed/${UID}`]: null,
  });
  assert.deepEqual(buildIdentityClaimUpdates({ k1: UID, k2: 'AA1', k3: DRAFT }, IDS), {
    'multiData/profileIdentityClaims/k1': null,
    'multiData/profileIdentityClaims/k3': null,
  });
});

test('чужі лайки, дизлайки, позначки й нотатки про видалену картку знімаються', () => {
  assert.deepEqual(buildOwnerCardUpdates('favorites', {
    agency: { [UID]: 'ed', AA1: true },
    [UID]: { AA2: true },
  }, UID, IDS), { [`multiData/favorites/agency/${UID}`]: null });
  // Стара перевернута форма `getInTouch`.
  assert.deepEqual(buildOwnerCardUpdates('getInTouch', {
    admin: { '2026-11-01': { [UID]: true, AA1: true }, [DRAFT]: '2026-12-01' },
  }, UID, IDS), {
    [`multiData/getInTouch/admin/2026-11-01/${UID}`]: null,
    [`multiData/getInTouch/admin/${DRAFT}`]: null,
  });
  assert.deepEqual(buildLikedAudienceUpdates({ reader: { [UID]: true, other: true }, [UID]: { x: true } }, UID, IDS), {
    [`multiData/likedAudience/reader/${UID}`]: null,
  });
});

test('сліди на чужих картках: доповнення, журнал, відгуки з прапорцем, спільний доступ, Telegram', () => {
  assert.deepEqual(buildEditsUpdates({ AA1: { [UID]: {}, other: {} }, [UID]: { x: {} } }, UID, IDS), {
    [`multiData/edits/AA1/${UID}`]: null,
  });
  assert.deepEqual(buildEditsHistoryUpdates({ AA1: { e1: { editorUserId: UID }, e2: { editorUserId: 'x' } } }, UID, IDS), {
    'multiData/editsHistory/AA1/e1': null,
  });
  assert.deepEqual(buildPublicCommentUpdates({
    AA1: { c1: { authorId: UID }, c2: { authorId: 'x' } },
    AA2: { c3: { authorId: UID } },
  }, UID, IDS), {
    'comments/AA1/c1': null,
    'replies/c1': null,
    'comments/AA2/c3': null,
    'replies/c3': null,
    // Під AA2 відгуків більше немає — прапорець картки теж іде.
    'matchingCards/AA2/hasPublicReview': null,
  });
  assert.deepEqual(buildSharedAccessUpdates({ helper: { multiDataSourceUserIds: { [UID]: true, z: true } } }, UID, IDS), {
    [`profileTechnical/helper/multiDataSourceUserIds/${UID}`]: null,
  });
  assert.deepEqual(buildTelegramUpdates({ 1: { uid: UID }, 2: { uid: 'x', previousUid: UID }, 3: { uid: 'y' } }, UID), {
    'telegramAccounts/1': null,
    'telegramAccounts/2/previousUid': null,
  });
});

test('видаляються вузли анкети й чернеток, власні multiData, legacy-копії', () => {
  const paths = buildOwnedPaths(UID, [DRAFT]);
  ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'users', 'usersIndex', 'comments']
    .forEach(root => assert.ok(paths.includes(`${root}/${UID}`), root));
  assert.ok(paths.includes(`multiData/favorites/${UID}`));
  assert.ok(paths.includes(`multiData/profileMutations/${UID}`));
  assert.ok(paths.includes(`comments/${DRAFT}`));
  assert.ok(paths.includes(`multiData/profileMutationOwners/${DRAFT}`));
});

test('чернеткою вважається лише доведене сервером: чужа анкета під id «чернетки» не видаляється', async () => {
  const VICTIM_ACCOUNT = 'victimvictimvictimvictim1';
  const drafts = {
    [DRAFT]: { operation: 'create', createdBy: UID, cardId: DRAFT },
    AA0001: { operation: 'create', createdBy: UID, cardId: 'AA0001' },
    [VICTIM_ACCOUNT]: { operation: 'create', createdBy: UID, cardId: VICTIM_ACCOUNT },
    '-Nshared': { operation: 'create', createdBy: UID, cardId: '-Nshared' },
    '-Nforged': { operation: 'create', createdBy: 'someoneElse', cardId: '-Nforged' },
    '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2': { operation: 'create', createdBy: UID, cardId: '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2' },
  };
  const data = {
    'multiData/profileMutations': { [UID]: drafts, other: { '-Nshared': {} } },
    'profileDetails/AA0001': { name: 'Оксана' },
  };
  const deps = {
    read: async path => data[path] ?? null,
    getAuthUser: async id => {
      if (id === VICTIM_ACCOUNT) return { uid: id };
      throw Object.assign(new Error('nf'), { code: 'auth/user-not-found' });
    },
  };
  assert.deepEqual(await verifyDraftCardIds(deps, UID, drafts), [DRAFT]);
});

test('адмінів і інспектора видалити не можна', () => {
  assert.ok(isProtectedUid('3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'));
  assert.ok(isProtectedUid('vtDxkDMjCwYuTDqTUnZsO29bpQr1'));
  assert.ok(!isProtectedUid(UID));
});

test('токени посилань беруться зі слотів', () => {
  assert.deepEqual(listShareTokens({ 0: { token: 'tokentokentoken1' }, 2: { token: 'bad token' } }), ['tokentokentoken1']);
});

const notFound = () => Object.assign(new Error('nf'), { code: 'auth/user-not-found' });

const fakeDeps = (data, overrides = {}) => {
  const log = [];
  const updates = [];
  const files = [];
  let authExists = true;
  return {
    log,
    updates,
    files,
    deps: {
      read: async path => data[path] ?? null,
      update: async next => { updates.push(next); },
      deleteFiles: async prefix => { files.push(prefix); },
      setAuthDisabled: async (id, disabled) => { log.push(`disabled:${disabled}`); },
      deleteAuthUser: async id => { log.push(`delete:${id}`); authExists = false; },
      getAuthUser: async id => { if (id !== UID || !authExists) throw notFound(); return { uid: UID }; },
      ...overrides,
    },
  };
};

test('повне видалення: чужі сліди, база, фото, посилання, а наприкінці — перевірене видалення акаунта', async () => {
  const { deps, updates, files, log } = fakeDeps({
    [`multiData/profileShareSlots/${UID}`]: { 0: { token: 'tokentokentoken1' } },
    [`multiData/profileMutations/${UID}`]: { [DRAFT]: { operation: 'create', createdBy: UID, cardId: DRAFT } },
    searchId: { '380': { phone: UID }, '381': { phone: DRAFT } },
    'multiData/favorites': { agency: { [UID]: true, [DRAFT]: true } },
    'multiData/dislikes': { donor: { [UID]: 123 } },
    'multiData/likedAudience': { readerA: { [UID]: true } },
    comments: { AA1: { c1: { authorId: UID } } },
  });
  const result = await deleteAccountData(deps, UID);
  assert.deepEqual(result.failed, []);
  assert.equal(result.deletedAuth, true);
  const merged = Object.assign({}, ...updates);
  assert.equal(merged['searchId/380/phone'], null);
  assert.equal(merged['searchId/381/phone'], null);
  assert.equal(merged[`multiData/favorites/agency/${UID}`], null);
  assert.equal(merged[`multiData/favorites/agency/${DRAFT}`], null);
  assert.equal(merged[`multiData/dislikes/donor/${UID}`], null);
  assert.equal(merged[`multiData/likedAudience/readerA/${UID}`], null);
  assert.equal(merged['comments/AA1/c1'], null);
  assert.equal(merged['profileShares/tokentokentoken1'], null);
  assert.equal(merged[`profileDetails/${UID}`], null);
  assert.equal(merged[`multiData/profileMutationOwners/${DRAFT}`], null);
  assert.deepEqual(files, [`avatar/${UID}/`, `avatar/${DRAFT}/`, 'profileShares/tokentokentoken1/']);
  // Спершу вимкнули вхід, наприкінці — видалили.
  assert.deepEqual(log, ['disabled:true', `delete:${UID}`]);
});

test('акаунт, який після deleteUser усе ще є, — це збій, а не успіх', async () => {
  const { deps } = fakeDeps({}, { deleteAuthUser: async () => {}, getAuthUser: async () => ({ uid: UID }) });
  const result = await deleteAccountData(deps, UID);
  assert.deepEqual(result.failed, ['auth']);
  assert.equal(result.deletedAuth, false);
});

test('повтор після часткового збою: акаунта вже немає — вважається видаленим', async () => {
  const { deps } = fakeDeps({}, { deleteAuthUser: async () => { throw notFound(); }, getAuthUser: async () => { throw notFound(); } });
  const result = await deleteAccountData(deps, UID);
  assert.equal(result.deletedAuth, true);
});

test('збій запису вузлів лишає акаунт і вмикає його назад: людина може увійти й повторити', async () => {
  const { deps, log } = fakeDeps({}, {
    update: async next => {
      if (Object.prototype.hasOwnProperty.call(next, `profileDetails/${UID}`)) throw new Error('boom');
    },
  });
  const result = await deleteAccountData(deps, UID);
  assert.deepEqual(result.failed, ['nodes']);
  assert.equal(result.deletedAuth, false);
  assert.deepEqual(log, ['disabled:true', 'disabled:false']);
});

test('великі переліки пишуться порціями', async () => {
  const searchId = {};
  for (let index = 0; index < 1000; index += 1) searchId[`v${index}`] = { phone: UID };
  const { deps, updates } = fakeDeps({ searchId });
  const result = await deleteAccountData(deps, UID);
  assert.equal(result.counts.searchId, 1000);
  assert.ok(updates.every(chunk => Object.keys(chunk).length <= 400));
});

test('лист «Профіль видалено» — без кнопки, мовою людини', () => {
  const uk = renderAccountDeletedEmail({ email: 'a@example.com', language: 'uk' });
  assert.equal(uk.subject, 'Профіль видалено');
  assert.match(uk.html, /<html lang="uk"/);
  assert.doesNotMatch(uk.html, /class="km-btn"/);
  assert.ok(uk.text.includes('a@example.com'));
  assert.equal(renderAccountDeletedEmail({ email: 'a@example.com', language: 'de' }).subject, 'Your profile has been deleted');
});
