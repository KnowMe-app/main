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
// кладе ту точність, яку дала людина). Для питання «ще вагітна?» неповна дата
// означає останній день свого місяця чи року: очікувані «в січні» пологи
// лишаються майбутніми до кінця січня. Поки тут читався лише `YYYY-MM-DD`,
// СМ з очікуваними пологами «01.2027» в адмінці вагітною не вважалась.
const parseDeliveryServerDate = value => {
  const full = parseServerDate(value);
  if (full) return full;
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 12;
  if (month < 1 || month > 12) return null;
  return new Date(year, month, 0);
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

  const parsedDelivery = parseDeliveryServerDate(user.lastDelivery);
  if (parsedDelivery) {
    if (isFutureDate(parsedDelivery)) {
      return 'pregnant';
    }

    if (user.cycleStatus === 'pregnant') {
      return 'menstruation';
    }
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
