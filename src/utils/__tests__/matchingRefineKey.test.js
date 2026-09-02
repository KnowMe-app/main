import {
  DEFAULT_REFINE_KEY,
  MATCHING_REFINE_KEYS,
  REFINE_CITY_LIMIT,
  applyRefineSelection,
  bucketOfUser,
  buildFeedFilterGroupForRefine,
  buildRefineOptions,
  isRefineKeyAvailableInFeed,
} from '../matchingRefineKey';

// Вік рахується від сьогодні, тож рік народження треба брати від поточного —
// інакше сюїта почала б падати сама по собі у січні.
const birthForAge = age => {
  const year = new Date().getFullYear() - age;
  return `01.01.${year}`;
};

const donor = (overrides = {}) => ({ userId: 'u1', ...overrides });

describe('словник дофільтра', () => {
  it('дефолтний ключ — вік: він уже написаний на самій картці', () => {
    expect(DEFAULT_REFINE_KEY).toBe('age');
  });

  it('ключ без індексу searchKey у стрічці не пропонується', () => {
    // Там ключ мусить назвати кандидатів, а не проріджувати завантажене:
    // «Київ: 12» серед сотні завантажених брехало б про базу, де їх триста.
    expect(isRefineKeyAvailableInFeed('city')).toBe(false);
    expect(isRefineKeyAvailableInFeed('age')).toBe(true);
    expect(isRefineKeyAvailableInFeed('bloodGroup')).toBe(true);
    expect(isRefineKeyAvailableInFeed('country')).toBe(true);
  });

  it('значення ключів збігаються з опціями груп шухляди', () => {
    // Саме тому тап у стрічці вміє записатись у наявні фільтри, не заводячи
    // другої моделі стану.
    const age = MATCHING_REFINE_KEYS.find(spec => spec.key === 'age');
    expect(age.buckets.map(bucket => bucket.value))
      .toEqual(['le25', '26_30', '31_33', '34_36', '37_plus', 'other']);
  });
});

describe('розкладання по значеннях', () => {
  it('вік бере ті самі межі, що індекс і пост-фільтр', () => {
    expect(bucketOfUser('age', donor({ birth: birthForAge(24) }))).toBe('le25');
    expect(bucketOfUser('age', donor({ birth: birthForAge(32) }))).toBe('31_33');
    expect(bucketOfUser('age', donor({ birth: birthForAge(41) }))).toBe('37_plus');
  });

  it('незаповнене значення — це «?», а не викинута картка', () => {
    expect(bucketOfUser('age', donor({}))).toBe('other');
    expect(bucketOfUser('bloodGroup', donor({}))).toBe('other');
    expect(bucketOfUser('country', donor({}))).toBe('unknown');
  });

  it('місто читається з картки як є', () => {
    expect(bucketOfUser('city', donor({ city: ' Київ ' }))).toBe('Київ');
    expect(bucketOfUser('city', donor({ city: '' }))).toBe('other');
  });
});

describe('значення з числами', () => {
  const users = [
    donor({ userId: '1', birth: birthForAge(24) }),
    donor({ userId: '2', birth: birthForAge(32) }),
    donor({ userId: '3', birth: birthForAge(33) }),
    donor({ userId: '4' }),
  ];

  it('ключ зі словником віддає всі свої значення, включно з нульовими', () => {
    // Чіп, що зникає під пальцем, смикає ряд саме тоді, коли в нього цілять.
    const options = buildRefineOptions('age', users);
    expect(options.map(option => option.value))
      .toEqual(['le25', '26_30', '31_33', '34_36', '37_plus', 'other']);
    expect(options.find(option => option.value === '31_33').count).toBe(2);
    expect(options.find(option => option.value === '26_30').count).toBe(0);
    expect(options.find(option => option.value === 'other').count).toBe(1);
  });

  it('місто віддає найчастіші значення видачі, а не всі підряд', () => {
    const cities = ['Київ', 'Київ', 'Київ', 'Харків', 'Харків', 'Одеса', 'Львів', 'Дніпро', 'Суми', 'Полтава', 'Рівне'];
    const options = buildRefineOptions('city', cities.map((city, index) => donor({ userId: String(index), city })));

    expect(options.length).toBeLessThanOrEqual(REFINE_CITY_LIMIT + 1);
    expect(options[0]).toMatchObject({ value: 'Київ', count: 3 });
    expect(options[1]).toMatchObject({ value: 'Харків', count: 2 });
  });

  it('порожня видача не ламає лічильники', () => {
    expect(buildRefineOptions('age', []).every(option => option.count === 0)).toBe(true);
    expect(buildRefineOptions('city', [])).toEqual([]);
  });
});

describe('звуження видачі', () => {
  const users = [
    donor({ userId: '1', birth: birthForAge(24) }),
    donor({ userId: '2', birth: birthForAge(32) }),
  ];

  it('без обраного значення видача лишається цілою', () => {
    expect(applyRefineSelection(users, 'age', null)).toHaveLength(2);
  });

  it('обране значення лишає рівно своє', () => {
    expect(applyRefineSelection(users, 'age', '31_33').map(user => user.userId)).toEqual(['2']);
  });
});

describe('запис у групу шухляди', () => {
  const group = { le25: true, '26_30': true, '31_33': true, '34_36': true, '37_plus': true, other: true };

  it('«лише це значення» — це та сама група з однією увімкненою опцією', () => {
    expect(buildFeedFilterGroupForRefine('age', '31_33', group)).toEqual({
      le25: false,
      '26_30': false,
      '31_33': true,
      '34_36': false,
      '37_plus': false,
      other: false,
    });
  });

  it('значення, якого група не пропонує, не вимикає геть усе', () => {
    // Це був би фільтр «нічого», а не уточнення.
    expect(buildFeedFilterGroupForRefine('age', 'нема-такого', group)).toBeNull();
  });

  it('ключ без групи в шухляду не пише', () => {
    expect(buildFeedFilterGroupForRefine('city', 'Київ', group)).toBeNull();
  });
});
