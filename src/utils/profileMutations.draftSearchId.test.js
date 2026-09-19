const { get, ref, runTransaction } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'history-1' })),
  ref: jest.fn((db, path) => ({ db, path })),
  runTransaction: jest.fn(),
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

const { reportSearchIdIndexFailure } = require('components/config');
const { saveCreateProfileMutation } = require('./profileMutations');

const snapshotOf = value => ({ exists: () => Boolean(value), val: () => value });

/**
 * Чернетка мусить лягти в `searchId` на збереженні, а не аж на публікації.
 *
 * Це єдиний індекс, у якому чернетка взагалі є: картки стрічки й вузлів анкети
 * в неї немає. Поки запис стояв самим лише в `acceptCreateProfileMutation`,
 * заведений номер не знаходив ніхто — на нього ставили лише заявку на
 * унікальність, а вона стереже дубль і пошуку не відповідає.
 */
describe('чернетка потрапляє в searchId на збереженні', () => {
  const searchIdWrites = () => runTransaction.mock.calls
    .map(([target]) => target.path)
    .filter(path => path.startsWith('searchId/'));

  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
    // Значення ще не в індексі, і заявку на нього ніхто не тримає.
    get.mockResolvedValue(snapshotOf(null));
    runTransaction.mockImplementation((target, updater) => {
      const next = updater(null);
      return Promise.resolve({
        committed: next !== undefined,
        snapshot: snapshotOf(next),
      });
    });
  });

  it('пише ключ на кожне індексоване значення чернетки', async () => {
    await saveCreateProfileMutation({
      cardId: 'card-1',
      creatorUid: 'author-1',
      actorUid: 'author-1',
      data: { phone: ['380501112233'], surname: 'Коваленко', city: 'Київ' },
    });

    expect(searchIdWrites()).toEqual(expect.arrayContaining([
      'searchId/380501112233/phone',
      expect.stringContaining('/surname'),
    ]));
    // Місто в `searchId` не живе — там лише контакти й імена.
    expect(searchIdWrites().some(path => path.includes('/city'))).toBe(false);
  });

  it('не переписує той самий ключ на кожному blur', async () => {
    const save = () => saveCreateProfileMutation({
      cardId: 'card-blur',
      creatorUid: 'author-1',
      actorUid: 'author-1',
      data: { phone: ['380501112244'] },
    });

    await save();
    const afterFirst = searchIdWrites().length;
    await save();

    // Збереження йде на кожен blur; без памʼяті таба заповнення однієї картки
    // коштувало б сотень транзакцій по тих самих ключах.
    expect(afterFirst).toBe(1);
    expect(searchIdWrites()).toHaveLength(1);
  });

  it('відмова на ключі не валить збереження, але називає ключ', async () => {
    runTransaction.mockImplementation((target, updater) => {
      if (target.path.startsWith('searchId/')) {
        return Promise.reject(new Error('PERMISSION_DENIED: Permission denied'));
      }
      const next = updater(null);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshotOf(next) });
    });

    // Свій ключ і своя картка: памʼять таба живе на рівні модуля, і вже
    // підтверджену пару наступний тест просто не писав би.
    const mutation = await saveCreateProfileMutation({
      cardId: 'card-denied',
      creatorUid: 'author-1',
      actorUid: 'author-1',
      data: { phone: ['380501112255'] },
    });

    // Набране лишається збереженим: ключ — це прискорення пошуку, а не анкета.
    expect(mutation).toEqual(expect.objectContaining({ cardId: 'card-denied', operation: 'create' }));
    expect(reportSearchIdIndexFailure).toHaveBeenCalledWith(expect.objectContaining({
      searchIdKey: '380501112255/phone',
      action: 'add',
    }));
  });
});
