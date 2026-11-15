import { sanitizeSearchQueryAnalytics } from '../searchQueryStorage';

// Ті самі межі, що в `.validate` вузла `multiData/searchQueries`: поле, яке
// правила відхилили б, мусить не потрапити в запис — інакше відмова забрала б
// разом із ним і сам запит.
describe('sanitizeSearchQueryAnalytics', () => {
  test('відомі значення проходять', () => {
    expect(sanitizeSearchQueryAnalytics({ intent: 'sm', intentChoice: 'find', resultsCount: 0 }))
      .toEqual({ intent: 'sm', intentChoice: 'find', resultsCount: 0 });
  });

  test('невідоме, відʼємне, дробове й відсутнє — геть', () => {
    expect(sanitizeSearchQueryAnalytics({ intent: 'xx', intentChoice: 'maybe', resultsCount: -1 })).toEqual({});
    expect(sanitizeSearchQueryAnalytics({ resultsCount: 2.5 })).toEqual({});
    expect(sanitizeSearchQueryAnalytics({ resultsCount: undefined, intent: undefined })).toEqual({});
    expect(sanitizeSearchQueryAnalytics()).toEqual({});
  });
});
