import {
  buildSearchQueryMigrationPlan,
  buildSearchSuggestions,
  decodePushKeyTimestamp,
  decodeSearchQueryKey,
  encodeSearchQueryKey,
  isTypingContinuation,
  normalizeSearchQuery,
  shouldStoreSearchQuery,
  toSearchQueryOwnerRows,
  toSearchQueryRows,
} from '../searchQueryStorage';

const OWNER = 'ownerUid00000000000000000';

// Push-ключ із заданим часом — так виглядають усі старі ряди історії пошуку.
const PUSH_CHARS = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const pushKeyAt = (timestamp, suffix = 'AAAAAAAAAAAA') => {
  let rest = timestamp;
  const chars = [];
  for (let index = 0; index < 8; index += 1) {
    chars.unshift(PUSH_CHARS[rest % 64]);
    rest = Math.floor(rest / 64);
  }
  return `-${chars.join('')}${suffix}`;
};

describe('ключ історії пошуку', () => {
  it('рахується з тексту, тож той самий запит не може лягти двічі', () => {
    expect(encodeSearchQueryKey('Armando')).toBe(encodeSearchQueryKey('  armando  '));
    expect(encodeSearchQueryKey('Armando')).not.toBe(encodeSearchQueryKey('Armand'));
  });

  it('лишає текст читабельним і екранує заборонені в RTDB символи', () => {
    expect(encodeSearchQueryKey('Марія Ковальчук')).toBe('марія ковальчук');
    const key = encodeSearchQueryKey('ivan.petrov@mail.com');
    expect(key).not.toMatch(/[.#$/[\]]/);
    expect(decodeSearchQueryKey(key)).toBe('ivan.petrov@mail.com');
  });

  it('не виходить за межу довжини ключа RTDB', () => {
    const long = `${'я'.repeat(400)}#${'ю'.repeat(90)}`;
    const key = encodeSearchQueryKey(long);
    expect(new TextEncoder().encode(key).length).toBeLessThanOrEqual(768);
    expect(key).not.toBe(encodeSearchQueryKey(`${long}інше`));
  });

  it('відкидає односимвольні залишки і синтаксис локального кешу', () => {
    expect(shouldStoreSearchQuery('Armando')).toBe(true);
    expect(shouldStoreSearchQuery('A')).toBe(false);
    expect(shouldStoreSearchQuery('   ')).toBe(false);
    expect(shouldStoreSearchQuery('!вагітна')).toBe(false);
  });

  it('нормалізує пробіли всередині запиту', () => {
    expect(normalizeSearchQuery('  Марія   Ковальчук \n')).toBe('Марія Ковальчук');
  });
});

describe('ланцюг набору тексту', () => {
  it('дописані символи за кілька секунд — це продовження, а не новий пошук', () => {
    expect(isTypingContinuation('Arma', 'Armando', 2000)).toBe(true);
    expect(isTypingContinuation('Armando', 'Arma', 2000)).toBe(true);
  });

  it('той самий початок через годину — це вже окремий пошук', () => {
    expect(isTypingContinuation('Arma', 'Armando', 3600000)).toBe(false);
  });

  it('різні слова не схлопуються ніколи', () => {
    expect(isTypingContinuation('Марія', 'Оксана', 1000)).toBe(false);
  });
});

describe('міграція старої історії пошуку', () => {
  it('зводить ланцюг набору до одного ряду з ключем від тексту', () => {
    const { updates } = buildSearchQueryMigrationPlan({
      [OWNER]: {
        [pushKeyAt(1000)]: 'Arma',
        [pushKeyAt(3000)]: 'Arman',
        [pushKeyAt(5000)]: 'Armand',
        [pushKeyAt(7000)]: 'Armando',
      },
    });

    const written = Object.entries(updates).filter(([, value]) => value !== null);
    expect(written).toHaveLength(1);
    const [path, value] = written[0];
    expect(path).toBe(`multiData/searchQueries/${OWNER}/armando`);
    expect(value).toEqual({ query: 'Armando', createdAt: 1000, updatedAt: 7000, count: 1 });
    expect(Object.values(updates).filter(value2 => value2 === null)).toHaveLength(4);
  });

  it('склеює повтори того самого запиту в один ряд із лічильником', () => {
    const { updates } = buildSearchQueryMigrationPlan({
      [OWNER]: {
        [pushKeyAt(1000)]: 'Марія',
        [pushKeyAt(900000)]: 'марія',
      },
    });

    expect(updates[`multiData/searchQueries/${OWNER}/марія`]).toEqual({
      query: 'марія',
      createdAt: 1000,
      updatedAt: 900000,
      count: 2,
    });
  });

  it('лишає різні пошуки різними рядами', () => {
    const { updates, report } = buildSearchQueryMigrationPlan({
      [OWNER]: {
        [pushKeyAt(1000)]: 'Марія',
        [pushKeyAt(900000)]: 'Оксана',
      },
    });

    expect(Object.entries(updates).filter(([, value]) => value !== null)).toHaveLength(2);
    expect(report).toEqual([{ ownerId: OWNER, before: 2, after: 2, removed: 2 }]);
  });

  it('нову форму лишає як є — повторний прогін нічого не псує', () => {
    const already = { query: 'Марія', createdAt: 1000, updatedAt: 2000, count: 3 };
    const { updates } = buildSearchQueryMigrationPlan({ [OWNER]: { марія: already } });

    expect(updates[`multiData/searchQueries/${OWNER}/марія`]).toEqual(already);
    expect(Object.values(updates).filter(value => value === null)).toHaveLength(0);
  });
});

describe('час зі старого push-ключа', () => {
  it('читається з перших восьми символів', () => {
    expect(decodePushKeyTimestamp(pushKeyAt(1735689600000))).toBe(1735689600000);
  });

  it('для ключа не з push() часу немає', () => {
    expect(decodePushKeyTimestamp('армандо')).toBeNull();
  });
});

// Підказки при наборі беруться з тієї самої історії, що лежить у базі, — саме
// тому вони переживають чищення кеша браузера.
describe('buildSearchSuggestions', () => {
  const entries = {
    марія: { query: 'Марія', updatedAt: 10, count: 1 },
    'марія коваленко': { query: 'Марія Коваленко', updatedAt: 20, count: 5 },
    'оксана марія': { query: 'Оксана Марія', updatedAt: 30, count: 9 },
    петро: { query: 'Петро', updatedAt: 40, count: 2 },
  };

  it('спершу ті, що починаються з набраного, а вже потім ті, що його містять', () => {
    expect(buildSearchSuggestions(entries, 'марія')).toEqual(['Марія Коваленко', 'Оксана Марія']);
  });

  it('сам набраний рядок підказкою не буває', () => {
    expect(buildSearchSuggestions(entries, 'Петро')).toEqual([]);
  });

  it('порожній запит підказок не дає', () => {
    expect(buildSearchSuggestions(entries, '   ')).toEqual([]);
  });

  it('однакові рядки з різних джерел не двояться', () => {
    const merged = [...toSearchQueryRows(entries), { query: 'марія коваленко', updatedAt: 99, count: 1 }];
    expect(buildSearchSuggestions(merged, 'мар')).toEqual(['Марія Коваленко', 'Марія', 'Оксана Марія']);
  });
});

// «Хто що шукав» — картки читачів разом з їхніми запитами. Запит людини лежить
// у її гілці історії і досі був видний лише їй самій, підказкою при наборі;
// адмінці ж він каже те, чого не каже анкета: кого шукали й чого не знайшли.
describe('toSearchQueryOwnerRows', () => {
  const node = {
    'reader-a': {
      'марія': { query: 'Марія', updatedAt: 10, count: 1 },
      '380501110011': { query: '380501110011', updatedAt: 30, count: 2 },
    },
    'reader-b': { 'оксана': { query: 'Оксана', updatedAt: 20, count: 1 } },
    'reader-empty': {},
  };

  it('читачі йдуть за свіжістю останнього запиту, запити всередині — теж', () => {
    const owners = toSearchQueryOwnerRows(node);

    expect(owners.map(owner => owner.ownerId)).toEqual(['reader-a', 'reader-b']);
    expect(owners[0].queries.map(row => row.query)).toEqual(['380501110011', 'Марія']);
    expect(owners[0].lastSearchAt).toBe(30);
  });

  it('читач без жодного запиту в перелік не потрапляє — картку показувати нема за що', () => {
    expect(toSearchQueryOwnerRows(node).some(owner => owner.ownerId === 'reader-empty')).toBe(false);
    expect(toSearchQueryOwnerRows(null)).toEqual([]);
  });
});
