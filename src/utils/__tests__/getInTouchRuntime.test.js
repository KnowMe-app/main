import fs from 'fs';
import path from 'path';

import { withOwnerGetInTouch } from '../profileNodesProvider';

const configSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'config.js'),
  'utf8',
);

/**
 * `getInTouch` — не поле анкети, а персональна позначка того, хто її поставив.
 *
 * Після розділення вона живе в `multiData/getInTouch/{owner}/{значення}/{id}`, і
 * код мусить і читати, і писати саме туди. Легко зробити половину: почати
 * читати з нового місця, а писати по-старому — і тоді позначка мовчки зникає
 * після кожного збереження анкети.
 */
describe('getInTouch читається і пишеться в новому місці', () => {
  it('config має і читача мапи власника, і писача позначки', () => {
    expect(configSource).toContain('export const readOwnerGetInTouchMap');
    expect(configSource).toContain('export const setOwnerGetInTouch');
    expect(configSource).toContain("const OWNER_GET_IN_TOUCH_PATH = 'multiData/getInTouch'");
  });

  it('збереження анкети веде позначку в multiData, а не у вузол профілю', () => {
    const fanOut = configSource.slice(
      configSource.indexOf('const fanOutProfileNodes ='),
      configSource.indexOf('const OWNER_GET_IN_TOUCH_PATH ='),
    );
    expect(fanOut).toContain("hasOwnProperty.call(payload, 'getInTouch')");
    expect(fanOut).toContain('await setOwnerGetInTouch(ownerId, userId, payload.getInTouch)');
  });

  it('зміна значення знімає старий ключ у тому самому патчі', () => {
    // Value-first структура означає, що зміна значення — це переїзд між
    // ключами. Якби старий ключ лишався, картка була б одразу у двох списках.
    const writer = configSource.slice(
      configSource.indexOf('export const setOwnerGetInTouch ='),
      configSource.indexOf('const refreshMatchingCardAfterProfileWrite ='),
    );
    expect(writer).toContain('if (previousKey) patch[');
    expect(writer).toContain('] = null;');
    expect(writer).toContain('await update(ref2(database, \'/\'), patch)');
  });

  it('позначка підмішується у прочитану анкету під старим іменем', () => {
    const reader = configSource.slice(
      configSource.indexOf('export const readProfileFromNodes ='),
      configSource.indexOf('export const fetchUsersByIds ='),
    );
    expect(reader).toContain('await readOwnerGetInTouchMap(ownerId)');
    expect(reader).toContain('merged.getInTouch = ownerMap[id]');
    // Немає позначки — немає й поля: інакше стара з анкети пережила б зняття.
    expect(reader).toContain('else delete merged.getInTouch;');
  });

  it('значення з забороненим символом у ключ не йде', () => {
    const keyGuard = configSource.slice(
      configSource.indexOf('const buildGetInTouchValueKey ='),
      configSource.indexOf('export const readOwnerGetInTouchMap'),
    );
    expect(keyGuard).toContain('if (!text) return');
    expect(keyGuard).toContain('u0000');
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
