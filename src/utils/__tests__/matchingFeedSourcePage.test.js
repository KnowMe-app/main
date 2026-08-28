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
  fetchUsersByLastLogin2: jest.fn(async () => ({ users: [], lastKey: null, hasMore: false })),
  fetchUsersByLastLogin2FromCollection: jest.fn(async () => ({ users: [], lastKey: null, hasMore: false })),
  ...overrides,
});

describe('стрічка читає урізані картки', () => {
  it('бере сторінку з matchingCards і не чіпає анкети', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({
      users: [summaryCard(id('a')), summaryCard(id('b'))],
      lastKey: { date: '2026-08-19', userId: id('b') },
      hasMore: true,
    }));
    const fetchUsersByLastLogin2 = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));
    const hydrateUsersByIds = jest.fn();

    const result = await runChunk({ fetchMatchingCardsPage, fetchUsersByLastLogin2, hydrateUsersByIds });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(fetchUsersByLastLogin2).not.toHaveBeenCalled();
    // Проєкція вже містить усе, що показує рядок — поштучних читань анкет немає.
    expect(hydrateUsersByIds).not.toHaveBeenCalled();
    expect(result.users.map(user => user.userId)).toEqual([id('a'), id('b')]);
    expect(result.users[0].photos).toEqual(['https://example.test/a.jpg']);
  });

  it('повертається до анкет, якщо вузол проєкцій ще порожній', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));
    const fetchUsersByLastLogin2 = jest.fn(async () => ({
      users: [fullProfile(id('a')), fullProfile(id('b'))],
      lastKey: { date: '2026-08-19', userId: id('b') },
      hasMore: false,
    }));

    const result = await runChunk({ fetchMatchingCardsPage, fetchUsersByLastLogin2 });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(fetchUsersByLastLogin2).toHaveBeenCalledTimes(1);
    expect(result.users.map(user => user.name)).toEqual(['Анкета', 'Анкета']);
  });

  it('повертає порожню стрічку без fallback для читача без доступу до анкет', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));
    const fetchUsersByLastLogin2 = jest.fn();

    const result = await runChunk({
      allowProfileFallback: false,
      fetchMatchingCardsPage,
      fetchUsersByLastLogin2,
    });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(fetchUsersByLastLogin2).not.toHaveBeenCalled();
    expect(result.users).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('повертається до анкет, якщо читання проєкцій впало', async () => {
    const fetchMatchingCardsPage = jest.fn(async () => { throw new Error('permission denied'); });
    const fetchUsersByLastLogin2 = jest.fn(async () => ({
      users: [fullProfile(id('a'))],
      lastKey: null,
      hasMore: false,
    }));

    const result = await runChunk({ targetVisibleCount: 1, fetchMatchingCardsPage, fetchUsersByLastLogin2 });

    expect(fetchUsersByLastLogin2).toHaveBeenCalledTimes(1);
    expect(result.users.map(user => user.userId)).toEqual([id('a')]);
  });

  it('не відкочується на анкети посеред пагінації', async () => {
    // Порожня сторінка з курсором означає «дійшли до кінця», а не «індексу
    // немає» — інакше кінець стрічки щоразу тягнув би зайвий запит по анкетах.
    const fetchMatchingCardsPage = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));
    const fetchUsersByLastLogin2 = jest.fn(async () => ({ users: [], lastKey: null, hasMore: false }));

    await runChunk({
      initialCursor: { date: '2026-08-19', userId: id('b') },
      fetchMatchingCardsPage,
      fetchUsersByLastLogin2,
    });

    expect(fetchMatchingCardsPage).toHaveBeenCalledTimes(1);
    expect(fetchUsersByLastLogin2).not.toHaveBeenCalled();
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
