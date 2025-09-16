import { getEffectiveCycleStatus } from '../cycleStatus';

const formatServerDate = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

describe('getEffectiveCycleStatus', () => {
  it('returns pregnant when lastDelivery is in the future', () => {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const future = new Date(base);
    future.setDate(base.getDate() + 7);
    const user = {
      cycleStatus: 'stimulation',
      lastDelivery: formatServerDate(future),
    };

    expect(getEffectiveCycleStatus(user)).toBe('pregnant');
  });

  it('falls back to cycleStatus when lastDelivery is not in the future', () => {
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    const past = new Date(base);
    past.setDate(base.getDate() - 7);
    const user = {
      cycleStatus: 'menstruation',
      lastDelivery: formatServerDate(past),
    };

    expect(getEffectiveCycleStatus(user)).toBe('menstruation');
  });

  it('returns undefined when user has no cycleStatus or future delivery', () => {
    const user = {
      lastDelivery: 'invalid-date',
    };

    expect(getEffectiveCycleStatus(user)).toBeUndefined();
  });
});
