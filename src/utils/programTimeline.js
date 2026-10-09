import { adjustForward, findWorkingCycleDay, isWeekend } from './cycleDates';

/*
 * Приблизний графік програми сурогатного материнства — від першого дня
 * місячних кандидатки до пологів, щоб, вступаючи в програму, вона бачила, коли
 * перенос і коли пологи.
 *
 * Дати рахує та сама логіка, що й графік стимуляції (`StimulationSchedule`,
 * спільні хелпери — `cycleDates`): перенос — перший робочий день з 19-го по
 * 22-й день циклу, диферелін — так само, а новий цикл після нього — через
 * 9 днів, на робочому дні. Візитів стимуляції тут немає навмисно: це графік
 * «коли чекати головного», а не розклад прийомів.
 *
 * Тижні вагітності — від першого дня циклу переносу, як їх рахує акушерство
 * (і `generateSchedule`): 12 тижнів — це база + 84 дні.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const PROGRAM_CYCLE_LENGTH = 28;

const atMidnight = date => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date, days) => {
  const next = atMidnight(date);
  next.setDate(next.getDate() + days);
  return next;
};

/** `YYYY-MM-DD` або `ДД.ММ.РРРР` (так лежать старі записи) — у дату. */
export const parseCycleDate = value => {
  const raw = String(Array.isArray(value) ? value[value.length - 1] ?? '' : value ?? '').trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dotted = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  let date = null;
  if (iso) date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (dotted) date = new Date(Number(dotted[3]), Number(dotted[2]) - 1, Number(dotted[1]));
  if (!date || Number.isNaN(date.getTime())) return null;
  return atMidnight(date);
};

export const formatCycleDateForStorage = date => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Місячні, записані давно, — це не старт програми: графік від них стояв би в
 * минулому. Від них відкладаються цикли по 28 днів, доки старт не стане
 * найближчим (не раніше ніж тиждень тому). Записана дата при цьому не
 * міняється — міняється лише те, від чого рахуємо.
 */
export const projectCycleStart = (lastCycle, today = new Date()) => {
  if (!lastCycle) return { date: null, projected: false };
  const floor = addDays(today, -7);
  let date = atMidnight(lastCycle);
  let projected = false;
  while (date < floor) {
    date = addDays(date, PROGRAM_CYCLE_LENGTH);
    projected = true;
  }
  return { date, projected };
};

const nextWorkingDay = date => {
  const next = atMidnight(date);
  while (isWeekend(next)) next.setDate(next.getDate() + 1);
  return next;
};

/** Повних тижнів від початку циклу переносу. */
const weeksFrom = (date, base) => Math.floor(Math.round((atMidnight(date) - base) / DAY_MS) / 7);

/**
 * Головні дати програми СМ. `dipherelin` — підготовка дифереліном: перенос
 * тоді йде в наступному циклі.
 *
 * Повертає `[{ key, date, label, week }]`; `week` є лише в подій від
 * переносу й далі — до переносу «тиждень вагітності» нічого не означає.
 */
export const buildSurrogacyTimeline = (cycleStart, { dipherelin = false } = {}) => {
  if (!cycleStart) return [];
  const first = atMidnight(cycleStart);
  const items = [{ key: 'cycle', date: first, label: 'Місячні' }];
  let base = first;
  if (dipherelin) {
    const dif = findWorkingCycleDay(first, 19, 22);
    items.push({ key: 'dipherelin', date: atMidnight(dif.date), label: 'Диферелін' });
    base = nextWorkingDay(addDays(dif.date, 9));
    items.push({ key: 'cycle2', date: base, label: 'Новий цикл' });
  }
  const transfer = atMidnight(findWorkingCycleDay(base, 19, 22).date);
  const hcg = addDays(transfer, 13);
  const heartbeat = atMidnight(adjustForward(addDays(hcg, 14), base).date);
  const week = (n, forward = true) => {
    const date = addDays(base, n * 7);
    return forward ? atMidnight(adjustForward(date, base).date) : date;
  };
  items.push(
    { key: 'transfer', date: transfer, label: 'Перенос ембріона' },
    { key: 'hcg', date: hcg, label: 'ХГЧ' },
    { key: 'heartbeat', date: heartbeat, label: 'УЗД, серцебиття' },
    { key: 'week12', date: week(12), label: 'Скринінг' },
    { key: 'week18', date: week(18), label: 'Скринінг' },
    { key: 'week36', date: week(36, false), label: 'Договір з пологовим' },
    { key: 'week40', date: week(40, false), label: 'Пологи' },
  );
  return items.map(item => (item.date >= transfer ? { ...item, week: weeksFrom(item.date, base) } : item));
};

const MONTHS = Object.freeze({
  uk: ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
});

/** «12 лис» — день і місяць скорочено. */
export const formatTimelineDate = (date, language = 'uk') => {
  const months = MONTHS[language === 'en' ? 'en' : 'uk'];
  return `${date.getDate()} ${months[date.getMonth()]}`;
};
