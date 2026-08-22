import fs from 'fs';
import path from 'path';

// Правила бази — це те, що вирішує, чи взагалі відпрацює побудова карток, і
// розійтись із кодом вони можуть тихо: у браузері це буде просто
// PERMISSION_DENIED без жодної підказки. Тут вони перевіряються як контракт.
describe('доступ до вузла matchingCards', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;
  const node = rules.matchingCards;
  const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

  it('існує і сортується за lastLogin2', () => {
    expect(node).toBeTruthy();
    // Без `.indexOn` пагінація стрічки сортувала б на клієнті, тобто качала б усе.
    expect(node['.indexOn']).toContain('lastLogin2');
  });

  it('дозволяє адміну замінити вузол цілком', () => {
    // Побудова пише мультилокаційним `update` від кореня. Права на рівні вузла —
    // те саме, що вже зроблено для `searchKey`, щоб перебудова могла його замінити.
    ADMIN_UIDS.forEach(uid => expect(node['.write']).toContain(uid));
  });

  it('дозволяє власнику писати свою картку, а адміну — будь-яку', () => {
    const uidWrite = node.$uid['.write'];
    expect(uidWrite).toContain('auth.uid == $uid');
    ADMIN_UIDS.forEach(uid => expect(uidWrite).toContain(uid));
  });

  it('відкриває читання рівно тим, хто читає users', () => {
    // Стрічка читає проєкцію замість анкет — коло читачів має збігатись,
    // інакше частина людей побачила б порожню стрічку замість карток.
    expect(node['.read']).toBe(rules.users['.read']);
  });

  it('індексує поле правил доступу, за яким шукають власників наборів', () => {
    // Без цього `orderByChild('additionalAccessRules')` відсортує на клієнті —
    // тобто перебудова наборів знову качатиме всю колекцію users.
    expect(rules.users['.indexOn']).toContain('additionalAccessRules');
  });
});
