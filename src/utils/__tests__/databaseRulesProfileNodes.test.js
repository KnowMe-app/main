import fs from 'fs';
import path from 'path';

import {
  OWNER_MULTI_DATA_INDEXED_FIELDS,
  OWNER_MULTI_DATA_STRING_FIELDS,
  MATCHING_CARD_ALLOWED_FIELDS,
  PROFILE_CONTACT_FIELDS,
  ACCESS_CONTROL_FIELDS,
  ALL_ACCESS_CONTROL_FIELDS,
  PROFILE_TECHNICAL_ACCESS_FIELDS,
  NEVER_MIGRATED_FIELDS,
} from '../profileNodeSchema';

const repoRoot = path.join(__dirname, '..', '..', '..');
const rules = JSON.parse(fs.readFileSync(path.join(repoRoot, 'database.rules.json'), 'utf8')).rules;
const profileFormSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'components', 'ProfileForm.jsx'),
  'utf8',
);
const matchingCardIndexSource = fs.readFileSync(
  path.join(repoRoot, 'src', 'utils', 'matchingCardIndex.js'),
  'utf8',
);

const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

const FEED_GATE = "root.child('matchingCards').child($uid).child('feedDate').isString()";

/**
 * Право за роллю живе під ключем стрічки — і більше ніде.
 *
 * Мова правил — це один довгий ланцюг `||`, у якому зайвий диз'юнкт нічого не
 * ламає, лише тихо відкриває. Тому перевіряється не «умова згадується», а що
 * жодного згадування ролі поза цим ключем не лишилось: інакше поруч із
 * закритою гілкою спокійно жила б відкрита.
 */
const expectRoleClauseGatedByFeed = read => {
  expect(read).toContain(FEED_GATE);
  const [beforeGate, afterGate] = read.split(FEED_GATE);
  expect(beforeGate).not.toContain('userRole');
  expect(beforeGate).not.toContain("child('role')");
  expect(afterGate).toContain("root.child('users').child(auth.uid).child('userRole').val() != 'ed'");
  // Службовий доступ від стрічки не залежить — інакше приховану анкету не було б
  // кому вести до публікації.
  expect(beforeGate).toContain("contains('matching')");
  expect(beforeGate).toContain('auth.uid == $uid');
  ADMIN_UIDS.forEach(uid => expect(beforeGate).toContain(uid));
};

/**
 * Мова правил не має ані функцій, ані коментарів, тож перевіряти її можна лише
 * за формою умови. Ці тести й перевіряють форму — але кожен із них стереже
 * властивість, яку зламати легко і непомітно: індекс, за яким ходить стрічка,
 * перелік полів, які взагалі можна покласти в картку, і те, що жоден із нових
 * вузлів не став другим місцем для контактів чи прав доступу.
 */
describe('нові вузли профілю в database.rules.json', () => {
  it('усі пʼять вузлів існують', () => {
    ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical']
      .forEach(node => expect(rules[node]).toBeDefined());
  });

  it.each(['getInTouch', 'writer', 'stimulationSchedule'])(
    'multiData/%s має структуру owner/profileId = значення',
    field => {
      const node = rules.multiData[field];
      expect(node.$ownerId).toBeDefined();
      // Рівня «значення» немає: значення лежить під анкетою, а не в назві ключа.
      expect(node.$ownerId.$value).toBeUndefined();
      expect(node.$ownerId.$userId).toBeDefined();
    },
  );

  it('позначки, за якими сортують, база індексує сама', () => {
    // Без індексу `orderByValue` на цьому вузлі отримав би «Index not defined»,
    // і сортування мовчки сповзло б назад у памʼять браузера.
    expect(rules.multiData.getInTouch.$ownerId['.indexOn']).toBe('.value');
    OWNER_MULTI_DATA_INDEXED_FIELDS
      .forEach(field => expect(rules.multiData[field].$ownerId['.indexOn']).toBe('.value'));
  });

  it('схема знає рівно ті поля, які база приймає лише рядком', () => {
    /*
     * `OWNER_MULTI_DATA_STRING_FIELDS` — не думка про дані, а копія правила, і
     * розійтись їм не можна в жоден бік. Якщо схема забуде поле, переїзд
     * пропустить масив зі старої анкети до заливки — і `.validate` поверне
     * PERMISSION_DENIED на цілу порцію в 200 записів, не сказавши, який із них
     * завинив. Якщо схема додасть зайве — переїзд зведе до рядка графік
     * стимуляції, тобто розчавить таблицю в «Гонал 150, Гонал 150».
     */
    const requiresString = Object.entries(rules.multiData)
      .filter(([, node]) => node.$ownerId?.$userId?.['.validate']?.includes('newData.isString()'))
      .map(([field]) => field);

    expect([...OWNER_MULTI_DATA_STRING_FIELDS].sort()).toEqual(requiresString.sort());
    expect(OWNER_MULTI_DATA_STRING_FIELDS).not.toContain('stimulationSchedule');
  });

  it('multiData/stimulationSchedule лежить під анкетою, а не під значенням', () => {
    // Друга форма поля власника: помітку можна засунути в назву ключа, а
    // таблицю днів і призначень — ні. Тож рівня `$value` тут немає взагалі, і
    // це не дрібниця форми: із ним графік розсипався б на ключі.
    const node = rules.multiData.stimulationSchedule;
    expect(node.$ownerId).toBeDefined();
    expect(node.$ownerId.$value).toBeUndefined();
    expect(node.$ownerId.$userId).toBeDefined();
  });

  it('графік читає делегований читач, але пише лише власник і суперадміни', () => {
    const owner = rules.multiData.stimulationSchedule.$ownerId;
    expect(owner['.read']).toContain("multiDataSourceUserIds').child($ownerId).val() == true");
    const write = owner.$userId['.write'];
    expect(write).toContain('auth.uid == $ownerId');
    expect(write).not.toContain('multiDataSourceUserIds');
  });

  it('getInTouch читає делегований читач, але пише лише власник і суперадміни', () => {
    const owner = rules.multiData.getInTouch.$ownerId;
    expect(owner['.read']).toContain("multiDataSourceUserIds').child($ownerId).val() == true");
    const write = owner.$userId['.write'];
    expect(write).toContain('auth.uid == $ownerId');
    expect(write).not.toContain('multiDataSourceUserIds');
  });

  it('делегування читається і з profileTechnical — воно теж переїхало', () => {
    expect(rules.multiData.getInTouch.$ownerId['.read'])
      .toContain("root.child('profileTechnical').child(auth.uid).child('multiDataSourceUserIds')");
  });
});

describe('індекси стрічки', () => {
  it('індексує поле сторінки стрічки і поля, за якими картку шукають', () => {
    // Ключ стрічки один — `feedDate`. Другий індекс не для стрічки, а для
    // пошуку: `matchingCards` тримає картку кожної анкети, тож саме тут її й
    // шукають за іменем, а не в legacy-колекції. `surnameShort` не індексують:
    // це одна літера, і запит по ній віддавав би відсотки колекції.
    expect(rules.matchingCards['.indexOn']).toEqual(['feedDate', 'name']);
  });

  it('писач сортує за тим самим полем, яке індексують правила', () => {
    // Регресія в проді: у базі був один індекс, а запит ішов за іншим ключем —
    // Firebase відповідав «Index not defined», і стрічка мовчки сповзала на
    // повні анкети. Тут ці двоє звіряються між собою.
    expect(matchingCardIndexSource).toContain("export const MATCHING_CARD_FEED_FIELD = 'feedDate'");
    expect(matchingCardIndexSource).toContain('MATCHING_CARD_ORDER_FIELD = MATCHING_CARD_FEED_FIELD');
    expect(matchingCardIndexSource).not.toContain('feedUsers');
    expect(matchingCardIndexSource).not.toContain('feedUsers');
  });
});

describe('matchingCards приймає лише перелічені поля', () => {
  const card = rules.matchingCards.$uid;
  const allowed = Object.keys(card).filter(key => !key.startsWith('.') && key !== '$other');

  it('відхиляє будь-яке поле поза переліком', () => {
    expect(card.$other['.validate']).toBe(false);
  });

  it('знає всі поля цільової схеми', () => {
    MATCHING_CARD_ALLOWED_FIELDS.forEach(field => expect(allowed).toContain(field));
  });

  it.each([
    ...PROFILE_CONTACT_FIELDS,
    ...ALL_ACCESS_CONTROL_FIELDS,
    ...NEVER_MIGRATED_FIELDS,
    'password',
    'publish',
    'cycleStatus',
    'lastCycle',
    'registrationDate',
    'myComment',
    'publicComment',
  ])('не має місця для %s', field => {
    expect(allowed).not.toContain(field);
  });

  it('дозволяє власнику прочитати власну картку', () => {
    // Після рефакторингу саме `feedDate` каже, чи анкета показана. Без цього
    // права звичайний користувач не міг би дізнатись власний стан публікації.
    expect(card['.read']).toContain('auth.uid == $uid');
  });

  it('більше не вимагає поля source, але й далі не пускає картку-привида', () => {
    // ТЗ знімає вимогу `source`, а не вимогу існування анкети.
    expect(card['.validate']).not.toContain("child('source')");
    expect(card['.validate']).toContain("root.child('users').child($uid).exists()");
  });

  it('анкети, яка живе лише в нових вузлах, для картки досить', () => {
    // Питати саме legacy означало б, що після зникнення `users` жодна картка
    // не запишеться взагалі — тобто стрічка перестане оновлюватись із першого
    // ж збереження.
    ['profileDetails', 'profileTechnical', 'profileContacts', 'profileWorkflow']
      .forEach(node => expect(card['.validate']).toContain(`root.child('${node}').child($uid).exists()`));
  });

  it('нічого понад цільову схему не приймає', () => {
    // Ані сирих полів, які тепер живуть в інших вузлах, ані перехідних
    // залишків: писач і правила описують той самий набір.
    expect(allowed.slice().sort()).toEqual(MATCHING_CARD_ALLOWED_FIELDS.slice().sort());
  });

  it('feedDate стереже лише той, кому дозволено писати картку', () => {
    // Публікація і зняття з публікації — це запис і видалення однієї дати,
    // тож право на неї те саме, що й на решту картки.
    expect(card.feedDate['.validate']).toContain('newData.isString()');
  });
});

describe('profileContacts — власне правило, і воно йде за стрічкою', () => {
  // Гвинт, заради якого вузол і виділявся, закручено: контакти читає аудиторія
  // матчингу, але звичайному користувачеві — лише доти, доки картка в стрічці.
  it('перелічити контакти може тільки суперадмін', () => {
    // Колекція цілком потрібна рівно одному: перебудові індексів. Поіменне
    // читання 26 тисяч анкет — це вже не індексація. Суперадмін і так бачить
    // кожну анкету поштучно, тож ширшим доступ не стає.
    const read = rules.profileContacts['.read'];
    ADMIN_UIDS.forEach(uid => expect(read).toContain(uid));
    expect(read).not.toContain('accessLevel');
    expect(rules.profileContacts['.indexOn']).toBeUndefined();
  });

  it('читає та сама аудиторія, що й картки стрічки, плюс власник анкети', () => {
    const read = rules.profileContacts.$uid['.read'];
    expect(read).toContain('auth.uid == $uid');
    ADMIN_UIDS.forEach(uid => expect(read).toContain(uid));
    expect(read).not.toBe(rules.matchingCards['.read']);
  });

  it('звичайному користувачеві — тільки поки картка в стрічці', () => {
    /*
     * Аудиторія матчингу — це не самі лише адміністратори: акаунт, заведений з
     * екрана входу як агенція, теж має роль, відмінну від `ed`, і саме за нею
     * правила віддавали йому контакти будь-якої анкети — зокрема тієї, якої в
     * стрічці немає. Умова ролі тепер стоїть під ключем стрічки: є `feedDate` —
     * анкета показана, і контакти читаються; немає — максимум, що лишається
     * такому читачеві, це проєкція `matchingCards`.
     */
    expectRoleClauseGatedByFeed(rules.profileContacts.$uid['.read']);
  });

  it('правило власне, а не успадковане — його можна звузити окремо', () => {
    expect(rules.profileContacts.$uid['.read']).not.toBe(rules.matchingCards['.read']);
  });

  it('редагує той, хто редагує анкету, і власник токена контактів', () => {
    const write = rules.profileContacts.$uid['.write'];
    expect(write).toContain("contains('matching')");
    expect(write).toContain("contains('profileContacts')");
    expect(write).toContain("contains('view&write')");
  });

  it('токен звуження справді можна видати з форми', () => {
    // Без цього правило запису було б формально коректним і практично мертвим:
    // жоден рівень доступу не містив би підрядка, який воно шукає.
    const block = profileFormSource.slice(
      profileFormSource.indexOf('const accessLevelOptions = ['),
      profileFormSource.indexOf('];', profileFormSource.indexOf('const accessLevelOptions = [')),
    );
    const assignable = [...block.matchAll(/\{ value: '([^']*)'/g)].map(match => match[1]);

    expect(assignable.some(level => level.includes('profileContacts'))).toBe(true);
    expect(assignable.some(level => level.includes('profileContacts') && level.includes('view&write'))).toBe(true);
  });
});

describe('решта вузлів не стає другим місцем для чужих даних', () => {
  it('profileDetails не приймає ані контактів, ані прав, ані операційних полів', () => {
    const validate = rules.profileDetails.$uid.$field['.validate'];
    [...PROFILE_CONTACT_FIELDS.filter(field => field !== 'other'), ...ALL_ACCESS_CONTROL_FIELDS,
      'password', 'getInTouch', 'publish', 'lastLogin', 'lastLogin2', 'lastAction',
      'cycleStatus', 'lastCycle', 'registrationDate']
      .forEach(field => expect(validate).toContain(`$field == '${field}'`));
  });

  it('profileDetails не відкривається разом із публічною проєкцією matchingCards', () => {
    expect(rules.matchingCards['.read']).toContain("query.orderByChild == 'feedDate'");
    expect(rules.profileDetails['.read']).not.toBe(rules.matchingCards['.read']);
  });

  it('profileDetails звичайному користувачеві — теж тільки поки картка в стрічці', () => {
    // Деталі анкети — це прізвище, стан здоровʼя і решта того, чого в картці
    // стрічки навмисно немає. Правило те саме, що й у контактів, бо й питання
    // те саме: показу цій анкеті ніхто не давав.
    expectRoleClauseGatedByFeed(rules.profileDetails.$uid['.read']);
  });

  it('перелічити деталі цілою колекцією може лише службовий доступ', () => {
    // У переліку немає де перевірити картку кожного запису, тож право за роллю
    // з рівня колекції знято: звичайний користувач читає анкету поіменно.
    const read = rules.profileDetails['.read'];
    expect(read).not.toContain('userRole');
    expect(read).toContain("contains('matching')");
    ADMIN_UIDS.forEach(uid => expect(read).toContain(uid));
  });

  it('profileTechnical бачать лише власник і суперадміни', () => {
    const read = rules.profileTechnical.$uid['.read'];
    expect(read).toContain('auth.uid == $uid');
    ADMIN_UIDS.forEach(uid => expect(read).toContain(uid));
    expect(read).not.toContain('accessLevel');
    // Колекцію цілком — теж тільки суперадмін, і теж заради перебудови індексів.
    ADMIN_UIDS.forEach(uid => expect(rules.profileTechnical['.read']).toContain(uid));
    expect(rules.profileTechnical['.read']).not.toContain('accessLevel');
  });

  it('profileTechnical не приймає device-полів, пароля і делегування', () => {
    const validate = rules.profileTechnical.$uid.$other['.validate'];
    ['deviceWidth', 'deviceHeight', 'deviceResize', 'password', ...ACCESS_CONTROL_FIELDS]
      .forEach(field => expect(validate).toContain(`$other != '${field}'`));
  });

  it('profileTechnical приймає права, які туди переїхали', () => {
    // Права акаунта — це технічні дані, і місце в них тепер тут. Без цього
    // рядка міграція забирала б їх із колекції в вузол, який їх не приймає.
    const validate = rules.profileTechnical.$uid.$other['.validate'];
    PROFILE_TECHNICAL_ACCESS_FIELDS
      .forEach(field => expect(validate).not.toContain(`$other != '${field}'`));
  });

  it('правила питають про рівень доступу і profileTechnical теж', () => {
    // Інакше переїзд прав зняв би доступ усім, чий акаунт лежав у legacy:
    // очищена колекція заливається в базу цілком, а разом із нею зникло б і
    // єдине місце, звідки правила про цей доступ дізнавались.
    const withAccessCheck = [
      rules.matchingCards.$uid['.write'],
      rules.profileDetails.$uid['.write'],
      rules.profileContacts.$uid['.read'],
      rules.profileContacts.$uid['.write'],
      rules.profileWorkflow.$uid['.read'],
      rules.searchKeySets.$keySet['.write'],
    ];

    withAccessCheck.forEach(rule => {
      expect(rule).toContain("root.child('profileTechnical').child(auth.uid).child('accessLevel')");
      // Legacy-джерело нікуди не діло: `/users` міграція не чистить.
      expect(rule).toContain("root.child('users').child(auth.uid).child('accessLevel')");
    });

    expect(rules.multiData.profileMutations['.read'])
      .toContain("root.child('profileTechnical').child(auth.uid).child('canCreateProfiles')");
  });

  it('profileWorkflow лишається внутрішнім і не тримає getInTouch/publish/lastLogin', () => {
    ADMIN_UIDS.forEach(uid => expect(rules.profileWorkflow['.read']).toContain(uid));
    expect(rules.profileWorkflow['.read']).not.toContain('accessLevel');
    const read = rules.profileWorkflow.$uid['.read'];
    expect(read).toContain("contains('matching')");
    expect(read).toContain("contains('view&write')");

    const validate = rules.profileWorkflow.$uid.$other['.validate'];
    ['getInTouch', 'lastLogin', 'lastLogin2', 'publish']
      .forEach(field => expect(validate).toContain(`$other != '${field}'`));
  });
});

describe('legacy лишається недоторканим', () => {
  it('корінь і далі заборонений за замовчуванням', () => {
    expect(rules['.read']).toBe(false);
    expect(rules['.write']).toBe(false);
  });

  it('users зберігає свої правила і індекси', () => {
    // Знімок легко звірити з файлом правил: legacy-колекція одна, і вона не
    // змінюється — ті самі вузли, ті самі індекси, та сама аудиторія.
    const legacy = JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'src', 'utils', '__tests__', 'fixtures', 'legacyRulesShape.json'),
      'utf8',
    ));
    expect(rules.users['.read']).toBe(legacy.users['.read']);
    expect(rules.users['.indexOn']).toEqual(legacy.users['.indexOn']);
    expect(rules.users.$uid['.read']).toBe(legacy.users.$uid['.read']);
    // Право на запис — єдине, що розширилось, і рівно на один диз'юнкт:
    // редактор заводить анкету під `push`-ключем. Знімок лишається початком
    // рядка, тож будь-яка правка самої legacy-умови все одно впаде тут.
    expect(rules.users.$uid['.write'].startsWith(legacy.users.$uid['.write'].replace(/\)$/, ''))).toBe(true);
    // Legacy-джерело прав нікуди не поділось: доступ, записаний там, працює далі.
    expect(rules.users['.read'])
      .toContain("root.child('users').child(auth.uid).child('accessLevel')");
  });

  it('другої legacy-колекції в правилах немає', () => {
    expect(rules.newUsers).toBeUndefined();
    expect(JSON.stringify(rules)).not.toContain('newUsers');
  });
});
