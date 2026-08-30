jest.mock('firebase/database', () => ({
  get: jest.fn(),
  ref: jest.fn((database, path) => path),
}));

jest.mock('components/config', () => ({
  database: { app: 'test-db' },
  collectAgeIdsByFilters: jest.fn(),
}));

const { fetchFilteredMatchingSourceChunk } = require('../matchingDataProvider');

// Колекція `users` приймає лише довгі id — короткий відсіється пост-фільтром.
const id = suffix => `matching-card-user-id-${suffix}`;

const summaryCard = (userId, extra = {}) => ({
  userId,
  name: 'Картка',
  photos: ['https://example.test/a.jpg'],
  __photosHydrated: true,
  __sourceCollection: 'users',
  __matchingSummary: true,
  ...extra,
});

const fullProfile = (userId, extra = {}) => ({ userId, name: 'Анкета', ...extra });

const runChunk = overrides => fetchFilteredMatchingSourceChunk({
  targetVisibleCount: 2,
  initialCursor: undefined,
  exclude: new Set(),
  collectionSource: 'users',
  isAdmin: false,
  hydrateUsersByIds: jest.fn(async ids => Object.fromEntries(ids.map(id => [id, fullProfile(id)]))),
  ...overrides,
});

describe('стрічка читає урізані картки', () => {
  it('бере сторінку з matchingCards і не чіпає анкети', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({
      users: [summaryCard(id('a')), summaryCard(id('b'))],
      lastKey: { date: '2026-08-19', userId: id('b') },
      hasMore: true,
    }));
    const hydrateUsersByIds = jest.fn();

    const result = await runChunk({ fetchMatchingCardsPage, hydrateUsersByIds });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    // Проєкція вже містить усе, що показує рядок — поштучних читань анкет немає.
    expect(hydrateUsersByIds).not.toHaveBeenCalled();
    expect(result.users.map(user => user.userId)).toEqual([id('a'), id('b')]);
    expect(result.users[0].photos).toEqual(['https://example.test/a.jpg']);
  });

  // Відкоту на повні анкети більше немає: він читав legacy-колекцію, з якої веб
  // не читає, і коштував порядок величини трафіку на кожну сторінку. Порожній
  // індекс — це порожня стрічка й названа причина, а не тихе сповзання на анкети.
  it('порожній вузол проєкцій дає порожню стрічку і названу причину', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));
    const onDiagnosticEvent = jest.fn();

    const result = await runChunk({ fetchMatchingCardsPage, onDiagnosticEvent });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(result.users).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(onDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      feedSource: 'matchingCards',
      reason: 'index-empty',
    }));
  });

  it('передає помилку проєкції нагору — читати замість неї нема чого', async () => {
    const error = new Error('temporary matchingCards failure');
    const fetchMatchingCardsPage = jest.fn(async () => { throw error; });
    const onDiagnosticEvent = jest.fn();

    await expect(runChunk({ fetchMatchingCardsPage, onDiagnosticEvent })).rejects.toBe(error);
    expect(onDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      feedSource: 'matchingCards',
      reason: 'index-read-failed',
    }));
  });

  it('кінець стрічки не називає причини', async () => {
    // Порожня сторінка з курсором означає «дійшли до кінця», а не «індексу
    // немає» — і повідомляти про це читачеві нема про що.
    const fetchMatchingCardsPage = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));
    const onDiagnosticEvent = jest.fn();

    await runChunk({
      initialCursor: { date: '2026-08-19', userId: id('b') },
      fetchMatchingCardsPage,
      onDiagnosticEvent,
    });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(onDiagnosticEvent).toHaveBeenCalledWith(expect.objectContaining({
      feedSource: 'matchingCards',
      reason: '',
    }));
  });

  it('просить у джерела запас, який не росте з множиною виключень', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({ users: [summaryCard(id('a'))], lastKey: null, hasMore: false }));
    const exclude = new Set(Array.from({ length: 400 }, (unused, index) => `seen-${index}`));

    await runChunk({ targetVisibleCount: 5, exclude, fetchMatchingCardsPage });

    const { limit } = fetchMatchingCardsPage.mock.calls[0][0];
    expect(limit).toBeLessThanOrEqual(100);
    expect(limit).toBeGreaterThanOrEqual(5);
  });

  it('не замінює загальну стрічку додатковим індексом', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({
      users: [summaryCard(id('public'))],
      lastKey: null,
      hasMore: false,
    }));

    const result = await runChunk({
      parsedAdditionalAccessRules: [{ role: ['ed'] }],
      fetchMatchingCardsPage,
    });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(result.users.map(user => user.userId)).toEqual([id('public')]);
  });

});
