const SERVER_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_PREGNANCY_DAYS = 41 * 7;

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

const getPregnancyDaysFromLastCycle = lastCycle => {
  const parsedLastCycle = parseServerDate(lastCycle);
  if (!parsedLastCycle) return null;

  const today = normalizeDate(new Date());
  const normalizedLastCycle = normalizeDate(parsedLastCycle);
  const diffMs = today.getTime() - normalizedLastCycle.getTime();
  if (diffMs < 0) return null;

  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
};

export const getEffectiveCycleStatus = user => {
  if (!user) return undefined;

  const parsedDelivery = parseServerDate(user.lastDelivery);
  if (parsedDelivery) {
    const today = normalizeDate(new Date());
    if (normalizeDate(parsedDelivery).getTime() > today.getTime()) {
      return 'pregnant';
    }

    if (user.cycleStatus === 'pregnant') {
      return 'menstruation';
    }
  }

  if (user.cycleStatus === 'pregnant') {
    const pregnancyDays = getPregnancyDaysFromLastCycle(user.lastCycle);
    if (pregnancyDays !== null && pregnancyDays >= MAX_PREGNANCY_DAYS) {
      return 'menstruation';
    }
  }

  return user.cycleStatus;
};

export { parseServerDate, MAX_PREGNANCY_DAYS };
