/**
 * Правила бази перевіряються емулятором, а не читанням очима.
 *
 * Мова правил не має ані функцій, ані тестів, і кожна умова тут — довгий
 * ланцюг `||` з підрядковими перевірками рівня доступу. Помилка в такому
 * ланцюгу не падає: вона або тихо відкриває зайве, або тихо закриває потрібне,
 * і виявляється це вже на живих даних. Тому кожна межа доступу з ТЗ описана
 * тут сценарієм: хто саме, що саме і чи має право.
 *
 * Запуск: npm run test:rules
 * (firebase emulators:exec піднімає локальну базу і віддає їй database.rules.json)
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import fs from 'node:fs';
import { ref, get, set, update, remove, query, orderByChild, orderByKey, orderByValue, startAt, endAt, limitToFirst, limitToLast } from 'firebase/database';

const SUPERADMIN = '0ghb1LphfASV0Y3b6J010v4CDyD2';
const MATCHING_VIEWER = 'matchingViewerUid0000000000';
const MATCHING_EDITOR = 'matchingEditorUid0000000000';
const CONTACTS_VIEWER = 'contactsViewerUid0000000000';
const DELEGATED_READER = 'delegatedReaderUid000000000';
const PROFILE_OWNER = 'profileOwnerUid00000000000';
const OUTSIDER = 'outsiderUid000000000000000';
// Звичайна донорка: роль `ed`, жодних прав адміністрування.
const SELF_SERVE = 'selfServeUid00000000000000';
// Адмін, чиї права вже переїхали: у legacy-колекціях про його доступ нічого
// немає, усе лежить у `profileTechnical`. Саме так виглядатиме кожен адмін
// після міграції, тож саме тут перевіряється, що доступ від переїзду не зник.
const MIGRATED_EDITOR = 'migratedEditorUid0000000000';
// Звичайний користувач матчингу: зареєструвався з екрана входу як агенція
// (`userRole: 'ag'`), жодного рівня доступу йому ніхто не видавав. Саме такий
// акаунт бачить стрічку — і саме на ньому перевіряється, що поза стрічкою він
// не бачить нічого, крім картки.
const ORDINARY_VIEWER = 'ordinaryViewerUid000000000';

const CARD = 'someOtherProfileId000000000';
// Анкета без ключа стрічки: картка є, але в стрічку не потрапляє.
const HIDDEN_CARD = 'hiddenProfileId00000000000';

const host = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9099';
const [emulatorHost, emulatorPort] = host.split(':');

const results = [];
let failures = 0;

const it = async (name, body) => {
  try {
    await body();
    results.push(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`  FAIL ${name}\n       ${error?.message || error}`);
  }
};

const describe = name => results.push(`\n${name}`);

const testEnv = await initializeTestEnvironment({
  projectId: 'demo-knowme-rules',
  database: {
    rules: fs.readFileSync('database.rules.json', 'utf8'),
    host: emulatorHost,
    port: Number(emulatorPort),
  },
});

/**
 * Дані сіються повз правила — інакше сам сів даних довелося б робити тим самим
 * доступом, який ці тести й перевіряють.
 */
await testEnv.withSecurityRulesDisabled(async context => {
  const db = context.database();
  await set(ref(db, 'users'), {
    [SUPERADMIN]: { name: 'Супер' },
    [MATCHING_VIEWER]: { name: 'Переглядач', accessLevel: 'matching:view' },
    [MATCHING_EDITOR]: { name: 'Редактор', accessLevel: 'matching:view&write' },
    [CONTACTS_VIEWER]: { name: 'Контакти', accessLevel: 'matching+profileContacts:view&write' },
    [DELEGATED_READER]: { name: 'Делегат', multiDataSourceUserIds: { [SUPERADMIN]: true } },
    [PROFILE_OWNER]: { name: 'Власниця', userRole: 'ed' },
    [OUTSIDER]: { name: 'Стороння', userRole: 'ed' },
    [SELF_SERVE]: { name: 'Донорка', userRole: 'ed' },
    [ORDINARY_VIEWER]: { name: 'Агенція', userRole: 'ag' },
    [CARD]: { name: 'Картка' },
    [HIDDEN_CARD]: { name: 'Прихована', publish: false },
  });
  await set(ref(db, 'matchingCards'), {
    [CARD]: { name: 'Картка', surnameShort: 'К.', feedDate: '2026-08-25' },
    [PROFILE_OWNER]: { name: 'Власниця', feedDate: '2026-08-20' },
    // Ключа стрічки немає — анкети немає і в стрічці.
    [HIDDEN_CARD]: { name: 'Прихована', surnameShort: 'П.', city: 'Київ' },
  });
  await set(ref(db, 'profileDetails'), {
    [CARD]: { surname: 'Коваленко', blood: '2+' },
    [HIDDEN_CARD]: { surname: 'Приховайло', blood: '3+' },
  });
  await set(ref(db, 'profileContacts'), {
    [CARD]: { phone: ['+380'], email: 'a@b.c' },
    [HIDDEN_CARD]: { phone: ['+380990000000'], email: 'hidden@b.c' },
  });
  await set(ref(db, 'profileWorkflow'), { [CARD]: { lastAction: 'дзвінок', cycleStatus: 'active' } });
  await set(ref(db, 'profileTechnical'), {
    [CARD]: { lastLogin2: '2026-08-25' },
    [PROFILE_OWNER]: { lastLogin2: '2026-08-20' },
    // Права після міграції: у legacy цього акаунта немає взагалі.
    [MIGRATED_EDITOR]: { accessLevel: 'matching:view&write', canCreateProfiles: true },
  });
  await set(ref(db, 'multiData/getInTouch'), {
    [SUPERADMIN]: { [CARD]: '2026-09-01', [PROFILE_OWNER]: '2026-08-20' },
  });
  await set(ref(db, 'multiData/writer'), {
    [SUPERADMIN]: { [CARD]: 'Ik, ' },
  });
  await set(ref(db, 'multiData/stimulationSchedule'), {
    [SUPERADMIN]: { [CARD]: { startDate: '2026-09-01' } },
  });
});

const db = uid => testEnv.authenticatedContext(uid).database();

describe('matchingCards / profileDetails — аудиторія матчингу');

await it('матчинговий переглядач читає картки стрічки', () =>
  assertSucceeds(get(ref(db(MATCHING_VIEWER), `matchingCards/${CARD}`))));

await it('матчинговий переглядач читає деталі анкети', () =>
  assertSucceeds(get(ref(db(MATCHING_VIEWER), `profileDetails/${CARD}`))));

await it('звичайний користувач може точково прочитати опубліковану проєкцію', () =>
  assertSucceeds(get(ref(db(OUTSIDER), `matchingCards/${CARD}`))));

await it('звичайний користувач не може точково читати неопубліковану проєкцію', async () => {
  await testEnv.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `matchingCards/${CARD}/feedDate`), null));
  await assertFails(get(ref(db(OUTSIDER), `matchingCards/${CARD}`)));
  await testEnv.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `matchingCards/${CARD}/feedDate`), '2026-08-25'));
});

await it('редактор може прочитати неопубліковану проєкцію перед синхронізацією', async () => {
  await testEnv.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `matchingCards/${CARD}/feedDate`), null));
  await assertSucceeds(get(ref(db(MIGRATED_EDITOR), `matchingCards/${CARD}`)));
  await testEnv.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `matchingCards/${CARD}/feedDate`), '2026-08-25'));
});

await it('суперадмін читає всю колекцію для очищення індексу', () =>
  assertSucceeds(get(ref(db(SUPERADMIN), 'matchingCards'))));

await it('кожен авторизований користувач читає стрічку опублікованих карток', () =>
  assertSucceeds(get(query(
    ref(db(OUTSIDER), 'matchingCards'),
    orderByChild('feedDate'),
    startAt(''),
    endAt('9999-12-31'),
    limitToLast(10),
  ))));

// Ховати контакти сьогодні не треба: їх читає та сама аудиторія, що й картки
// стрічки. Цінність окремого вузла в іншому — доступ до нього описаний одним
// власним правилом, тож звузити його до окремої категорії людей можна, не
// чіпаючи ані анкети, ані стрічки. Токен `profileContacts` — уже готовий для
// цього гвинт.
describe('profileContacts — відкриті, але з власним правилом');

await it('матчинговий переглядач читає контакти', () =>
  assertSucceeds(get(ref(db(MATCHING_VIEWER), `profileContacts/${CARD}`))));

await it('власник токена profileContacts теж читає', () =>
  assertSucceeds(get(ref(db(CONTACTS_VIEWER), `profileContacts/${CARD}`))));

await it('стороння без матчингу контактів не читає', () =>
  assertFails(get(ref(db(OUTSIDER), `profileContacts/${CARD}`))));

await it('матчинговий редактор пише контакти — так само, як редагував анкету', () =>
  assertSucceeds(set(ref(db(MATCHING_EDITOR), `profileContacts/${CARD}/telegram`), '@x')));

await it('матчинговий переглядач без view&write контактів не пише', () =>
  assertFails(set(ref(db(MATCHING_VIEWER), `profileContacts/${CARD}/telegram`), '@nope')));

await it('перелічити контакти цілою колекцією може тільки суперадмін', async () => {
  await assertFails(get(ref(db(CONTACTS_VIEWER), 'profileContacts')));
  await assertFails(get(ref(db(MATCHING_EDITOR), 'profileContacts')));
  // Суперадміну колекція потрібна рівно для перебудови індексів: індекс
  // будується з тих самих вузлів, з яких читає застосунок.
  await assertSucceeds(get(ref(db(SUPERADMIN), 'profileContacts')));
});

await it('перебудова індексів читає всі пʼять вузлів цілком', async () => {
  for (const node of ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical']) {
    await assertSucceeds(get(ref(db(SUPERADMIN), node)));
  }
});

await it('правило контактів окреме — звузити його можна, не чіпаючи стрічки', () => {
  // Саме заради цього вузол і виділявся: `profileContacts` має власний `.read`,
  // не успадкований від `matchingCards`, тож обмеження до окремої категорії
  // людей — це правка одного рядка, а не переїзд даних.
  const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8')).rules;
  if (!rules.profileContacts.$uid['.read']) throw new Error('немає власного .read');
  if (rules.profileContacts.$uid['.read'] === rules.matchingCards['.read']) {
    throw new Error('правило контактів не має бути тим самим обʼєктом, що й у стрічки');
  }
  if (rules.profileContacts['.read'].includes('accessLevel')) {
    throw new Error('колекцію цілком читає тільки суперадмін');
  }
  if (!rules.profileContacts.$uid['.write'].includes("contains('profileContacts')")) {
    throw new Error('токен звуження зник із правила запису');
  }
});

describe('власниця анкети');

await it('читає власні контакти', () =>
  assertSucceeds(get(ref(db(PROFILE_OWNER), `profileContacts/${PROFILE_OWNER}`))));

await it('читає власні технічні дані', () =>
  assertSucceeds(get(ref(db(PROFILE_OWNER), `profileTechnical/${PROFILE_OWNER}`))));

await it('читає власну картку стрічки, щоб знати стан публікації', () =>
  assertSucceeds(get(ref(db(PROFILE_OWNER), `matchingCards/${PROFILE_OWNER}`))));

await it('не читає технічних даних чужої картки', () =>
  assertFails(get(ref(db(PROFILE_OWNER), `profileTechnical/${CARD}`))));

describe('profileTechnical — власник і суперадміни, більше ніхто');

await it('матчинговий переглядач не читає технічних даних чужої картки', () =>
  assertFails(get(ref(db(MATCHING_VIEWER), `profileTechnical/${CARD}`))));

await it('суперадмін читає технічні дані', () =>
  assertSucceeds(get(ref(db(SUPERADMIN), `profileTechnical/${CARD}`))));

await it('device-поля не приймаються навіть від суперадміна', () =>
  assertFails(set(ref(db(SUPERADMIN), `profileTechnical/${CARD}/deviceWidth`), 1080)));

await it('пароль не приймається в технічний вузол', () =>
  assertFails(set(ref(db(SUPERADMIN), `profileTechnical/${CARD}/password`), 'x')));

describe('profileWorkflow — внутрішні дані');

await it('матчинговий редактор читає workflow', () =>
  assertSucceeds(get(ref(db(MATCHING_EDITOR), `profileWorkflow/${CARD}`))));

await it('матчинговий переглядач без view&write workflow не читає', () =>
  assertFails(get(ref(db(MATCHING_VIEWER), `profileWorkflow/${CARD}`))));

await it('getInTouch не можна покласти у workflow', () =>
  assertFails(set(ref(db(SUPERADMIN), `profileWorkflow/${CARD}/getInTouch`), '2026-09-01')));

await it('publish не можна покласти у workflow', () =>
  assertFails(set(ref(db(SUPERADMIN), `profileWorkflow/${CARD}/publish`), true)));

describe('multiData/getInTouch — власник, делегат і решта');

await it('власник читає власні позначки', () =>
  assertSucceeds(get(ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}`))));

await it('власник пише позначку під карткою', () =>
  assertSucceeds(set(ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}/${CARD}`), '2026-10-01')));

await it('делегований читач читає позначки власника', () =>
  assertSucceeds(get(ref(db(DELEGATED_READER), `multiData/getInTouch/${SUPERADMIN}`))));

await it('делегований читач НЕ пише у позначки власника', () =>
  assertFails(set(ref(db(DELEGATED_READER), `multiData/getInTouch/${SUPERADMIN}/${CARD}`), '2026-10-01')));

await it('стороння не читає чужих позначок', () =>
  assertFails(get(ref(db(OUTSIDER), `multiData/getInTouch/${SUPERADMIN}`))));

await it('позначка — рядок, а не структура', () =>
  assertFails(set(ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}/${CARD}`), { date: '2026-10-01' })));

await it('база сортує позначки за значенням — індекс на місці', async () => {
  const rows = [];
  const snapshot = await get(query(
    ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}`),
    orderByValue(),
    startAt('2026-01-01'),
    limitToFirst(10),
  ));
  snapshot.forEach(child => {
    rows.push([child.key, child.val()]);
  });
  // Порядок саме за датою: без `.indexOn: ".value"` запит відповів би
  // «Index not defined», а не відсортованим списком.
  const dates = rows.map(([, value]) => value);
  if (dates.length < 2) throw new Error(`очікували щонайменше дві позначки, отримали ${dates.length}`);
  const sorted = [...dates].sort();
  if (dates.join() !== sorted.join()) throw new Error(`не відсортовано: ${dates.join()}`);
});

describe('multiData/writer — та сама аудиторія, що й у getInTouch');

await it('власник читає власні позначки способу звʼязку', () =>
  assertSucceeds(get(ref(db(SUPERADMIN), `multiData/writer/${SUPERADMIN}`))));

await it('власник пише позначку під карткою — зі скороченням, яке ключем бути не могло', () =>
  assertSucceeds(set(ref(db(SUPERADMIN), `multiData/writer/${SUPERADMIN}/${CARD}`), 'Ik/T, 01.09')));

await it('делегований читач читає позначки власника', () =>
  assertSucceeds(get(ref(db(DELEGATED_READER), `multiData/writer/${SUPERADMIN}`))));

await it('делегований читач НЕ пише у позначки власника', () =>
  assertFails(set(ref(db(DELEGATED_READER), `multiData/writer/${SUPERADMIN}/${CARD}`), 'T')));

await it('стороння не читає чужих позначок', () =>
  assertFails(get(ref(db(OUTSIDER), `multiData/writer/${SUPERADMIN}`))));

describe('права після переїзду в profileTechnical');

await it('адмін із правами лише в profileTechnical читає стрічку', () =>
  assertSucceeds(get(ref(db(MIGRATED_EDITOR), `matchingCards/${CARD}`))));

await it('він же редагує картку', () =>
  assertSucceeds(set(ref(db(MIGRATED_EDITOR), `matchingCards/${CARD}/city`), 'Львів')));

await it('він же редагує деталі анкети', () =>
  assertSucceeds(set(ref(db(MIGRATED_EDITOR), `profileDetails/${CARD}/education`), 'вища')));

await it('він же редагує контакти', () =>
  assertSucceeds(set(ref(db(MIGRATED_EDITOR), `profileContacts/${CARD}/phone`), '+380')));

await it('він же створює анкету через profileMutations', () =>
  assertSucceeds(set(
    ref(db(MIGRATED_EDITOR), `multiData/profileMutations/${MIGRATED_EDITOR}/${CARD}`),
    {
      cardId: CARD,
      operation: 'update',
      createdBy: MIGRATED_EDITOR,
      status: 'draft',
      revision: 1,
    },
  )));

await it('стороння без прав ніде так не може', () =>
  assertFails(set(ref(db(OUTSIDER), `matchingCards/${CARD}/city`), 'Львів')));

await it('profileTechnical приймає права акаунта', () =>
  assertSucceeds(set(
    ref(db(SUPERADMIN), `profileTechnical/${CARD}/accessLevel`),
    'matching:view',
  )));

await it('profileTechnical приймає й делегування читання чужого multiData', () =>
  assertSucceeds(set(
    ref(db(SUPERADMIN), `profileTechnical/${CARD}/multiDataSourceUserIds`),
    { [SUPERADMIN]: true },
  )));

await it('profileTechnical і далі не приймає ані пароля, ані godMode', async () => {
  await assertFails(set(ref(db(SUPERADMIN), `profileTechnical/${CARD}/password`), 'x'));
  await assertFails(set(ref(db(SUPERADMIN), `profileTechnical/${CARD}/godMode`), true));
});

await it('делегування з profileTechnical відкриває чужі позначки', async () => {
  const DELEGATE = 'technicalDelegateUid000000';
  await testEnv.withSecurityRulesDisabled(async context => {
    await set(
      ref(context.database(), `profileTechnical/${DELEGATE}/multiDataSourceUserIds/${SUPERADMIN}`),
      true,
    );
  });
  // У legacy про цього читача не сказано нічого — право лежить тільки в новому
  // вузлі, і саме його правило й мусить побачити.
  await assertSucceeds(get(ref(db(DELEGATE), `multiData/getInTouch/${SUPERADMIN}`)));
});

describe('multiData/stimulationSchedule — той самий власник, але значення значенням');

await it('власник читає власні графіки', () =>
  assertSucceeds(get(ref(db(SUPERADMIN), `multiData/stimulationSchedule/${SUPERADMIN}`))));

await it('власник пише графік під анкету', () =>
  assertSucceeds(set(
    ref(db(SUPERADMIN), `multiData/stimulationSchedule/${SUPERADMIN}/${CARD}`),
    { startDate: '2026-10-01', rows: [{ date: '2026-10-01' }] },
  )));

await it('делегований читач читає графіки власника', () =>
  assertSucceeds(get(ref(db(DELEGATED_READER), `multiData/stimulationSchedule/${SUPERADMIN}`))));

await it('делегований читач НЕ пише у графіки власника', () =>
  assertFails(set(
    ref(db(DELEGATED_READER), `multiData/stimulationSchedule/${SUPERADMIN}/${CARD}`),
    { startDate: '2026-10-01' },
  )));

await it('стороння не читає чужих графіків', () =>
  assertFails(get(ref(db(OUTSIDER), `multiData/stimulationSchedule/${SUPERADMIN}`))));

describe('matchingCards — що взагалі можна покласти в картку');

await it('phone у картку не приймається', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/phone`), '+380')));

await it('email у картку не приймається', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/email`), 'a@b.c')));

await it('street у картку не приймається', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/street`), 'вул. Тестова')));

await it('accessLevel у картку не приймається', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/accessLevel`), 'matching:view')));

await it('довільне невідоме поле у картку не приймається', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/somethingNew`), 'x')));

await it('rh приймає лише + або -', async () => {
  await assertSucceeds(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/rh`), '+'));
  await assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/rh`), '2+'));
});

await it('surnameShort не приймає повного прізвища', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/surnameShort`),
    'ДужеДовгеПрізвищеЯкеТочноНеІніціал')));

// Найважливіша перевірка розгортання: те, що пише писач, має проходити
// правила цілком, одним записом. Якби бодай одне поле випало з переліку,
// кожне збереження анкети падало б одразу після деплою правил.
await it('повна проєкція писача лягає одним записом', () =>
  assertSucceeds(set(ref(db(SUPERADMIN), `matchingCards/${CARD}`), {
    name: 'Катерина', surnameShort: 'К.', birth: '15.07.1995',
    city: 'Київ', region: 'Київська', country: 'Україна', role: 'sm',
    height: '168', weight: '58', bmi: '20.5', rh: '+', bloodGroup: '2',
    ownKids: '2', csection: '0', lastDelivery: '2022-05-15',
    maritalStatus: 'No', experience: '2', eyeColor: 'Green',
    hairColor: 'Dark Brown', avatar: 'https://a', feedDate: '2026-08-25',
  })));

await it('сирі поля, що переїхали в інші вузли, картка вже не приймає', async () => {
  for (const [field, value] of [
    ['surname', 'Коваленко'],
    ['blood', '2+'],
    ['getInTouch', '2026-09-01'],
    ['lastAction', 'дзвінок'],
    ['lastLogin2', '2026-08-25'],
    ['contacts', 'phone,email'],
    ['userRole', 'sm'],
    ['feedUsers', '2026-08-25'],
    // Службові поля проєкції теж пішли: усі картки перебудовані, тож версія
    // схеми більше нічого не розрізняє; заповненість прибрано разом із
    // фільтром; а колекцію називає формат id.
    ['v', 5],
    ['fieldsCount', 42],
    ['source', 'users'],
  ]) {
    await assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/${field}`), value));
  }
});

await it('bloodGroup приймає лише номер групи', async () => {
  await assertSucceeds(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/bloodGroup`), '2'));
  await assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/bloodGroup`), '2+'));
  await assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/bloodGroup`), '5'));
});

describe('розкладка збереженої анкети по вузлах');

await it('власниця анкети розкладає власні дані по всіх своїх вузлах', async () => {
  const db1 = db(PROFILE_OWNER);
  await assertSucceeds(update(ref(db1, '/'), {
    [`profileContacts/${PROFILE_OWNER}/phone`]: '+380',
  }));
  await assertSucceeds(update(ref(db1, '/'), {
    [`profileDetails/${PROFILE_OWNER}/surname`]: 'Власна',
  }));
  await assertSucceeds(update(ref(db1, '/'), {
    [`profileTechnical/${PROFILE_OWNER}/language`]: 'uk',
  }));
});

await it('редактор матчингу пише деталі й контакти, але не технічне', async () => {
  const db1 = db(MATCHING_EDITOR);
  await assertSucceeds(update(ref(db1, '/'), { [`profileDetails/${CARD}/surname`]: 'Коваленко' }));
  await assertSucceeds(update(ref(db1, '/'), { [`profileContacts/${CARD}/phone`]: '+380' }));
  await assertSucceeds(update(ref(db1, '/'), { [`profileWorkflow/${CARD}/lastAction`]: 'дзвінок' }));
  // Технічні дані чужої анкети — тільки власник і суперадміни.
  await assertFails(update(ref(db1, '/'), { [`profileTechnical/${CARD}/language`]: 'uk' }));
});

await it('відмова на одному вузлі не тягне за собою решту', async () => {
  // Саме тому розкладка йде вузол за вузлом: в одному патчі ці два шляхи
  // впали б разом, і закрите право на технічне знеструмило б `profileDetails`.
  const db1 = db(MATCHING_EDITOR);
  await assertFails(update(ref(db1, '/'), {
    [`profileDetails/${CARD}/education`]: 'вища',
    [`profileTechnical/${CARD}/language`]: 'uk',
  }));
  await assertSucceeds(update(ref(db1, '/'), { [`profileDetails/${CARD}/education`]: 'вища' }));
});

await it('видалення поля доїжджає до нового вузла', async () => {
  await assertSucceeds(update(ref(db(SUPERADMIN), '/'), { [`profileContacts/${CARD}/telegram`]: null }));
  await testEnv.withSecurityRulesDisabled(async context => {
    const snapshot = await get(ref(context.database(), `profileContacts/${CARD}/telegram`));
    if (snapshot.exists()) throw new Error('telegram лишився після видалення');
  });
});

describe('feedDate — публікація і зняття з публікації');

await it('видалення feedDate знімає картку зі стрічки', async () => {
  await assertSucceeds(remove(ref(db(SUPERADMIN), `matchingCards/${CARD}/feedDate`)));
  await testEnv.withSecurityRulesDisabled(async context => {
    const snapshot = await get(ref(context.database(), `matchingCards/${CARD}/feedDate`));
    if (snapshot.exists()) throw new Error('feedDate лишився після видалення');
  });
});

await it('публікація — це запис самої лише дати', () =>
  assertSucceeds(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/feedDate`), '2026-08-26')));

await it('feedDate має бути рядком', () =>
  assertFails(set(ref(db(SUPERADMIN), `matchingCards/${CARD}/feedDate`), 20260826)));

// Застосунок має жити без адміністрування: людина заводить анкету, публікує
// її, ховає — і все це без жодного погодження. Кожен крок тут — те, що робить
// сама користувачка зі своєю анкетою.
describe('самообслуговування: анкета живе без адміна');

await it('заводить власну картку стрічки', () =>
  assertSucceeds(update(ref(db(SELF_SERVE), '/'), {
    [`matchingCards/${SELF_SERVE}/name`]: 'Донорка',
    [`matchingCards/${SELF_SERVE}/birth`]: '01.01.1995',
    [`matchingCards/${SELF_SERVE}/surnameShort`]: 'Д.',
  })));

await it('публікує себе — це запис однієї дати', () =>
  assertSucceeds(set(ref(db(SELF_SERVE), `matchingCards/${SELF_SERVE}/feedDate`), '2026-08-26')));

await it('ховається — це видалення тієї самої дати', () =>
  assertSucceeds(remove(ref(db(SELF_SERVE), `matchingCards/${SELF_SERVE}/feedDate`))));

await it('заповнює власні деталі, контакти й технічне', async () => {
  await assertSucceeds(set(ref(db(SELF_SERVE), `profileDetails/${SELF_SERVE}/surname`), 'Донорченко'));
  await assertSucceeds(set(ref(db(SELF_SERVE), `profileContacts/${SELF_SERVE}/phone`), '+380'));
  await assertSucceeds(set(ref(db(SELF_SERVE), `profileTechnical/${SELF_SERVE}/lastLogin2`), '2026-08-26'));
});

await it('індексує власну анкету — і старі значення, і нові', async () => {
  // Пошук по контакту тримається на цих індексах. Якби їх могла писати лише
  // адміністрація, самостійно заведена анкета не знаходилась би взагалі.
  await assertSucceeds(set(ref(db(SELF_SERVE), `searchKey/users/role/ed/${SELF_SERVE}`), true));
  await assertSucceeds(set(ref(db(SELF_SERVE), `searchId/380671112233`), SELF_SERVE));
  // Старе значення лишається в індексі поруч із новим: змінена пошта — не
  // зникла пошта, анкету шукають і ті, хто знає лише старий контакт.
  await assertSucceeds(set(ref(db(SELF_SERVE), `searchId/380500000000`), SELF_SERVE));
});

describe('searchId — точковий резолв усім, перелік індексу тільки адміну');

await it('будь-хто авторизований читає один ключ індексу', async () => {
  // На цьому тримається і пошук, і стрілка «відкрити запис searchId» у формі:
  // ключ будується з самого значення, тож перелік вузла для цього не потрібен.
  await assertSucceeds(get(ref(db(SELF_SERVE), 'searchId/380671112233')));
  await assertSucceeds(get(ref(db(MATCHING_EDITOR), 'searchId/380671112233')));
});

await it('перелічити індекс цілим вузлом може тільки суперадмін', async () => {
  // Індекс називає чужі контакти, тож його перелік — це та сама чутливість,
  // що й `profileContacts`, і та сама аудиторія.
  await assertFails(get(ref(db(SELF_SERVE), 'searchId')));
  await assertFails(get(ref(db(MATCHING_EDITOR), 'searchId')));
  await assertSucceeds(get(ref(db(SUPERADMIN), 'searchId')));
});

await it('сканування по префіксу ключа доступне адміну — і тільки йому', async () => {
  // Це запит, яким пошук розширює точний збіг по префіксу ключа. Стрілка
  // в анкеті сканування не робить — вона читає готовий ключ, тож працює
  // і без цього права.
  const scan = uid => query(
    ref(db(uid), 'searchId'),
    orderByKey(),
    startAt('3805'),
    endAt('3805\uf8ff'),
  );

  await assertFails(get(scan(MATCHING_EDITOR)));
  await assertSucceeds(get(scan(SUPERADMIN)));
});

await it('не може підмінити чужу картку', () =>
  assertFails(set(ref(db(SELF_SERVE), `matchingCards/${CARD}/feedDate`), '2026-08-26')));

// Це і є перевірка на життя без `/users`: анкета, яка існує лише в нових
// вузлах, мусить мати право на картку. Стара умова питала саме legacy — тож
// після зникнення колекції жодна картка не записалась би взагалі, і стрічка
// перестала б оновлюватись з першого ж збереження.
await it('картка законна, коли анкета живе лише в нових вузлах', async () => {
  await assertSucceeds(set(ref(db(SELF_SERVE), `profileTechnical/${SELF_SERVE}/createdAt2`), '2026-08-27'));
  await assertSucceeds(set(ref(db(SELF_SERVE), `matchingCards/${SELF_SERVE}/feedDate`), '2026-08-27'));
});

await it('картка без анкети де-небудь лишається неможливою', () =>
  // Привид у вузлі стрічки — це картка, за якою нічого немає: вона показується,
  // відкрити її нема куди.
  assertFails(set(ref(db(SUPERADMIN), 'matchingCards/nobodyAtAllUid00000000/name'), 'Привид')));

await it('відгук користувача видно всім авторизованим', async () => {
  await assertSucceeds(set(ref(db(SELF_SERVE), `comments/${CARD}/c1`), {
    text: 'відгук', authorId: SELF_SERVE, createdAt: 1, visibility: 'public',
  }));
  await assertSucceeds(get(ref(db(OUTSIDER), `comments/${CARD}`)));
  await assertSucceeds(get(ref(db(MATCHING_VIEWER), `comments/${CARD}`)));
});

await it('чужий відгук підмінити не можна', () =>
  assertFails(set(ref(db(OUTSIDER), `comments/${CARD}/c1`), {
    text: 'підміна', authorId: OUTSIDER, createdAt: 2, visibility: 'public',
  })));

// Публічний запис про третю особу мусить мати кому зняти: інакше єдиний спосіб
// прибрати наклеп — писати розробникам.
await it('стороння людина чужий відгук не знімає', () =>
  assertFails(remove(ref(db(OUTSIDER), `comments/${CARD}/c1`))));

await it('адмін правит текст чужого відгуку, не чіпаючи авторства', async () => {
  await assertSucceeds(update(ref(db(SUPERADMIN), `comments/${CARD}/c1`), {
    text: 'відредаговано адміном', updatedAt: 3,
  }));
  await assertFails(update(ref(db(SUPERADMIN), `comments/${CARD}/c1`), {
    authorId: SUPERADMIN,
  }));
});

await it('адмін знімає чужий відгук', () =>
  assertSucceeds(remove(ref(db(SUPERADMIN), `comments/${CARD}/c1`))));

await it('автор знімає власний відгук', async () => {
  await assertSucceeds(set(ref(db(SELF_SERVE), `comments/${CARD}/c2`), {
    text: 'передумала', authorId: SELF_SERVE, createdAt: 4, visibility: 'public',
  }));
  await assertSucceeds(remove(ref(db(SELF_SERVE), `comments/${CARD}/c2`)));
});

describe('історія пошуку — один ряд на запит');

await it('власниця пише запит із ключем від тексту', () =>
  assertSucceeds(set(ref(db(SELF_SERVE), `multiData/searchQueries/${SELF_SERVE}/армандо`), {
    query: 'Армандо', createdAt: 1, updatedAt: 2, count: 3,
  })));

await it('стара форма — просто рядок — лишається дійсною', () =>
  assertSucceeds(set(ref(db(SELF_SERVE), `multiData/searchQueries/${SELF_SERVE}/марія`), 'Марія')));

await it('зайве поле в ряді історії не проходить', () =>
  assertFails(set(ref(db(SELF_SERVE), `multiData/searchQueries/${SELF_SERVE}/оксана`), {
    query: 'Оксана', updatedAt: 2, ownerNote: 'зайве',
  })));

await it('ряд без тексту запиту не проходить', () =>
  assertFails(set(ref(db(SELF_SERVE), `multiData/searchQueries/${SELF_SERVE}/пусто`), {
    updatedAt: 2, count: 1,
  })));

await it('чужу історію пошуку сторонній не пише і не читає', async () => {
  await assertFails(set(ref(db(OUTSIDER), `multiData/searchQueries/${SELF_SERVE}/чуже`), {
    query: 'чуже', updatedAt: 2,
  }));
  await assertFails(get(ref(db(OUTSIDER), `multiData/searchQueries/${SELF_SERVE}`)));
});

/*
 * Поза стрічкою звичайний користувач бачить рівно картку.
 *
 * Аудиторія матчингу — це не тільки адміністратори: акаунт, заведений з екрана
 * входу як агенція, теж має роль, відмінну від `ed`, і саме за нею правила
 * відкривали йому і `profileDetails`, і `profileContacts` — на будь-яку анкету,
 * хоч і на ту, якої в стрічці немає. Тобто анкету, знайдену за точним
 * контактом, він бачив цілком: прізвище, деталі й контакти, попри те що показу
 * їй ніхто не давав.
 *
 * Межу проводить той самий ключ, що й для самої стрічки: є `feedDate` — анкета
 * показана, і аудиторія матчингу читає її як завжди; немає — максимум, який
 * лишається такому читачеві, це проєкція `matchingCards`. Службовий доступ
 * (`accessLevel` з `matching`), власниця анкети й суперадміни від цієї межі не
 * залежать: вони й ведуть анкети до публікації.
 */
describe('звичайний користувач і прихована анкета');

await it('показану анкету читає як завжди — і деталі, і контакти', async () => {
  await assertSucceeds(get(ref(db(ORDINARY_VIEWER), `matchingCards/${CARD}`)));
  await assertSucceeds(get(ref(db(ORDINARY_VIEWER), `profileDetails/${CARD}`)));
  await assertSucceeds(get(ref(db(ORDINARY_VIEWER), `profileContacts/${CARD}`)));
});

await it('на прихованій анкеті не отримує ані деталей, ані контактів', async () => {
  await assertFails(get(ref(db(ORDINARY_VIEWER), `profileDetails/${HIDDEN_CARD}`)));
  await assertFails(get(ref(db(ORDINARY_VIEWER), `profileContacts/${HIDDEN_CARD}`)));
});

await it('максимум, що лишається, — картка', () =>
  assertSucceeds(get(ref(db(ORDINARY_VIEWER), `matchingCards/${HIDDEN_CARD}`))));

await it('перелічити деталі цілою колекцією теж не може', () =>
  assertFails(get(ref(db(ORDINARY_VIEWER), 'profileDetails'))));

await it('зняття з публікації забирає доступ, публікація повертає', async () => {
  await testEnv.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `matchingCards/${HIDDEN_CARD}/feedDate`), '2026-08-26'));
  await assertSucceeds(get(ref(db(ORDINARY_VIEWER), `profileDetails/${HIDDEN_CARD}`)));
  await assertSucceeds(get(ref(db(ORDINARY_VIEWER), `profileContacts/${HIDDEN_CARD}`)));
  await testEnv.withSecurityRulesDisabled(context =>
    set(ref(context.database(), `matchingCards/${HIDDEN_CARD}/feedDate`), null));
  await assertFails(get(ref(db(ORDINARY_VIEWER), `profileDetails/${HIDDEN_CARD}`)));
  await assertFails(get(ref(db(ORDINARY_VIEWER), `profileContacts/${HIDDEN_CARD}`)));
});

await it('службовий доступ бачить приховану анкету цілком — інакше її нема кому вести', async () => {
  await assertSucceeds(get(ref(db(MATCHING_VIEWER), `profileDetails/${HIDDEN_CARD}`)));
  await assertSucceeds(get(ref(db(MATCHING_VIEWER), `profileContacts/${HIDDEN_CARD}`)));
  await assertSucceeds(get(ref(db(MIGRATED_EDITOR), `profileDetails/${HIDDEN_CARD}`)));
  await assertSucceeds(get(ref(db(SUPERADMIN), `profileContacts/${HIDDEN_CARD}`)));
});

await it('власниця читає власну анкету, поки та прихована', async () => {
  await assertSucceeds(get(ref(db(HIDDEN_CARD), `profileDetails/${HIDDEN_CARD}`)));
  await assertSucceeds(get(ref(db(HIDDEN_CARD), `profileContacts/${HIDDEN_CARD}`)));
});

await it('донорка чужої анкети не читає ані показаної, ані прихованої', async () => {
  await assertFails(get(ref(db(SELF_SERVE), `profileDetails/${CARD}`)));
  await assertFails(get(ref(db(SELF_SERVE), `profileContacts/${HIDDEN_CARD}`)));
});

describe('legacy /users лишається як був');

await it('матчинговий переглядач і далі читає legacy-колекцію', () =>
  assertSucceeds(get(ref(db(MATCHING_VIEWER), 'users'))));

await it('корінь бази закритий', () =>
  assertFails(get(ref(db(SUPERADMIN), '/'))));

await testEnv.cleanup();

console.log(results.join('\n'));
console.log(`\n${failures ? `${failures} FAILED` : 'усі перевірки пройдено'} `
  + `(${results.filter(line => line.startsWith('  ')).length} перевірок)`);
process.exit(failures ? 1 : 0);
