import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

const fnBody = source.slice(
  source.indexOf('export const fetchMatchingCardsPage'),
  source.indexOf('export const fetchMatchingCardsByIds'),
);

describe('сторінка стрічки коштує один запит, а не два', () => {
  // Замір на живих даних: із вікном рівно на `limit + 1` кожна зі 120 сторінок
  // поспіль ішла на друге коло — 240 запитів на 222 показані картки.
  // Причина: `lastLogin2` — це день, тож курсор майже завжди стоїть усередині
  // групи карток з тією самою датою, і відсікання за парою (дата, id) лишало
  // менше, ніж треба.

  it('перше вікно береться із запасом на збіг дат', () => {
    expect(fnBody).toContain('const firstWindow = Math.min(');
    expect(fnBody).toContain('safeLimit * MATCHING_CARDS_FIRST_WINDOW_FACTOR');
    expect(fnBody).toContain('let windowSize = firstWindow;');
  });

  it('запас не менший за саму порцію', () => {
    // Інакше сторінка не набралася б навіть без жодного збігу дат.
    expect(fnBody).toContain('Math.max(fetchLimit, safeLimit * MATCHING_CARDS_FIRST_WINDOW_FACTOR)');
  });

  it('запас не перестрибує стелю вікна', () => {
    expect(fnBody).toContain('MATCHING_CARDS_PAGE_WINDOW_CAP,');
  });

  it('множник оголошений і більший за одиницю', () => {
    const declaration = source.match(/const MATCHING_CARDS_FIRST_WINDOW_FACTOR = (\d+);/);
    expect(declaration).not.toBeNull();
    expect(Number(declaration[1])).toBeGreaterThan(1);
  });

  it('подвоєння вікна лишається запасним ходом, а не основним', () => {
    // Верхня межа нікуди не ділась: якщо дату ділять сотні карток, вікно
    // все одно розшириться.
    expect(fnBody).toContain('windowSize *= 2;');
    expect(fnBody).toContain('while (windowSize <= MATCHING_CARDS_PAGE_WINDOW_CAP)');
  });
});
