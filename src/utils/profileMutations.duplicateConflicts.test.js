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
 * Дубль контакту збереження не зупиняє: значення пишеться в чернетку, а збіг
 * повертається попередженням (поле + картки) — обʼєднує дублі адмін.
 * «Сирота» в `searchId` (id без картки й без чернетки) дублем не рахується.
 */
describe('дубль контакту — попередження, а не відмова', () => {
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

  it('зберігає значення й називає картку, що вже його має', async () => {
    mockDb({
      'searchId/some_nick/telegram': 'card-9',
      'matchingCards/card-9': { name: 'Олена' },
    });

    const saved = await save();
    expect(saved.data.telegram).toBe('@some_nick');
    expect(saved.duplicateConflicts).toEqual([{ field: 'telegram', cardIds: ['card-9'] }]);
    // Попередження не стає частиною запису.
    expect(Object.keys(saved)).not.toContain('duplicateConflicts');
  });

  it('id без картки й без чернетки дублем не рахується', async () => {
    mockDb({ 'searchId/some_nick/telegram': 'deleted-card' });

    const saved = await save();
    expect(saved).toMatchObject({ cardId: 'draft-1' });
    expect(saved.duplicateConflicts).toBeUndefined();
  });

  it('чужу заявку не перебиває, а зберігає й попереджає', async () => {
    runTransaction.mockImplementation((target, updater) => {
      const current = target.path === 'multiData/profileIdentityClaims/telegram_some_nick' ? 'draft-2' : null;
      const next = updater(current);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshotOf(next ?? current) });
    });
    mockDb({});

    const saved = await save();
    expect(saved.data.telegram).toBe('@some_nick');
    expect(saved.identityKeys).toEqual(['phone_380501112233']);
    expect(saved.duplicateConflicts).toEqual([{ field: 'telegram', cardIds: ['draft-2'] }]);
  });
});
