import {
  MATCHING_CARD_SCHEMA_VERSION,
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

  it('пише publish лише коли анкету сховано', () => {
    expect(buildMatchingCardProjection('id', { name: 'A' })).not.toHaveProperty('publish');
    expect(buildMatchingCardProjection('id', { name: 'A', publish: false }).publish).toBe(false);
    expect(buildMatchingCardProjection('id', { name: 'A', publish: true })).not.toHaveProperty('publish');
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
