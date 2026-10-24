import {
  countMatchingFilterOptions,
  isDraftFilterCountExact,
  matchingFilterGroupHasCounts,
  withUnloadedFilterOptions,
} from '../matchingFilterCounts';

const thisYear = new Date().getFullYear();
const birthAt = age => `${thisYear - age}-01-01`;

const FEED = [
  { userId: 'a', role: 'ed', birth: birthAt(24), blood: '2+', country: 'Ukraine', maritalStatus: 'married', height: '170', weight: '58' },
  { userId: 'b', role: 'ed', birth: birthAt(28), blood: '1-', country: 'Poland', maritalStatus: 'single', height: '165', weight: '50' },
  { userId: 'c', role: 'ag', birth: '', blood: '', country: '', maritalStatus: '' },
];

describe('числа біля опцій фільтра', () => {
  it('рахує по тих самих межах, що й сам фільтр', () => {
    expect(countMatchingFilterOptions({ filterName: 'age', users: FEED }))
      .toEqual({ le25: 1, '26_30': 1, other: 1 });
    expect(countMatchingFilterOptions({ filterName: 'rh', users: FEED }))
      .toEqual({ '+': 1, '-': 1, other: 1 });
    expect(countMatchingFilterOptions({ filterName: 'country', users: FEED }))
      .toEqual({ ua: 1, other: 1, unknown: 1 });
    expect(countMatchingFilterOptions({ filterName: 'userRole', users: FEED }))
      .toEqual({ ed: 2, ag: 1 });
  });

  /*
   * Групи крові в проєкції немає, і це не пропуск: картка носить сам лише знак
   * резуса, бо разом із номером вони складаються назад у повне `blood`, яке
   * живе за межею приватності. Числа тут були б нулями в усіх пʼятьох опціях —
   * тобто рядом чіпів, який відмовляє сам собі.
   */
  it('мовчить про групу крові замість того, щоб показувати нулі', () => {
    expect(matchingFilterGroupHasCounts('bloodGroup')).toBe(false);
    expect(countMatchingFilterOptions({ filterName: 'bloodGroup', users: FEED })).toBeNull();
  });

  it('порожня дека дає порожній набір, а не падіння', () => {
    expect(countMatchingFilterOptions({ filterName: 'age' })).toEqual({});
    expect(countMatchingFilterOptions({ filterName: 'age', users: null })).toEqual({});
  });
});

// Дека набрана вже під фільтром, тож вимкненої опції в ній немає за побудовою:
// СМ бачила «Біологічні батьки 0» там, де їх півтора десятка.
describe('опції, яких дека не вантажила', () => {
  it('вимкнена опція активної групи лишається без числа, а не з нулем', () => {
    const counts = countMatchingFilterOptions({ filterName: 'userRole', users: FEED });
    expect(withUnloadedFilterOptions(counts, { ag: true, ip: false, ed: false, other: false }))
      .toEqual({ ...counts, ip: null, ed: null, other: null });
  });

  it('незаймана група й відсутній фільтр числа не чіпають', () => {
    const counts = countMatchingFilterOptions({ filterName: 'age', users: FEED });
    expect(withUnloadedFilterOptions(counts, { le25: true, '26_30': true, other: true })).toBe(counts);
    expect(withUnloadedFilterOptions(counts, undefined)).toBe(counts);
    expect(withUnloadedFilterOptions(null, { le25: false })).toBeNull();
  });
});

// «Показати 2» на кнопці, а після застосування — пʼятдесят сім анкет: кнопка
// рахувала завантажене, а застосований фільтр дочитував джерело.
describe('число на «Показати N»', () => {
  const applied = { age: { le25: false, '26_30': true, other: false }, rh: { '+': true, '-': true, other: true } };

  it('нижня межа, поки стрічка має ще сторінки', () => {
    expect(isDraftFilterCountExact({ appliedFilters: applied, draftFilters: applied, deckHasMore: true })).toBe(false);
  });

  it('нижня межа, коли чернетка вмикає відсіяне застосованим фільтром', () => {
    const draft = { ...applied, age: { ...applied.age, le25: true } };
    expect(isDraftFilterCountExact({ appliedFilters: applied, draftFilters: draft, deckHasMore: false })).toBe(false);
  });

  it('точне, коли стрічку дочитано, а чернетка лише звужує', () => {
    const draft = { ...applied, rh: { ...applied.rh, '-': false } };
    expect(isDraftFilterCountExact({ appliedFilters: applied, draftFilters: draft, deckHasMore: false })).toBe(true);
    // Місце з пошуку лежить поруч із групами, і рядки в ньому позначками не є.
    const withPlace = { ...applied, place: { kind: 'city', uk: 'Харків' } };
    expect(isDraftFilterCountExact({ appliedFilters: withPlace, draftFilters: withPlace, deckHasMore: false })).toBe(true);
    expect(isDraftFilterCountExact({ appliedFilters: applied, draftFilters: undefined, deckHasMore: false })).toBe(true);
  });
});
