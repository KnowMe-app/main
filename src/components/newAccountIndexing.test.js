import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('нова анкета одразу потрапляє в усі три індекси', () => {
  const config = () => read('config.js');

  it('makeNewUser пише картку стрічки', () => {
    expect(config()).toContain(
      'await syncMatchingCardIndex(newUserId, newUser, { existingCard: null, includeStorageAvatar: false });',
    );
  });

  it('makeNewUser пише searchKey', () => {
    expect(config()).toContain('await syncUserSearchKeyIndex(newUserId, {}, newUser);');
  });

  it('makeNewUser пише searchId по всіх полях, а не лише по ключу запиту', () => {
    // Запит «УК СМ …» кладе в анкету і імʼя, і прізвище, і контакт, але в індекс
    // ішов тільки ключ самого запиту — за рештою полів анкета не знаходилась.
    expect(config()).toContain('await syncUserSearchIdIndex(newUserId, {}, newUser);');
  });
});

describe('реєстрація теж заповнює пошукові індекси', () => {
  const persistence = () => read('authProfilePersistence.js');

  it('синхронізує обидва індекси для щойно створеного акаунта', () => {
    const source = persistence();
    expect(source).toContain('syncUserSearchIdIndex(userId, {}, uploadedInfo)');
    expect(source).toContain('syncUserSearchKeyIndex(userId, {}, uploadedInfo)');
  });

  it('робить це лише на реєстрації, а не на кожному вході', () => {
    // Вхід передає 'update' і індексів не чіпає: вони вже є, а зайвий прохід
    // коштував би читання на кожне поле.
    expect(persistence()).toContain("if (firestoreCondition !== 'set') return;");
  });

  it('не валить реєстрацію, якщо індекс не записався', () => {
    // Індекси — прискорення читання, а не частина створення акаунта.
    const source = persistence();
    expect(source).toContain("console.warn('[registration] не вдалося оновити searchId'");
    expect(source).toContain("console.warn('[registration] не вдалося оновити searchKey'");
  });
});
