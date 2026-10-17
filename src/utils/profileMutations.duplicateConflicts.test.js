const { get, ref, runTransaction } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'history-1' })),
  ref: jest.fn((db, path) => ({ db, path })),
  runTransaction: jest.fn(),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  database: { app: 'db' },
  PUBLIC_COMMENTS_ROOT_PATH: 'comments',
  removeCardAndSearchId: jest.fn(),
  reportSearchIdIndexFailure: jest.fn(),
  syncUserSearchKeyIndex: jest.fn(),
  syncMatchingCardIndex: jest.fn(),
}));

const { saveCreateProfileMutation } = require('./profileMutations');

const snapshotOf = value => ({ exists: () => value != null, val: () => value });

/**
 * Дописаний у чернетку нік, який індекс уже знає, — відмова мусить назвати
 * поле й картку, а «сирота» в `searchId` (id без картки й без чернетки)
 * дублем не рахується.
 */
describe('DUPLICATE_PROFILE називає, що зайняте', () => {
  const mockDb = values => {
    get.mockImplementation(({ path }) => Promise.resolve(snapshotOf(values[path] ?? null)));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
    runTransaction.mockImplementation((target, updater) => {
      const next = updater(null);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshotOf(next) });
    });
  });

  const save = () => saveCreateProfileMutation({
    cardId: 'draft-1',
    creatorUid: 'author-1',
    actorUid: 'admin-1',
    data: { phone: '380501112233', telegram: '@some_nick' },
  });

  it('несе поле й id картки, що тримає значення', async () => {
    mockDb({
      'searchId/some_nick/telegram': 'card-9',
      'matchingCards/card-9': { name: 'Олена' },
    });

    await expect(save()).rejects.toMatchObject({
      message: 'DUPLICATE_PROFILE',
      profileSaveStage: 'identity-claim',
      duplicateConflicts: [{ field: 'telegram', cardIds: ['card-9'] }],
    });
  });

  it('id без картки й без чернетки збереження не блокує', async () => {
    mockDb({ 'searchId/some_nick/telegram': 'deleted-card' });

    await expect(save()).resolves.toMatchObject({ cardId: 'draft-1' });
  });

  it('чужа чернетка (пара автора) — теж дубль', async () => {
    mockDb({
      'searchId/some_nick/telegram': ['draft-2'],
      'multiData/profileMutationOwners/draft-2': 'author-2',
    });

    await expect(save()).rejects.toMatchObject({
      duplicateConflicts: [{ field: 'telegram', cardIds: ['draft-2'] }],
    });
  });
});
