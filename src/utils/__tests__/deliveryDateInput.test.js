import {
  parseDeliveryDateInput,
  readDeliveryDate,
  toStoredDeliveryDate,
  formatDeliveryDateForInput,
} from '../deliveryDateInput';
import { monthsSinceDate } from '../deliveryRecency';

// Дату останніх пологів пишуть як звикли — і кожен такий запис мусить
// розпізнатись однаково. Стара маска з «1.5.2019» робила «15.20.19».
describe('розпізнавання дати останніх пологів', () => {
  const now = new Date(2026, 9, 23);
  const stored = text => toStoredDeliveryDate(parseDeliveryDateInput(text, now));

  it.each([
    ['12.05.2019', '2019-05-12'],
    ['1.5.2019', '2019-05-01'],
    ['01.05.2019', '2019-05-01'],
    ['1/5/2019', '2019-05-01'],
    ['1-5-2019', '2019-05-01'],
    ['1 5 2019', '2019-05-01'],
    ['12. 05. 2019', '2019-05-12'],
    ['12,05,2019', '2019-05-12'],
    ['12.05.19', '2019-05-12'],
    ['1.5.19', '2019-05-01'],
    ['13.01.22', '2022-01-13'],
    ['12.05.98', '1998-05-12'],
    ['12052019', '2019-05-12'],
    ['120519', '2019-05-12'],
    ['2019-05-12', '2019-05-12'],
    ['2019.5.12', '2019-05-12'],
    ['20190512', '2019-05-12'],
  ])('день: «%s» → %s', (text, expected) => {
    expect(stored(text)).toBe(expected);
  });

  it.each([
    ['05.2019', '2019-05'],
    ['5.2019', '2019-05'],
    ['5/19', '2019-05'],
    ['05.19', '2019-05'],
    ['052019', '2019-05'],
    ['0519', '2019-05'],
    ['2019-05', '2019-05'],
    ['травень 2019', '2019-05'],
    ['Травня 2019', '2019-05'],
    ['май 2019', '2019-05'],
    ['May 2019', '2019-05'],
    ['листопад 21', '2021-11'],
    ['липень 2020', '2020-07'],
    ['6 місяців тому', '2026-04'],
    ['2 роки тому', '2024-10'],
    ['півроку тому', '2026-04'],
    ['Mai 2019', '2019-05'],
    ['mei 2019', '2019-05'],
    ['mayo 2019', '2019-05'],
    ['agosto 2018', '2018-08'],
    ['2019年5月', '2019-05'],
  ])('місяць: «%s» → %s', (text, expected) => {
    expect(stored(text)).toBe(expected);
  });

  it.each([
    ['12 травня 2019', '2019-05-12'],
    ['12 мая 2019', '2019-05-12'],
    ['1 березня 2020 р.', '2020-03-01'],
    ['3 August 2018', '2018-08-03'],
    ['May 12 2019', '2019-05-12'],
    ['August 3 2018', '2018-08-03'],
    ['May 12, 19', '2019-05-12'],
    ['12. März 2019', '2019-03-12'],
    ['2019年5月12日', '2019-05-12'],
    ['через 10 тижнів', '2027-01-01'],
    ['3 тижні тому', '2026-10-02'],
  ])('день словами: «%s» → %s', (text, expected) => {
    expect(stored(text)).toBe(expected);
  });

  it.each([['2019', '2019'], ['2019 рік', '2019'], ['2019 р.', '2019']])('рік: «%s» → %s', (text, expected) => {
    expect(stored(text)).toBe(expected);
  });

  it('без року не вгадує', () => {
    expect(parseDeliveryDateInput('12.05', now).reason).toBe('noYear');
    expect(parseDeliveryDateInput('12 травня', now).reason).toBe('noYear');
  });

  it('не дату називає не датою', () => {
    ['15.20.19', '31.02.2020', 'вчора', 'абв', '20.19.0512', '123'].forEach(text => {
      expect(readDeliveryDate(text, now).ok).toBe(false);
    });
  });

  it('майбутнє в межах вагітності — очікувані пологи, далі — описка', () => {
    const soon = readDeliveryDate('15.01.2027', now);
    expect(soon.ok).toBe(true);
    expect(soon.future).toBe(true);
    expect(soon.weeksAhead).toBe(12);
    expect(readDeliveryDate('2027-10-01', now)).toEqual({ ok: false, reason: 'tooFar' });
    expect(readDeliveryDate('1950', now)).toEqual({ ok: false, reason: 'tooOld' });
  });

  it('поточний місяць і рік — не майбутнє', () => {
    expect(readDeliveryDate('10.2026', now).future).toBe(false);
    expect(readDeliveryDate('2026', now).future).toBe(false);
  });

  it('у полі показує ту точність, яку дала людина', () => {
    expect(formatDeliveryDateForInput(parseDeliveryDateInput('1.5.19', now))).toBe('01.05.2019');
    expect(formatDeliveryDateForInput(parseDeliveryDateInput('травень 2019', now))).toBe('05.2019');
    expect(formatDeliveryDateForInput(parseDeliveryDateInput('2019', now))).toBe('2019');
  });

  it('картка рахує «як давно» і з місяця, і з року', () => {
    expect(monthsSinceDate('2026-04', now)).toBe(6);
    expect(monthsSinceDate('2024', now)).toBe(27);
    expect(monthsSinceDate('2019-05-12', now)).toBe(89);
  });

  it('відносні місяці не переповнюють короткий місяць', () => {
    const endOfOctober = new Date(2026, 9, 31);
    expect(toStoredDeliveryDate(parseDeliveryDateInput('8 місяців тому', endOfOctober))).toBe('2026-02');
    expect(toStoredDeliveryDate(parseDeliveryDateInput('6 місяців тому', endOfOctober))).toBe('2026-04');
  });

  it('«через 1 тиждень» лишається майбутнім', () => {
    const read = readDeliveryDate('через 1 тиждень', now);
    expect(read.future).toBe(true);
    expect(read.weeksAhead).toBe(1);
  });

  it('поточний рік до липня картка не ховає', () => {
    const march = new Date(2026, 2, 15);
    expect(readDeliveryDate('2026', march).ok).toBe(true);
    expect(monthsSinceDate('2026', march)).toBe(1);
    expect(monthsSinceDate('2026', new Date(2026, 0, 10))).toBe(0);
  });
});
