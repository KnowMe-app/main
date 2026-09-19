import { collectSearchIdDuplicatePairs } from '../searchKeyUtils';

/**
 * Кнопка «Дублікати» повертала порожній список на базі, повній дублікатів:
 * збирач питав стару форму індексу (`{поле}_{значення}` зі списком id одразу
 * під ключем), а в базі лежить `searchId/{значення}/{поле}` — під ключем
 * обʼєкт полів, і `Array.isArray` на ньому хибний завжди.
 */
describe('collectSearchIdDuplicatePairs', () => {
  it('знаходить пару в новій формі індексу: список під полем', () => {
    expect(collectSearchIdDuplicatePairs({
      380501112233: { phone: ['card-a', 'card-b'] },
    })).toEqual([['card-a', 'card-b']]);
  });

  it('одне значення на одну картку дублікатом не є', () => {
    expect(collectSearchIdDuplicatePairs({
      380501112233: { phone: 'card-a' },
    })).toEqual([]);
  });

  it('імʼя і прізвище збігаються в різних людей, тож дублікатом не рахуються', () => {
    expect(collectSearchIdDuplicatePairs({
      олена: { name: ['card-a', 'card-b'], surname: ['card-c', 'card-d'] },
    })).toEqual([]);
  });

  it('поле відсіюється саме як поле, а не як початок значення', () => {
    // «назар» починається на `na`, але полем `name` від того не стає: раніше
    // перевірка `startsWith('name')` дивилась на значення й викидала не те.
    expect(collectSearchIdDuplicatePairs({
      nameless_nick: { telegram: ['card-a', 'card-b'] },
    })).toEqual([['card-a', 'card-b']]);
  });

  it('читає й стару форму: поле в назві ключа, список під ним', () => {
    expect(collectSearchIdDuplicatePairs({
      'phone_380501112233': ['card-a', 'card-b'],
      'name_олена': ['card-c', 'card-d'],
    })).toEqual([['card-a', 'card-b']]);
  });

  it('три картки на одному значенні — одна група, а не дві пари', () => {
    expect(collectSearchIdDuplicatePairs({
      380501112233: { phone: ['card-a', 'card-b', 'card-a'] },
    })).toEqual([['card-a', 'card-b']]);
  });
});
