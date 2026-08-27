import fs from 'fs';
import path from 'path';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);

const sliceFn = (name, until) => {
  const from = configSource.indexOf(name);
  const to = configSource.indexOf(until, from + name.length);
  if (from < 0 || to < 0) throw new Error(`не знайдено межі зрізу: ${name} → ${until}`);
  return configSource.slice(from, to);
};

/**
 * Індекс, побудований не з того джерела, з якого читає застосунок, — це не
 * повільний індекс, а неправильний. І помітно це не одразу: пошук просто
 * перестає знаходити частину анкет.
 *
 * Після зникнення `newUsers` перебудова з legacy взагалі дала б порожній
 * індекс. Тому тут перевіряється рівно одне: перебудова бере анкети з нових
 * вузлів.
 */
describe('індекси будуються з нових вузлів', () => {
  it('є завантажувач, який збирає анкету з пʼяти вузлів', () => {
    const loader = sliceFn('export const loadProfilesFromNodesForIndexing', 'const collectUserIdsBySearchIdKeys');

    expect(loader).toContain('mergeProfileNodes(');
    ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical']
      .forEach(node => expect(configSource).toContain(`PROFILE_NODES.${node}`));
  });

  it('searchKey перебудовується з вузлів, а не з legacy-колекції', () => {
    const builder = sliceFn(
      'export const createSelectedSearchKeyIndexesInCollection',
      'const toPlainObjectFromSetMap',
    );

    expect(builder).toContain('await loadProfilesFromNodesForIndexing(collection');
    expect(builder).not.toContain('loadCollectionWithIndexCache(collection');
  });

  it('жоден будівник індексів не відкочується на legacy-колекцію', () => {
    // Кожен із них можна запустити й окремо, і тоді він сам вирішує, звідки
    // брати анкети. Один забутий відкат — і частина індексу будується зі
    // старого джерела, а це помітно вже тільки по порожній видачі пошуку.
    expect(configSource).not.toContain('loadCollectionWithIndexCache(collection)');
    expect(configSource).not.toContain('loadCollectionWithIndexCache(collection,');
  });

  it('searchId теж будується з вузлів — контакти вже не в анкеті', () => {
    const builder = sliceFn('export const createSearchIdsInCollection', 'export const');
    expect(builder).toContain('await loadProfilesFromNodesForIndexing(collection)');
  });

  it('картки стрічки перебудовуються з вузлів', () => {
    const builder = sliceFn(
      'export const createMatchingCardsIndexInCollection',
      'export const getMedicationPhotos',
    );

    expect(builder).toContain('await loadProfilesFromNodesForIndexing(collection)');
    expect(builder).not.toContain('loadCollectionWithIndexCache(collection)');
  });

  it('прибирання карток-сиріт визначає колекцію форматом id, а не полем source', () => {
    // `source` у картці більше немає. Якби перевірка лишилась на ньому, вона
    // читала б `undefined` як `users` — і перебудова однієї колекції зносила б
    // картки другої.
    const builder = sliceFn(
      'export const createMatchingCardsIndexInCollection',
      'export const getMedicationPhotos',
    );

    expect(builder).toContain("isUsersCollectionUserId(id) ? 'users' : 'newUsers'");
    expect(builder).not.toContain("card?.source");
  });

  it('publish береться з legacy — і це єдиний виняток', () => {
    // Власного вузла в нього немає: ним володіє мобільний застосунок, і лежить
    // він у `/users`. Решта полів приходить із нових вузлів.
    const loader = sliceFn('export const loadProfilesFromNodesForIndexing', 'const collectUserIdsBySearchIdKeys');

    expect(loader).toContain("loadCollectionWithIndexCache('users'");
    expect(loader).toContain('profile.publish = publish');
  });

  it('поточні дані для індексації читаються тим самим шляхом, що й анкета', () => {
    // `syncUserSearchIdIndex` і `syncUserSearchKeyIndex` порівнюють попередній
    // стан із новим. Попередній стан дає `fetchUserById`, а він уже читає нові
    // вузли — тож індекс не може розійтися з тим, що показує застосунок.
    const reader = sliceFn('export const fetchUserById', 'export const removeKeyFromFirebase');
    expect(reader).toContain('await readProfileFromNodes(userId');
  });
});

describe('маршрутизація індексів переживе зникнення newUsers', () => {
  it('корінь індексу визначається форматом id, а не існуванням колекції', () => {
    // `resolveSearchKeyRootForUserId` дивиться на id, а не на те, чи є вузол
    // `newUsers`. Тож коли колекцію приберуть, маршрутизація не зміниться —
    // просто коротких id більше не зʼявлятиметься.
    expect(configSource).toContain(
      'export const resolveSearchKeyRootForUserId = userId =>',
    );
    expect(configSource).toContain(
      "export const isUsersCollectionUserId = userId => String(userId || '').trim().length > 20;",
    );
  });
});
