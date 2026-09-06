import {
  MATCHING_COUNTDOWN_TICK_MS,
  MATCHING_THROTTLED_LOAD_BATCH,
  MATCHING_THROTTLED_LOAD_DELAY_MS,
  formatMatchingCountdown,
  matchingCountdownProgress,
  quantizeMatchingCountdown,
} from '../matchingFeedThrottle';

describe('пауза між сторінками стрічки matching', () => {
  it('тримає домовлені десять секунд і дві картки', () => {
    expect(MATCHING_THROTTLED_LOAD_DELAY_MS).toBe(10000);
    expect(MATCHING_THROTTLED_LOAD_BATCH).toBe(2);
  });

  // Мілісекунди звідси прибрані: у кінці стрічки крутився `02.700`, який
  // мінявся двадцять разів на секунду, а підпис поруч казав фіксоване
  // «за 10 с» — два числа, які між собою не збігались.
  it('показує цілі секунди, округлені вгору', () => {
    expect(formatMatchingCountdown(10000)).toBe('10');
    expect(formatMatchingCountdown(9847)).toBe('10');
    expect(formatMatchingCountdown(1005)).toBe('2');
    expect(formatMatchingCountdown(999)).toBe('1');
  });

  it('доходить рівно до нуля і не йде нижче', () => {
    expect(formatMatchingCountdown(0)).toBe('0');
    expect(formatMatchingCountdown(-500)).toBe('0');
  });

  it('не ламається на сміттєвому вводі', () => {
    expect(formatMatchingCountdown(undefined)).toBe('0');
    expect(formatMatchingCountdown(null)).toBe('0');
    expect(formatMatchingCountdown(NaN)).toBe('0');
  });

  it('дає частку минулого часу для смужки', () => {
    expect(matchingCountdownProgress(10000, 10000)).toBe(0);
    expect(matchingCountdownProgress(5000, 10000)).toBe(0.5);
    expect(matchingCountdownProgress(0, 10000)).toBe(1);
    // Час, «більший» за тривалість, і сміття не виносять смужку за межі.
    expect(matchingCountdownProgress(99999, 10000)).toBe(0);
    expect(matchingCountdownProgress(NaN, 10000)).toBe(1);
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
