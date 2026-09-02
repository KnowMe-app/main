import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8'),
).rules;

// Каталогом усіх анкет тепер є `matchingCards`: картка є в кожної анкети, хай
// де лежить її тіло. Анкета, заведена у вебі, тіла в legacy-колекції не має
// взагалі — скан по `users` знаходив би саме лише акаунти.
describe('пошук ходить по matchingCards', () => {
  it('пошук за частиною id сканує картки, а не legacy-колекцію', () => {
    const body = source.slice(
      source.indexOf('const collectIdsByPartialUserId'),
      source.indexOf('export const searchUserByPartialUserIdUsers'),
    );

    expect(body).toContain('ref2(database, MATCHING_CARDS_ROOT)');
    expect(body).toContain('orderByKey()');
    expect(body).not.toContain("ref2(database, 'users')");
  });

  it('обидва входи пошуку за частиною id беруть той самий каталог', () => {
    const usersEntry = source.slice(
      source.indexOf('export const searchUserByPartialUserIdUsers'),
      source.indexOf('export const searchUsersOnly'),
    );
    const mainEntry = source.slice(
      source.indexOf('export const searchUserByPartialUserId = async'),
      source.indexOf('const addUserToResults'),
    );

    expect(usersEntry).toContain('await collectIdsByPartialUserId(userId)');
    expect(mainEntry).toContain('await collectIdsByPartialUserId(userId)');
  });

  it('пошук за датою додає ключ стрічки — єдину дату, яку тримає картка', () => {
    const body = source.slice(
      source.indexOf('const searchByDate = async'),
      source.indexOf('const MATCHING_CARD_TEXT_SEARCH_FIELDS'),
    );

    expect(body).toContain('orderByChild(MATCHING_CARD_ORDER_FIELD)');
    expect(body).toContain('ref2(database, MATCHING_CARDS_ROOT)');
  });

  it('у картці шукається імʼя — і тільки воно', () => {
    // `surnameShort` — одна літера. Префіксний запит по ній повертає всіх, у
    // кого прізвище з тієї літери, тобто відсотки колекції на кожен пошук.
    // Прізвище шукається через `searchId`, де лежить повне значення.
    expect(source).toContain("const MATCHING_CARD_TEXT_SEARCH_FIELDS = ['name'];");
    expect(source).toContain('await searchMatchingCardsByText(searchValue, uniqueUserIds, users, { cardsOnly });');
  });

  it('знайдена картка гідратується тим самим шляхом, що й решта влучань', () => {
    // Широкий скан не має власного способу показати знайдене: він кличе того
    // самого гідратора, що й влучання з `searchId`. Інакше та сама анкета
    // приїжджала б різною залежно від того, яка гілка пошуку її знайшла.
    const body = source.slice(
      source.indexOf('const searchMatchingCardsByText'),
      source.indexOf('const executeSearchBySearchIdIndex'),
    );

    expect(body).toContain('addUserToResults(userId, users, { cardsOnly })');
  });

  it('за замовчуванням знайдене й далі читається з вузлів анкети', () => {
    // `cardsOnly` — це опція сторінки matching, а не нова поведінка пошуку:
    // `ProfileCreationWorkspace` шукає дублікати й потребує саме анкети.
    expect(source).toContain('  return cardsOnly ? addCardHit : addSearchHit;');
    expect(source).toContain('    cardsOnly = false,');
  });

  it('правила дозволяють ці запити — інакше пошук мовчки повертав би порожньо', () => {
    expect(rules.matchingCards['.indexOn']).toEqual(expect.arrayContaining(['name']));
    // І не індексують того, за чим не шукають: зайвий індекс — це зайва копія
    // колекції, яку база перебудовує на кожен запис картки.
    expect(rules.matchingCards['.indexOn']).not.toContain('surnameShort');
    const usersReaders = rules.users['.read'].replace('auth != null && (', '').replace(/\)$/, '');
    expect(rules.matchingCards['.read']).toContain(usersReaders);
  });
});

/**
 * Пошук на matching віддає урізану картку — і мусить віддавати її й тоді, коли
 * тіла в legacy-колекції немає.
 *
 * Читач без повного доступу знаходить анкету за `searchId` (телефон, пошта,
 * інстаграм — будь-який ключ індексу), а показати за знайденим id було нічого:
 * проєкція читалася лише з `users/{id}`, а в анкети, заведеної у вебі, такого
 * запису немає. Картка ж `matchingCards/{id}` відкрита кожному авторизованому,
 * щойно вона опублікована, — це і є та загальнодоступна картка, яку можна
 * подивитись і під якою можна лишити публічний відгук.
 */
describe('урізана проєкція пошукового влучання', () => {
  const projection = source.slice(
    source.indexOf('const readLimitedProfileFromMatchingCard'),
    source.indexOf('const addLimitedUser'),
  );

  it('читає опубліковану картку стрічки', () => {
    expect(projection).toContain('`${MATCHING_CARDS_ROOT}/${userId}`');
  });

  it('до legacy-колекції не ходить узагалі', () => {
    // Раніше картка була першим джерелом, а поля `users/$uid` — запасним. Але
    // запасне джерело нічого не додавало: `users/$uid` відкритий лише самому
    // власнику й адмінам, тож звичайному читачеві ці пʼять читань повертали
    // саме лише PERMISSION_DENIED. Джерело лишилось одне — проєкція.
    const readerBody = source.slice(
      source.indexOf('export const fetchLimitedProfileById'),
      source.indexOf('const addLimitedUser'),
    );

    expect(readerBody).toContain('await readLimitedProfileFromMatchingCard(userId)');
    expect(source).not.toContain('readLimitedProfileFields');
  });

  it('повне прізвище з картки не бере — його там і немає', () => {
    // У картці лежить `surnameShort`, і для урізаної проєкції це не втрата, а
    // рівно та форма, яку вона й має показувати.
    expect(projection).toContain('projection.surname = card.surnameShort');
  });

  it('картка лишається читабельною для кожного авторизованого — і поза стрічкою', () => {
    // Читання картки не вимагає дати: вона і є той мінімум, який видно поза
    // стрічкою, і саме з неї пошук показує знайдене. Поки `feedDate` був тут
    // умовою, знайдений у `searchId` id неопублікованої анкети мовчки випадав
    // з видачі — читач бачив лише те, що й так є в стрічці. Схована анкета
    // (`feedDate: false`) лишається закритою — це окремий стан, а не «ще не
    // опублікована».
    expect(rules.matchingCards.$uid['.read']).toContain("!data.child('feedDate').isBoolean()");
  });

  it('ключ стрічки їде разом з проєкцією — за ним видача розрізняє показане', () => {
    expect(projection).toContain('projection[MATCHING_CARD_FEED_FIELD] = card[MATCHING_CARD_FEED_FIELD]');
  });
});

// Створення анкети не має впиратись у права: писач розкладає її по вузлах, і
// кожен із них мусить приймати запис від того, кому дозволено заводити анкети.
describe('створення анкети не впирається в права', () => {
  it('`createdAt` приймається у profileTechnical від творця анкети', () => {
    const write = rules.profileTechnical.$uid.createdAt['.write'];

    expect(write).toContain("root.child('users').child(auth.uid).child('canCreateProfiles').val() == true");
    expect(write).toContain("root.child('profileTechnical').child(auth.uid).child('canCreateProfiles').val() == true");
    expect(write).toContain("contains('matching')");
    expect(write).toContain("contains('view&write')");
  });

  it('решта технічного вузла лишається закритою — там лежать права доступу', () => {
    const nodeWrite = rules.profileTechnical.$uid['.write'];

    expect(nodeWrite).not.toContain('canCreateProfiles');
    expect(nodeWrite).not.toContain("contains('matching')");
  });

  it('дата створення приймається лише рядком', () => {
    expect(rules.profileTechnical.$uid.createdAt['.validate'])
      .toBe('!newData.exists() || newData.isString()');
  });
});
