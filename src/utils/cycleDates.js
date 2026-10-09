/*
 * Дні циклу й робочі дні — спільне для графіка стимуляції
 * (`StimulationSchedule`) і приблизного графіка програми (`programTimeline`).
 *
 * Правило одне: візит і перенос стоять лише на робочому дні, а «N-й день»
 * рахується від першого дня місячних, і перший день — це 1, а не 0. Поки ці
 * функції жили всередині компонента графіка, другий графік мусив би
 * повторювати їх — і перенос «19–22 день, лише будній» розійшовся б з першої ж
 * правки.
 */

export const isWeekend = date => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/** Номер дня циклу: база — перший день. */
export const diffDays = (date, base) =>
  Math.round((date - base) / (1000 * 60 * 60 * 24)) + 1;

export const adjustForward = (date, base) => {
  let day = diffDays(date, base);
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
    day = diffDays(date, base);
  }
  return { date, day, sign: '' };
};

export const adjustBackward = (date, base) => {
  let day = diffDays(date, base);
  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
    day = diffDays(date, base);
  }
  return { date, day, sign: '' };
};

/**
 * Перший робочий день у вікні днів циклу `from..to` (включно). Якщо все вікно
 * випало на вихідні — найближчий робочий день до `fallbackDay` назад.
 * Так стоять перенос (19–22 день) і диферелін перед ним.
 */
export const findWorkingCycleDay = (base, from, to, fallbackDay = to) => {
  for (let n = from; n <= to; n += 1) {
    const candidate = new Date(base);
    candidate.setDate(base.getDate() + n - 1);
    if (!isWeekend(candidate)) return { date: candidate, day: n, sign: '' };
  }
  const fallback = new Date(base);
  fallback.setDate(base.getDate() + fallbackDay - 1);
  return adjustBackward(fallback, base);
};
