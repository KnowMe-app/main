/**
 * Замір затримки бази з пристроїв справжніх читачів.
 *
 * База стоїть у `us-central1`, а читачі — в Україні, і питання «чи варто
 * переїжджати в Європу» вирішують цифри з їхніх телефонів, а не з контейнера
 * розробки, що сидить в іншій мережі. Тож раз на добу з пристрою застосунок
 * міряє, скільки йде найменше читання бази, і кладе це в
 * `latencyProbes/{uid}/{дата}` лічильниками за кошиками часу — `increment()`,
 * тобто запис без читання й без жодних особистих даних, лише мілісекунди.
 *
 * Тут — чисті функції: кошики, вигляд запису й зведення для адміна. Мережевий
 * бік — `components/latencyProbeRemote.js`.
 */

export const LATENCY_PROBES_ROOT = 'latencyProbes';

/** Межі кошиків у мілісекундах; останній — «довше за все перелічене». */
export const LATENCY_BUCKETS = Object.freeze([100, 200, 300, 500, 800, 1500, 3000]);
export const LATENCY_OVERFLOW_BUCKET = 'over';

export const LATENCY_PROBE_DONE_KEY_PREFIX = 'km.latencyProbe.v1:';

export const latencyBucketFor = ms => {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return null;
  const bound = LATENCY_BUCKETS.find(limit => value <= limit);
  return bound ? `le${bound}` : LATENCY_OVERFLOW_BUCKET;
};

export const LATENCY_BUCKET_KEYS = Object.freeze([
  ...LATENCY_BUCKETS.map(limit => `le${limit}`),
  LATENCY_OVERFLOW_BUCKET,
]);

/** `YYYY-MM-DD` за місцевим часом — той самий день, що бачить людина. */
export const toLocalDayKey = (date = new Date()) => {
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const shouldProbeToday = ({ storage, uid, day }) => {
  if (!uid || !storage) return false;
  try {
    return storage.getItem(`${LATENCY_PROBE_DONE_KEY_PREFIX}${uid}`) !== day;
  } catch {
    return false;
  }
};

export const markProbedToday = ({ storage, uid, day }) => {
  try {
    storage.setItem(`${LATENCY_PROBE_DONE_KEY_PREFIX}${uid}`, day);
  } catch {
    // без памʼяті пристрою замір просто повториться завтра
  }
};

/**
 * Шляхи для одного `update` від `latencyProbes/{uid}`: кошик заміру й
 * лічильник днів. `increment` передається ззовні, щоб модуль лишався чистим.
 */
export const buildLatencyProbeUpdate = ({ day, rttMs, increment }) => {
  const bucket = latencyBucketFor(rttMs);
  if (!day || !bucket || typeof increment !== 'function') return null;
  return { [`${day}/${bucket}`]: increment(1) };
};

const percentileBucket = (counts, total, share) => {
  if (!total) return null;
  const target = Math.ceil(total * share);
  let seen = 0;
  for (const key of LATENCY_BUCKET_KEYS) {
    seen += counts[key] || 0;
    if (seen >= target) return key;
  }
  return LATENCY_OVERFLOW_BUCKET;
};

export const describeLatencyBucket = key => {
  if (!key) return '—';
  if (key === LATENCY_OVERFLOW_BUCKET) return `> ${LATENCY_BUCKETS[LATENCY_BUCKETS.length - 1]} мс`;
  return `≤ ${key.slice(2)} мс`;
};

/**
 * Зведення по вузлу `latencyProbes` за останні `days` днів: скільки замірів,
 * з кількох пристроїв-акаунтів, медіана й 90-й перцентиль (з точністю до
 * кошика) і частка замірів до 300 мс.
 */
export const summarizeLatencyProbes = (node, { days = 7, today = new Date() } = {}) => {
  const fromDay = toLocalDayKey(new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const counts = {};
  let total = 0;
  let viewers = 0;
  Object.values(node || {}).forEach(byDay => {
    let counted = false;
    Object.entries(byDay || {}).forEach(([day, buckets]) => {
      if (day < fromDay || !buckets || typeof buckets !== 'object') return;
      LATENCY_BUCKET_KEYS.forEach(key => {
        const value = Number(buckets[key]) || 0;
        if (!value) return;
        counts[key] = (counts[key] || 0) + value;
        total += value;
        counted = true;
      });
    });
    if (counted) viewers += 1;
  });
  const fast = ['le100', 'le200', 'le300'].reduce((sum, key) => sum + (counts[key] || 0), 0);
  return {
    days,
    total,
    viewers,
    counts,
    median: percentileBucket(counts, total, 0.5),
    p90: percentileBucket(counts, total, 0.9),
    fastShare: total ? fast / total : 0,
  };
};

export const formatLatencySummary = summary => {
  if (!summary?.total) return `За ${summary?.days || 7} днів замірів ще немає.`;
  return [
    `За ${summary.days} днів: ${summary.total} замірів з ${summary.viewers} акаунтів.`,
    `Медіана ${describeLatencyBucket(summary.median)}, 90% — ${describeLatencyBucket(summary.p90)}.`,
    `До 300 мс: ${Math.round(summary.fastShare * 100)}%.`,
  ].join(' ');
};
