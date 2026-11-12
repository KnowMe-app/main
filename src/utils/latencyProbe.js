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

import { READONLY_ADMIN_UIDS } from './accessLevel';

export const LATENCY_PROBES_ROOT = 'latencyProbes';

/** Межі кошиків у мілісекундах; останній — «довше за все перелічене». */
export const LATENCY_BUCKETS = Object.freeze([100, 200, 300, 500, 800, 1500, 3000]);
export const LATENCY_OVERFLOW_BUCKET = 'over';

export const LATENCY_PROBE_DONE_KEY_PREFIX = 'km.latencyProbe.v1:';

/**
 * Заміри з України лягають у кошики з префіксом `ua_` (`ua_le300`). Країну
 * знає лише часовий пояс пристрою — без геолокації й без IP: питання «чи
 * переїжджати в Європу» про читачів в Україні, а решта (зокрема тестові
 * запуски з контейнера розробки, що сидить у США) його лише розмивала.
 */
export const LATENCY_REGION_PREFIX = 'ua_';
const UKRAINE_TIME_ZONES = new Set([
  'Europe/Kyiv',
  'Europe/Kiev',
  'Europe/Uzhgorod',
  'Europe/Zaporozhye',
  'Europe/Simferopol',
]);

export const isUkraineTimeZone = timeZone => UKRAINE_TIME_ZONES.has(String(timeZone || ''));

export const readDeviceTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
};

/**
 * Не міряти взагалі: інспектор (тестовий акаунт), QA-акаунти з вигаданою
 * поштою й автоматизований браузер (`navigator.webdriver` — Playwright,
 * Selenium). Їхні заміри — це мережа машини розробки, а не телефони читачів,
 * і в першому ж тижні вони дали більшість «≤ 100 мс».
 */
export const isLatencyProbeExcluded = ({ uid, email, webdriver } = {}) => {
  if (webdriver === true) return true;
  if (uid && READONLY_ADMIN_UIDS.includes(uid)) return true;
  return /@example\.com$/i.test(String(email || '').trim());
};

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
export const buildLatencyProbeUpdate = ({ day, rttMs, increment, ukraine = false }) => {
  const bucket = latencyBucketFor(rttMs);
  if (!day || !bucket || typeof increment !== 'function') return null;
  return { [`${day}/${ukraine ? LATENCY_REGION_PREFIX : ''}${bucket}`]: increment(1) };
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

const summarizeCounts = (counts, total, viewers, days) => {
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

/**
 * Зведення по вузлу `latencyProbes` за останні `days` днів: скільки замірів,
 * з кількох пристроїв-акаунтів, медіана й 90-й перцентиль (з точністю до
 * кошика) і частка замірів до 300 мс — окремо для України (`ukraine`) і для
 * всіх (`all`). Інспектора не рахує ніде: його заміри — з машини розробки,
 * зокрема ті, що лягли до того, як клієнт перестав його міряти.
 */
export const summarizeLatencyProbes = (node, { days = 7, today = new Date() } = {}) => {
  const fromDay = toLocalDayKey(new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  const scopes = {
    all: { counts: {}, total: 0, viewers: 0 },
    ukraine: { counts: {}, total: 0, viewers: 0 },
  };
  Object.entries(node || {}).forEach(([uid, byDay]) => {
    if (READONLY_ADMIN_UIDS.includes(uid)) return;
    const seen = { all: false, ukraine: false };
    Object.entries(byDay || {}).forEach(([day, buckets]) => {
      if (day < fromDay || !buckets || typeof buckets !== 'object') return;
      LATENCY_BUCKET_KEYS.forEach(key => {
        const plain = Number(buckets[key]) || 0;
        const local = Number(buckets[`${LATENCY_REGION_PREFIX}${key}`]) || 0;
        const add = (scope, value) => {
          if (!value) return;
          scopes[scope].counts[key] = (scopes[scope].counts[key] || 0) + value;
          scopes[scope].total += value;
          seen[scope] = true;
        };
        add('all', plain + local);
        add('ukraine', local);
      });
    });
    if (seen.all) scopes.all.viewers += 1;
    if (seen.ukraine) scopes.ukraine.viewers += 1;
  });
  const all = summarizeCounts(scopes.all.counts, scopes.all.total, scopes.all.viewers, days);
  return {
    ...all,
    all,
    ukraine: summarizeCounts(scopes.ukraine.counts, scopes.ukraine.total, scopes.ukraine.viewers, days),
  };
};

const formatScope = (label, scope) => {
  if (!scope?.total) return `${label}: замірів ще немає.`;
  return `${label}: ${scope.total} замірів з ${scope.viewers} акаунтів, медіана ${describeLatencyBucket(scope.median)}, `
    + `90% — ${describeLatencyBucket(scope.p90)}, до 300 мс — ${Math.round(scope.fastShare * 100)}%.`;
};

export const formatLatencySummary = summary => {
  const days = summary?.days || 7;
  if (!summary?.total) return `За ${days} днів замірів ще немає.`;
  return [
    `За ${days} днів.`,
    formatScope('Україна (за часовим поясом пристрою)', summary.ukraine),
    formatScope('Усі', summary.all || summary),
  ].join(' ');
};
