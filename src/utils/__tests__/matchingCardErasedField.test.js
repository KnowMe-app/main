import {
  areMatchingCardProjectionsEqual,
  buildMatchingCardProjection,
  expandMatchingCard,
} from '../matchingCardIndex';
import { normalizeDisplayValue } from 'components/profileLayoutConfig';

/*
 * Стерте поле не має воскресати в рядку стрічки.
 *
 * Картка збиралась із непорожніх значень поля — тобто рівно з тих, які
 * лишаються після стирання. Людина прибирала імʼя (`['Оксана', '']`), у картку
 * їхало `['Оксана']`, і стрічка показувала його далі, тоді як відкрита анкета
 * показувала порожньо: дві відповіді на одне питання.
 *
 * Історію при цьому зводити нікуди не можна: `name` живе **тільки** в цій
 * проєкції, тож попередні версії з неї — це не кеш, а єдина копія.
 */
describe('картка стрічки переживає стирання поля', () => {
  it('доносить позначку стирання разом з історією', () => {
    const projection = buildMatchingCardProjection('card1', {
      name: ['Оксана', ''],
      publish: true,
      lastLogin2: '2026-09-01',
    });

    expect(projection.name).toEqual(['Оксана', '']);
    expect(normalizeDisplayValue(expandMatchingCard('card1', projection).name)).toBe('');
  });

  it('заповнене поле лишається як було', () => {
    const projection = buildMatchingCardProjection('card1', {
      name: ['Оксана', 'Ксенія'],
      publish: true,
      lastLogin2: '2026-09-01',
    });

    expect(projection.name).toEqual(['Оксана', 'Ксенія']);
    expect(normalizeDisplayValue(expandMatchingCard('card1', projection).name)).toBe('Ксенія');
  });

  // Недописаний рядок форми — дірка, а не стирання: позначки він не лишає.
  it('дірку в масиві позначкою стирання не вважає', () => {
    const projection = buildMatchingCardProjection('card1', {
      name: ['Оксана', null],
      publish: true,
      lastLogin2: '2026-09-01',
    });

    expect(projection.name).toEqual(['Оксана']);
  });

  it('поле без жодного значення в картку не потрапляє', () => {
    const projection = buildMatchingCardProjection('card1', {
      name: 'Оксана',
      city: ['', ''],
      publish: true,
      lastLogin2: '2026-09-01',
    });

    expect(projection.name).toBe('Оксана');
    expect(projection.city).toBeUndefined();
  });

  // Роль — набір, а не історія: там масив означає «і агенція, і донорка».
  it('роль лишається набором', () => {
    const projection = buildMatchingCardProjection('card1', {
      userRole: 'ed',
      role: 'ag',
      publish: true,
      lastLogin2: '2026-09-01',
    });

    expect(projection.role).toEqual(['ed', 'ag']);
  });

  // Писач звіряє нову картку зі збереженою і мовчить, коли нічого не змінилось.
  // Позначку стирання він мусить помітити — інакше вона до бази не доїде.
  it('писач бачить різницю між «було значення» і «стерли»', () => {
    expect(areMatchingCardProjectionsEqual({ name: ['Оксана'] }, { name: ['Оксана', ''] })).toBe(false);
    expect(areMatchingCardProjectionsEqual({ name: ['Оксана'] }, { name: ['Оксана'] })).toBe(true);
    expect(areMatchingCardProjectionsEqual({ name: ['Оксана', ''] }, { name: ['Оксана', ''] })).toBe(true);
  });
});
