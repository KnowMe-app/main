import fs from 'fs';
import path from 'path';

import { withOwnerGetInTouch, withOwnerWriter } from '../profileNodesProvider';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);

/**
 * `getInTouch` — не поле анкети, а персональна позначка того, хто її поставив.
 *
 * Після розділення вона живе в `multiData/getInTouch/{owner}/{id}` значенням, і
 * код мусить і читати, і писати саме туди. Легко зробити половину: почати
 * читати з нового місця, а писати по-старому — і тоді позначка мовчки зникає
 * після кожного збереження анкети.
 */
describe('позначки власника читаються і пишуться в новому місці', () => {
  it('config має читача мапи і писача позначки для обох полів', () => {
    expect(configSource).toContain('export const readOwnerGetInTouchMap');
    expect(configSource).toContain('export const setOwnerGetInTouch');
    expect(configSource).toContain("const OWNER_GET_IN_TOUCH_PATH = 'multiData/getInTouch'");
    expect(configSource).toContain('export const readOwnerWriterMap');
    expect(configSource).toContain('export const setOwnerWriter');
    expect(configSource).toContain("const OWNER_WRITER_PATH = 'multiData/writer'");
  });

  it('обидва поля ходять однією реалізацією, а не двома копіями', () => {
    // Дві копії того самого коду розійшлись би на першій же правці, і одне з
    // полів тихо лишилось би зі старою поведінкою.
    expect(configSource).toContain('const setOwnerValue = async (path, ownerId, profileId, value)');
    expect(configSource).toContain('const readOwnerValueMap = async (path, ownerId)');
  });

  it('збереження анкети веде обидві позначки в multiData, а не у вузол профілю', () => {
    const fanOut = configSource.slice(
      configSource.indexOf('const fanOutProfileNodes ='),
      configSource.indexOf('const buildProfileNodePatch'),
    );
    expect(fanOut).toContain("hasOwnProperty.call(payload, 'getInTouch')");
    expect(fanOut).toContain('await setOwnerGetInTouch(ownerId, userId, payload.getInTouch)');
    expect(fanOut).toContain("hasOwnProperty.call(payload, 'writer')");
    expect(fanOut).toContain('await setOwnerWriter(ownerId, userId, payload.writer)');
  });

  it('зміна позначки — це запис в одну адресу, а не переїзд між ключами', () => {
    // Значення лежить значенням, тож міняти його — це `set` у ту саму адресу,
    // а знімати — `null` у ній же. Переїзду між двома ключами, у якому картка
    // на мить опинялась одразу у двох списках, більше немає.
    const setter = configSource.slice(
      configSource.indexOf('const setOwnerValue = async ('),
      configSource.indexOf('export const readOwnerGetInTouchMap ='),
    );
    expect(setter).toContain('await set(ref2(database, `${path}/${owner}/${id}`), hasValue ? nextValue : null)');
    expect(setter).not.toContain('previousKey');
  });

  it('база сортує позначки сама — це і є плата за окремий запис', () => {
    // Ось заради чого значення під анкетою: `orderByValue` по індексу `.value`
    // віддає вже впорядковані картки замість сортування в памʼяті браузера.
    expect(configSource).toContain('export const readOwnerGetInTouchSorted');
    expect(configSource).toContain('const constraints = [orderByValue()]');
    expect(configSource).toContain('constraints.push(startAt(from))');
    expect(configSource).toContain('constraints.push(limitToFirst(limit))');
  });

  it('графік стимуляції ходить тією самою реалізацією', () => {
    expect(configSource).toContain("const OWNER_STIMULATION_SCHEDULE_PATH = 'multiData/stimulationSchedule'");
    expect(configSource).toContain('export const readOwnerStimulationScheduleMap');
    expect(configSource).toContain('export const setOwnerStimulationSchedule');
  });

  it('обидві позначки підмішуються у прочитану анкету під старими іменами', () => {
    const reader = configSource.slice(
      configSource.indexOf('export const readProfileFromNodes ='),
      configSource.indexOf('export const fetchUsersByIds ='),
    );
    expect(reader).toContain('readOwnerGetInTouchMap(ownerId)');
    expect(reader).toContain('merged.getInTouch = getInTouchMap[id]');
    expect(reader).toContain('readOwnerWriterMap(ownerId)');
    expect(reader).toContain('merged.writer = writerMap[id]');
    // Немає позначки — немає й поля: інакше стара з анкети пережила б зняття.
    expect(reader).toContain('else delete merged.getInTouch;');
    expect(reader).toContain('else delete merged.writer;');
  });

  it('читач розуміє і стару форму — позначки, поставлені до переїзду, не зникають', () => {
    // Доки multiData не перезалито, під власником може лежати ще старе
    // групування. Без цієї гілки все, поставлене до релізу, зникло б з карток
    // мовчки — і виглядало б як «адмін нічого не позначав».
    const reader = configSource.slice(
      configSource.indexOf('const readOwnerValueMap ='),
      configSource.indexOf('const invalidateOwnerValueMap ='),
    );
    expect(reader).toContain('isLegacyOwnerValueGroup(value)');
    expect(configSource).toContain('Object.values(value).every(flag => flag === true)');
  });

  it('значення більше не доводиться правити під ключ бази', () => {
    // Поки воно було назвою ключа, з нього викидались `.`, `/`, `#`, `[`, `]`
    // і контрольні символи — адмін отримував назад не свою нотатку.
    expect(configSource).not.toContain('buildOwnerValueKey');
  });

  it('мапи двох полів не діляться кешем', () => {
    // Один Map на обидва шляхи — і `writer` віддавав би дати `getInTouch`.
    expect(configSource).toContain('const cacheKey = `${path}::${owner}`');
  });
});

describe('адаптер віддає старій логіці те саме поле', () => {
  it('підставляє значення власника на картку', () => {
    const cards = [{ userId: 'P1' }, { userId: 'P2' }];
    const map = { P1: '2026-09-01' };

    expect(withOwnerGetInTouch(cards, map)).toEqual([
      { userId: 'P1', getInTouch: '2026-09-01' },
      { userId: 'P2' },
    ]);
  });

  it('прибирає застаріле значення, яке лишилось на картці', () => {
    // Поки анкети не дочищені, `getInTouch` може ще лежати в самій картці.
    // Джерелом істини є мапа власника, тож картка має слухатись її.
    const cards = [{ userId: 'P1', getInTouch: 'старе' }];
    expect(withOwnerGetInTouch(cards, {})).toEqual([{ userId: 'P1' }]);
  });

  it('не чіпає картку, якої немає ані там, ані там', () => {
    const cards = [{ userId: 'P1', name: 'Оля' }];
    expect(withOwnerGetInTouch(cards, {})[0]).toBe(cards[0]);
  });
});

describe('writer повертається на картку тим самим шляхом', () => {
  it('підставляє значення власника на картку', () => {
    const cards = [{ userId: 'P1' }, { userId: 'P2' }];

    expect(withOwnerWriter(cards, { P1: 'Ik,' })).toEqual([
      { userId: 'P1', writer: 'Ik,' },
      { userId: 'P2' },
    ]);
  });

  it('прибирає застаріле значення, яке лишилось в анкеті', () => {
    const cards = [{ userId: 'P1', writer: 'старе' }];
    expect(withOwnerWriter(cards, {})).toEqual([{ userId: 'P1' }]);
  });

  it('не плутає поля між собою', () => {
    const cards = [{ userId: 'P1', getInTouch: '2026-09-01' }];
    expect(withOwnerWriter(cards, { P1: 'Ik,' })).toEqual([
      { userId: 'P1', getInTouch: '2026-09-01', writer: 'Ik,' },
    ]);
  });
});
