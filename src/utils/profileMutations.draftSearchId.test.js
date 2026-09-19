const { get, ref, runTransaction, set } = require('firebase/database');

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

  it('не переписує запис, у якому ця картка вже стоїть', async () => {
    // Правила дають авторові чернетки право лише **завести** запис, не
    // переписати. Поки код повертав те саме значення, транзакція відлітала з
    // PERMISSION_DENIED на кожному blur — і застосунок казав людині, що
    // набраний телефон не потрапив в індекс, хоч він там лежав.
    const stored = { 'searchId/380501112266/phone': 'card-known' };
    const aborted = [];
    runTransaction.mockImplementation((target, updater) => {
      const next = updater(stored[target.path] ?? null);
      if (next === undefined) aborted.push(target.path);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshotOf(next) });
    });

    await saveCreateProfileMutation({
      cardId: 'card-known',
      creatorUid: 'author-1',
      actorUid: 'author-1',
      data: { phone: ['380501112266'] },
    });

    expect(aborted).toEqual(['searchId/380501112266/phone']);
    expect(reportSearchIdIndexFailure).not.toHaveBeenCalled();
  });

  it('дописує картку в запис, у якому вже стоїть чужа', async () => {
    const stored = { 'searchId/380501112277/phone': 'other-card' };
    const written = [];
    runTransaction.mockImplementation((target, updater) => {
      const next = updater(stored[target.path] ?? null);
      if (next !== undefined && target.path.startsWith('searchId/')) written.push([target.path, next]);
      return Promise.resolve({ committed: next !== undefined, snapshot: snapshotOf(next) });
    });

    await saveCreateProfileMutation({
      cardId: 'card-second',
      creatorUid: 'author-1',
      actorUid: 'author-1',
      data: { phone: ['380501112277'] },
    });

    // Перервати тут означало б лишити картку поза індексом: id у записі немає.
    expect(written).toEqual([['searchId/380501112277/phone', ['other-card', 'card-second']]]);
  });

  it('називає автора картки, щоб чернетку знайшов не лише він сам', async () => {
    // Шлях до чернетки починається з автора, а пошук дає самий лише id
    // картки: без цієї пари знайдену чужу чернетку читає лише той, кому
    // відкрито вузол цілком, тобто службовий читач.
    await saveCreateProfileMutation({
      cardId: 'card-owned',
      creatorUid: 'author-1',
      actorUid: 'author-1',
      data: { phone: ['380501112288'] },
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/profileMutationOwners/card-owned' }),
      'author-1',
    );
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
