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

  const parsedDelivery = parseServerDate(user.lastDelivery);
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
