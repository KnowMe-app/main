import { buildMatchingCardProjection, withPublicationDate } from '../matchingCardIndex';

// Адмін ставив анкеті `publish: true`, а картка лишалась без `feedDate`: у
// анкети не було жодної дати (ні входу, ні створення), і проєкції не було за
// чим поставити її в стрічку. Форма казала «Опубліковано», стрічка — нічого.
describe('публікація без дат в анкеті', () => {
  const ID = 'a'.repeat(28);
  const TODAY = '2026-10-04';

  it('стає датою сама, коли публікують просто зараз', () => {
    const data = withPublicationDate({ name: 'Ірина', publish: true }, { publishRequested: true, today: TODAY });
    expect(buildMatchingCardProjection(ID, data).feedDate).toBe(TODAY);
  });

  it('не перебиває дату, яка в анкеті вже є', () => {
    const data = withPublicationDate(
      { publish: true, lastLogin: '2026-09-01' },
      { publishRequested: true, today: TODAY },
    );
    expect(buildMatchingCardProjection(ID, data).feedDate).toBe('2026-09-01');
  });

  it('не ставить «сьогодні» перебудові, яка нічого не публікує', () => {
    // Офлайн-збірка вузла й будь-яке збереження без `publish` — не рішення
    // опублікувати, і вигадувати їм дату не можна.
    const data = { publish: true };
    expect(withPublicationDate(data, { publishRequested: false, today: TODAY })).toBe(data);
  });

  it('не чіпає зняття з публікації', () => {
    const data = { publish: false };
    expect(withPublicationDate(data, { publishRequested: true, today: TODAY })).toBe(data);
  });
});
