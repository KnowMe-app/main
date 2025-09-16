const SERVER_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseServerDate = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = SERVER_DATE_PATTERN.exec(trimmed);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getEffectiveCycleStatus = user => {
  if (!user) return undefined;

  const parsedDelivery = parseServerDate(user.lastDelivery);
  if (parsedDelivery) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsedDelivery.getTime() > today.getTime()) {
      return 'pregnant';
    }
  }

  return user.cycleStatus;
};

export { parseServerDate };
