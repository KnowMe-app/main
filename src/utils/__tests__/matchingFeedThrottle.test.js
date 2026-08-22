import {
  MATCHING_THROTTLED_LOAD_BATCH,
  MATCHING_THROTTLED_LOAD_DELAY_MS,
  formatMatchingCountdown,
} from '../matchingFeedThrottle';

describe('пауза між сторінками стрічки matching', () => {
  it('тримає домовлені десять секунд і дві картки', () => {
    expect(MATCHING_THROTTLED_LOAD_DELAY_MS).toBe(10000);
    expect(MATCHING_THROTTLED_LOAD_BATCH).toBe(2);
  });

  it('показує секунди і три розряди мілісекунд', () => {
    expect(formatMatchingCountdown(10000)).toBe('10.000');
    expect(formatMatchingCountdown(9847)).toBe('9.847');
    expect(formatMatchingCountdown(1005)).toBe('1.005');
    expect(formatMatchingCountdown(999)).toBe('0.999');
  });

  it('доходить рівно до нуля і не йде нижче', () => {
    expect(formatMatchingCountdown(0)).toBe('0.000');
    expect(formatMatchingCountdown(-500)).toBe('0.000');
  });

  it('не ламається на сміттєвому вводі', () => {
    expect(formatMatchingCountdown(undefined)).toBe('0.000');
    expect(formatMatchingCountdown(null)).toBe('0.000');
    expect(formatMatchingCountdown(NaN)).toBe('0.000');
  });
});
