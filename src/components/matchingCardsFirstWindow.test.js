import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

// Читаємо саме реалізацію: назовні `fetchMatchingCardsPage` — це обгортка,
// яка зливає однакові сторінки в один запит, а вікно живе під нею.
const fnBody = source.slice(
  source.indexOf('const fetchMatchingCardsPageUncoalesced'),
  source.indexOf('const matchingCardsPageInFlight'),
);

describe('сторінка стрічки коштує один запит, а не два', () => {
  // Замір на живих даних: із вікном рівно на `limit + 1` кожна зі 120 сторінок
  // поспіль ішла на друге коло — 240 запитів на 222 показані картки.
  // Причина: `lastLogin2` — це день, тож курсор майже завжди стоїть усередині
  // групи карток з тією самою датою, і відсікання за парою (дата, id) лишало
  // менше, ніж треба.

  it('вікно з курсором береться із запасом на збіг дат, без курсора — рівно на порцію', () => {
    expect(fnBody).toContain('const firstWindow = Math.min(');
    expect(fnBody).toContain('normalizedCursor.date ? fetchLimit + MATCHING_CARDS_CURSOR_DATE_SLACK : fetchLimit');
    expect(fnBody).toContain('let windowSize = firstWindow;');
  });

  it('запас не перестрибує стелю вікна', () => {
    expect(fnBody).toContain('MATCHING_CARDS_PAGE_WINDOW_CAP,');
  });

  it('запас покриває найбільшу групу однією датою (4 картки)', () => {
    const declaration = source.match(/const MATCHING_CARDS_CURSOR_DATE_SLACK = (\d+);/);
    expect(declaration).not.toBeNull();
    expect(Number(declaration[1])).toBeGreaterThanOrEqual(4);
  });

  it('подвоєння вікна лишається запасним ходом, а не основним', () => {
    // Верхня межа нікуди не ділась: якщо дату ділять сотні карток, вікно
    // все одно розшириться.
    expect(fnBody).toContain('windowSize *= 2;');
    expect(fnBody).toContain('while (windowSize <= MATCHING_CARDS_PAGE_WINDOW_CAP)');
  });
});
