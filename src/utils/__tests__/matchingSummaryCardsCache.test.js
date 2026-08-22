const card = (userId, extra = {}) => ({ userId, name: `Ім'я ${userId}`, __matchingSummary: true, ...extra });

// Кеш тримає розібраний JSON у памʼяті модуля, тож між тестами його треба
// піднімати наново — інакше `localStorage.clear()` чистить тільки половину.
const loadModule = () => require('../cardIndex');

describe('кеш проєкцій стрічки matching', () => {
  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('віддає збережену картку і не просить її з бекенду', () => {
    const { getCachedMatchingSummaryCards, setCachedMatchingSummaryCards } = loadModule();
    setCachedMatchingSummaryCards({ a: card('a'), b: card('b') });

    const { cards, missingIds } = getCachedMatchingSummaryCards(['a', 'b']);
    expect(missingIds).toEqual([]);
    expect(cards.a).toEqual(card('a'));
    expect(cards.b).toEqual(card('b'));
  });

  it('називає незнайомі id, щоб їх дочитали', () => {
    const { getCachedMatchingSummaryCards, setCachedMatchingSummaryCards } = loadModule();
    setCachedMatchingSummaryCards({ a: card('a') });

    const { cards, missingIds } = getCachedMatchingSummaryCards(['a', 'b']);
    expect(Object.keys(cards)).toEqual(['a']);
    expect(missingIds).toEqual(['b']);
  });

  it('зберігає позначку проєкції — інакше стрічка вважала б її повною анкетою', () => {
    const { getCachedMatchingSummaryCards, setCachedMatchingSummaryCards } = loadModule();
    setCachedMatchingSummaryCards({ a: card('a', { avatar: 'https://example.test/a.jpg' }) });

    const { cards } = getCachedMatchingSummaryCards(['a']);
    expect(cards.a.__matchingSummary).toBe(true);
    expect(cards.a.avatar).toBe('https://example.test/a.jpg');
  });

  it('віддає протухлий запис у missingIds і викидає його зі сховища', () => {
    const {
      MATCHING_SUMMARY_CARD_TTL_MS,
      getCachedMatchingSummaryCards,
      setCachedMatchingSummaryCards,
    } = loadModule();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    setCachedMatchingSummaryCards({ a: card('a'), b: card('b') });

    Date.now.mockReturnValue(now + MATCHING_SUMMARY_CARD_TTL_MS + 1);
    const expired = getCachedMatchingSummaryCards(['a']);
    expect(expired.cards).toEqual({});
    expect(expired.missingIds).toEqual(['a']);

    // Прибрало саме протухлий запис, а не весь кеш: сусідній id ще свіжий доти,
    // доки його власний TTL не вийшов.
    Date.now.mockReturnValue(now + MATCHING_SUMMARY_CARD_TTL_MS - 1);
    expect(getCachedMatchingSummaryCards(['a']).missingIds).toEqual(['a']);
    expect(getCachedMatchingSummaryCards(['b']).missingIds).toEqual([]);
  });

  it('лежить окремо від спільного кеша карток', () => {
    jest.useFakeTimers();
    try {
      const { MATCHING_SUMMARY_CARDS_KEY, setCachedMatchingSummaryCards } = loadModule();
      setCachedMatchingSummaryCards({ a: card('a') });
      jest.runOnlyPendingTimers();

      // Спільний кеш тримає повні анкети; проєкція там підмінила б анкету
      // десятком полів для всіх інших сторінок.
      expect(localStorage.getItem('cards')).toBeNull();
      expect(JSON.parse(localStorage.getItem(MATCHING_SUMMARY_CARDS_KEY)).items.a.card).toEqual(card('a'));
    } finally {
      jest.useRealTimers();
    }
  });

  it('тримає стелю розміру, лишаючи найсвіжіші записи', () => {
    jest.useFakeTimers();
    try {
      const {
        MATCHING_SUMMARY_CARDS_KEY,
        MATCHING_SUMMARY_CARDS_MAX,
        setCachedMatchingSummaryCards,
      } = loadModule();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      const oldBatch = {};
      for (let index = 0; index < MATCHING_SUMMARY_CARDS_MAX; index += 1) {
        oldBatch[`old-${index}`] = card(`old-${index}`);
      }
      setCachedMatchingSummaryCards(oldBatch);

      Date.now.mockReturnValue(now + 1000);
      setCachedMatchingSummaryCards({ fresh: card('fresh') });
      jest.runOnlyPendingTimers();

      const stored = JSON.parse(localStorage.getItem(MATCHING_SUMMARY_CARDS_KEY));
      expect(Object.keys(stored.items)).toHaveLength(MATCHING_SUMMARY_CARDS_MAX);
      expect(stored.items.fresh).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});
