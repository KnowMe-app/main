import {
  isAllowedIdForMatchingCollection,
  matchesMatchingCollectionSource,
} from '../matchingDataProvider';

const LONG_ID = 'vtDxkDMjCwYuTDqTUnZsO29bpQr1';
const SHORT_ID = 'mQ7x2';

describe('стрічка питає картку про джерело, а не гадає за довжиною id', () => {
  // Замір на живих даних: у `matchingCards` 1650 карток із довгим id, а
  // джерело `users` мають лише 379. Тобто на здогадці 1271 картка `newUsers`
  // пройшла б як своя.

  it('картка з довгим id, але з newUsers, не потрапляє у стрічку users', () => {
    const card = { userId: LONG_ID, __sourceCollection: 'newUsers' };
    // Стара перевірка таку картку пропускала — саме тут і була міна.
    expect(isAllowedIdForMatchingCollection(card.userId, 'users')).toBe(true);
    expect(matchesMatchingCollectionSource(card, 'users')).toBe(false);
  });

  it('картка з коротким id, але з users, зі стрічки users не випадає', () => {
    const card = { userId: SHORT_ID, __sourceCollection: 'users' };
    expect(isAllowedIdForMatchingCollection(card.userId, 'users')).toBe(false);
    expect(matchesMatchingCollectionSource(card, 'users')).toBe(true);
  });

  it('пускає картку в її власну стрічку', () => {
    expect(matchesMatchingCollectionSource({ userId: LONG_ID, __sourceCollection: 'users' }, 'users')).toBe(true);
    expect(matchesMatchingCollectionSource({ userId: SHORT_ID, __sourceCollection: 'newUsers' }, 'newUsers')).toBe(true);
  });

  it('відкочується до довжини id, коли джерело невідоме', () => {
    // Повна анкета, догідратована повз проєкцію, поля `source` не має.
    expect(matchesMatchingCollectionSource({ userId: LONG_ID }, 'users')).toBe(true);
    expect(matchesMatchingCollectionSource({ userId: SHORT_ID }, 'users')).toBe(false);
    expect(matchesMatchingCollectionSource({ userId: SHORT_ID }, 'newUsers')).toBe(true);
  });

  it('не ламається на сміттєвому вводі', () => {
    expect(matchesMatchingCollectionSource(null, 'users')).toBe(false);
    expect(matchesMatchingCollectionSource({}, 'users')).toBe(false);
    expect(matchesMatchingCollectionSource({ userId: LONG_ID, __sourceCollection: 'хтозна' }, 'users')).toBe(true);
  });
});
