import {
  MATCHING_CARD_SCHEMA_VERSION,
  buildMatchingCardsPayloadFromCollections,
  MATCHING_SUMMARY_FLAG,
  areMatchingCardProjectionsEqual,
  buildMatchingCardProjection,
  collectMatchingCardContactKeys,
  expandMatchingCard,
  isCurrentMatchingCardSchema,
  isMatchingSummaryCard,
  resolveMatchingCardAvatarFromProfile,
} from '../matchingCardIndex';
import { countProfileFields, resolveProfileFieldCountBucket } from '../fieldCountBuckets';
import { canShowMatchingUser } from '../reactionPriority';

const fullProfile = {
  name: 'Яна',
  surname: 'Дорошенко',
  birth: '12.03.1994',
  city: 'Київ',
  region: 'Київська область',
  country: 'Україна',
  height: '180',
  weight: '77',
  maritalStatus: '+',
  cSection: '1',
  blood: '1+',
  ownKids: '2',
  lastDelivery: '2023-02-21',
  role: 'ed',
  publish: true,
  lastLogin2: '2026-08-19',
  phone: '+380671112233',
  telegram: 'yana',
  instagram: '',
  moreInfo_main: 'довгий текст про себе, який стрічка не показує',
  photos: ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
};

describe('buildMatchingCardProjection', () => {
  it('переносить поля стрічки і лишає важкі поля анкети позаду', () => {
    const projection = buildMatchingCardProjection('user-id-of-twenty-chars', fullProfile);

    expect(projection.name).toBe('Яна');
    expect(projection.height).toBe('180');
    expect(projection.blood).toBe('1+');
    expect(projection.lastLogin2).toBe('2026-08-19');
    expect(projection.v).toBe(MATCHING_CARD_SCHEMA_VERSION);
    expect(projection.source).toBe('users');
    // Опис і самі значення контактів у проєкцію не потрапляють.
    expect(projection.moreInfo_main).toBeUndefined();
    expect(projection.phone).toBeUndefined();
    expect(projection.telegram).toBeUndefined();
    expect(projection.photos).toBeUndefined();
  });

  it('зводить аліаси кесаревого до одного ключа', () => {
    expect(buildMatchingCardProjection('id', { cSection: '2' }).csection).toBe('2');
    expect(buildMatchingCardProjection('id', { cesareanSection: '3' }).csection).toBe('3');
  });

  it('бере перше фото анкети як аватар і дозволяє його перевизначити', () => {
    expect(buildMatchingCardProjection('id', fullProfile).avatar).toBe('https://example.test/a.jpg');
    expect(
      buildMatchingCardProjection('id', { ...fullProfile, photos: [] }, { avatar: 'https://example.test/storage.jpg' }).avatar,
    ).toBe('https://example.test/storage.jpg');
  });

  it('не пише порожні поля', () => {
    const projection = buildMatchingCardProjection('id', { name: 'Ольга', city: '   ', weight: null });
    expect(projection).not.toHaveProperty('city');
    expect(projection).not.toHaveProperty('weight');
  });

  it('пише publish лише коли анкету не показують — за міркою стрічки', () => {
    expect(buildMatchingCardProjection('id', { name: 'A', publish: true })).not.toHaveProperty('publish');
    expect(buildMatchingCardProjection('id', { name: 'A', publish: 'true' })).not.toHaveProperty('publish');
    // Анкети старих поколінь тримають publish масивом; стрічка читає його як
    // «показувати», щойно там є true.
    expect(buildMatchingCardProjection('id', { name: 'A', publish: [false, true] })).not.toHaveProperty('publish');

    expect(buildMatchingCardProjection('id', { name: 'A', publish: false }).publish).toBe(false);
    // «Не показувати» — це не лише літеральне false: анкета, яка ніколи не
    // вмикала показ, теж має лягти в проєкцію винятком, інакше картка без
    // ключа назве її показаною.
    expect(buildMatchingCardProjection('id', { name: 'A' }).publish).toBe(false);
    expect(buildMatchingCardProjection('id', { name: 'A', publish: '' }).publish).toBe(false);
  });

  it('відносить короткий id до newUsers, довгий — до users', () => {
    expect(buildMatchingCardProjection('short', { name: 'A' }).source).toBe('newUsers');
    expect(buildMatchingCardProjection('a'.repeat(28), { name: 'A' }).source).toBe('users');
  });

  it('повертає null без id або без даних', () => {
    expect(buildMatchingCardProjection('', fullProfile)).toBeNull();
    expect(buildMatchingCardProjection('id', null)).toBeNull();
  });
});

describe('collectMatchingCardContactKeys', () => {
  it('називає ключі наявних контактів і мовчить про порожні', () => {
    const keys = collectMatchingCardContactKeys(fullProfile);
    expect(keys).toContain('phone');
    expect(keys).toContain('telegram');
    expect(keys).not.toContain('instagram');
    expect(keys).not.toContain('facebook');
  });

  it('розділяє український телеграм і решту', () => {
    expect(collectMatchingCardContactKeys({ telegram: 'ук_щось' })).toEqual(['telegram2']);
    expect(collectMatchingCardContactKeys({ telegram: 'nickname' })).toEqual(['telegram']);
    expect(collectMatchingCardContactKeys({ telegram: ['ук_один', 'nickname'] })).toEqual(['telegram', 'telegram2']);
  });
});

describe('expandMatchingCard', () => {
  it('розгортає проєкцію у форму, придатну для рендера і фільтрів', () => {
    const projection = buildMatchingCardProjection('a'.repeat(28), fullProfile);
    const expanded = expandMatchingCard('a'.repeat(28), projection);

    expect(expanded.userId).toBe('a'.repeat(28));
    expect(expanded.name).toBe('Яна');
    expect(expanded.photos).toEqual(['https://example.test/a.jpg']);
    expect(expanded.__photosHydrated).toBe(true);
    expect(expanded.__sourceCollection).toBe('users');
    expect(expanded.__contactKeys).toEqual(expect.arrayContaining(['phone', 'telegram']));
    expect(expanded[MATCHING_SUMMARY_FLAG]).toBe(true);
    expect(isMatchingSummaryCard(expanded)).toBe(true);
    // Службові поля самої проєкції назовні не течуть.
    expect(expanded).not.toHaveProperty('v');
    expect(expanded).not.toHaveProperty('source');
    expect(expanded).not.toHaveProperty('contacts');
  });

  it('віддає null для чужої або відсутньої версії схеми', () => {
    expect(expandMatchingCard('id', null)).toBeNull();
    expect(expandMatchingCard('id', { name: 'A' })).toBeNull();
    expect(expandMatchingCard('id', { name: 'A', v: MATCHING_CARD_SCHEMA_VERSION + 1 })).toBeNull();
    expect(isCurrentMatchingCardSchema({ v: MATCHING_CARD_SCHEMA_VERSION })).toBe(true);
  });

  it('лишає порожній список фото, коли аватара немає', () => {
    const projection = buildMatchingCardProjection('id', { name: 'A' });
    expect(expandMatchingCard('id', projection).photos).toEqual([]);
  });

  it('розгортає відсутній publish у явне true, а виняток лишає false', () => {
    const id = 'a'.repeat(28);
    const shown = expandMatchingCard(id, buildMatchingCardProjection(id, fullProfile));
    const hidden = expandMatchingCard(id, buildMatchingCardProjection(id, { ...fullProfile, publish: false }));

    expect(shown.publish).toBe(true);
    expect(hidden.publish).toBe(false);
  });
});

// Стрічка міряє картку тим самим `canShowMatchingUser`, що й повну анкету, а той
// рахує відсутній `publish` за «не показувати». Тож проєкція, що мовчала про
// показані анкети, лишала неадміну нуль карток при повному вузлі matchingCards.
describe('картка проходить фінальну перевірку показу', () => {
  const id = 'a'.repeat(28);
  const expand = profile => expandMatchingCard(id, buildMatchingCardProjection(id, profile));

  it('показану анкету бачить і неадмін', () => {
    expect(canShowMatchingUser(expand(fullProfile), { isAdmin: false })).toBe(true);
    expect(canShowMatchingUser(expand({ ...fullProfile, publish: [false, true] }), { isAdmin: false })).toBe(true);
  });

  it('сховану анкету не бачить ніхто, крім адміна', () => {
    expect(canShowMatchingUser(expand({ ...fullProfile, publish: false }), { isAdmin: false })).toBe(false);
    expect(canShowMatchingUser(expand({ ...fullProfile, publish: false }), { isAdmin: true })).toBe(true);
  });

  it('анкету, яка ніколи не вмикала показ, стрічка теж не показує', () => {
    const { publish, ...neverPublished } = fullProfile;
    expect(canShowMatchingUser(expand(neverPublished), { isAdmin: false })).toBe(false);
    expect(canShowMatchingUser(expand({ ...neverPublished, publish: '' }), { isAdmin: false })).toBe(false);
  });
});

describe('лічильник заповнених полів', () => {
  it('проєкція звітує про кількість полів анкети, а не власних', () => {
    const projection = buildMatchingCardProjection('a'.repeat(28), fullProfile);
    const expanded = expandMatchingCard('a'.repeat(28), projection);

    expect(countProfileFields(expanded)).toBe(countProfileFields(fullProfile));
    expect(resolveProfileFieldCountBucket(expanded)).toBe(resolveProfileFieldCountBucket(fullProfile));
  });

  it('без підказки рахує ключі, як і раніше', () => {
    expect(countProfileFields({ a: 1, b: 2, __sourceCollection: 'users' })).toBe(2);
  });
});

describe('areMatchingCardProjectionsEqual', () => {
  it('бачить зміну поля і не бачить її відсутність', () => {
    const a = buildMatchingCardProjection('id', fullProfile);
    const b = buildMatchingCardProjection('id', fullProfile);
    expect(areMatchingCardProjectionsEqual(a, b)).toBe(true);

    const changed = buildMatchingCardProjection('id', { ...fullProfile, weight: '70' });
    expect(areMatchingCardProjectionsEqual(a, changed)).toBe(false);
  });

  it('вважає різними проєкції, де в однієї зʼявився зайвий ключ', () => {
    const a = buildMatchingCardProjection('id', { name: 'A' });
    const b = buildMatchingCardProjection('id', { name: 'A', city: 'Київ' });
    expect(areMatchingCardProjectionsEqual(a, b)).toBe(false);
  });
});

describe('resolveMatchingCardAvatarFromProfile', () => {
  it('дістає перше фото з різних форм зберігання', () => {
    expect(resolveMatchingCardAvatarFromProfile({ photos: 'https://a' })).toBe('https://a');
    expect(resolveMatchingCardAvatarFromProfile({ photos: { '0': 'https://a' } })).toBe('https://a');
    expect(resolveMatchingCardAvatarFromProfile({ photos: [] })).toBe('');
    expect(resolveMatchingCardAvatarFromProfile({})).toBe('');
  });
});

describe('buildMatchingCardsPayloadFromCollections', () => {
  const collections = {
    users: {
      ['a'.repeat(28)]: { name: 'Яна', photos: ['https://example.test/a.jpg'], lastLogin2: '2026-08-19' },
      ['b'.repeat(28)]: { name: 'Ольга', lastLogin2: '2026-08-18' },
    },
    newUsers: {
      short1: { name: 'Ірина', lastLogin2: '2026-08-17' },
    },
  };

  it('віддає вміст вузла, придатний для прямого імпорту в matchingCards', () => {
    const { payload } = buildMatchingCardsPayloadFromCollections(collections);

    expect(Object.keys(payload).sort()).toEqual(['a'.repeat(28), 'b'.repeat(28), 'short1'].sort());
    // Ключі — це userId, а не шлях від кореня: файл лягає саме у вузол matchingCards.
    expect(payload['a'.repeat(28)].name).toBe('Яна');
    expect(payload['a'.repeat(28)].v).toBe(MATCHING_CARD_SCHEMA_VERSION);
  });

  it('проставляє колекцію за тим, з якого файлу прийшла картка', () => {
    const { payload } = buildMatchingCardsPayloadFromCollections(collections);
    expect(payload['a'.repeat(28)].source).toBe('users');
    expect(payload.short1.source).toBe('newUsers');
  });

  it('рахує, скільки карток лишились без аватара', () => {
    const { stats } = buildMatchingCardsPayloadFromCollections(collections);

    expect(stats.total).toBe(3);
    expect(stats.written).toBe(3);
    // Офлайн-збірка не ходить у Storage, тож аватар мають лише анкети з `photos`.
    expect(stats.withAvatar).toBe(1);
    expect(stats.withoutAvatar).toBe(2);
    expect(stats.byCollection.users.written).toBe(2);
    expect(stats.byCollection.newUsers.written).toBe(1);
  });

  it('пропускає биті записи, не ламаючи решту файлу', () => {
    const { payload, stats } = buildMatchingCardsPayloadFromCollections({
      users: {
        ['c'.repeat(28)]: { name: 'Ок' },
        ['d'.repeat(28)]: null,
        '': { name: 'Без id' },
      },
    });

    expect(Object.keys(payload)).toEqual(['c'.repeat(28)]);
    expect(stats.written).toBe(1);
  });

  it('переживає порожній вхід', () => {
    const { payload, stats } = buildMatchingCardsPayloadFromCollections({});
    expect(payload).toEqual({});
    expect(stats.written).toBe(0);
  });
});
