import fs from 'fs';
import path from 'path';

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../database.rules.json'), 'utf8'),
).rules;

const EDITOR_LEVELS = [
  'matching:view&write',
  'matching+addNewProfile:view&write',
  'add+matching:view&write',
];

describe('права, без яких нова анкета не потрапляє в пошукові індекси', () => {
  // Реєстрація тепер індексує щойно створений акаунт сама. Доти писали лише
  // адміни, тож новий акаунт не знаходився ні за поштою, ні за іменем, доки
  // власник не збереже анкету вручну.

  it('дозволяє власнику писати лише свій листок searchKey', () => {
    // Тут шлях сам іменує власника — `searchKey/{індекс}/{значення}/{userId}`,
    // тож право звужується до збігу з `$userId` і чужого членства не зачіпає.
    [rules.searchKey.$indexName, rules.searchKey.users.$indexName].forEach(node => {
      const write = node.$value.$userId['.write'];
      expect(write).toContain('auth.uid == $userId');
      expect(node.$value.$userId['.validate']).toBe(
        'newData.val() === true || newData.val() === null',
      );
    });
  });

  describe('searchId — спільний вузол, тож право дане по формі запису', () => {
    // Ключ — саме значення, а id лежать у полі під ним
    // (`searchId/{значення}/{поле}`), тож форма запису перевіряється на полі.
    const write = rules.searchId.$key.$field['.write'];
    const validate = rules.searchId.$key.$field['.validate'];
    const indexValidate = rules.searchId.$key.$field.$index['.validate'];

    it('ключ тримає поля, а не id', () => {
      expect(rules.searchId.$key['.validate']).toBe('newData.hasChildren()');
    });

    it('приймає лише ті поля, які індексує застосунок', () => {
      // Той самий принцип, що й `$other: false` у картці стрічки: інакше під
      // значенням накопичується будь-що, і читач індексу отримує сміття.
      expect(validate).toContain('$field.matches(');
      ['phone', 'email', 'name', 'surname', 'telegram'].forEach(field => {
        expect(validate).toContain(field);
      });
    });

    it('дозволяє завести ключ, якого ще немає, власним uid', () => {
      // Унікальні поля — пошта, телефон, соцмережі — дають саме такий ключ.
      expect(validate).toContain('newData.isString() && !data.exists() && newData.val() == auth.uid');
    });

    it('дозволяє дописатися до вже зайнятого ключа', () => {
      // Імʼя і прізвище спільні, і клієнт уміє з масивом — правило мусить
      // це дозволяти, інакше третій однофамілець мовчки випадає з пошуку.
      expect(write).toContain('newData.exists()');
      expect(validate).toContain('newData.hasChildren()');
    });

    it('морозить кожну вже зайняту позицію масиву', () => {
      // Ось чим тримається дописування: позиція, яка вже існує, мусить
      // лишитись тим самим значенням, тож чужий uid не перезаписати.
      expect(indexValidate).toContain("data.exists() && newData.val() == data.val()");
    });

    it('пускає в нову позицію лише власний uid', () => {
      // Інакше дописуванням можна було б зробити чужу анкету знаходжуваною
      // за довільним іменем.
      expect(indexValidate).toContain('newData.val() == auth.uid');
    });

    it('переносить старий одиничний uid у нульовий елемент', () => {
      // Перехід «рядок -> масив»: старе значення мусить вижити на позиції 0.
      expect(validate).toContain("newData.child('0').val() == data.val()");
      expect(indexValidate).toContain("data.parent().isString() && newData.val() == data.parent().val()");
    });

    it('дозволяє знести ключ лише його одноосібному власнику', () => {
      // Видалення вузла не проходить через `.validate` — Firebase не
      // перевіряє порожнє значення. Тому знесення ключа обмежене тут.
      expect(write).toContain("data.isString() && data.val() == auth.uid");
    });

    it('лишає корінь searchId несканованим для тих, хто в нього пише', () => {
      // Право писати свій ключ не відкриває перелік усього індексу: перегляд
      // вузла цілком лишається адмінським, а гуртового запису немає ні в кого.
      EDITOR_LEVELS.forEach(level => {
        expect(rules.searchId['.read']).not.toContain(level);
      });
      expect(rules.searchId['.read']).not.toBe('auth != null');
      expect(rules.searchId['.read']).toBe(rules.profileContacts['.read']);
      expect(rules.searchId['.write']).toBeUndefined();
    });
  });

  it('не заважає адмінам і редакторам перебудовувати індекси', () => {
    // `.validate` діє на всіх, тож без цієї гілки масова переіндексація
    // впала б на першому ж записі, який зсуває позиції масиву.
    EDITOR_LEVELS.forEach(level => {
      expect(rules.searchId.$key.$field['.validate']).toContain(level);
      expect(rules.searchId.$key.$field.$index['.validate']).toContain(level);
      expect(rules.searchKeySets.$keySet['.write']).toContain(level);
      // Ті самі права, що вже є на картку стрічки: `makeNewUser` створює
      // анкету і всі три індекси одним заходом.
      expect(rules.matchingCards.$uid['.write']).toContain(level);
    });
  });
});
