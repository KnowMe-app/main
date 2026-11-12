import {
  buildLatencyProbeUpdate,
  formatLatencySummary,
  isLatencyProbeExcluded,
  isUkraineTimeZone,
  latencyBucketFor,
  markProbedToday,
  shouldProbeToday,
  summarizeLatencyProbes,
  toLocalDayKey,
} from '../latencyProbe';

const memoryStorage = () => {
  const data = {};
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
};

describe('кошики затримки', () => {
  it('кладе мілісекунди в найменший кошик, що їх вміщає', () => {
    expect(latencyBucketFor(0)).toBe('le100');
    expect(latencyBucketFor(100)).toBe('le100');
    expect(latencyBucketFor(101)).toBe('le200');
    expect(latencyBucketFor(2999)).toBe('le3000');
    expect(latencyBucketFor(5000)).toBe('over');
  });

  it('нечислове й відʼємне не міряється', () => {
    expect(latencyBucketFor(NaN)).toBeNull();
    expect(latencyBucketFor(-5)).toBeNull();
    expect(buildLatencyProbeUpdate({ day: '2026-11-09', rttMs: NaN, increment: n => n })).toBeNull();
  });

  it('запис — один лічильник у кошику дня, без жодних інших полів', () => {
    expect(buildLatencyProbeUpdate({ day: '2026-11-09', rttMs: 240, increment: n => ({ inc: n }) }))
      .toEqual({ '2026-11-09/le300': { inc: 1 } });
  });
});

describe('кого міряти й звідки', () => {
  it('заміри з України лягають у кошик з префіксом', () => {
    expect(buildLatencyProbeUpdate({ day: '2026-11-09', rttMs: 240, increment: n => n, ukraine: true }))
      .toEqual({ '2026-11-09/ua_le300': 1 });
    expect(isUkraineTimeZone('Europe/Kyiv')).toBe(true);
    expect(isUkraineTimeZone('Europe/Kiev')).toBe(true);
    expect(isUkraineTimeZone('Europe/Warsaw')).toBe(false);
    expect(isUkraineTimeZone('')).toBe(false);
  });

  it('не міряє автоматизований браузер, інспектора й QA-пошту', () => {
    expect(isLatencyProbeExcluded({ uid: 'u1', webdriver: true })).toBe(true);
    expect(isLatencyProbeExcluded({ uid: 'vtDxkDMjCwYuTDqTUnZsO29bpQr1' })).toBe(true);
    expect(isLatencyProbeExcluded({ uid: 'u1', email: 'knowme.qa.1.a@example.com' })).toBe(true);
    expect(isLatencyProbeExcluded({ uid: 'u1', email: 'reader@gmail.com', webdriver: false })).toBe(false);
  });
});

describe('раз на добу з пристрою', () => {
  it('міряє, поки сьогодні ще не міряли, і не повторює того ж дня', () => {
    const storage = memoryStorage();
    expect(shouldProbeToday({ storage, uid: 'u1', day: '2026-11-09' })).toBe(true);
    markProbedToday({ storage, uid: 'u1', day: '2026-11-09' });
    expect(shouldProbeToday({ storage, uid: 'u1', day: '2026-11-09' })).toBe(false);
    expect(shouldProbeToday({ storage, uid: 'u1', day: '2026-11-10' })).toBe(true);
    // Інший акаунт на тому самому пристрої — окремий замір.
    expect(shouldProbeToday({ storage, uid: 'u2', day: '2026-11-09' })).toBe(true);
  });

  it('без памʼяті пристрою чи читача не міряє зовсім', () => {
    expect(shouldProbeToday({ storage: null, uid: 'u1', day: '2026-11-09' })).toBe(false);
    expect(shouldProbeToday({ storage: memoryStorage(), uid: '', day: '2026-11-09' })).toBe(false);
  });

  it('день — місцевий, у вигляді ключа бази', () => {
    expect(toLocalDayKey(new Date(2026, 10, 9, 23, 59))).toBe('2026-11-09');
  });
});

describe('зведення для адміна', () => {
  const today = new Date(2026, 10, 9, 12);

  it('рахує заміри за вікно днів, медіану й 90-й перцентиль кошиками', () => {
    const summary = summarizeLatencyProbes({
      a: { '2026-11-09': { le200: 3, le500: 1 }, '2026-10-01': { over: 50 } },
      b: { '2026-11-08': { le300: 5, le1500: 1 } },
      c: { '2026-10-02': { le100: 9 } },
    }, { days: 7, today });

    expect(summary.total).toBe(10);
    expect(summary.viewers).toBe(2);
    expect(summary.median).toBe('le300');
    expect(summary.p90).toBe('le500');
    expect(summary.fastShare).toBeCloseTo(0.8);
  });

  it('без замірів каже про це словами', () => {
    expect(formatLatencySummary(summarizeLatencyProbes(null, { today }))).toBe('За 7 днів замірів ще немає.');
  });

  it('звіт — окремо Україна й усі, з медіаною, 90% і часткою швидких', () => {
    const text = formatLatencySummary(summarizeLatencyProbes({
      a: { '2026-11-09': { ua_le200: 9, ua_over: 1 } },
      b: { '2026-11-09': { le100: 10 } },
    }, { today }));
    expect(text).toBe('За 7 днів. '
      + 'Україна (за часовим поясом пристрою): 10 замірів з 1 акаунтів, медіана ≤ 200 мс, 90% — ≤ 200 мс, до 300 мс — 90%. '
      + 'Усі: 20 замірів з 2 акаунтів, медіана ≤ 100 мс, 90% — ≤ 200 мс, до 300 мс — 95%.');
  });

  it('інспектора не рахує ніде — його заміри з машини розробки', () => {
    const summary = summarizeLatencyProbes({
      vtDxkDMjCwYuTDqTUnZsO29bpQr1: { '2026-11-09': { le100: 30 } },
      a: { '2026-11-09': { ua_le300: 2 } },
    }, { today });
    expect(summary.all.total).toBe(2);
    expect(summary.ukraine.total).toBe(2);
  });
});
