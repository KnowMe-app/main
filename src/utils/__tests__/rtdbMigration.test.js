import {
  CLEANED_COLLECTIONS_KIND,
  MIGRATION_GROUPS,
  createMigrationState,
  planMigrationGroup,
  applyMigrationPlan,
  runMigrationGroup,
  buildCombinedRootPatch,
  buildCleanedNewUsers,
  buildMigrationAudit,
  buildCollectionInventory,
  buildRemainingUsers,
  buildRemainingNewUsers,
  buildRemaindersExport,
  buildCleanedUsers,
  buildCleanedCollections,
  getOwnerValuePatch,
} from '../rtdbMigration';
import {
  deriveSurnameShort,
  deriveRh,
  deriveAvatar,
  deriveRole,
  deriveFeedDate,
  normalizeLegacyDates,
  normalizeFeedDateValue,
} from '../rtdbMigrationDerive';
import { MATCHING_CARD_FORBIDDEN_FIELDS } from '../profileNodeSchema';

const OWNER = 'ADMIN_UID';

const stateWith = (users, newUsers) => createMigrationState({ users, newUsers });

const card = (state, id) => state.targets.matchingCards[id];
const cardFields = card;

describe('surnameShort', () => {
  it('бере перший символ скалярного прізвища', () => {
    expect(deriveSurnameShort('Коваленко')).toEqual({ value: 'К.' });
    expect(deriveSurnameShort('Smith')).toEqual({ value: 'S.' });
  });

  it('бере поточне значення з масиву версій, а не перше-ліпше', () => {
    // Той самий резолвер, яким UI показує «поточне» значення: остання
    // непорожня версія. Інакше в стрічці стояв би ініціал прізвища, яке адмін
    // уже виправив.
    expect(deriveSurnameShort(['Стара', 'Нова'])).toEqual({ value: 'Н.' });
  });

  it('не ріже сурогатну пару навпіл', () => {
    expect(deriveSurnameShort('𝒦oval')).toEqual({ value: '𝒦.' });
  });

  it('тримає діакритику при першій літері', () => {
    // «Ї» як «І» + комбінований знак — без цього вийшло б «І.».
    expect(deriveSurnameShort('Ïvanova')).toEqual({ value: 'Ï.' });
  });

  it('не створює ключ, коли прізвища немає', () => {
    expect(deriveSurnameShort(undefined)).toEqual({ value: undefined });
    expect(deriveSurnameShort('   ')).toEqual({ value: undefined });
  });

  it('каже вголос, коли значення є, але дістати рядок неможливо', () => {
    expect(deriveSurnameShort({ nested: { deeper: {} } })).toEqual({ value: undefined });
    expect(deriveSurnameShort([{ a: true }])).toEqual({
      value: undefined,
      warning: 'UNRESOLVED_SURNAME',
    });
  });
});

describe('rh', () => {
  it('дістає резус із повної групи', () => {
    expect(deriveRh('2+')).toEqual({ value: '+' });
    expect(deriveRh('3-')).toEqual({ value: '-' });
  });

  it('приймає масив, у якому всі значення дають той самий резус', () => {
    expect(deriveRh(['2+', '3+'])).toEqual({ value: '+' });
  });

  it('не вгадує, коли резуси в масиві розходяться', () => {
    expect(deriveRh(['2+', '3-'])).toEqual({ value: undefined, warning: 'RH_CONFLICT' });
  });

  it('мовчить, коли резусу в значенні просто немає', () => {
    expect(deriveRh('2')).toEqual({ value: undefined });
    expect(deriveRh(undefined)).toEqual({ value: undefined });
  });
});

describe('avatar', () => {
  it('віддає перевагу окремому полю avatar', () => {
    expect(deriveAvatar({ avatar: 'https://a', photos: ['https://b'] })).toEqual({
      value: 'https://a',
      fromPhotos: false,
    });
  });

  it('інакше бере основне фото тим самим алгоритмом, що й застосунок', () => {
    expect(deriveAvatar({ photos: ['https://b', 'https://c'] })).toEqual({
      value: 'https://b',
      fromPhotos: true,
    });
  });

  it('нічого не вигадує, коли фото немає', () => {
    expect(deriveAvatar({})).toEqual({ value: undefined, fromPhotos: false });
  });
});

describe('role', () => {
  it('зводить самотній userRole до role', () => {
    expect(deriveRole({ userRole: 'sm' })).toEqual({ value: 'sm', consumed: ['userRole'] });
  });

  it('зводить самотній role до role', () => {
    expect(deriveRole({ role: 'ip' })).toEqual({ value: 'ip', consumed: ['role'] });
  });

  it('приймає обидва, коли вони однакові, і лишає скаляр скаляром', () => {
    expect(deriveRole({ userRole: 'ag', role: 'ag' })).toEqual({
      value: 'ag',
      consumed: ['userRole', 'role'],
    });
  });

  it('зберігає обидва варіанти, коли вони різні', () => {
    expect(deriveRole({ userRole: 'sm', role: 'ed' })).toEqual({
      value: ['sm', 'ed'],
      consumed: ['userRole', 'role'],
    });
  });

  it('розгортає масив ролей і не дублює того, що вже є', () => {
    expect(deriveRole({ userRole: 'ed', role: ['ed', 'ag'] })).toEqual({
      value: ['ed', 'ag'],
      consumed: ['userRole', 'role'],
    });
  });

  it('збирає варіанти з обох колекцій у сталому порядку', () => {
    expect(deriveRole({ userRole: 'ed' }, { role: 'ag', userRole: 'ip' })).toEqual({
      value: ['ed', 'ip', 'ag'],
      consumed: ['userRole', 'role'],
    });
  });

  it('не забирає ключа, з якого не вийшло жодного варіанта', () => {
    expect(deriveRole({ userRole: 'ed', role: { обгортка: '' } })).toEqual({
      value: 'ed',
      consumed: ['userRole'],
    });
  });
});

describe('feedDate', () => {
  it('нормалізує обидва відомі формати дати', () => {
    expect(normalizeFeedDateValue('2026-08-25')).toBe('2026-08-25');
    expect(normalizeFeedDateValue('25.08.2026')).toBe('2026-08-25');
    expect(normalizeFeedDateValue('казна-що')).toBe('');
    expect(normalizeFeedDateValue('2026-99-99')).toBe('');
  });

  it('показана картка з датою отримує feedDate', () => {
    expect(deriveFeedDate({ publish: true, lastLogin2: '2026-08-25' })).toMatchObject({
      value: '2026-08-25',
      published: true,
    });
  });

  it('не показана картка не отримує feedDate', () => {
    expect(deriveFeedDate({ publish: false, lastLogin2: '2026-08-25' })).toMatchObject({
      value: undefined,
      published: false,
      publishRepresented: true,
    });
  });

  it('читає publish-масив так само, як застосунок', () => {
    expect(deriveFeedDate({ publish: [false, true], lastLogin2: '2026-08-25' })).toMatchObject({
      value: '2026-08-25',
    });
    expect(deriveFeedDate({ publish: [false, false], lastLogin2: '2026-08-25' })).toMatchObject({
      published: false,
    });
  });

  it('відкочується на lastLogin, коли lastLogin2 непридатний', () => {
    expect(deriveFeedDate({ publish: true, lastLogin2: '', lastLogin: '25.08.2026' })).toMatchObject({
      value: '2026-08-25',
    });
  });

  it('показана картка без жодної дати блокує, а не вигадує дату', () => {
    expect(deriveFeedDate({ publish: true })).toEqual({
      value: undefined,
      published: true,
      publishRepresented: false,
      warning: 'FEED_DATE_MISSING_DATE',
    });
  });
});

describe('нормалізація дат', () => {
  it('крапкову дату переписує в ISO, ISO лишає як є', () => {
    expect(normalizeLegacyDates('25.08.2026')).toBe('2026-08-25');
    expect(normalizeLegacyDates('2026-08-25')).toBe('2026-08-25');
  });

  it('не чіпає того, що датою цілком не є', () => {
    // Нотатка з датою всередині — це нотатка: переписана, вона перестала б
    // бути тим, що адмін упізнає.
    expect(normalizeLegacyDates('до 25.08.2026 не писати')).toBe('до 25.08.2026 не писати');
    expect(normalizeLegacyDates('2099-99-99')).toBe('2099-99-99');
    expect(normalizeLegacyDates('1.2.3')).toBe('1.2.3');
  });

  it('обходить масив версій і вкладений обʼєкт', () => {
    expect(normalizeLegacyDates(['01.09.2026', 'нотатка'])).toEqual(['2026-09-01', 'нотатка']);
    expect(normalizeLegacyDates({ a: { b: '01.09.2026' } })).toEqual({ a: { b: '2026-09-01' } });
  });

  it('не чіпає чисел і булевих значень', () => {
    expect(normalizeLegacyDates(1770456647255)).toBe(1770456647255);
    expect(normalizeLegacyDates(true)).toBe(true);
    expect(normalizeLegacyDates(null)).toBe(null);
  });
});

describe('Matching Cards', () => {
  it('переносить прямі поля без зміни типу і прибирає їх із newUsers', () => {
    const state = stateWith({}, {
      P1: { name: 'Катерина', height: '168', ownKids: 2, city: 'Київ' },
    });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ name: 'Катерина', height: '168', ownKids: 2, city: 'Київ' });
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('складає похідні і лишає їхні джерела на місці', () => {
    const state = stateWith({
      P1: {
        surname: 'Коваленко',
        blood: '2+',
        photos: ['https://p1', 'https://p2'],
        userRole: 'sm',
        publish: true,
        lastLogin2: '2026-08-25',
      },
    }, {
      P1: {
        surname: 'Коваленко',
        blood: '2+',
        photos: ['https://p1', 'https://p2'],
        userRole: 'sm',
        lastLogin2: '2026-08-25',
      },
    });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({
      surnameShort: 'К.',
      rh: '+',
      bloodGroup: '2',
      avatar: 'https://p1',
      role: 'sm',
      feedDate: '2026-08-25',
    });

    // Повне прізвище і повна група ще потрібні Profiles, набір фото — теж.
    // lastLogin2 чекає на Technical. Пішов тільки userRole, зведений у role.
    expect(state.workingNewUsers.P1).toEqual({
      surname: 'Коваленко',
      blood: '2+',
      photos: ['https://p1', 'https://p2'],
      lastLogin2: '2026-08-25',
    });
  });

  it('не підписує картку ані версією, ані колекцією, ані заповненістю', () => {
    // Усі картки перебудовані, тож версія більше нічого не розрізняє;
    // заповненість зі стрічки прибрано разом із фільтром; а колекцію називає
    // формат id, і другого місця для цієї відповіді бути не повинно.
    const state = stateWith({ P1: { name: 'Оля', surname: 'К', phone: '+380' } }, {});
    runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).toEqual({ name: 'Оля', surnameShort: 'К.' });
  });

  it('feedDate не зʼявляється у картки з newUsers, а її publish не чіпають', () => {
    const state = stateWith({}, { P1: { name: 'Оля', publish: true, lastLogin2: '2026-08-25' } });
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).not.toHaveProperty('feedDate');
    expect(state.workingNewUsers.P1.publish).toBe(true);
    expect(plan.warningsByCode.PUBLISH_IN_NEW_USERS_IGNORED).toBe(1);
  });

  it('прибирає окреме поле avatar, бо це пряма копія', () => {
    const state = stateWith({}, { P1: { avatar: 'https://direct', photos: ['https://p'] } });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ avatar: 'https://direct' });
    expect(state.workingNewUsers.P1).toEqual({ photos: ['https://p'] });
  });

  it('зберігає обидва варіанти ролі і забирає обидва старі ключі', () => {
    const state = stateWith({}, { P1: { userRole: 'sm', role: 'ed' } });
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).toEqual({ role: ['sm', 'ed'] });
    expect(state.workingNewUsers.P1).toEqual({});
    expect(plan.counters.conflicts).toBe(0);
  });

  it('збирає роль з обох колекцій одним набором, а не двома записами', () => {
    // Раніше друга колекція приносила в ціль інший масив і сперечалася з
    // першою. Роль — питання про анкету, а не про копію анкети.
    const state = stateWith({ P1: { userRole: 'ed' } }, { P1: { role: 'ag' } });
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).toEqual({ role: ['ed', 'ag'] });
    expect(state.workingNewUsers.P1).toEqual({});
    expect(state.remainingUsers.P1).toEqual({});
    expect(plan.counters.conflicts).toBe(0);
  });

  it('не створює feedDate, коли показана анкета не має жодної дати', () => {
    const state = stateWith({ P1: { name: 'Оля', publish: true } }, {});
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).not.toHaveProperty('feedDate');
    expect(plan.warningsByCode.FEED_DATE_MISSING_DATE).toBe(1);
    expect(plan.counters.errors).toBe(1);
  });

  it('не показана анкета лишається без feedDate', () => {
    const state = stateWith({ P1: { name: 'Оля', publish: false, lastLogin2: '2026-08-25' } }, {});
    runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).not.toHaveProperty('feedDate');
  });

  it('бере область і з `state` — це та сама локація під старою назвою', () => {
    const state = stateWith({}, { P1: { state: 'Донецкая область' }, P2: { state: 'Бавария' } });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ region: 'Донецкая область' });
    expect(cardFields(state, 'P2')).toEqual({ region: 'Бавария' });
    // Старий ключ поїхав разом зі значенням: другого місця для області немає.
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('канонічний `region` виграє, а зайвий `state` лишається на місці', () => {
    // Забирати обидва ключі не можна: у картку поїхало значення лише одного, і
    // друге зникло б, так і не переїхавши. Тож воно лишається в залишку —
    // видимою розбіжністю, з якою розбереться людина.
    const state = stateWith({}, { P1: { region: 'Київська область', state: 'Донецкая область' } });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ region: 'Київська область' });
    expect(state.workingNewUsers.P1).toEqual({ state: 'Донецкая область' });
  });

  it('порожній `region` не заступає дорогу непорожньому `state`', () => {
    const state = stateWith({}, { P1: { region: '', state: 'Житомирська область' } });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ region: 'Житомирська область' });
    expect(state.workingNewUsers.P1).toEqual({ region: '' });
  });

  it('`state` не рахується полем, з яким має розбиратись людина', () => {
    const { mapped, unknown } = buildRemaindersExport(stateWith({}, { P1: { state: 'Бавария' } }))
      .summary.newUsers.unmappedFieldStats;

    expect(mapped).toEqual({ state: 1 });
    expect(unknown).toEqual({});
  });

  it('ніколи не кладе в картку заборонених ключів', () => {
    const state = stateWith({
      P1: {
        name: 'Катерина',
        surname: 'Коваленко',
        blood: '2+',
        phone: '+380',
        email: 'a@b.c',
        getInTouch: '2026-09-01',
        lastAction: 'x',
        lastLogin2: '2026-08-25',
        publish: true,
        accessLevel: 'matching:view',
        deviceWidth: 1080,
        password: 'secret',
      },
    }, {});
    runMigrationGroup(state, 'matchingCards');

    MATCHING_CARD_FORBIDDEN_FIELDS.forEach(field => {
      expect(card(state, 'P1')).not.toHaveProperty(field);
    });
  });
});

describe('Contacts', () => {
  it('переносить скаляр, масив і вкладений обʼєкт точно як є', () => {
    const nested = { primary: { value: '+380', note: 'дзвонити' } };
    const state = stateWith({}, {
      P1: { phone: ['+380', '+381'], email: 'a@b.c', telegram: nested, street: 'вул. Тестова, 1' },
    });
    runMigrationGroup(state, 'profileContacts');

    expect(state.targets.profileContacts.P1).toEqual({
      phone: ['+380', '+381'],
      email: 'a@b.c',
      telegram: nested,
      street: 'вул. Тестова, 1',
    });
    expect(Array.isArray(state.targets.profileContacts.P1.phone)).toBe(true);
    // Глибока копія, а не спільне посилання на той самий обʼєкт.
    expect(state.targets.profileContacts.P1.telegram).not.toBe(nested);
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('не переносить і не прибирає порожній рядок', () => {
    const state = stateWith({}, { P1: { phone: '', email: 'a@b.c' } });
    const plan = runMigrationGroup(state, 'profileContacts');

    expect(state.targets.profileContacts.P1).toEqual({ email: 'a@b.c' });
    expect(state.workingNewUsers.P1).toEqual({ phone: '' });
    expect(plan.warningsByCode.EMPTY_SOURCE_VALUE).toBe(1);
  });

  it('лишає джерело на місці при конфлікті з users', () => {
    const state = stateWith({ P1: { phone: '+380' } }, { P1: { phone: '+999' } });
    const plan = runMigrationGroup(state, 'profileContacts');

    expect(state.targets.profileContacts.P1).toEqual({ phone: '+380' });
    expect(state.workingNewUsers.P1).toEqual({ phone: '+999' });
    expect(plan.conflicts).toContainEqual(expect.objectContaining({
      profileId: 'P1',
      targetGroup: 'profileContacts',
      field: 'phone',
      usersValue: '+380',
      newUsersValue: '+999',
      reason: 'SOURCE_CONFLICT',
    }));
  });
});

describe('дати входу з двох колекцій', () => {
  it('лишає ту, що ближча до сьогодення, і чистить обидва джерела', () => {
    const state = stateWith(
      { P1: { lastLogin2: '2026-08-22' } },
      { P1: { lastLogin2: '2026-08-01' } },
    );
    const plan = runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.P1).toEqual({ lastLogin2: '2026-08-22' });
    expect(state.workingNewUsers.P1).toEqual({});
    expect(plan.counters.conflicts).toBe(0);
    expect(plan.warningsByCode.LOGIN_RECENCY_RESOLVED).toBe(1);
  });

  it('свіжіша дата з newUsers заміщає старішу з users', () => {
    // `users` виграє в конфлікті, але тут не конфлікт: пізніша дата — не думка
    // колекції, а факт.
    const state = stateWith(
      { P1: { lastLogin: '2026-01-01' } },
      { P1: { lastLogin: '2026-08-25' } },
    );
    runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.P1).toEqual({ lastLogin: '2026-08-25' });
    expect(state.workingNewUsers.P1).toEqual({});
    expect(state.remainingUsers.P1).toEqual({});
  });

  it('зводить і різні формати запису тієї самої дати', () => {
    const state = stateWith(
      { P1: { lastLogin2: '01.08.2026' } },
      { P1: { lastLogin2: '2026-08-25' } },
    );
    runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.P1).toEqual({ lastLogin2: '2026-08-25' });
  });

  it('у звіті видно, що саме лишили і що відкинули', () => {
    const state = stateWith(
      { P1: { lastLogin2: '2026-08-22' } },
      { P1: { lastLogin2: '2026-08-01' } },
    );
    const plan = runMigrationGroup(state, 'profileTechnical');

    expect(plan.warnings).toContainEqual(expect.objectContaining({
      code: 'LOGIN_RECENCY_RESOLVED',
      profileId: 'P1',
      field: 'lastLogin2',
      keptValue: '2026-08-22',
      droppedValue: '2026-08-01',
      keptSource: 'users',
    }));
  });

  it('незрозуміле значення лишається конфліктом, а не «свіжішою датою»', () => {
    const state = stateWith(
      { P1: { lastLogin2: '2026-08-22' } },
      { P1: { lastLogin2: 'колись улітку' } },
    );
    const plan = runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.P1).toEqual({ lastLogin2: '2026-08-22' });
    expect(state.workingNewUsers.P1).toEqual({ lastLogin2: 'колись улітку' });
    expect(plan.counters.conflicts).toBe(1);
  });

  it('дата входу не робить свіжішим нічого, крім lastLogin', () => {
    const state = stateWith(
      { P1: { registrationDate: '2026-08-22' } },
      { P1: { registrationDate: '2026-08-25' } },
    );
    const plan = runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.P1).toEqual({ registrationDate: '2026-08-22' });
    expect(plan.counters.conflicts).toBe(1);
  });
});

describe('Workflow і Technical', () => {
  it('workflow бере рівно три поля і не чіпає getInTouch/lastLogin/publish', () => {
    const state = stateWith({}, {
      P1: {
        lastAction: 'дзвінок',
        cycleStatus: 'active',
        lastCycle: '2026-05',
        getInTouch: '2026-09-01',
        lastLogin: '25.08.2026',
        publish: true,
      },
    });
    runMigrationGroup(state, 'profileWorkflow');

    expect(state.targets.profileWorkflow.P1).toEqual({
      lastAction: 'дзвінок',
      cycleStatus: 'active',
      lastCycle: '2026-05',
    });
    expect(state.workingNewUsers.P1).toEqual({
      getInTouch: '2026-09-01',
      lastLogin: '25.08.2026',
      publish: true,
    });
  });

  it('technical забирає права акаунта і не забирає device- та cache-полів', () => {
    const state = stateWith({}, {
      P1: {
        lastLogin: '25.08.2026',
        lastLogin2: '2026-08-25',
        language: 'uk',
        accessLevel: 'matching:view',
        canCreateProfiles: true,
        multiDataAccessUserIds: { ADMIN: true },
        multiDataSourceUserIds: { ADMIN: true },
        additionalAccessRules: 'усе видно',
        deviceWidth: 1080,
        deviceHeight: 1920,
        deviceResize: true,
        cachedAt: 123,
      },
    });
    runMigrationGroup(state, 'profileTechnical');

    // Права акаунта — теж технічні дані, і тепер вони переїжджають разом із
    // рештою: правила бази читають рівень доступу і з `profileTechnical`.
    expect(state.targets.profileTechnical.P1).toEqual({
      // Дата входу приїхала одним написанням — крапкова стала ISO.
      lastLogin: '2026-08-25',
      lastLogin2: '2026-08-25',
      language: 'uk',
      accessLevel: 'matching:view',
      canCreateProfiles: true,
      multiDataAccessUserIds: { ADMIN: true },
      multiDataSourceUserIds: { ADMIN: true },
      additionalAccessRules: 'усе видно',
    });
    expect(state.workingNewUsers.P1).toEqual({
      deviceWidth: 1080,
      deviceHeight: 1920,
      deviceResize: true,
      cachedAt: 123,
    });
  });
});

describe('GetInTouch', () => {
  it('без owner UID нічого не робить', () => {
    const state = stateWith({}, { P1: { getInTouch: '2026-09-01' } });
    const plan = planMigrationGroup(state, 'getInTouch');

    expect(plan.blocked).toBe('MISSING_OWNER_UID');
    applyMigrationPlan(state, plan);
    expect(state.workingNewUsers.P1).toEqual({ getInTouch: '2026-09-01' });
  });

  it('складає структуру owner/profileId = значення', () => {
    const state = stateWith({}, {
      P1: { getInTouch: '2026-09-01' },
      P2: { getInTouch: '2026-09-01' },
      P3: { getInTouch: '2099-99-99' },
      P4: { getInTouch: 'Теж більше не писати' },
    });
    runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(getOwnerValuePatch(state, 'getInTouch')).toEqual({
      [OWNER]: {
        P1: '2026-09-01',
        P2: '2026-09-01',
        P3: '2099-99-99',
        P4: 'Теж більше не писати',
      },
    });
    ['P1', 'P2', 'P3', 'P4'].forEach(id => expect(state.workingNewUsers[id]).toEqual({}));
  });

  it('нотатку більше не доводиться правити під ключ бази', () => {
    // Раніше значення ставало назвою ключа, тож `.`, `/`, `#`, `[`, `]` у ньому
    // замінювались дефісом, а задовге обрізалось: адмін отримував назад не те,
    // що записував. Значенням воно лежить як є.
    const state = stateWith({}, {
      P1: { getInTouch: 'до 01/09' },
      P2: { getInTouch: 'а.б' },
      P3: { getInTouch: 'я'.repeat(500) },
    });
    const plan = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(getOwnerValuePatch(state, 'getInTouch')[OWNER]).toEqual({
      P1: 'до 01/09',
      P2: 'а.б',
      P3: 'я'.repeat(500),
    });
    expect(plan.warningsByCode).toEqual({});
    ['P1', 'P2', 'P3'].forEach(id => expect(state.workingNewUsers[id]).toEqual({}));
  });

  it('дата приїжджає одним написанням, з якого боку не прийшла б', () => {
    // Це і є те, заради чого нормалізація: два написання тієї самої дати не
    // повинні давати ані двох різних значень, ані конфлікту між копіями.
    const state = stateWith(
      { P1: { getInTouch: '01.09.2026' } },
      { P1: { getInTouch: '2026-09-01' }, P2: { getInTouch: '01.09.2026' } },
    );
    const plan = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(getOwnerValuePatch(state, 'getInTouch')[OWNER])
      .toEqual({ P1: '2026-09-01', P2: '2026-09-01' });
    expect(plan.conflicts).toHaveLength(0);
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('порожнє значення не переноситься і не зникає', () => {
    const state = stateWith({}, { P1: { getInTouch: '   ' } });
    const plan = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(getOwnerValuePatch(state, 'getInTouch')).toEqual({});
    expect(state.workingNewUsers.P1).toEqual({ getInTouch: '   ' });
    expect(plan.warningsByCode.EMPTY_SOURCE_VALUE).toBe(1);
  });

  it('не кладе одну картку під два різні значення', () => {
    const state = stateWith({ P1: { getInTouch: '2026-09-01' } }, { P1: { getInTouch: '2026-10-01' } });
    const plan = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(getOwnerValuePatch(state, 'getInTouch')[OWNER]).toEqual({ P1: '2026-09-01' });
    expect(state.workingNewUsers.P1).toEqual({ getInTouch: '2026-10-01' });
    expect(plan.conflicts).toHaveLength(1);
  });

  it('повторний запуск нічого не додає і нічого не міняє', () => {
    const state = stateWith({ P1: { getInTouch: '2026-09-01' } }, { P1: { getInTouch: '2026-09-01' } });
    runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });
    const before = JSON.stringify(state.targets.multiDataPatch.getInTouch);

    const second = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });
    expect(JSON.stringify(state.targets.multiDataPatch.getInTouch)).toBe(before);
    expect(second.ownerValueWrites).toHaveLength(0);
  });
});

describe('однаковий id у users та newUsers', () => {
  it('однакові значення — це успіх, і newUsers чиститься', () => {
    const state = stateWith({ P1: { height: '168' } }, { P1: { height: '168' } });
    runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ height: '168' });
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('різні значення — це конфлікт, і newUsers не чиститься', () => {
    const state = stateWith({ P1: { height: '168' } }, { P1: { height: '170' } });
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(cardFields(state, 'P1')).toEqual({ height: '168' });
    expect(state.workingNewUsers.P1).toEqual({ height: '170' });
    expect(plan.conflicts).toContainEqual(expect.objectContaining({
      profileId: 'P1',
      targetGroup: 'matchingCards',
      field: 'height',
      usersValue: '168',
      newUsersValue: '170',
      reason: 'SOURCE_CONFLICT',
    }));
  });

  it('вкладені структури, рівні за значенням, конфліктом не є', () => {
    const value = { a: [1, { b: 'c' }] };
    const state = stateWith({ P1: { phone: value } }, { P1: { phone: { a: [1, { b: 'c' }] } } });
    const plan = runMigrationGroup(state, 'profileContacts');

    expect(plan.conflicts).toHaveLength(0);
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('вкладені структури, різні в глибині, конфліктом є', () => {
    const state = stateWith({ P1: { phone: { a: [1, { b: 'c' }] } } }, { P1: { phone: { a: [1, { b: 'd' }] } } });
    const plan = runMigrationGroup(state, 'profileContacts');

    expect(plan.conflicts).toHaveLength(1);
    expect(state.workingNewUsers.P1).toEqual({ phone: { a: [1, { b: 'd' }] } });
  });

  it('про публікацію говорить лише users — publish у newUsers лишається недоторканим', () => {
    const state = stateWith(
      { P1: { publish: true, lastLogin2: '2026-08-25' } },
      { P1: { publish: false, lastLogin2: '2026-08-25' } },
    );
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1').feedDate).toBe('2026-08-25');
    expect(state.workingNewUsers.P1.publish).toBe(false);
    expect(plan.warningsByCode.PUBLISH_IN_NEW_USERS_IGNORED).toBe(1);
  });
});

describe('Stimulation Schedule', () => {
  const SCHEDULE = { startDate: '2026-09-01', rows: [{ date: '2026-09-01', values: { menopur: '150' } }] };

  it('без owner UID нічого не робить', () => {
    const state = stateWith({}, { P1: { stimulationSchedule: SCHEDULE } });
    const plan = planMigrationGroup(state, 'stimulationSchedule');

    expect(plan.blocked).toBe('MISSING_OWNER_UID');
    applyMigrationPlan(state, plan);
    expect(state.workingNewUsers.P1).toEqual({ stimulationSchedule: SCHEDULE });
  });

  it('кладе графік під власника цілим значенням, а не назвою ключа', () => {
    // Графік — це таблиця днів і призначень. У ключі їй не поміститись, та й
    // не треба: під власником анкета вже одна, і значення лягає значенням.
    const state = stateWith({}, { P1: { stimulationSchedule: SCHEDULE }, P2: { stimulationSchedule: 'з 1 вересня' } });
    runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'stimulationSchedule')).toEqual({
      [OWNER]: { P1: SCHEDULE, P2: 'з 1 вересня' },
    });
    expect(state.workingNewUsers.P1).toEqual({});
    expect(state.workingNewUsers.P2).toEqual({});
  });

  it('порожній графік не переноситься і не зникає', () => {
    const state = stateWith({}, { P1: { stimulationSchedule: '' } });
    const plan = runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'stimulationSchedule')).toEqual({});
    expect(state.workingNewUsers.P1).toEqual({ stimulationSchedule: '' });
    expect(plan.warningsByCode.EMPTY_SOURCE_VALUE).toBe(1);
  });

  it('різні графіки у двох колекціях — це конфлікт, а не мовчазний перезапис', () => {
    const state = stateWith(
      { P1: { stimulationSchedule: SCHEDULE } },
      { P1: { stimulationSchedule: { startDate: '2026-10-01' } } },
    );
    const plan = runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'stimulationSchedule')[OWNER].P1).toEqual(SCHEDULE);
    expect(state.workingNewUsers.P1).toEqual({ stimulationSchedule: { startDate: '2026-10-01' } });
    expect(plan.conflicts).toHaveLength(1);
  });

  it('однаковий графік в обох колекціях чистить обидва джерела', () => {
    const state = stateWith(
      { P1: { stimulationSchedule: SCHEDULE } },
      { P1: { stimulationSchedule: { ...SCHEDULE } } },
    );
    const plan = runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    expect(plan.conflicts).toHaveLength(0);
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('повторний запуск нічого не додає', () => {
    const state = stateWith({}, { P1: { stimulationSchedule: SCHEDULE } });
    runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });
    const second = runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    expect(second.ownerValueWrites).toHaveLength(0);
    expect(second.deletions).toHaveLength(0);
    expect(getOwnerValuePatch(state, 'stimulationSchedule')[OWNER]).toEqual({ P1: SCHEDULE });
  });

  it('графік їде в патч кореня разом із рештою multiData', () => {
    const state = stateWith({}, { P1: { stimulationSchedule: SCHEDULE } });
    runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    expect(buildCombinedRootPatch(state).multiData.stimulationSchedule)
      .toEqual({ [OWNER]: { P1: SCHEDULE } });
  });

  it('патч — копія, а не посилання на робочий стан', () => {
    const state = stateWith({}, { P1: { stimulationSchedule: SCHEDULE } });
    runMigrationGroup(state, 'stimulationSchedule', { ownerUid: OWNER });

    const patch = getOwnerValuePatch(state, 'stimulationSchedule');
    patch[OWNER].P1.rows.push({ date: 'зайве' });

    expect(state.targets.multiDataPatch.stimulationSchedule[OWNER].P1.rows).toHaveLength(1);
  });
});

describe('порядок кнопок', () => {
  // Кнопок шість, вони поруч, і всі однаково активні. Порядок, у якому їх
  // «задумано натискати», — це коментар у коді, а не механізм, тож результат
  // не має від нього залежати. Найдорожчий випадок — «Migrate Profiles»
  // першою: вона володіє `surname`, `blood` і `photos`, тобто джерелами, з
  // яких стрічка виводить ініціал, резус, групу крові й аватар.
  const SEED = {
    P1: {
      name: 'Оля',
      surname: 'Коваленко',
      blood: '2+',
      photos: ['https://p1', 'https://p2'],
      userRole: 'sm',
      phone: '+380',
      lastAction: 'дзвінок',
      lastLogin2: '2026-08-25',
      getInTouch: '2026-09-01',
      education: 'вища',
    },
  };

  const ALL = ['matchingCards', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'getInTouch', 'profileDetails'];

  const runOrder = order => {
    const state = createMigrationState({ users: {}, newUsers: JSON.parse(JSON.stringify(SEED)) });
    order.forEach(group => runMigrationGroup(state, group, { getInTouchOwnerUid: OWNER }));
    return state;
  };

  it('картка стрічки не залежить від того, коли натиснули Profiles', () => {
    const expected = {
      name: 'Оля',
      surnameShort: 'К.',
      rh: '+',
      bloodGroup: '2',
      avatar: 'https://p1',
      role: 'sm',
    };

    expect(card(runOrder(ALL), 'P1')).toEqual(expected);
    expect(card(runOrder(['profileDetails', ...ALL.filter(g => g !== 'profileDetails')]), 'P1')).toEqual(expected);
    expect(card(runOrder([...ALL].reverse()), 'P1')).toEqual(expected);
  });

  it('зворотний порядок дає той самий результат у всіх вузлах і той самий залишок', () => {
    const forward = runOrder(ALL);
    const backward = runOrder([...ALL].reverse());

    expect(buildCombinedRootPatch(backward)).toEqual(buildCombinedRootPatch(forward));
    expect(buildCleanedNewUsers(backward)).toEqual(buildCleanedNewUsers(forward));
  });

  it('похідні не видаляють нічого, чим не володіють, навіть коли читають вихідний файл', () => {
    // Джерела похідних читаються з початкової копії — але забирає їх звідти
    // тільки той вузол, якому вони належать. Інакше `Profiles` лишився б без
    // прізвища, а картка виявилась би єдиним місцем, де воно колись було.
    const state = runOrder(['matchingCards']);

    expect(state.workingNewUsers.P1).toMatchObject({
      surname: 'Коваленко',
      blood: '2+',
      photos: ['https://p1', 'https://p2'],
      lastLogin2: '2026-08-25',
    });
  });
});

describe('видалення перенесеного', () => {
  // Питання, яке ставлять до цього інструмента найчастіше: якщо поле поїхало
  // в новий вузол, чому воно й далі лежить у файлі? Відповідь має бути одна —
  // не лежить. Тут це перевіряється по повній анкеті, а не по одному полю.
  const FULL = {
    userId: 'P1',
    name: 'Оля',
    state: 'Донецкая область',
    surname: 'Коваленко',
    phone: '+380',
    lastAction: 'дзвінок',
    language: 'uk',
    accessLevel: 'matching:view&write',
    canCreateProfiles: true,
    multiDataAccessUserIds: { ADMIN_UID: true },
    additionalAccessRules: 'усе видно',
    getInTouch: '2026-09-01',
    writer: 'Ik, ',
    stimulationSchedule: { startDate: '2026-09-01' },
    education: 'вища',
  };

  const ALL_GROUPS = MIGRATION_GROUPS.map(group => group.id);

  const runAll = state => ALL_GROUPS.forEach(
    group => runMigrationGroup(state, group, { ownerUid: OWNER }),
  );

  it('після всіх кнопок у newUsers не лишається нічого, крім адреси запису', () => {
    const state = createMigrationState({ users: {}, newUsers: { P1: { ...FULL } } });
    runAll(state);

    // `userId` не переносить ніхто: він дублює назву вузла. У робочій копії він
    // лишається (інакше повторний прогін вважав би, що анкети немає), а от у
    // файл уже не їде — разом із самою анкетою-оболонкою.
    expect(state.workingNewUsers.P1).toEqual({ userId: 'P1' });
    expect(buildCleanedNewUsers(state)).toEqual({});
  });

  it('те саме видно й по копії users, з якої продовжують наступного разу', () => {
    const state = createMigrationState({ users: { P1: { ...FULL } }, newUsers: {} });
    runAll(state);

    expect(buildCleanedUsers(state)).toEqual({});
    // Сам вихідний файл при цьому недоторканий: `/users` чистить не міграція.
    expect(state.originalUsers.P1).toEqual(FULL);
  });

  it('кожне поле опинилось саме там, куди його вели', () => {
    const state = createMigrationState({ users: {}, newUsers: { P1: { ...FULL } } });
    runAll(state);

    expect(state.targets.matchingCards.P1)
      .toMatchObject({ name: 'Оля', region: 'Донецкая область', surnameShort: 'К.' });
    expect(state.targets.profileContacts.P1).toEqual({ phone: '+380' });
    expect(state.targets.profileWorkflow.P1).toEqual({ lastAction: 'дзвінок' });
    expect(state.targets.profileTechnical.P1).toEqual({
      language: 'uk',
      accessLevel: 'matching:view&write',
      canCreateProfiles: true,
      multiDataAccessUserIds: { ADMIN_UID: true },
      additionalAccessRules: 'усе видно',
    });
    expect(state.targets.profileDetails.P1).toEqual({ surname: 'Коваленко', education: 'вища' });
    expect(state.targets.multiDataPatch.getInTouch[OWNER]).toEqual({ P1: '2026-09-01' });
    expect(state.targets.multiDataPatch.writer[OWNER]).toEqual({ P1: 'Ik, ' });
    expect(state.targets.multiDataPatch.stimulationSchedule[OWNER])
      .toEqual({ P1: { startDate: '2026-09-01' } });
  });
});

describe('ідемпотентність', () => {
  const seed = () => stateWith(
    { P1: { name: 'Оля', surname: 'Коваленко', publish: true, lastLogin2: '2026-08-25' } },
    { P2: { name: 'Ніна', blood: '3-', photos: ['https://p'], role: 'sm', phone: '+380' } },
  );

  it.each(['matchingCards', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'profileDetails'])(
    'повторний запуск %s не змінює ні цілі, ні джерело',
    group => {
      const state = seed();
      runMigrationGroup(state, group);
      const targetsAfterFirst = JSON.stringify(state.targets);
      const workingAfterFirst = JSON.stringify(state.workingNewUsers);

      const second = runMigrationGroup(state, group);

      expect(JSON.stringify(state.targets)).toBe(targetsAfterFirst);
      expect(JSON.stringify(state.workingNewUsers)).toBe(workingAfterFirst);
      expect(second.writes).toHaveLength(0);
      expect(second.deletions).toHaveLength(0);
      expect(second.counters.conflicts).toBe(0);
    },
  );

  it('повний прогін усіх кнопок двічі дає той самий результат', () => {
    const groups = ['matchingCards', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'getInTouch', 'profileDetails'];
    const state = stateWith({}, {
      P1: {
        name: 'Оля',
        surname: 'Коваленко',
        blood: '2+',
        photos: ['https://p'],
        userRole: 'sm',
        publish: true,
        lastLogin2: '2026-08-25',
        phone: '+380',
        lastAction: 'дзвінок',
        getInTouch: '2026-09-01',
        education: 'вища',
        unknownLegacyField: 'лишається',
      },
    });

    groups.forEach(group => runMigrationGroup(state, group, { getInTouchOwnerUid: OWNER }));
    const snapshot = JSON.stringify({ t: state.targets, w: state.workingNewUsers });

    groups.forEach(group => runMigrationGroup(state, group, { getInTouchOwnerUid: OWNER }));
    expect(JSON.stringify({ t: state.targets, w: state.workingNewUsers })).toBe(snapshot);

    // Повне прізвище, повна група і набір фото дочекались своєї кнопки —
    // Profiles забрав їх останнім, уже після того, як стрічка взяла з них
    // ініціал, резус і аватар.
    expect(state.targets.profileDetails.P1).toEqual({
      surname: 'Коваленко',
      blood: '2+',
      photos: ['https://p'],
      education: 'вища',
    });

    // Незнайоме поле лишилось на ручний розгляд — «profileDetails = решта» не
    // сталось. `publish` тут теж лишився: анкета з `newUsers` у стрічку не
    // потрапляє, тож переносити його нема куди, а видаляти — нема підстав.
    expect(state.workingNewUsers.P1).toEqual({
      publish: true,
      unknownLegacyField: 'лишається',
    });
  });
});

describe('безпека видалення', () => {
  it('поле зникає з newUsers тільки тоді, коли план відзвітував успіх саме про нього', () => {
    const state = stateWith({ P1: { height: '168', weight: '58' } }, {
      P1: { height: '170', weight: '58', city: '' },
    });
    const plan = planMigrationGroup(state, 'matchingCards');

    const succeeded = new Set(plan.writes.filter(write => write.origin === 'newUsers').map(write => write.field));
    // `weight` збігся з users — це теж успіх, хоч запису й не було.
    succeeded.add('weight');

    plan.deletions.forEach(deletion => {
      expect(succeeded.has(deletion.field)).toBe(true);
    });
    expect(plan.deletions).toEqual([{ profileId: 'P1', field: 'weight' }]);
  });

  it('нічого не видаляє, поки план не застосований', () => {
    const state = stateWith({}, { P1: { name: 'Оля' } });
    planMigrationGroup(state, 'matchingCards');
    expect(state.workingNewUsers.P1).toEqual({ name: 'Оля' });
  });
});

describe('незмінність users', () => {
  it('жодна кнопка не мутує локальну копію users', () => {
    const users = {
      P1: {
        name: 'Оля',
        surname: 'Коваленко',
        publish: true,
        lastLogin2: '2026-08-25',
        phone: '+380',
        getInTouch: '2026-09-01',
        lastAction: 'дзвінок',
        education: 'вища',
        photos: ['https://p'],
      },
    };
    const before = JSON.parse(JSON.stringify(users));
    const state = createMigrationState({ users, newUsers: { P1: { name: 'Оля' } } });

    ['matchingCards', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'getInTouch', 'profileDetails']
      .forEach(group => runMigrationGroup(state, group, { getInTouchOwnerUid: OWNER }));

    expect(state.originalUsers).toEqual(before);
    expect(users).toEqual(before);
  });
});

describe('рештки обох колекцій', () => {
  // Питання в адміна одне: що не переїхало. Відповідь на нього не можна
  // складати з `cleaned-newUsers` (там тільки одна колекція) і здогадок про
  // `users` (звідти нічого не видаляється, тож файл виглядає незміненим).

  const RICH = {
    name: 'Оля',
    surname: 'Коваленко',
    publish: true,
    lastLogin2: '2026-08-25',
    phone: '+380',
    lastAction: 'дзвінок',
    education: 'вища',
    createdAt2: '2026-01-01',
    щосьНевідоме: 'лишиться',
  };

  const fullRun = state => ['matchingCards', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'profileDetails']
    .forEach(group => runMigrationGroup(state, group, { getInTouchOwnerUid: OWNER }));

  it('показує по users рівно те, чого жодна група не забрала', () => {
    const state = createMigrationState({ users: { P1: { ...RICH } }, newUsers: {} });
    fullRun(state);

    const remaining = buildRemainingUsers(state);

    // Перенесене зникло зі звіту — разом із `publish`, чий сенс тепер
    // виражений `feedDate`, і `lastLogin2`, який забрав profileTechnical.
    ['name', 'surname', 'phone', 'lastAction', 'education', 'createdAt2', 'publish', 'lastLogin2']
      .forEach(field => expect(remaining.P1).not.toHaveProperty(field));
    // ...а невідоме поле лишилось видимим: заради нього звіт і потрібен.
    expect(remaining.P1).toEqual({ щосьНевідоме: 'лишиться' });
  });

  it('не чіпає сам users — залишок рахується по копії', () => {
    const users = { P1: { ...RICH } };
    const before = JSON.parse(JSON.stringify(users));
    const state = createMigrationState({ users, newUsers: {} });
    fullRun(state);

    expect(users).toEqual(before);
    expect(state.originalUsers).toEqual(before);
  });

  it('анкета, з якої забрали все, у звіт не потрапляє', () => {
    const state = createMigrationState({ users: { P1: { name: 'Оля' } }, newUsers: {} });
    runMigrationGroup(state, 'matchingCards');

    expect(buildRemainingUsers(state)).toEqual({});
  });

  it('поле, яке не змогли перенести, лишається в залишку', () => {
    // Конфлікт: картка вже має інше імʼя. Джерело не видаляється — і звіт має
    // сказати про це, інакше вихід «нічого не сталось» не відрізнити від
    // «усе перенеслось».
    const state = createMigrationState({ users: { P1: { name: 'Оля' } }, newUsers: {} });
    state.targets.matchingCards.P1 = { name: 'Інша' };

    runMigrationGroup(state, 'matchingCards');

    expect(buildRemainingUsers(state).P1).toEqual({ name: 'Оля' });
  });

  it('по newUsers звіт збігається з тим, що поїде в базу', () => {
    const state = createMigrationState({ users: {}, newUsers: { N1: { name: 'Ірина', хвіст: 1 } } });
    runMigrationGroup(state, 'matchingCards');

    expect(buildRemainingNewUsers(state)).toEqual({ N1: { хвіст: 1 } });
    expect(buildCleanedNewUsers(state).N1).toEqual({ хвіст: 1 });
  });

  it('не показує значення пароля навіть у залишку', () => {
    const state = createMigrationState({
      users: { P1: { password: 'hunter2', хвіст: 1 } },
      newUsers: { N1: { password: 'hunter2', хвіст: 1 } },
    });

    const dump = JSON.stringify(buildRemaindersExport(state));
    expect(dump).not.toContain('hunter2');
    expect(buildRemainingUsers(state).P1.password).toBe('[не показано]');
    // У файлі на імпорт пароля немає взагалі — ані справжнього, ані
    // заміщеного. Пароль у даних — інцидент, і возити його з файлу у файл
    // означало б множити копії того, чого там бути не мало.
    expect(buildCleanedNewUsers(state).N1).toEqual({ хвіст: 1 });
    expect(JSON.stringify(buildCleanedCollections(state))).not.toContain('hunter2');
  });

  it('віддає обидві колекції одним файлом із підсумком', () => {
    const state = createMigrationState({
      users: { P1: { ...RICH } },
      newUsers: { N1: { name: 'Ірина', хвіст: 1 } },
    });
    fullRun(state);

    const dump = buildRemaindersExport(state);

    expect(dump.users.P1).toBeDefined();
    expect(dump.newUsers.N1).toEqual({ хвіст: 1 });
    expect(dump.summary.users.sourceRecordCount).toBe(1);
    expect(dump.summary.newUsers.remainingKeyCount).toBe(1);
    expect(dump.summary.users.unmappedFieldStats.unknown).toHaveProperty('щосьНевідоме');
    expect(dump.appliedGroups).toContain('matchingCards');
  });

  it('розкладає поля newUsers ще до першого Apply', () => {
    // Файл, викачаний після самих лише Preview, — це нормальний сценарій: саме
    // так адмін вирішує, чи натискати Apply взагалі. Порожня розкладка поруч із
    // чесно порахованими ключами читалась би як «у newUsers нічого немає».
    const state = createMigrationState({
      users: {},
      newUsers: { N1: { name: 'Ірина', щосьНевідоме: 1, deviceWidth: 1080 } },
    });

    const dump = buildRemaindersExport(state);

    expect(dump.appliedGroups).toEqual([]);
    expect(dump.summary.newUsers.remainingKeyCount).toBe(3);
    expect(dump.summary.newUsers.unmappedFieldStats).toEqual({
      mapped: { name: 1 },
      unknown: { щосьНевідоме: 1 },
      excluded: { deviceWidth: 1 },
    });
  });

  it('не кличе людину розбиратись із полями, які мають власне сховище', () => {
    // `myComment` живе в `multiData/comments`, кеш-мітки транзитні за природою.
    // У купці «невідоме» їм робити нічого: це список рішень, а не сміття.
    const state = createMigrationState({
      users: {},
      newUsers: { N1: { myComment: 'подзвонити', __sourceCollection: 'users', localVersion: 3 } },
    });

    const { unknown, excluded } = buildRemaindersExport(state).summary.newUsers.unmappedFieldStats;

    expect(unknown).toEqual({});
    expect(excluded).toEqual({ myComment: 1, __sourceCollection: 1, localVersion: 1 });
  });

  it('не тягне в звіт журнал attitude, але й не ховає самого поля', () => {
    // На бойових даних це 71 анкета і майже третина мегабайта — більше, ніж
    // весь інший залишок разом. У нові вузли поле не їде, а читати звіт крізь
    // нього доводиться.
    const attitude = [{ like: [{ reason: 'perfect', status: true }], userId: 'X' }];
    const state = createMigrationState({
      users: { P1: { attitude, щосьНевідоме: 1 } },
      newUsers: {},
    });

    const remaining = buildRemainingUsers(state);

    expect(remaining.P1.attitude).toBe('[не показано у звіті]');
    expect(remaining.P1.щосьНевідоме).toBe(1);
    expect(JSON.stringify(buildRemaindersExport(state))).not.toContain('perfect');
    // Поле й далі рахується як навмисно виключене — зникло значення, не факт.
    expect(buildRemaindersExport(state).summary.users.unmappedFieldStats.excluded)
      .toMatchObject({ attitude: 1 });
  });

  it('звіт — копія, а не посилання на робочий стан', () => {
    const state = createMigrationState({ users: { P1: { photos: ['https://p'] } }, newUsers: {} });
    const remaining = buildRemainingUsers(state);
    remaining.P1.photos.push('https://зайве');

    expect(state.remainingUsers.P1.photos).toEqual(['https://p']);
  });

  it('рахує залишок обох колекцій у звіті після кожної групи', () => {
    const state = createMigrationState({
      users: { P1: { name: 'Оля', хвіст: 1 } },
      newUsers: { N1: { name: 'Ірина' } },
    });
    runMigrationGroup(state, 'matchingCards');

    expect(state.report.groups.matchingCards.remainingUsersKeys).toBe(1);
    expect(state.report.groups.matchingCards.remainingNewUsersKeys).toBe(0);
    expect(buildMigrationAudit(state).remainingUsers)
      .toEqual({ recordCount: 1, keyCount: 1, identityOnlyRecordCount: 0 });
  });

  it('reset повертає залишок до вихідного файлу', () => {
    const state = createMigrationState({ users: { P1: { name: 'Оля' } }, newUsers: {} });
    runMigrationGroup(state, 'matchingCards');
    expect(buildRemainingUsers(state)).toEqual({});

    const fresh = createMigrationState({ users: state.originalUsers, newUsers: state.originalNewUsers });
    expect(buildRemainingUsers(fresh)).toEqual({ P1: { name: 'Оля' } });
  });
});

describe('звіт і експорт', () => {
  it('пише CRITICAL про пароль і ніколи не показує значення', () => {
    const state = stateWith({ P1: { password: 'hunter2' } }, {});
    const audit = buildMigrationAudit(state);

    expect(audit.securityWarnings).toHaveLength(1);
    expect(audit.securityWarnings[0]).toMatchObject({ severity: 'CRITICAL', field: 'password' });
    expect(JSON.stringify(audit)).not.toContain('hunter2');
  });

  it('combined patch не містить /users', () => {
    const state = stateWith({ P1: { name: 'Оля' } }, {});
    runMigrationGroup(state, 'matchingCards');
    const patch = buildCombinedRootPatch(state);

    expect(Object.keys(patch)).toEqual([
      'matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical', 'multiData',
    ]);
    expect(patch).not.toHaveProperty('users');
    expect(patch.multiData).toEqual({ getInTouch: {}, writer: {}, stimulationSchedule: {} });
  });

  it('рахує залишок у workingNewUsers після кожної групи', () => {
    const state = stateWith({}, { P1: { name: 'Оля', unknownField: 1 } });
    runMigrationGroup(state, 'matchingCards');

    expect(state.report.groups.matchingCards.remainingNewUsersKeys).toBe(1);
    expect(buildMigrationAudit(state).remainingNewUsers)
      .toEqual({ recordCount: 1, keyCount: 1, identityOnlyRecordCount: 0 });
  });

  it('розкладає залишок на відоме, невідоме і навмисно виключене', () => {
    const state = stateWith({}, { P1: { surname: 'К', unknownField: 1, deviceWidth: 1080 } });
    runMigrationGroup(state, 'matchingCards');

    expect(state.report.unmappedFieldStats).toEqual({
      mapped: { surname: 1 },
      unknown: { unknownField: 1 },
      excluded: { deviceWidth: 1 },
    });
  });

  it('cleaned newUsers — копія, а не посилання на робочий стан', () => {
    const state = stateWith({}, { P1: { name: 'Оля' } });
    const cleaned = buildCleanedNewUsers(state);
    cleaned.P1.name = 'змінено';
    expect(state.workingNewUsers.P1.name).toBe('Оля');
  });
});

describe('інвентаризація', () => {
  it('рахує поля, їхні типи і те, чи їх хтось знає', () => {
    const inventory = buildCollectionInventory({
      P1: { name: 'Оля', phone: ['+380'], mystery: null },
      P2: { name: 'Ніна', phone: '+381' },
    });

    expect(inventory.recordCount).toBe(2);
    expect(inventory.uniqueFieldCount).toBe(3);
    expect(inventory.fields).toContainEqual({
      field: 'phone', count: 2, types: { array: 1, string: 1 }, mapped: true, excluded: false,
    });
    expect(inventory.fields).toContainEqual({
      field: 'mystery', count: 1, types: { null: 1 }, mapped: false, excluded: false,
    });
  });
});

describe('Writer', () => {
  it('кладе кожній картці власне значення, а не групує їх під ним', () => {
    // `writer` — це «хто з нею спілкувався», а не властивість жінки: у новій
    // структурі він живе там само, де `getInTouch`, — під власником і під
    // карткою. Групування під значенням не лишилось: воно нічого не давало,
    // а нотатку доводилось правити під ключ бази.
    const state = stateWith({}, {
      P1: { writer: 'Ik, ' },
      P2: { writer: 'Ik, ' },
      P3: { writer: 'T, ' },
    });
    runMigrationGroup(state, 'writer', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'writer')).toEqual({
      [OWNER]: { P1: 'Ik, ', P2: 'Ik, ', P3: 'T, ' },
    });
    ['P1', 'P2', 'P3'].forEach(id => expect(state.workingNewUsers[id]).toEqual({}));
  });

  it('без UID власника не робить нічого', () => {
    const state = stateWith({}, { P1: { writer: 'Ik' } });
    const plan = planMigrationGroup(state, 'writer');

    expect(plan.blocked).toBe('MISSING_OWNER_UID');
    applyMigrationPlan(state, plan);
    expect(state.workingNewUsers.P1).toEqual({ writer: 'Ik' });
  });

  it('не змішується з getInTouch під тим самим власником', () => {
    // Обидва поля лежать під одним UID, і сплутати їх означало б показати
    // «звʼязатись» там, де стоїть ініціал адміна.
    const state = stateWith({}, { P1: { writer: 'Ik', getInTouch: '2026-09-01' } });
    runMigrationGroup(state, 'getInTouch', { ownerUid: OWNER });
    runMigrationGroup(state, 'writer', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'getInTouch')[OWNER]).toEqual({ P1: '2026-09-01' });
    expect(getOwnerValuePatch(state, 'writer')[OWNER]).toEqual({ P1: 'Ik' });
    expect(state.workingNewUsers.P1).toEqual({});
  });

  it('різні значення в двох колекціях — конфлікт, а не два записи', () => {
    const state = stateWith({ P1: { writer: 'Ik' } }, { P1: { writer: 'T' } });
    const plan = runMigrationGroup(state, 'writer', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'writer')[OWNER]).toEqual({ P1: 'Ik' });
    expect(state.workingNewUsers.P1).toEqual({ writer: 'T' });
    expect(plan.conflicts).toHaveLength(1);
  });

  it('значення з забороненим у ключі символом їде як є', () => {
    const state = stateWith({}, { P1: { writer: 'Ik/T' } });
    const plan = runMigrationGroup(state, 'writer', { ownerUid: OWNER });

    expect(getOwnerValuePatch(state, 'writer')[OWNER]).toEqual({ P1: 'Ik/T' });
    expect(plan.warningsByCode).toEqual({});
  });

  it('повторний запуск нічого не додає', () => {
    const state = stateWith({ P1: { writer: 'Ik' } }, { P1: { writer: 'Ik' } });
    runMigrationGroup(state, 'writer', { ownerUid: OWNER });
    const before = JSON.stringify(state.targets.multiDataPatch.writer);

    const second = runMigrationGroup(state, 'writer', { ownerUid: OWNER });
    expect(JSON.stringify(state.targets.multiDataPatch.writer)).toBe(before);
    expect(second.ownerValueWrites).toHaveLength(0);
  });

  it('поле більше не числиться серед незмаплених', () => {
    // Доки в нього не було місця, воно щоразу спливало в купці «розібратись
    // людині» — при тому, що розбиратись там нема з чим.
    const state = stateWith({}, { P1: { writer: 'Ik' } });
    const { mapped, unknown } = buildRemaindersExport(state).summary.newUsers.unmappedFieldStats;

    expect(mapped).toEqual({ writer: 1 });
    expect(unknown).toEqual({});
  });
});

describe('очищені файли', () => {
  it('анкету, від якої лишився сам userId, не показує і не везе далі', () => {
    const state = createMigrationState({
      users: {},
      newUsers: { N1: { userId: 'N1', name: 'Ірина' }, N2: { userId: 'N2', хвіст: 1 } },
    });
    runMigrationGroup(state, 'matchingCards');

    // Оболонка з самим `userId` — це успіх міграції, а не залишок. У самого
    // `userId` в очищеному файлі місця теж немає: він дублює назву вузла.
    expect(buildCleanedNewUsers(state)).toEqual({ N2: { хвіст: 1 } });
    expect(buildRemainingNewUsers(state)).toEqual({ N2: { userId: 'N2', хвіст: 1 } });
    // У самому робочому стані запис лишається — інакше повторний прогін
    // вважав би, що анкети не існує взагалі.
    expect(state.workingNewUsers.N1).toEqual({ userId: 'N1' });
  });

  it('рахує оболонки окремо, щоб їх зникнення не читалось як втрата', () => {
    const state = createMigrationState({
      users: { P1: { userId: 'P1', name: 'Оля' } },
      newUsers: { N1: { userId: 'N1', name: 'Ірина' } },
    });
    runMigrationGroup(state, 'matchingCards');

    const audit = buildMigrationAudit(state);
    expect(audit.remainingNewUsers.identityOnlyRecordCount).toBe(1);
    expect(audit.remainingUsers.identityOnlyRecordCount).toBe(1);
    expect(buildRemaindersExport(state).summary.newUsers.identityOnlyRecordCount).toBe(1);
  });

  it('віддає обидві колекції справжніми значеннями — на відміну від звіту', () => {
    const attitude = [{ like: [{ reason: 'perfect', status: true }], userId: 'X' }];
    const state = createMigrationState({
      users: { P1: { attitude, myComment: 'подзвонити' } },
      newUsers: { N1: { photos: ['https://p'], хвіст: 2 } },
    });

    const cleaned = buildCleanedCollections(state);

    expect(cleaned.kind).toBe(CLEANED_COLLECTIONS_KIND);
    // Звіт заміщає `attitude` позначкою, а файл — просто не везе його далі.
    // Решта значень тут справжні: файл читає інструмент, а не людина, і
    // обрізане значення повернулось би в базу замість справжнього.
    expect(cleaned.newUsers.N1).toEqual({ photos: ['https://p'], хвіст: 2 });
    expect(cleaned.users.P1).toEqual({ myComment: 'подзвонити' });
    expect(buildCleanedUsers(state)).toEqual(cleaned.users);
  });

  it('не везе далі шуму, який ніколи нікуди не поїде', () => {
    // Це рівно те, з чого на бойових даних складається залишок: мертві
    // списки, журнал реакцій, розміри екрана, кеш-мітки і адреса запису.
    const state = createMigrationState({
      users: {},
      newUsers: {
        N1: {
          userId: 'N1',
          id: 'N1',
          collection: 'newUsers',
          __sourceCollection: 'users',
          blackList: ['X'],
          whiteList: ['X'],
          attitude: [{ like: [{ status: true }] }],
          deviceWidth: 360,
          deviceHeight: 718,
          deviceResize: 0.8,
          photo: 'https://p',
          cachedAt: 1770456647255,
          cacheVersion: 3,
          updatedAt: 1770456647255,
          login: '+380',
          password: 'hunter2',
          хвіст: 1,
        },
      },
    });

    expect(buildCleanedNewUsers(state)).toEqual({ N1: { хвіст: 1 } });
  });

  it('ключ із порожнім рядком — це не дані', () => {
    const state = createMigrationState({
      users: {},
      newUsers: {
        N1: { name: '', writer: '  ', photos: [], contacts: { phone: '' }, хвіст: 1 },
        N2: { name: '', telegram: '' },
      },
    });

    // Порожнє значення нікуди не переїхало і не переїде: переносити нема чого,
    // а тягнути ключ із файлу у файл лише заради самого ключа — теж.
    expect(buildCleanedNewUsers(state)).toEqual({ N1: { хвіст: 1 } });
    // Анкета з самих порожніх ключів зникає цілим записом.
    expect(buildCleanedNewUsers(state).N2).toBeUndefined();
  });

  it('делегування лишається навіть порожнім — іншого місця в нього немає', () => {
    // `multiDataSourceUserIds` у нові вузли не їде: правила питають про нього
    // тільки legacy. Прибрати його разом із рештою порожніх ключів означало б
    // зняти делегування залитим назад файлом.
    const state = createMigrationState({
      users: {},
      newUsers: { N1: { multiDataSourceUserIds: { OWNER_UID: true }, godMode: '' } },
    });

    expect(buildCleanedNewUsers(state).N1).toEqual({
      multiDataSourceUserIds: { OWNER_UID: true },
      godMode: '',
    });
  });

  it('перенесені права в очищеному файлі не лишаються', () => {
    // Це і є перевірка видалення перенесеного: після кнопки Technical права
    // лежать у вузлі, а в колекції їх немає — ані в `newUsers`, ані в копії
    // `users`, з якої інструмент продовжує наступного разу.
    const rights = { accessLevel: 'matching:view&write', canCreateProfiles: true };
    const state = createMigrationState({
      users: { P1: { ...rights, хвіст: 1 } },
      newUsers: { N1: { ...rights, хвіст: 1 } },
    });
    runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.N1).toEqual(rights);
    expect(buildCleanedNewUsers(state).N1).toEqual({ хвіст: 1 });
    expect(buildCleanedUsers(state).P1).toEqual({ хвіст: 1 });
  });

  it('каже, що саме прибрало і скільки разів', () => {
    // Без цього рядка «поле поїхало у свій вузол» і «поле викинули як шум»
    // виглядали б однаково: обидва зникають із файлу.
    const state = createMigrationState({
      users: { P1: { cachedAt: 1, хвіст: 1 } },
      newUsers: { N1: { userId: 'N1', photo: '', хвіст: 1 }, N2: { userId: 'N2', photo: '', хвіст: 2 } },
    });

    const { summary } = buildCleanedCollections(state);

    expect(summary.newUsers.droppedFields).toEqual({ userId: 2, photo: 2 });
    expect(summary.users.droppedFields).toEqual({ cachedAt: 1 });
  });

  it('завантажений назад, продовжує з того місця, де скінчили', () => {
    const first = createMigrationState({
      users: { P1: { name: 'Оля', surname: 'Коваленко' } },
      newUsers: { N1: { name: 'Ірина', phone: '+380' } },
    });
    runMigrationGroup(first, 'matchingCards');

    const cleaned = buildCleanedCollections(first);
    const second = createMigrationState({ users: cleaned.users, newUsers: cleaned.newUsers });

    // Перенесене не пропонується вдруге, неперенесене — пропонується.
    expect(second.workingNewUsers.N1).toEqual({ phone: '+380' });
    expect(second.originalUsers.P1).toEqual({ surname: 'Коваленко' });

    runMigrationGroup(second, 'profileContacts');
    expect(second.targets.profileContacts.N1).toEqual({ phone: '+380' });
    expect(buildCleanedNewUsers(second)).toEqual({});
  });
});
