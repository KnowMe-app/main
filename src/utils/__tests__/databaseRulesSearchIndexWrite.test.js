import fs from 'fs';
import path from 'path';

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../database.rules.json'), 'utf8'),
).rules;

const SELF_UID = 'auth.uid';

describe('права, без яких нова анкета не потрапляє в пошукові індекси', () => {
  // Реєстрація тепер пише `searchId` і `searchKey` сама. Доти писали тільки
  // адміни, тож щойно створений акаунт не знаходився ні за поштою, ні за
  // іменем, доки власник не збереже анкету вручну.

  it('дозволяє власнику завести свій ключ у searchId', () => {
    // Унікальні поля (пошта, телефон, соцмережі) дають ключ, якого ще немає:
    // значення — рівно власний uid, і нічого чужого такий запис не чіпає.
    const write = rules.searchId.$key['.write'];
    expect(write).toContain('!data.exists()');
    expect(write).toContain(`newData.val() == ${SELF_UID}`);
  });

  it('дозволяє власнику дописатися до чужого ключа, не стираючи його', () => {
    // Імʼя і прізвище — спільні ключі. Дозволено рівно перетворення
    // `"чужий_uid"` на `["чужий_uid", "мій_uid"]`: старе значення мусить
    // лишитись на місці нульовим елементом.
    const write = rules.searchId.$key['.write'];
    expect(write).toContain("newData.child('0').val() == data.val()");
    expect(write).toContain(`newData.child('1').val() == ${SELF_UID}`);
    // І не довше двох: інакше під виглядом «дописування» можна було б
    // підкласти довільний масив.
    expect(write).toContain("!newData.child('2').exists()");
  });

  it('дозволяє власнику прибрати свій одиничний ключ', () => {
    // Дзеркальна операція до створення: змінив пошту — старий ключ треба зняти.
    const write = rules.searchId.$key['.write'];
    expect(write).toContain(`!newData.exists() && data.isString() && data.val() == ${SELF_UID}`);
  });

  it('не дає переписати спільний ключ одним лише своїм uid', () => {
    // Гілка створення обмежена `!data.exists()`, тож існуючий ключ —
    // хай там один uid, хай масив — простим `set` не затреться.
    const write = rules.searchId.$key['.write'];
    expect(write).toContain(`(!data.exists() && newData.isString() && newData.val() == ${SELF_UID})`);
    expect(write).not.toContain(`(newData.isString() && newData.val() == ${SELF_UID})`);
  });

  it('лишає корінь searchId несканованим', () => {
    // Право писати свій ключ не має відкривати перелік усього індексу.
    expect(rules.searchId['.read']).toBeUndefined();
    expect(rules.searchId['.write']).toBeUndefined();
  });

  it('дозволяє власнику писати лише свій листок searchKey', () => {
    // Тут шлях сам по собі іменує власника:
    // `searchKey/{індекс}/{значення}/{userId}`, тож право звужується до
    // збігу з `$userId` і чужого членства не зачіпає.
    ['$indexName', 'users'].forEach(branch => {
      const node = branch === 'users' ? rules.searchKey.users.$indexName : rules.searchKey.$indexName;
      expect(node.$value.$userId['.write']).toBe(`auth != null && auth.uid == $userId`);
      expect(node.$value.$userId['.validate']).toBe('newData.val() === true || newData.val() === null');
    });
  });

  it('дає редакторам ті самі права на індекси, що й на картки стрічки', () => {
    // `makeNewUser` створює анкету і всі три індекси одним заходом. Якщо
    // індекси лишити адмінськими, редакторова анкета зʼявиться в стрічці,
    // але не знайдеться пошуком.
    const cardWrite = rules.matchingCards.$uid['.write'];
    const editorLevels = [
      'matching:view&write',
      'matching+addNewProfile:view&write',
      'add+matching:view&write',
    ];
    editorLevels.forEach(level => {
      expect(cardWrite).toContain(level);
      expect(rules.searchId.$key['.write']).toContain(level);
      expect(rules.searchKey.$indexName['.write']).toContain(level);
      expect(rules.searchKey.users.$indexName['.write']).toContain(level);
      expect(rules.searchKeySets.$keySet['.write']).toContain(level);
    });
  });
});
