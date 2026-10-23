import { isRealProfileDate, parseProfileDate, readPastDateIssue } from '../profileDate';

// Дати минулих подій, які вже лежать в анкетах: такі значення в базі є —
// маска поля пологів перетворювала «1.5.2019» на «15.20.19», а майбутній рік
// пропускала, — і картка їх мовчки не показувала.
describe('що не так із датою минулої події', () => {
  const now = new Date(2026, 9, 23);

  it('нормальна дата — без зауважень, у будь-якому записаному форматі', () => {
    expect(readPastDateIssue('2019-05-12', now)).toBe('');
    expect(readPastDateIssue('12.05.2019', now)).toBe('');
    expect(readPastDateIssue('13.01.22', now)).toBe('');
    expect(readPastDateIssue('23.10.2026', now)).toBe('');
  });

  it('порожнє поле — не помилка', () => {
    expect(readPastDateIssue('', now)).toBe('');
    expect(readPastDateIssue(undefined, now)).toBe('');
  });

  it('дата, що ще не настала, — описка', () => {
    expect(readPastDateIssue('2027-10-01', now)).toBe('future');
    expect(readPastDateIssue('24.10.2026', now)).toBe('future');
  });

  it('те, що маска лишала замість дати, — не дата', () => {
    expect(readPastDateIssue('15.20.19', now)).toBe('invalid');
    expect(readPastDateIssue('20.19', now)).toBe('invalid');
    expect(readPastDateIssue('05.20.19', now)).toBe('invalid');
    expect(readPastDateIssue('11.02.017', now)).toBe('invalid');
    expect(readPastDateIssue('31.02.2020', now)).toBe('invalid');
  });

  it('календар знає довжину місяця й високосні роки', () => {
    expect(isRealProfileDate(parseProfileDate('29.02.2024'))).toBe(true);
    expect(isRealProfileDate(parseProfileDate('29.02.2023'))).toBe(false);
    expect(isRealProfileDate(null)).toBe(false);
  });
});
