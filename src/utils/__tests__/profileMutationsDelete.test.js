/**
 * Видалення чернетки мусить бути видаленням, а не зникненням з екрана.
 *
 * Слідів у чернетки більше, ніж вона сама: заявка на унікальність тримає
 * зайнятим її номер, `searchId` і далі віддає її в пошуку, шари доповнень і
 * журнал лишаються під `cardId`, якого немає. Кожен з них — місце, звідки
 * видалена картка повертається на екран, тож перевіряється кожен.
 */
const removed = [];
const transactions = [];

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn(),
  remove: jest.fn(),
  runTransaction: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  PUBLIC_COMMENTS_ROOT_PATH: 'comments',
  database: {},
  removeCardAndSearchId: jest.fn(async () => {}),
  syncUserSearchKeyIndex: jest.fn(),
  syncMatchingCardIndex: jest.fn(),
}));

jest.mock('../multiAccountEdits', () => ({
  buildOverlayFromDraft: jest.fn(() => ({})),
  getOverlaysForCard: jest.fn(async () => ({})),
  purgeCardOverlays: jest.fn(async () => ({ editorUserIds: [] })),
}));

const { get, ref, remove, runTransaction } = require('firebase/database');
const { removeCardAndSearchId } = require('components/config');
const { purgeCardOverlays } = require('../multiAccountEdits');
const { deleteCreateProfileMutation } = require('../profileMutations');

const MUTATION = {
  cardId: 'card-1',
  createdBy: 'author-1',
  identityKeys: ['phone_380501112233'],
  data: { userId: 'card-1', phone: '380501112233', name: 'Анна' },
};

describe('deleteCreateProfileMutation', () => {
  // CRA скидає моки перед кожним тестом (`resetMocks`), тож реалізації живуть
  // тут, а не у фабриці `jest.mock`.
  beforeEach(() => {
    removed.length = 0;
    transactions.length = 0;
    ref.mockImplementation((_db, path) => ({ path }));
    remove.mockImplementation(async node => { removed.push(node.path); });
    runTransaction.mockImplementation(async (node, updater) => {
      transactions.push({ path: node.path, result: updater(['card-1', 'card-2']) });
      return { committed: true, snapshot: { val: () => null } };
    });
    removeCardAndSearchId.mockImplementation(async () => {});
    purgeCardOverlays.mockImplementation(async () => ({ editorUserIds: [] }));
    get.mockImplementation(async node => (
      node.path.startsWith('multiData/profileMutationHistory')
        ? { exists: () => true, val: () => ({ 'entry-1': {}, 'entry-2': {} }) }
        : { exists: () => true, val: () => MUTATION }
    ));
  });

  it('вимагає і картку, і автора', async () => {
    await expect(deleteCreateProfileMutation({ cardId: 'card-1' })).rejects.toThrow();
    await expect(deleteCreateProfileMutation({ creatorUid: 'author-1' })).rejects.toThrow();
  });

  it('знімає заявку на унікальність — інакше номер лишається зайнятим', async () => {
    await deleteCreateProfileMutation({ cardId: 'card-1', creatorUid: 'author-1' });

    expect(transactions.some(entry => (
      entry.path === 'multiData/profileIdentityClaims/phone_380501112233'
    ))).toBe(true);
  });

  it('знімає id картки з `searchId`, лишаючи там сусідів', async () => {
    await deleteCreateProfileMutation({ cardId: 'card-1', creatorUid: 'author-1' });

    const searchIdWrites = transactions.filter(entry => entry.path.startsWith('searchId/'));
    expect(searchIdWrites.length).toBeGreaterThan(0);
    // Значення інших карток під тим самим ключем лишаються на місці.
    expect(searchIdWrites.every(entry => entry.result === 'card-2')).toBe(true);
  });

  it('зносить шари, відгуки, вузли анкети й саму чернетку', async () => {
    await deleteCreateProfileMutation({ cardId: 'card-1', creatorUid: 'author-1' });

    expect(purgeCardOverlays).toHaveBeenCalledWith('card-1');
    expect(removeCardAndSearchId).toHaveBeenCalledWith('card-1');
    expect(removed).toContain('comments/card-1');
    expect(removed).toContain('multiData/profileMutations/author-1/card-1');
  });

  it('зносить журнал ревізій поштучно: правила не дають писати у вузол картки', async () => {
    await deleteCreateProfileMutation({ cardId: 'card-1', creatorUid: 'author-1' });

    expect(removed).toContain('multiData/profileMutationHistory/card-1/entry-1');
    expect(removed).toContain('multiData/profileMutationHistory/card-1/entry-2');
    expect(removed).not.toContain('multiData/profileMutationHistory/card-1');
  });

  it('відмова одного кроку не скасовує решти й потрапляє у звіт', async () => {
    removeCardAndSearchId.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    const report = await deleteCreateProfileMutation({ cardId: 'card-1', creatorUid: 'author-1' });

    expect(report.failures).toEqual([
      expect.objectContaining({ step: 'profileNodes', message: 'PERMISSION_DENIED' }),
    ]);
    expect(removed).toContain('multiData/profileMutations/author-1/card-1');
  });

  it('сама чернетка йде останньою — поки вона є, видно, що ще не дочищено', async () => {
    await deleteCreateProfileMutation({ cardId: 'card-1', creatorUid: 'author-1' });

    expect(removed[removed.length - 1]).toBe('multiData/profileMutations/author-1/card-1');
  });
});
