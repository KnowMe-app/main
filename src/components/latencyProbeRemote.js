import { get, increment, ref, update } from 'firebase/database';
import { database } from './config';
import { noteRealtimeDemand } from '../utils/realtimeConnectionManager';
import {
  LATENCY_PROBES_ROOT,
  buildLatencyProbeUpdate,
  markProbedToday,
  shouldProbeToday,
  summarizeLatencyProbes,
  toLocalDayKey,
} from '../utils/latencyProbe';

/*
 * Мережевий бік заміру затримки (`utils/latencyProbe`).
 *
 * Замір не має коштувати того, що вже зекономлено: тепле перезавантаження
 * стрічки обходиться без жодного читання й без сокета до бази. Тож він
 * біжить лише тоді, коли зʼєднання вже відкрите з іншої причини
 * (`database._instanceStarted` — той самий прапорець, яким користується
 * `realtimeConnectionManager`), раз на добу з пристрою й через паузу після
 * старту, щоб не стати в чергу з запитами першого екрана.
 *
 * Міряється найменше читання — власний вузол заміру, — двічі поспіль, і
 * береться менше: перше могло чекати на відновлення зʼєднання.
 */

const PROBE_DELAY_MS = 20000;

const timeOneRead = async path => {
  const startedAt = performance.now();
  await get(ref(database, path));
  return performance.now() - startedAt;
};

export const runLatencyProbe = async uid => {
  const day = toLocalDayKey();
  const storage = typeof window !== 'undefined' ? window.localStorage : null;
  if (!shouldProbeToday({ storage, uid, day })) return null;
  // Сокета ще немає — сьогодні не міряємо, а не відкриваємо його заради цього.
  if (!database?._instanceStarted) return null;

  noteRealtimeDemand();
  const path = `${LATENCY_PROBES_ROOT}/${uid}/${day}`;
  const first = await timeOneRead(path);
  const second = await timeOneRead(path);
  const rttMs = Math.min(first, second);
  const patch = buildLatencyProbeUpdate({ day, rttMs, increment });
  if (!patch) return null;
  await update(ref(database, `${LATENCY_PROBES_ROOT}/${uid}`), patch);
  markProbedToday({ storage, uid, day });
  return rttMs;
};

let scheduledFor = '';

export const scheduleLatencyProbe = uid => {
  if (!uid || scheduledFor === uid || typeof window === 'undefined') return;
  scheduledFor = uid;
  window.setTimeout(() => {
    runLatencyProbe(uid).catch(error => {
      // Замір — статистика, а не функція застосунку: збій мовчить для людини.
      console.warn('[latencyProbe] замір не вдався', error?.code || error?.message || error);
    });
  }, PROBE_DELAY_MS);
};

/** Для адміна: зведення за тиждень (вузол цілком читають лише адміни). */
export const readLatencySummary = async ({ days = 7 } = {}) => {
  noteRealtimeDemand();
  const snapshot = await get(ref(database, LATENCY_PROBES_ROOT));
  return summarizeLatencyProbes(snapshot.exists() ? snapshot.val() : null, { days });
};
