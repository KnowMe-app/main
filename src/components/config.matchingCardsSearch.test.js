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

  it('імʼя і прізвище шукаються в картці, і саме тими полями, які вона тримає', () => {
    expect(source).toContain("const MATCHING_CARD_TEXT_SEARCH_FIELDS = ['name', 'surnameShort'];");
    expect(source).toContain('await searchMatchingCardsByText(searchValue, uniqueUserIds, users);');
  });

  it('знайдена картка гідратується з вузлів, а не роздається проєкцією', () => {
    const body = source.slice(
      source.indexOf('const searchMatchingCardsByText'),
      source.indexOf('const executeSearchBySearchIdIndex'),
    );

    expect(body).toContain('addUserToResults(userId, users)');
  });

  it('правила дозволяють ці запити — інакше пошук мовчки повертав би порожньо', () => {
    expect(rules.matchingCards['.indexOn']).toEqual(
      expect.arrayContaining(['name', 'surnameShort']),
    );
    const usersReaders = rules.users['.read'].replace('auth != null && (', '').replace(/\)$/, '');
    expect(rules.matchingCards['.read']).toContain(usersReaders);
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
