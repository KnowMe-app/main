import {
  MATCHING_CARD_FEED_FIELD,
  buildMatchingCardsPayloadFromCollections,
  MATCHING_SUMMARY_FLAG,
  areMatchingCardProjectionsEqual,
  buildMatchingCardProjection,
  expandMatchingCard,
  isCurrentMatchingCardSchema,
  isMatchingSummaryCard,
  resolveMatchingCardAvatarFromProfile,
} from '../matchingCardIndex';
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

    // Ані версії схеми, ані колекції, ані заповненості: усі картки
    // перебудовані, заповненість зі стрічки прибрано, а колекцію називає
    // формат id — другого місця для цієї відповіді бути не повинно.
    expect(projection.v).toBeUndefined();
    expect(projection.source).toBeUndefined();
    expect(projection.fieldsCount).toBeUndefined();

    // Похідні замість сирих значень: у стрічці стоїть ініціал і розібрана
    // група крові, а повні `surname` і `blood` живуть у `profileDetails`.
    expect(projection.surnameShort).toBe('Д.');
    expect(projection.rh).toBe('+');
    expect(projection.bloodGroup).toBe('1');
    expect(projection.surname).toBeUndefined();
    expect(projection.blood).toBeUndefined();

    // Опис, контакти, робочі й технічні поля у проєкцію не потрапляють —
    // у кожного з них тепер власний вузол із власними правами.
    expect(projection.moreInfo_main).toBeUndefined();
    expect(projection.phone).toBeUndefined();
    expect(projection.telegram).toBeUndefined();
    expect(projection.photos).toBeUndefined();
    expect(projection.lastLogin2).toBeUndefined();
    expect(projection.lastAction).toBeUndefined();
    expect(projection.getInTouch).toBeUndefined();
    // Переліку наявних контактів теж більше немає: фільтр «є контакт» зі
    // стрічки прибрано, а тримати підказку про контакти в публічнішому вузлі
    // не було потреби.
    expect(projection.contacts).toBeUndefined();
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

  it('кладе в індекс стрічки лише показану картку, і значенням — саму дату', () => {
    const usersId = 'a'.repeat(28);
    const build = profile => buildMatchingCardProjection(usersId, profile);
    const FEED = MATCHING_CARD_FEED_FIELD;

    expect(build({ name: 'A', lastLogin2: '2026-08-19', publish: true })[FEED]).toBe('2026-08-19');
    expect(build({ name: 'A', lastLogin2: '2026-08-19', publish: 'true' })[FEED]).toBe('2026-08-19');
    // Анкети старих поколінь тримають publish масивом; стрічка читає його як
    // «показувати», щойно там є true.
    expect(build({ name: 'A', lastLogin2: '2026-08-19', publish: [false, true] })[FEED]).toBe('2026-08-19');
    // Дата з legacy-формату теж придатна — вона просто переставляється.
    expect(build({ name: 'A', lastLogin: '19.08.2026', publish: true })[FEED]).toBe('2026-08-19');

    // Усе інше — відсутність ключа: і явне false, і порожнє, і анкета, яка
    // показ ніколи не вмикала. Схованої картки в індексі немає взагалі, тож
    // вона не може приїхати у видачу.
    expect(build({ name: 'A', lastLogin2: '2026-08-19', publish: false })).not.toHaveProperty(FEED);
    expect(build({ name: 'A', lastLogin2: '2026-08-19', publish: '' })).not.toHaveProperty(FEED);
    expect(build({ name: 'A', lastLogin2: '2026-08-19' })).not.toHaveProperty(FEED);
  });

  it('не індексує показану картку без дати — впорядкувати її нема за чим', () => {
    expect(
      buildMatchingCardProjection('a'.repeat(28), { name: 'A', publish: true }),
    ).not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
  });

  it('формат id більше не вирішує, чи картка в стрічці', () => {
    // Колекція у вебі одна. Анкета, створена у вебі, отримує push-ключ — і
    // умова «в стрічку лише з users» не пускала б її туди ніколи, скільки б
    // разів її не опублікували.
    const shortIdCard = buildMatchingCardProjection('short', {
      name: 'A', lastLogin2: '2026-08-19', publish: true,
    });
    expect(shortIdCard[MATCHING_CARD_FEED_FIELD]).toBe('2026-08-19');

    const longIdCard = buildMatchingCardProjection('a'.repeat(28), {
      name: 'A', lastLogin2: '2026-08-19', publish: true,
    });
    expect(longIdCard[MATCHING_CARD_FEED_FIELD]).toBe('2026-08-19');
  });

  it('нова анкета без жодного логіна все одно стає в стрічку', () => {
    // Анкету щойно створили й одразу опублікували: `lastLogin2` у неї ще
    // немає, і без запасної дати вона лишилась би поза стрічкою до першого
    // логіна — тобто для профілю, створеного кимось іншим, назавжди.
    const card = buildMatchingCardProjection('freshPushKey00000000', {
      name: 'A', publish: true, createdAt2: '2026-08-27',
    });

    expect(card[MATCHING_CARD_FEED_FIELD]).toBe('2026-08-27');
  });

  it('без publish дата створення в стрічку не пускає', () => {
    const card = buildMatchingCardProjection('freshPushKey00000000', {
      name: 'A', createdAt2: '2026-08-27',
    });

    expect(card).not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
  });

  it('логін не публікує анкету, яка не була показана', () => {
    // Логін оновлює `lastLogin2` — і саме тому індекс стрічки не можна
    // будувати з самої лише дати. Прихід користувача в застосунок не є
    // рішенням показати його анкету, і writer це поважає: без `publish`
    // ключа стрічки не зʼявляється, скільки б разів людина не залогінилась.
    const usersId = 'a'.repeat(28);
    const afterLogin = { name: 'A', publish: false, lastLogin2: '2026-08-26' };

    expect(buildMatchingCardProjection(usersId, afterLogin))
      .not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
    expect(buildMatchingCardProjection(usersId, { ...afterLogin, publish: undefined }))
      .not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
  });

  it('більше не пише окремих publish і sourceLastLogin2', () => {
    const projection = buildMatchingCardProjection('a'.repeat(28), fullProfile);
    expect(projection).not.toHaveProperty('publish');
    expect(projection).not.toHaveProperty('sourceLastLogin2');
  });

  it('повертає null без id або без даних', () => {
    expect(buildMatchingCardProjection('', fullProfile)).toBeNull();
    expect(buildMatchingCardProjection('id', null)).toBeNull();
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
    expect(expanded[MATCHING_SUMMARY_FLAG]).toBe(true);
    expect(isMatchingSummaryCard(expanded)).toBe(true);

    // Адаптер віддає старі імена полів: стрічка, її фільтри й сортування не
    // знають, що в базі лежать похідні під іншими ключами.
    expect(expanded.surname).toBe('Д.');
    expect(expanded.blood).toBe('1+');
    expect(expanded.lastLogin2).toBe('2026-08-19');

    // Службові поля самої проєкції назовні не течуть.
    expect(expanded).not.toHaveProperty('v');
    expect(expanded).not.toHaveProperty('source');
    expect(expanded).not.toHaveProperty('contacts');
    expect(expanded).not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
  });

  it('віддає null там, де картки немає', () => {
    // Версії схеми більше немає — усі картки перебудовані. Лишилось питання
    // «чи є тут узагалі щось»: порожній або битий вузол читач і далі
    // відрізняє від картки й догідратовує анкету.
    expect(expandMatchingCard('id', null)).toBeNull();
    expect(expandMatchingCard('id', {})).toBeNull();
    expect(expandMatchingCard('id', 'не картка')).toBeNull();
    expect(expandMatchingCard('', { name: 'A' })).toBeNull();
    expect(isCurrentMatchingCardSchema({ name: 'A' })).toBe(true);
  });

  it('лишає порожній список фото, коли аватара немає', () => {
    const projection = buildMatchingCardProjection('id', { name: 'A' });
    expect(expandMatchingCard('id', projection).photos).toEqual([]);
  });

  it('виводить показ із наявності ключа стрічки', () => {
    const id = 'a'.repeat(28);
    const shown = expandMatchingCard(id, buildMatchingCardProjection(id, fullProfile));
    const hidden = expandMatchingCard(id, buildMatchingCardProjection(id, { ...fullProfile, publish: false }));

    expect(shown.publish).toBe(true);
    expect(hidden).not.toHaveProperty('publish');
    // Сам ключ назовні не тече — він службовий для запиту, не для рендера;
    // дата виходить під старим іменем, за яким сортує стрічка.
    expect(shown).not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
    expect(shown.lastLogin2).toBe('2026-08-19');
  });
});

// Ось навіщо проєкція носить `publish`: стрічка міряє картку тим самим
// `canShowMatchingUser`, що й повну анкету. Поки картка про показ мовчала,
// `normalizePublish` рахував це за «не показувати» — і неадмін бачив нуль
// карток при повному вузлі matchingCards.
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

  // Картка, яку писав ще старий писач, ключа стрічки не має — і ховається, а
  // не показується. Саме такої відмови ми й хотіли: помітної, а не тихої.
  it('картку без ключа стрічки ховає, а не показує', () => {
    const legacyCard = { ...buildMatchingCardProjection(id, fullProfile) };
    delete legacyCard[MATCHING_CARD_FEED_FIELD];
    expect(canShowMatchingUser(expandMatchingCard(id, legacyCard), { isAdmin: false })).toBe(false);
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
    accounts: {
      ['a'.repeat(28)]: { name: 'Яна', photos: ['https://example.test/a.jpg'], lastLogin2: '2026-08-19' },
      ['b'.repeat(28)]: { name: 'Ольга', lastLogin2: '2026-08-18' },
    },
    webCards: {
      short1: { name: 'Ірина', lastLogin2: '2026-08-17' },
    },
  };

  it('віддає вміст вузла, придатний для прямого імпорту в matchingCards', () => {
    const { payload } = buildMatchingCardsPayloadFromCollections(collections);

    expect(Object.keys(payload).sort()).toEqual(['a'.repeat(28), 'b'.repeat(28), 'short1'].sort());
    // Ключі — це userId, а не шлях від кореня: файл лягає саме у вузол matchingCards.
    expect(payload['a'.repeat(28)].name).toBe('Яна');
    // Службових полів у картці немає взагалі — ані версії, ані колекції,
    // ані заповненості.
    expect(payload['a'.repeat(28)]).not.toHaveProperty('v');
    expect(payload['a'.repeat(28)]).not.toHaveProperty('source');
    expect(payload['a'.repeat(28)]).not.toHaveProperty('fieldsCount');
  });

  it('у стрічку пускає лише показані картки і рахує їх окремо', () => {
    const { payload, stats } = buildMatchingCardsPayloadFromCollections(collections);
    expect(payload.short1).not.toHaveProperty(MATCHING_CARD_FEED_FIELD);
    expect(stats.inFeed).toBe(
      Object.values(payload).filter(entry => entry[MATCHING_CARD_FEED_FIELD]).length,
    );
  });

  it('рахує, скільки карток лишились без аватара', () => {
    const { stats } = buildMatchingCardsPayloadFromCollections(collections);

    expect(stats.total).toBe(3);
    expect(stats.written).toBe(3);
    // Офлайн-збірка не ходить у Storage, тож аватар мають лише анкети з `photos`.
    expect(stats.withAvatar).toBe(1);
    expect(stats.withoutAvatar).toBe(2);
    expect(stats.byCollection.accounts.written).toBe(2);
    expect(stats.byCollection.webCards.written).toBe(1);
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
