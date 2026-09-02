import fs from 'fs';
import path from 'path';

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../database.rules.json'), 'utf8'),
).rules;

describe('правила, без яких стрічка не може читати проєкції', () => {
  it('індексує поле, за яким сортується сторінка стрічки', () => {
    // Регресія в проді: у базі був лише `lastLogin2`, а запит ішов за складеним
    // ключем — Firebase відповідав «Index not defined», і стрічка мовчки
    // сповзала на повні анкети. Тепер ключ один — `feedDate`, — і індекс мусить
    // виїхати в базу РАНІШЕ за код, інакше повториться те саме.
    expect(rules.matchingCards['.indexOn'][0]).toBe('feedDate');
    // Поруч — `name`: `matchingCards` тепер каталог усіх анкет, і текстовий
    // пошук ходить по ньому, а не по legacy-колекції. `surnameShort` тут не
    // потрібен — це одна літера, і шукати за нею означало б віддавати відсотки
    // колекції на кожен запит.
    expect(rules.matchingCards['.indexOn']).toEqual(['feedDate', 'name']);
  });

  it('дає кожному авторизованому користувачеві читати картку — і стрічкою, і точково', () => {
    expect(rules.matchingCards['.read']).toContain('auth != null');
    expect(rules.matchingCards['.read']).toContain("query.orderByChild == 'feedDate'");
    expect(rules.matchingCards['.read']).toContain("query.startAt == ''");
    // Точкове читання картки більше не вимагає дати: картка — це той мінімум,
    // який видно поза стрічкою (імʼя, ініціал, вік, місто, аватар), і саме її
    // показує пошук. Умовою `feedDate` тут був, і коштувало це видачі: у
    // `searchId` лежать усі анкети, а картку неопублікованої база віддавати
    // відмовлялась — знайдений id мовчки випадав з результатів.
    expect(rules.matchingCards.$uid['.read']).toContain('auth != null');
    // Але сховану анкету (`feedDate: false`) правило й далі не віддає: «сховали»
    // — це рішення власниці, і тримати його самим лише клієнтом не можна.
    expect(rules.matchingCards.$uid['.read']).toContain("!data.child('feedDate').isBoolean()");
    expect(rules.matchingCards.$uid['.read']).toContain('auth.uid == $uid');
    // Межа приватності від цього не зрушила: вона на приватних вузлах, і там
    // `feedDate` вирішує, як вирішував.
    expect(rules.profileDetails.$uid['.read']).toContain("root.child('matchingCards').child($uid).child('feedDate').isString()");
    expect(rules.profileContacts.$uid['.read']).toContain("root.child('matchingCards').child($uid).child('feedDate').isString()");
  });

  it('приймає в ключ стрічки або дату, або false — і нічого більше', () => {
    // Три стани ключа: дата (в стрічці), `false` (сховали), немає ключа (ще не
    // публікували). Пошук розрізняє другий і третій, тож зняття публікації
    // пише саме `false`, а не стирає поле.
    const validate = rules.matchingCards.$uid.feedDate['.validate'];
    expect(validate).toContain('newData.isBoolean() && newData.val() == false');
    expect(validate).toContain('newData.isString()');
  });

  it('не тримає окремого прапорця повноти', () => {
    // Його читали ПЕРЕД запитом карток — зайвий круг до бекенду на кожну
    // сторінку заради значення, яке для перебудованої колекції завжди `true`.
    expect(rules.matchingCardsMeta).toBeUndefined();
  });

  it('дає редактору право оновити картку, яку він щойно змінив', () => {
    // Дзеркалення живе в писачах анкети: хто може зберегти анкету, той мусить
    // могти оновити і її проєкцію, інакше картка застигає застарілою.
    expect(rules.matchingCards.$uid['.write']).toBe(rules.profileDetails.$uid['.write']
      .replace(" || (root.child('users').child(auth.uid).child('canCreateProfiles').val() == true"
        + " || root.child('profileTechnical').child(auth.uid).child('canCreateProfiles').val() == true)", ''));
    ["matching:view&write", 'matching+addNewProfile:view&write', 'add+matching:view&write']
      .forEach(level => expect(rules.matchingCards.$uid['.write']).toContain(level));
  });

  it('лишає точковий резолв searchId доступним авторизованому читачеві', () => {
    // Пошук по імені будує ключ і читає його напряму; без цього права кожен
    // запит падає в PERMISSION_DENIED, а пошук мовчки каже «не знайшов».
    expect(rules.searchId.$key['.read']).toBe('auth != null');
    // І при цьому індекс лишається нескановним для звичайного читача: на корені
    // `searchId` читання дане тільки адмінам, тим самим двом uid, що й на
    // `profileContacts`.
    expect(rules.searchId['.read']).toBe(rules.profileContacts['.read']);
    expect(rules.searchId['.read']).not.toBe('auth != null');
  });

  it('тримає публічні коментарі читабельними', () => {
    expect(rules.comments['.read']).toBe('auth != null');
    expect(rules.replies['.read']).toBe('auth != null');
  });
});
