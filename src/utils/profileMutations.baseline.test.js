import { get, push, ref, runTransaction, set, update } from 'firebase/database';
import {
  loadProfileMutationHistory,
  rejectCreateProfileMutation,
  reserveProfileCardId,
  saveCreateProfileMutation,
} from './profileMutations';

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn(),
  runTransaction: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  database: {},
  reportSearchIdIndexFailure: jest.fn(),
}));

const creatorUid = 'author-1';
const phone = '380501112201';
const identityPath = `multiData/profileIdentityClaims/phone_${phone}`;
const searchPath = `searchId/${phone}/phone`;
const mutationPath = cardId => `multiData/profileMutations/${creatorUid}/${cardId}`;
const historyPath = cardId => `multiData/profileMutationHistory/${cardId}`;
const snapshot = value => ({ exists: () => value != null, val: () => value ?? null });

describe('create draft lifecycle before publication', () => {
  let stored;

  beforeEach(() => {
    jest.clearAllMocks();
    stored = new Map();
    let pushed = 0;
    get.mockImplementation(async ({ path }) => snapshot(stored.get(path)));
    push.mockImplementation(() => ({ key: `reserved-${++pushed}` }));
    ref.mockImplementation((database, path) => ({ path }));
    runTransaction.mockImplementation(async ({ path }, apply) => {
      const current = stored.get(path) ?? null;
      const next = apply(current);
      if (next === undefined) return { committed: false, snapshot: snapshot(current) };
      if (next === null) stored.delete(path);
      else stored.set(path, next);
      return { committed: true, snapshot: snapshot(next) };
    });
    set.mockImplementation(async ({ path }, value) => stored.set(path, value));
    update.mockImplementation(async ({ path }, changes) => {
      stored.set(path, { ...stored.get(path), ...changes });
    });
  });

  const save = (cardId, data, expectedRevision) => saveCreateProfileMutation({
    cardId,
    creatorUid,
    actorUid: creatorUid,
    data,
    expectedRevision,
  });

  it('reserves an ID without writing data and saves only draft and discovery records', async () => {
    const cardId = reserveProfileCardId();
    expect(stored.size).toBe(0);

    await expect(save(cardId, { phone })).resolves.toMatchObject({
      operation: 'create',
      status: 'pendingReview',
      revision: 1,
      createdBy: creatorUid,
      data: { userId: cardId, phone },
    });

    expect(Object.fromEntries(stored)).toEqual({
      [mutationPath(cardId)]: expect.objectContaining({ cardId }),
      [`multiData/profileMutationOwners/${cardId}`]: creatorUid,
      [identityPath]: cardId,
      [searchPath]: cardId,
    });
  });

  it('rejects a stale author save without changing the newer draft, history or identity claim', async () => {
    const cardId = 'concurrent-draft';
    await save(cardId, { phone, city: 'Kyiv' });
    const newer = await save(cardId, { phone, city: 'Lviv' }, 1);
    const beforeStaleSave = new Map(stored);

    await expect(save(cardId, { phone: '380501112202', city: 'Odesa' }, 1))
      .rejects.toThrow('REVISION_CONFLICT');

    expect(newer.revision).toBe(2);
    expect(stored).toEqual(beforeStaleSave);
    await expect(loadProfileMutationHistory(cardId)).resolves.toEqual([
      expect.objectContaining({ revision: 2, actorUid: creatorUid, fieldName: 'city', change: { from: 'Kyiv', to: 'Lviv' } }),
    ]);
  });

  it('returns a draft with its data and history intact and lets its author submit it again', async () => {
    const cardId = 'returned-draft';
    await save(cardId, { phone, city: 'Kyiv' });
    const latest = await save(cardId, { phone, city: 'Lviv' }, 1);
    const priorHistory = stored.get(historyPath(cardId));

    await expect(rejectCreateProfileMutation({ cardId, creatorUid, expectedRevision: 1 }))
      .rejects.toThrow('REVISION_CONFLICT');
    const returned = await rejectCreateProfileMutation({ cardId, creatorUid, expectedRevision: 2 });
    expect(returned).toMatchObject({ status: 'private', revision: 3, data: latest.data });
    expect(stored.get(historyPath(cardId))).toEqual(priorHistory);
    expect(stored.has(identityPath)).toBe(false);
    expect(stored.get(searchPath)).toBe(cardId);

    await expect(save(cardId, returned.data, 3)).resolves.toMatchObject({
      status: 'pendingReview', revision: 4, data: latest.data,
    });
    expect(stored.get(identityPath)).toBe(cardId);
    expect(stored.get(historyPath(cardId))).toEqual(priorHistory);
  });
});
