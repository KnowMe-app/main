import {
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
} from '../rtdbMigration';
import {
  deriveSurnameShort,
  deriveRh,
  deriveAvatar,
  deriveRole,
  deriveFeedDate,
  checkGetInTouchKeySafety,
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

  it('приймає обидва, коли вони однакові', () => {
    expect(deriveRole({ userRole: 'ag', role: 'ag' })).toEqual({
      value: 'ag',
      consumed: ['userRole', 'role'],
    });
  });

  it('не вибирає мовчки, коли вони різні', () => {
    expect(deriveRole({ userRole: 'sm', role: 'ed' })).toEqual({
      value: undefined,
      conflict: 'ROLE_CONFLICT',
      consumed: [],
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

describe('getInTouch key safety', () => {
  it('пропускає звичайну дату', () => {
    expect(checkGetInTouchKeySafety('2026-09-01')).toEqual({ safe: true, key: '2026-09-01' });
  });

  it('пропускає legacy 2099-99-99 без «виправлень»', () => {
    expect(checkGetInTouchKeySafety('2099-99-99')).toEqual({ safe: true, key: '2099-99-99' });
  });

  it('пропускає текстове значення з пробілами', () => {
    expect(checkGetInTouchKeySafety(' Теж більше не писати ')).toEqual({
      safe: true,
      key: 'Теж більше не писати',
    });
  });

  it.each(['.', '#', '$', '[', ']', '/'])('відхиляє заборонений символ %s', character => {
    expect(checkGetInTouchKeySafety(`нотатка${character}`)).toMatchObject({
      safe: false,
      reason: 'UNSAFE_GET_IN_TOUCH_KEY',
    });
  });

  it('відхиляє невидимий контрольний символ', () => {
    expect(checkGetInTouchKeySafety('нотатка')).toMatchObject({
      safe: false,
      reason: 'UNSAFE_GET_IN_TOUCH_KEY',
    });
  });

  it('відхиляє порожнє значення', () => {
    expect(checkGetInTouchKeySafety('   ')).toMatchObject({ reason: 'EMPTY_GET_IN_TOUCH_VALUE' });
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

  it('не прибирає жодного з role/userRole, поки вони конфліктують', () => {
    const state = stateWith({}, { P1: { userRole: 'sm', role: 'ed' } });
    const plan = runMigrationGroup(state, 'matchingCards');

    expect(card(state, 'P1')).toBeUndefined();
    expect(state.workingNewUsers.P1).toEqual({ userRole: 'sm', role: 'ed' });
    expect(plan.conflicts).toContainEqual(expect.objectContaining({ reason: 'ROLE_CONFLICT' }));
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

  it('technical не забирає device-, cache- і access-полів', () => {
    const state = stateWith({}, {
      P1: {
        lastLogin: '25.08.2026',
        lastLogin2: '2026-08-25',
        language: 'uk',
        deviceWidth: 1080,
        deviceHeight: 1920,
        deviceResize: true,
        cachedAt: 123,
        accessLevel: 'matching:view',
        canCreateProfiles: true,
      },
    });
    runMigrationGroup(state, 'profileTechnical');

    expect(state.targets.profileTechnical.P1).toEqual({
      lastLogin: '25.08.2026',
      lastLogin2: '2026-08-25',
      language: 'uk',
    });
    expect(state.workingNewUsers.P1).toEqual({
      deviceWidth: 1080,
      deviceHeight: 1920,
      deviceResize: true,
      cachedAt: 123,
      accessLevel: 'matching:view',
      canCreateProfiles: true,
    });
  });
});

describe('GetInTouch', () => {
  it('без owner UID нічого не робить', () => {
    const state = stateWith({}, { P1: { getInTouch: '2026-09-01' } });
    const plan = planMigrationGroup(state, 'getInTouch');

    expect(plan.blocked).toBe('MISSING_GET_IN_TOUCH_OWNER');
    applyMigrationPlan(state, plan);
    expect(state.workingNewUsers.P1).toEqual({ getInTouch: '2026-09-01' });
  });

  it('складає структуру owner/value/profileId, а не owner/profileId/value', () => {
    const state = stateWith({}, {
      P1: { getInTouch: '2026-09-01' },
      P2: { getInTouch: '2026-09-01' },
      P3: { getInTouch: '2099-99-99' },
      P4: { getInTouch: 'Теж більше не писати' },
    });
    runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(state.targets.multiDataPatch.getInTouch).toEqual({
      [OWNER]: {
        '2026-09-01': { P1: true, P2: true },
        '2099-99-99': { P3: true },
        'Теж більше не писати': { P4: true },
      },
    });
    ['P1', 'P2', 'P3', 'P4'].forEach(id => expect(state.workingNewUsers[id]).toEqual({}));
  });

  it('непридатний ключ лишає джерело на місці', () => {
    const state = stateWith({}, { P1: { getInTouch: 'до 01/09' }, P2: { getInTouch: 'а.б' } });
    const plan = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(state.targets.multiDataPatch.getInTouch[OWNER]).toBeUndefined();
    expect(state.workingNewUsers.P1).toEqual({ getInTouch: 'до 01/09' });
    expect(state.workingNewUsers.P2).toEqual({ getInTouch: 'а.б' });
    expect(plan.counters.unsafeKeys).toBe(2);
    expect(plan.warningsByCode.UNSAFE_GET_IN_TOUCH_KEY).toBe(2);
  });

  it('не кладе одну картку під два різні значення', () => {
    const state = stateWith({ P1: { getInTouch: '2026-09-01' } }, { P1: { getInTouch: '2026-10-01' } });
    const plan = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });

    expect(state.targets.multiDataPatch.getInTouch[OWNER]).toEqual({ '2026-09-01': { P1: true } });
    expect(state.workingNewUsers.P1).toEqual({ getInTouch: '2026-10-01' });
    expect(plan.conflicts).toHaveLength(1);
  });

  it('повторний запуск нічого не додає і нічого не міняє', () => {
    const state = stateWith({ P1: { getInTouch: '2026-09-01' } }, { P1: { getInTouch: '2026-09-01' } });
    runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });
    const before = JSON.stringify(state.targets.multiDataPatch.getInTouch);

    const second = runMigrationGroup(state, 'getInTouch', { getInTouchOwnerUid: OWNER });
    expect(JSON.stringify(state.targets.multiDataPatch.getInTouch)).toBe(before);
    expect(second.getInTouchWrites).toHaveLength(0);
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
      users: { P1: { password: 'hunter2' } },
      newUsers: { N1: { password: 'hunter2' } },
    });

    const dump = JSON.stringify(buildRemaindersExport(state));
    expect(dump).not.toContain('hunter2');
    expect(buildRemainingUsers(state).P1.password).toBe('[не показано]');
    // А от файл на імпорт мусить нести справжнє значення: він замінює вузол
    // цілком, і заміщена позначка стерла б людям паролі.
    expect(buildCleanedNewUsers(state).N1.password).toBe('hunter2');
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
    expect(buildMigrationAudit(state).remainingUsers).toEqual({ recordCount: 1, keyCount: 1 });
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
    expect(patch.multiData).toEqual({ getInTouch: {} });
  });

  it('рахує залишок у workingNewUsers після кожної групи', () => {
    const state = stateWith({}, { P1: { name: 'Оля', unknownField: 1 } });
    runMigrationGroup(state, 'matchingCards');

    expect(state.report.groups.matchingCards.remainingNewUsersKeys).toBe(1);
    expect(buildMigrationAudit(state).remainingNewUsers).toEqual({ recordCount: 1, keyCount: 1 });
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
