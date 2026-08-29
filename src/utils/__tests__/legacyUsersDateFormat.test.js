import fs from 'fs';
import path from 'path';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);
const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database.rules.json'), 'utf8'),
).rules;

/**
 * Одна анкета — два адресати, і в кожного своє написання дати.
 *
 * `users` живе своїм життям: із неї читає мобільний застосунок, і там дата
 * написана крапками — `ДД.ММ.РРРР`. Нові вузли й картка стрічки лишаються в
 * `РРРР-ММ-ДД`, бо саме за ними база сортує і бере діапазони.
 *
 * Розійтись ці два написання можуть мовчки: ISO-дата в `users` не ламає жодного
 * запису, вона просто перестає знаходитись. Найпомітніше це на `lastLogin` —
 * посторінковий завантажувач питає його через `equalTo('дд.мм.рррр')`, і на
 * ISO-значеннях віддає нуль рядків без жодної помилки.
 */
describe('дата в legacy-колекції — крапками, у вузлах — ISO', () => {
  const converter = configSource.slice(
    configSource.indexOf('const LEGACY_TWIN_DATE_FIELDS'),
    configSource.indexOf('const stripTransientUserDataFields'),
  );

  it('перетворення стоїть рівно на вході в legacy — і ніде більше', () => {
    const mirror = configSource.slice(
      configSource.indexOf('const mirrorProfileToLegacyUsers'),
      configSource.indexOf('const throwProfileWriteFailure'),
    );
    expect(mirror).toContain('formatDatesForLegacyUsers(payload)');
    expect(mirror).toContain('legacyPayload');

    // Вузли й картку перетворення не чіпає: там ISO.
    const nodes = configSource.slice(
      configSource.indexOf('const fanOutProfileNodes'),
      configSource.indexOf('const OWNER_GET_IN_TOUCH_PATH'),
    );
    expect(nodes).not.toContain('formatDatesForLegacyUsers');
  });

  it('крапковими стають саме поля-дати, а не все підряд', () => {
    expect(converter).toContain('LEGACY_DOTTED_DATE_FIELDS.forEach');
    expect(converter).toContain('formatDateToDisplay(value)');
  });

  it('поля-двійники лишаються двома написаннями однієї дати', () => {
    // `lastLogin2` тримає пагінація (`orderByChild('lastLogin2')`, ISO), а
    // `lastLogin` — завантажувач за датою входу (`equalTo('дд.мм.рррр')`).
    // Переписати одне на формат іншого означає зламати того, чиє воно.
    expect(converter).toContain("createdAt: 'createdAt2'");
    expect(converter).toContain("lastLogin: 'lastLogin2'");
    expect(converter).toContain('next[dotted] = formatDateToDisplay(');
    expect(converter).toContain('next[iso] = formatDateToServer(');
    // Двійники не проходять крапкову петлю: інакше ISO-копія стала б крапковою.
    expect(converter).toContain('LEGACY_DOTTED_DATE_FIELDS = STORAGE_DATE_FIELDS.filter');
    expect(converter).toContain('!LEGACY_TWIN_DATE_KEYS.has(field)');
  });

  it('обидві копії лишаються в індексі — за обома ходять запити', () => {
    expect(rules.users['.indexOn']).toEqual(expect.arrayContaining(['lastLogin', 'lastLogin2']));
  });
});

/**
 * Права на створення анкети в legacy-колекції.
 *
 * Анкета мусить лягти в `users`, інакше мобільний застосунок її не побачить. Але
 * `users/$uid` — це ще й вузол акаунта, у якому лежать права доступу, тож
 * відкрити його редакторам цілком означало б дати їм переписувати чужий
 * `accessLevel`.
 */
describe('редактор заводить картку в users, але не чіпає акаунти', () => {
  const write = rules.users.$uid['.write'];

  it('делегований запис дозволено лише під ключем анкети, не під uid акаунта', () => {
    // Ключ анкети — це `push`-ключ (20 символів); uid від Firebase Auth довший.
    // Так делегований запис не може дістати до жодного акаунта взагалі.
    expect(write).toContain('$uid.length < 21');
  });

  it('не дає ані внести поля прав, ані торкнутись запису, у якому вони вже є', () => {
    ['accessLevel', 'canCreateProfiles'].forEach(field => {
      expect(write).toContain(`!newData.child('${field}').exists()`);
      expect(write).toContain(`!data.child('${field}').exists()`);
    });
  });

  it('відкриває запис тому самому колу, що вже пише вузли анкети', () => {
    ['matching:view&write', 'matching+addNewProfile:view&write', 'add+matching:view&write']
      .forEach(level => expect(write).toContain(level));
    expect(write).toContain("child('canCreateProfiles').val() == true");
  });

  it('лишає власника і адмінів із безумовним правом на свій запис', () => {
    expect(write).toContain('auth.uid == $uid');
    ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2']
      .forEach(uid => expect(write).toContain(`auth.uid == '${uid}'`));
  });
});
