import {
  MATCHING_COUNTDOWN_TICK_MS,
  MATCHING_THROTTLED_LOAD_BATCH,
  MATCHING_THROTTLED_LOAD_DELAY_MS,
  formatMatchingCountdown,
  quantizeMatchingCountdown,
} from '../matchingFeedThrottle';

describe('пауза між сторінками стрічки matching', () => {
  it('тримає домовлені десять секунд і дві картки', () => {
    expect(MATCHING_THROTTLED_LOAD_DELAY_MS).toBe(10000);
    expect(MATCHING_THROTTLED_LOAD_BATCH).toBe(2);
  });

  it('показує секунди і три розряди мілісекунд', () => {
    expect(formatMatchingCountdown(10000)).toBe('10.000');
    expect(formatMatchingCountdown(9847)).toBe('09.847');
    expect(formatMatchingCountdown(1005)).toBe('01.005');
    expect(formatMatchingCountdown(999)).toBe('00.999');
  });

  it('тримає сталу ширину на всьому шляху відліку', () => {
    // Без нуля попереду «10.000» і «9.950» різної довжини, і на переході через
    // десяту секунду весь рядок смикається вбік.
    const widths = new Set(
      [10000, 9950, 5000, 999, 0].map(ms => formatMatchingCountdown(ms).length),
    );
    expect(widths.size).toBe(1);
  });

  it('доходить рівно до нуля і не йде нижче', () => {
    expect(formatMatchingCountdown(0)).toBe('00.000');
    expect(formatMatchingCountdown(-500)).toBe('00.000');
  });

  it('не ламається на сміттєвому вводі', () => {
    expect(formatMatchingCountdown(undefined)).toBe('00.000');
    expect(formatMatchingCountdown(null)).toBe('00.000');
    expect(formatMatchingCountdown(NaN)).toBe('00.000');
  });

  it('прив\'язує показане значення до кроку, а не до моменту кадру', () => {
    // Звідси рівний хід: розряди йдуть кроками, а не випадковими числами.
    expect(MATCHING_COUNTDOWN_TICK_MS).toBe(50);
    expect(quantizeMatchingCountdown(9847)).toBe(9850);
    expect(quantizeMatchingCountdown(9850)).toBe(9850);
    expect(quantizeMatchingCountdown(1)).toBe(50);
  });

  it('не піднімає нуль до кроку — інакше відлік не показував би нуля', () => {
    expect(quantizeMatchingCountdown(0)).toBe(0);
    expect(quantizeMatchingCountdown(-10)).toBe(0);
  });
});
