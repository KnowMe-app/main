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
    // `name` — поруч, бо пошук ходить по картці. Більше нічого: кожен індекс —
    // це копія колекції, яку база перебудовує на кожен запис.
    expect(node['.indexOn']).toEqual(['feedDate', 'name']);
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
    expect(validate).toContain("root.child('profileDetails').child($uid).exists()");
    expect(validate).not.toContain("child('users')");
    // Питається це напряму у вузлах, а не через поле `source`: у цільовій
    // схемі картки `source` немає, а перевірка потрібна.
    expect(validate).not.toContain("child('source')");
  });

  it('більше не тримає окремої позначки готовності індексу', () => {
    // Колекція перебудована під вимоги `matchingCards`, а дзеркалення тримає її
    // такою: картка зʼявляється разом з анкетою і зникає разом з нею. Прапорець
    // лишався б зайвим читанням перед кожною сторінкою заради сталого `true`.
    expect(rules.matchingCardsMeta).toBeUndefined();
  });

  it('відкриває сканування службовому доступу й не-донорам, а стрічку — всім авторизованим', () => {
    // Пошук ходить по `matchingCards`: сканувати вузол мають адміни, службовий
    // доступ і читач з роллю, відмінною від `ed` (роль — з його картки).
    expect(node['.read']).toContain("root.child('profileTechnical').child(auth.uid).child('accessLevel').val().contains('matching')");
    expect(node['.read']).toContain("root.child('matchingCards').child(auth.uid).child('role').val() != 'ed'");
    // А запит самої стрічки лишається відкритим кожному авторизованому.
    expect(node['.read']).toContain("query.orderByChild == 'feedDate' && query.startAt == ''");
  });

});
