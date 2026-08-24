import fs from 'fs';
import path from 'path';

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../../database.rules.json'), 'utf8'),
).rules;

describe('правила, без яких стрічка не може читати проєкції', () => {
  it('індексує поле, за яким сортується сторінка стрічки', () => {
    // Регресія в проді: у базі був лише `lastLogin2`, а запит іде за
    // `sourceLastLogin2` — Firebase відповідав «Index not defined», і стрічка
    // мовчки сповзала на повні анкети.
    expect(rules.matchingCards['.indexOn']).toEqual(
      expect.arrayContaining(['lastLogin2', 'sourceLastLogin2']),
    );
  });

  it('лишає прапорець повноти індексу читабельним', () => {
    // Його читають ПЕРЕД запитом карток, тож відсутній вузол валив увесь
    // швидкий шлях ще до того, як справа доходила до індексу.
    expect(rules.matchingCardsMeta['.read']).toBe('auth != null');
  });

  it('дає редактору право оновити картку, яку він щойно змінив', () => {
    // Дзеркалення живе в писачах анкети: хто може зберегти анкету, той мусить
    // могти оновити і її проєкцію, інакше картка застигає застарілою.
    expect(rules.matchingCards.$uid['.write']).toBe(rules.newUsers.$uid['.write']);
  });

  it('лишає точковий резолв searchId доступним авторизованому читачеві', () => {
    // Пошук по імені будує ключ і читає його напряму; без цього права кожен
    // запит падає в PERMISSION_DENIED, а пошук мовчки каже «не знайшов».
    expect(rules.searchId.$key['.read']).toBe('auth != null');
    // І при цьому індекс лишається нескановним: на корені `searchId` читання немає.
    expect(rules.searchId['.read']).toBeUndefined();
  });

  it('тримає публічні коментарі читабельними', () => {
    expect(rules.comments['.read']).toBe('auth != null');
    expect(rules.replies['.read']).toBe('auth != null');
  });
});
