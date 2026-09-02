import {
  isFeedDateExplicitlyDenied,
  isSearchResultInFeed,
  orderMatchingSearchResults,
  readSearchResultFeedDate,
} from '../matchingSearchResultOrder';

// Форма, у якій картка приходить у видачу пошуку: `readProfileFromNodes` і
// `fetchLimitedProfileById` обидва віддають ключ стрічки під старим іменем
// `lastLogin2`, а сира проєкція — під власним `feedDate`. Порядок мусить
// читати обидві.
const inFeed = (userId, date) => ({ userId, lastLogin2: date, publish: true });
const outsideFeed = userId => ({ userId });
const hidden = userId => ({ userId, feedDate: false });
// Та сама схована картка, але прочитана як повна анкета: `expandMatchingCard`
// сирого ключа назовні не віддає — воно перекладає `false` у `publish: false`.
const hiddenAsProfile = userId => ({ userId, publish: false });

describe('orderMatchingSearchResults', () => {
  it('ставить опубліковані картки перед рештою знайденого', () => {
    const ordered = orderMatchingSearchResults([
      outsideFeed('draft-1'),
      inFeed('shown-1', '2026-08-19'),
      outsideFeed('draft-2'),
      inFeed('shown-2', '2026-09-01'),
    ]);

    expect(ordered.map(user => user.userId)).toEqual(['shown-2', 'shown-1', 'draft-1', 'draft-2']);
  });

  it('не викидає з видачі неопубліковані — їх шукали так само', () => {
    const ordered = orderMatchingSearchResults([outsideFeed('draft-1'), outsideFeed('draft-2')]);
    expect(ordered).toHaveLength(2);
  });

  it('прибирає сховані: feedDate false — це заборона показу, а не її відсутність', () => {
    const ordered = orderMatchingSearchResults([
      hidden('hidden-1'),
      inFeed('shown-1', '2026-08-19'),
      { userId: 'hidden-2', feedDate: 'false' },
      hiddenAsProfile('hidden-3'),
      outsideFeed('draft-1'),
    ]);

    expect(ordered.map(user => user.userId)).toEqual(['shown-1', 'draft-1']);
  });

  it('зберігає порядок надходження всередині кожної групи', () => {
    const ordered = orderMatchingSearchResults([
      outsideFeed('draft-1'),
      outsideFeed('draft-2'),
      inFeed('shown-1', '2026-08-19'),
      inFeed('shown-2', '2026-08-19'),
    ]);

    expect(ordered.map(user => user.userId)).toEqual(['shown-1', 'shown-2', 'draft-1', 'draft-2']);
  });

  it('читає ключ стрічки і під власним іменем проєкції', () => {
    const ordered = orderMatchingSearchResults([
      outsideFeed('draft-1'),
      { userId: 'card-1', feedDate: '2026-08-19' },
    ]);

    expect(ordered.map(user => user.userId)).toEqual(['card-1', 'draft-1']);
  });

  it('переживає порожній і битий вхід', () => {
    expect(orderMatchingSearchResults()).toEqual([]);
    expect(orderMatchingSearchResults(null)).toEqual([]);
    expect(orderMatchingSearchResults([null, undefined])).toEqual([]);
  });
});

describe('стани ключа стрічки', () => {
  it('розрізняє показану, сховану і ще не опубліковану', () => {
    expect(isSearchResultInFeed(inFeed('a', '2026-08-19'))).toBe(true);
    expect(isSearchResultInFeed(outsideFeed('b'))).toBe(false);
    expect(isSearchResultInFeed(hidden('c'))).toBe(false);

    expect(isFeedDateExplicitlyDenied(hidden('c'))).toBe(true);
    // Повна анкета несе ту саму заборону під іменем `publish`.
    expect(isFeedDateExplicitlyDenied(hiddenAsProfile('d'))).toBe(true);
    expect(isFeedDateExplicitlyDenied(outsideFeed('b'))).toBe(false);
    expect(isFeedDateExplicitlyDenied(inFeed('a', '2026-08-19'))).toBe(false);
  });

  it('дата поза стрічкою — це порожній рядок, а не false', () => {
    expect(readSearchResultFeedDate(inFeed('a', '2026-08-19'))).toBe('2026-08-19');
    expect(readSearchResultFeedDate(hidden('c'))).toBe('');
    expect(readSearchResultFeedDate(outsideFeed('b'))).toBe('');
  });
});
