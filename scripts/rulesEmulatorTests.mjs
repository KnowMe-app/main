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
import { ref, get, set, update, remove } from 'firebase/database';

const SUPERADMIN = '0ghb1LphfASV0Y3b6J010v4CDyD2';
const MATCHING_VIEWER = 'matchingViewerUid0000000000';
const MATCHING_EDITOR = 'matchingEditorUid0000000000';
const CONTACTS_VIEWER = 'contactsViewerUid0000000000';
const DELEGATED_READER = 'delegatedReaderUid000000000';
const PROFILE_OWNER = 'profileOwnerUid00000000000';
const OUTSIDER = 'outsiderUid000000000000000';

const CARD = 'someOtherProfileId000000000';

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
    [CARD]: { name: 'Картка' },
  });
  await set(ref(db, 'matchingCards'), {
    [CARD]: { name: 'Картка', surnameShort: 'К.', feedDate: '2026-08-25' },
    [PROFILE_OWNER]: { name: 'Власниця', feedDate: '2026-08-20' },
  });
  await set(ref(db, 'profileDetails'), { [CARD]: { surname: 'Коваленко', blood: '2+' } });
  await set(ref(db, 'profileContacts'), { [CARD]: { phone: ['+380'], email: 'a@b.c' } });
  await set(ref(db, 'profileWorkflow'), { [CARD]: { lastAction: 'дзвінок', cycleStatus: 'active' } });
  await set(ref(db, 'profileTechnical'), {
    [CARD]: { lastLogin2: '2026-08-25' },
    [PROFILE_OWNER]: { lastLogin2: '2026-08-20' },
  });
  await set(ref(db, 'multiData/getInTouch'), {
    [SUPERADMIN]: { '2026-09-01': { [CARD]: true } },
  });
});

const db = uid => testEnv.authenticatedContext(uid).database();

describe('matchingCards / profileDetails — аудиторія матчингу');

await it('матчинговий переглядач читає картки стрічки', () =>
  assertSucceeds(get(ref(db(MATCHING_VIEWER), `matchingCards/${CARD}`))));

await it('матчинговий переглядач читає деталі анкети', () =>
  assertSucceeds(get(ref(db(MATCHING_VIEWER), `profileDetails/${CARD}`))));

await it('стороння без матчингу не читає карток', () =>
  assertFails(get(ref(db(OUTSIDER), `matchingCards/${CARD}`))));

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

await it('контакти не можна перелічити цілою колекцією', () =>
  assertFails(get(ref(db(CONTACTS_VIEWER), 'profileContacts'))));

await it('правило контактів окреме — звузити його можна, не чіпаючи стрічки', () => {
  // Саме заради цього вузол і виділявся: `profileContacts` має власний `.read`,
  // не успадкований від `matchingCards`, тож обмеження до окремої категорії
  // людей — це правка одного рядка, а не переїзд даних.
  const rules = JSON.parse(fs.readFileSync('database.rules.json', 'utf8')).rules;
  if (!rules.profileContacts.$uid['.read']) throw new Error('немає власного .read');
  if (rules.profileContacts['.read']) throw new Error('колекцію не можна робити читабельною цілком');
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

await it('власник читає власні групи', () =>
  assertSucceeds(get(ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}`))));

await it('власник пише у власні групи', () =>
  assertSucceeds(set(ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}/2026-10-01/${CARD}`), true)));

await it('делегований читач читає групи власника', () =>
  assertSucceeds(get(ref(db(DELEGATED_READER), `multiData/getInTouch/${SUPERADMIN}`))));

await it('делегований читач НЕ пише у групи власника', () =>
  assertFails(set(ref(db(DELEGATED_READER), `multiData/getInTouch/${SUPERADMIN}/2026-10-01/${CARD}`), true)));

await it('стороння не читає чужих груп', () =>
  assertFails(get(ref(db(OUTSIDER), `multiData/getInTouch/${SUPERADMIN}`))));

await it('значенням може бути тільки true', () =>
  assertFails(set(ref(db(SUPERADMIN), `multiData/getInTouch/${SUPERADMIN}/2026-10-01/${CARD}`), 'yes')));

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
    ['feedNewUsers', '2026-08-25'],
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
