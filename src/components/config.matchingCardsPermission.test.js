import fs from 'fs';
import path from 'path';

// Правила бази — це те, що вирішує, чи взагалі відпрацює побудова карток, і
// розійтись із кодом вони можуть тихо: у браузері це буде просто
// PERMISSION_DENIED без жодної підказки. Тут вони перевіряються як контракт.
describe('доступ до вузла matchingCards', () => {
  const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database.rules.json'), 'utf8')).rules;
  const node = rules.matchingCards;
  const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

  it('існує і сортується за ключем стрічки', () => {
    expect(node).toBeTruthy();
    // Без `.indexOn` пагінація стрічки сортувала б на клієнті, тобто качала б усе.
    // Ключ один: у стрічці лише показані анкети `users`.
    expect(node['.indexOn']).toEqual(['feedDate']);
  });

  it('дозволяє власнику писати свою картку, а адміну — будь-яку', () => {
    // Побудова пише мультилокаційним `update` від кореня, тож права потрібні саме
    // на рівні картки: кожен шлях у пачці перевіряється окремо.
    const uidWrite = node.$uid['.write'];
    expect(uidWrite).toContain('auth.uid == $uid');
    ADMIN_UIDS.forEach(uid => expect(uidWrite).toContain(uid));
  });

  it('не дає завести картку без анкети за нею', () => {
    // Проєкція без канонічної анкети — привид, на який нічого не вказує.
    const validate = node.$uid['.validate'];
    expect(validate).toContain("root.child('users').child($uid).exists()");
    expect(validate).toContain("root.child('newUsers').child($uid).exists()");
    // Але питається це напряму в обох колекціях, а не через поле `source`:
    // у цільовій схемі картки `source` немає, а перевірка потрібна.
    expect(validate).not.toContain("child('source')");
  });

  it('більше не тримає окремої позначки готовності індексу', () => {
    // Колекція перебудована під вимоги `matchingCards`, а дзеркалення тримає її
    // такою: картка зʼявляється разом з анкетою і зникає разом з нею. Прапорець
    // лишався б зайвим читанням перед кожною сторінкою заради сталого `true`.
    expect(rules.matchingCardsMeta).toBeUndefined();
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
