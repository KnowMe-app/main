import {
  countMatchingFilterOptions,
  matchingFilterGroupHasCounts,
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
