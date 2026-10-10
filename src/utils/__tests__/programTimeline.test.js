import {
  buildSurrogacyTimeline,
  formatTimelineDate,
  groupTimelineByYear,
  parseCycleDate,
  projectCycleStart,
} from '../programTimeline';

describe('приблизний графік програми СМ', () => {
  it('читає дату обома написаннями', () => {
    expect(parseCycleDate('2026-10-05')).toEqual(new Date(2026, 9, 5));
    expect(parseCycleDate('05.10.2026')).toEqual(new Date(2026, 9, 5));
    expect(parseCycleDate(['2026-01-01', '2026-10-05'])).toEqual(new Date(2026, 9, 5));
    expect(parseCycleDate('вчора')).toBeNull();
  });

  it('давні місячні відкладає циклами по 28 днів до найближчих', () => {
    const today = new Date(2026, 9, 9);
    expect(projectCycleStart(new Date(2026, 9, 5), today)).toEqual({ date: new Date(2026, 9, 5), projected: false });
    // 1 вер → 29 вер (уже старше тижня) → 27 жов: наступні очікувані.
    expect(projectCycleStart(new Date(2026, 8, 1), today)).toEqual({ date: new Date(2026, 9, 27), projected: true });
  });

  it('перенос — лише будній 19–22 день; тижні — від циклу переносу', () => {
    // 1 лис 2026 — неділя: 19-й день (19 лис) — четвер.
    const items = buildSurrogacyTimeline(new Date(2026, 10, 1));
    const byKey = Object.fromEntries(items.map(item => [item.key, item]));
    expect(byKey.transfer.date).toEqual(new Date(2026, 10, 19));
    expect(byKey.hcg.date).toEqual(new Date(2026, 11, 2));
    expect(byKey.week12).toEqual(expect.objectContaining({ week: 12 }));
    expect(byKey.week40).toEqual(expect.objectContaining({ date: new Date(2027, 7, 8), week: 40 }));
    expect(byKey.cycle.week).toBeUndefined();
  });

  it('з дифереліном перенос іде в наступному циклі', () => {
    const items = buildSurrogacyTimeline(new Date(2026, 10, 1), { dipherelin: true });
    const byKey = Object.fromEntries(items.map(item => [item.key, item]));
    // Диферелін 19 лис (чт), новий цикл через 9 днів — 28 лис (сб) → пн 30 лис.
    expect(byKey.dipherelin.date).toEqual(new Date(2026, 10, 19));
    expect(byKey.cycle2.date).toEqual(new Date(2026, 10, 30));
    expect(byKey.transfer.date).toEqual(new Date(2026, 11, 18));
  });

  it('дата — «27.11 пн»: день, місяць і день тижня', () => {
    expect(formatTimelineDate(new Date(2026, 10, 27))).toBe('27.11 пт');
    expect(formatTimelineDate(new Date(2026, 10, 30), 'en')).toBe('30.11 Mon');
  });

  it('перенос несе день циклу, а не тиждень; новий рік — окремим рядком', () => {
    const items = buildSurrogacyTimeline(new Date(2026, 10, 1));
    const transfer = items.find(item => item.key === 'transfer');
    expect(transfer).toEqual(expect.objectContaining({ cycleDay: 19 }));
    expect(transfer.week).toBeUndefined();
    const rows = groupTimelineByYear(items);
    const yearIndex = rows.findIndex(row => row.year === 2027);
    expect(rows[yearIndex - 1].date.getFullYear()).toBe(2026);
    expect(rows[yearIndex + 1].date.getFullYear()).toBe(2027);
    expect(rows.filter(row => row.year)).toHaveLength(1);
  });
});
