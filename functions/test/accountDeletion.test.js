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
  canPurgeAccounts,
  canViewDeletionQueue,
  isProtectedUid,
  listAccountDeletionQueue,
  listShareTokens,
  purgeAccountData,
  requestAccountDeletion,
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
      deleteAuthUser: async id => { log.push(`delete:${id}`); authExists = false; },
      getAuthUser: async id => { if (id !== UID || !authExists) throw notFound(); return { uid: UID }; },
      ...overrides,
    },
  };
};

test('крок людини: анкета ховається, посилання гаснуть, запис у черзі, акаунт входу видалено', async () => {
  const { deps, updates, log } = fakeDeps({
    [`matchingCards/${UID}`]: { name: 'Оксана', feedDate: '2026-10-01', audience: 'liked' },
    [`multiData/profileShareSlots/${UID}`]: { 0: { token: 'tokentokentoken1' } },
  });
  const result = await requestAccountDeletion(deps, UID, { now: 1000 });
  assert.deepEqual(result, { status: 'requested', authDeleted: true });
  assert.deepEqual(updates[0], {
    [`accountDeletions/${UID}`]: { requestedAt: 1000, via: 'self' },
    [`matchingCards/${UID}/feedDate`]: false,
    [`matchingCards/${UID}/audience`]: null,
    'profileShares/tokentokentoken1': null,
  });
  // Сама анкета й решта даних лишаються — їх очищає адмін.
  assert.ok(!Object.keys(updates[0]).some(path => path.startsWith('profileDetails') || path === `matchingCards/${UID}`));
  assert.deepEqual(updates[1], { [`accountDeletions/${UID}/authDeletedAt`]: 1000 });
  assert.deepEqual(log, [`delete:${UID}`]);
});

test('крок людини: картки-привида не заводить, повтор не переписує час першого запиту', async () => {
  const { deps, updates } = fakeDeps({ [`accountDeletions/${UID}`]: { requestedAt: 500 } }, {
    getAuthUser: async () => { throw notFound(); },
  });
  await requestAccountDeletion(deps, UID, { now: 1000 });
  assert.deepEqual(updates[0], { [`accountDeletions/${UID}`]: { requestedAt: 500, via: 'self' } });
});

test('крок людини: вимкнений акаунт не чіпається', async () => {
  const { deps, updates, log } = fakeDeps({}, { getAuthUser: async () => ({ uid: UID, disabled: true }) });
  assert.deepEqual(await requestAccountDeletion(deps, UID), { status: 'disabled', authDeleted: false });
  assert.deepEqual(updates, []);
  assert.deepEqual(log, []);
});

test('крок людини: акаунт, що лишився після deleteUser, — збій, а не успіх', async () => {
  const { deps } = fakeDeps({}, { deleteAuthUser: async () => {}, getAuthUser: async () => ({ uid: UID }) });
  await assert.rejects(() => requestAccountDeletion(deps, UID), /still exists/);
});

test('черга: найстаріший запит першим, сміття відкинуто', () => {
  assert.deepEqual(listAccountDeletionQueue({
    [UID]: { requestedAt: 20, authDeletedAt: 21 },
    bbbbbbbbbbbbbbbbbbbbbbbb: { requestedAt: 10 },
    'bad id': { requestedAt: 1 },
    cccccccccccccccccccccccc: 'junk',
  }).map(entry => entry.uid), ['bbbbbbbbbbbbbbbbbbbbbbbb', UID]);
});

test('права: очищає лише повний адмін, чергу бачить і інспектор', () => {
  assert.ok(canPurgeAccounts('3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'));
  assert.ok(!canPurgeAccounts('vtDxkDMjCwYuTDqTUnZsO29bpQr1'));
  assert.ok(canViewDeletionQueue('vtDxkDMjCwYuTDqTUnZsO29bpQr1'));
  assert.ok(!canViewDeletionQueue(UID));
});

test('крок адміна: чужі сліди, база, фото, посилання — і запис черги знято', async () => {
  const { deps, updates, files } = fakeDeps({
    [`multiData/profileShareSlots/${UID}`]: { 0: { token: 'tokentokentoken1' } },
    [`multiData/profileMutations/${UID}`]: { [DRAFT]: { operation: 'create', createdBy: UID, cardId: DRAFT } },
    searchId: { '380': { phone: UID }, '381': { phone: DRAFT } },
    'multiData/favorites': { agency: { [UID]: true, [DRAFT]: true } },
    'multiData/dislikes': { donor: { [UID]: 123 } },
    'multiData/likedAudience': { readerA: { [UID]: true } },
    comments: { AA1: { c1: { authorId: UID } } },
  }, { getAuthUser: async () => { throw notFound(); } });
  const result = await purgeAccountData(deps, UID);
  assert.deepEqual(result.failed, []);
  assert.equal(result.complete, true);
  const merged = Object.assign({}, ...updates);
  assert.equal(merged['searchId/380/phone'], null);
  assert.equal(merged['searchId/381/phone'], null);
  assert.equal(merged[`multiData/favorites/agency/${UID}`], null);
  assert.equal(merged[`multiData/favorites/agency/${DRAFT}`], null);
  assert.equal(merged[`multiData/dislikes/donor/${UID}`], null);
  assert.equal(merged[`multiData/likedAudience/readerA/${UID}`], null);
  assert.equal(merged['comments/AA1/c1'], null);
  assert.equal(merged['profileShares/tokentokentoken1'], null);
  assert.equal(merged[`matchingCards/${UID}`], null);
  assert.equal(merged[`profileDetails/${UID}`], null);
  assert.equal(merged[`multiData/profileMutationOwners/${DRAFT}`], null);
  assert.equal(merged[`accountDeletions/${UID}`], null);
  assert.deepEqual(files, [`avatar/${UID}/`, `avatar/${DRAFT}/`, 'profileShares/tokentokentoken1/']);
});

test('крок адміна: акаунт входу, що лишився після збою людини, теж видаляється', async () => {
  const { deps, log } = fakeDeps({});
  const result = await purgeAccountData(deps, UID);
  assert.equal(result.complete, true);
  assert.deepEqual(log, [`delete:${UID}`]);
});

test('крок адміна: збій лишає запис у черзі з переліком кроків — сповіщення не гасне', async () => {
  const { deps, updates } = fakeDeps({}, {
    getAuthUser: async () => { throw notFound(); },
    update: async next => {
      if (Object.prototype.hasOwnProperty.call(next, `profileDetails/${UID}`)) throw new Error('boom');
      updates.push(next);
    },
  });
  const result = await purgeAccountData(deps, UID, { now: 7 });
  assert.equal(result.complete, false);
  assert.deepEqual(result.failed, ['nodes']);
  assert.deepEqual(updates[updates.length - 1], { [`accountDeletions/${UID}/lastPurge`]: { at: 7, failed: ['nodes'] } });
});

test('відповідь знімається лише тоді, коли id відгуку не стоїть під чужим відгуком', () => {
  const updates = buildPublicCommentUpdates({
    AA1: { shared: { authorId: UID }, own: { authorId: UID } },
    AA2: { shared: { authorId: 'victim' } },
  }, UID, IDS);
  assert.equal(updates['comments/AA1/shared'], null);
  assert.ok(!Object.prototype.hasOwnProperty.call(updates, 'replies/shared'));
  assert.equal(updates['replies/own'], null);
});

test('крок адміна: великі переліки пишуться порціями', async () => {
  const searchId = {};
  for (let index = 0; index < 1000; index += 1) searchId[`v${index}`] = { phone: UID };
  const { deps, updates } = fakeDeps({ searchId }, { getAuthUser: async () => { throw notFound(); } });
  const result = await purgeAccountData(deps, UID);
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
