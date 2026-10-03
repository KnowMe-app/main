import {
  addMonthsIsoDate,
  formatPostponeDate,
  isPostponedUntil,
  placePostponedCardsLast,
} from './matchingPostpone';

describe('matchingPostpone', () => {
  it('рахує дату в місяцях від сьогодні без переносу зайвих днів', () => {
    expect(addMonthsIsoDate(3, new Date(2026, 9, 3))).toBe('2027-01-03');
    expect(addMonthsIsoDate(1, new Date(2027, 0, 31))).toBe('2027-02-28');
  });

  it('вважає відкладеною лише дату після сьогодні', () => {
    expect(isPostponedUntil('2026-10-04', '2026-10-03')).toBe(true);
    expect(isPostponedUntil('2026-10-03', '2026-10-03')).toBe(false);
    expect(isPostponedUntil('подзвонити', '2026-10-03')).toBe(false);
    expect(formatPostponeDate('2027-01-03')).toBe('03.01.2027');
  });

  it('ставить відкладені картки в кінець, найближчу першою', () => {
    const rows = [{ id: 'a' }, { id: 'b', d: '2027-03-01' }, { id: 'c' }, { id: 'd', d: '2027-01-01' }];
    const ordered = placePostponedCardsLast(rows, row => row.d, '2026-10-03');
    expect(ordered.map(row => row.id)).toEqual(['a', 'c', 'd', 'b']);
    const untouched = [{ id: 'a' }];
    expect(placePostponedCardsLast(untouched, row => row.d, '2026-10-03')).toBe(untouched);
  });
});
