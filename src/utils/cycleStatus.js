const SERVER_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const PREGNANCY_DURATION_DAYS = 40 * 7;

const parseServerDate = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = SERVER_DATE_PATTERN.exec(trimmed);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const normalizeDate = date => {
  if (!date) return null;
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const isFutureDate = date => {
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) return false;

  const today = normalizeDate(new Date());
  return normalizedDate.getTime() > today.getTime();
};

// Дата пологів буває й неповною — `2027-01` чи `2027` (`deliveryDateInput`
// кладе ту точність, яку дала людина). Неповна дата — це період, і про
// вагітність каже лише тоді, коли весь він попереду: очікувані пологи «в
// січні 2027» — вагітна. Поточний місяць чи рік («2026-10» у жовтні 2026)
// поле читає як пологи, що вже були, тож явного статусу (місячні,
// стимуляція) такий запис не перебиває — `current`. Минулий період — пологи
// позаду. Поки тут читався лише `YYYY-MM-DD`, очікувані «01.2027» в адмінці
// вагітністю не рахувались; поки неповна дата бралась кінцем свого періоду,
// «2026» у жовтні 2026 робило вагітною кожну, хто народила цього року.
const readDeliveryTiming = value => {
  const full = parseServerDate(value);
  if (full) return isFutureDate(full) ? 'future' : 'past';
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 0;
  if (match[2] && (month < 1 || month > 12)) return null;
  const start = new Date(year, month ? month - 1 : 0, 1);
  const end = month ? new Date(year, month, 0) : new Date(year, 12, 0);
  if (isFutureDate(start)) return 'future';
  if (!isFutureDate(end)) {
    const today = normalizeDate(new Date());
    return end.getTime() < today.getTime() ? 'past' : 'current';
  }
  return 'current';
};

export const getExpectedDeliveryDate = lastCycleDate => {
  if (!lastCycleDate) return null;
  const expectedDelivery = new Date(lastCycleDate);
  if (Number.isNaN(expectedDelivery.getTime())) return null;

  expectedDelivery.setDate(expectedDelivery.getDate() + PREGNANCY_DURATION_DAYS);
  return expectedDelivery;
};

const getExpectedDeliveryFromLastCycle = lastCycle => {
  const parsedLastCycle = parseServerDate(lastCycle);
  return getExpectedDeliveryDate(parsedLastCycle);
};

export const getEffectiveCycleStatus = user => {
  if (!user) return undefined;

  const deliveryTiming = readDeliveryTiming(user.lastDelivery);
  if (deliveryTiming === 'future') {
    return 'pregnant';
  }
  if (deliveryTiming === 'past' && user.cycleStatus === 'pregnant') {
    return 'menstruation';
  }

  if (user.cycleStatus === 'pregnant') {
    const expectedDelivery = getExpectedDeliveryFromLastCycle(user.lastCycle);
    if (expectedDelivery && !isFutureDate(expectedDelivery)) {
      return 'menstruation';
    }
  }

  return user.cycleStatus;
};

export { parseServerDate, PREGNANCY_DURATION_DAYS };
