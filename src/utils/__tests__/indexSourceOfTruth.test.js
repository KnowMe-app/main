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
 * Тому тут перевіряється рівно одне: перебудова бере анкети з нових вузлів,
 * а не з legacy-колекції.
 */
describe('індекси будуються з нових вузлів', () => {
  it('є завантажувач, який збирає анкету з пʼяти вузлів', () => {
    const loader = sliceFn('export const loadProfilesFromNodesForIndexing', 'const collectUserIdsBySearchIdKeys');

    // Збірка одна на два входи індексації — з бекенду і з локальних файлів.
    // Якби вона була написана двічі, індекси розійшлися б непомітно.
    expect(loader).toContain('mergeProfileNodeCollections(');
    ['matchingCards', 'profileDetails', 'profileContacts', 'profileWorkflow', 'profileTechnical']
      .forEach(node => expect(configSource).toContain(`PROFILE_NODES.${node}`));
  });

  it('завантажувач не приймає колекцію — вона одна', () => {
    expect(configSource).toContain('export const loadProfilesFromNodesForIndexing = async (options = {}) => {');
    expect(configSource).not.toContain('loadProfilesFromNodesForIndexing(collection');
  });

  it('searchKey перебудовується з вузлів, а не з legacy-колекції', () => {
    const builder = sliceFn(
      'export const createSelectedSearchKeyIndexes',
      'const toPlainObjectFromSetMap',
    );

    expect(builder).toContain('await loadProfilesFromNodesForIndexing({');
    expect(builder).not.toContain('loadCollectionWithIndexCache(');
  });

  it('жоден будівник індексів не відкочується на legacy-колекцію', () => {
    // Кожен із них можна запустити й окремо, і тоді він сам вирішує, звідки
    // брати анкети. Один забутий відкат — і частина індексу будується зі
    // старого джерела, а це помітно вже тільки по порожній видачі пошуку.
    expect(configSource).not.toContain('loadCollectionWithIndexCache(collection)');
    expect(configSource).not.toContain('loadCollectionWithIndexCache(collection,');
  });

  it('searchId теж будується з вузлів — контакти вже не в анкеті', () => {
    const builder = sliceFn('export const createSearchIds', 'export const');
    expect(builder).toContain('await loadProfilesFromNodesForIndexing()');
  });

  it('картки стрічки перебудовуються з вузлів', () => {
    const builder = sliceFn(
      'export const createMatchingCardsIndex',
      'export const getMedicationPhotos',
    );

    expect(builder).toContain('await loadProfilesFromNodesForIndexing()');
    expect(builder).not.toContain('loadCollectionWithIndexCache(');
  });

  it('прибирання карток-сиріт не питає, з якої вони колекції', () => {
    // Прогін один на всю колекцію, тож картка без анкети — просто зайва.
    // Раніше тут стояла перевірка «а чи ця картка з тієї колекції, яку
    // перебудовують»; без неї один прогін зносив би картки другої деки.
    const builder = sliceFn(
      'export const createMatchingCardsIndex',
      'export const getMedicationPhotos',
    );

    expect(builder).toContain('if (!usersData[id]) stalePayload[`${MATCHING_CARDS_ROOT}/${id}`] = null;');
    expect(builder).not.toContain('card?.source');
  });

  it('publish приносить картка, а не legacy-колекція', () => {
    // Останнє читання `/users` в індексації стояло тут — заради одного
    // `publish`. Стан публікації живе у `feedDate`, і `expandMatchingCard`
    // розгортає його назад у `publish`, тож legacy тут більше нема за чим.
    const loader = sliceFn('export const loadProfilesFromNodesForIndexing', 'const collectUserIdsBySearchIdKeys');
    const merge = fs.readFileSync(path.join(__dirname, '..', 'profileNodeCollections.js'), 'utf8');

    expect(loader).not.toContain("loadCollectionWithIndexCache('users'");
    expect(loader).toContain('mergeProfileNodeCollections(sources)');
    // Локальний вхід (файл `users.json` під час міграції) legacy-шар приймати
    // не перестав — саме заради нього злиття його й розуміє.
    expect(merge).toContain('profile.publish = publish');
  });

  it('поточні дані для індексації читаються тим самим шляхом, що й анкета', () => {
    // `syncUserSearchIdIndex` і `syncUserSearchKeyIndex` порівнюють попередній
    // стан із новим. Попередній стан дає `fetchUserById`, а він уже читає нові
    // вузли — тож індекс не може розійтися з тим, що показує застосунок.
    const reader = sliceFn('export const fetchUserById', 'export const removeKeyFromFirebase');
    expect(reader).toContain('await readProfileFromNodes(userId');
  });
});

describe('маршрутизація індексів не залежить від колекцій', () => {
  it('корінь індексу визначається форматом id, а не існуванням колекції', () => {
    // `resolveSearchKeyRootForUserId` дивиться на id, а не на те, чи є вузол
    // legacy-колекції.
    expect(configSource).toContain(
      'export const resolveSearchKeyRootForUserId = userId =>',
    );
    expect(configSource).toContain(
      "export const isUsersCollectionUserId = userId => String(userId || '').trim().length > 20;",
    );
  });
});
