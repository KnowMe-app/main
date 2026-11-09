import { describeCardActivity, formatActivityAgo, parseActivityDate, pickCardActivity } from './cardActivity';

const NOW = new Date(2026, 10, 9, 10, 0).getTime();

describe('cardActivity', () => {
  it('reads both ISO and dotted dates', () => {
    expect(parseActivityDate('2026-11-05')).toBe('2026-11-05');
    expect(parseActivityDate('5.11.2026')).toBe('2026-11-05');
    expect(parseActivityDate('garbage')).toBe('');
    expect(parseActivityDate('')).toBe('');
  });

  it('prefers last sign-in and falls back to registration, then createdAt', () => {
    expect(pickCardActivity({ lastLogin: '2026-11-01', registrationDate: '01.01.2025' }))
      .toEqual({ date: '2026-11-01', kind: 'login' });
    expect(pickCardActivity({ registrationDate: '01.01.2025' }))
      .toEqual({ date: '2025-01-01', kind: 'registration' });
    expect(pickCardActivity({ createdAt: '2024-03-02' }))
      .toEqual({ date: '2024-03-02', kind: 'registration' });
    expect(pickCardActivity({})).toBeNull();
    expect(pickCardActivity(null)).toBeNull();
  });

  it('formats how long ago in days, months and years', () => {
    expect(formatActivityAgo('2026-11-09', 'en', { now: NOW })).toBe('today');
    expect(formatActivityAgo('2026-11-06', 'en', { now: NOW })).toMatch(/3 days ago/);
    expect(formatActivityAgo('2026-08-01', 'en', { now: NOW })).toMatch(/3 mo/);
    expect(formatActivityAgo('2024-10-01', 'en', { now: NOW })).toMatch(/2 yr/);
  });

  it('labels a sign-in and a registration differently, with the exact date in the title', () => {
    const login = describeCardActivity({ date: '2026-11-06', kind: 'login' }, 'uk', { now: NOW });
    expect(login.label).toMatch(/^Вхід /);
    expect(login.title).toBe('Останній вхід: 06.11.2026');
    const registration = describeCardActivity({ date: '2025-01-01', kind: 'registration' }, 'uk', { now: NOW });
    expect(registration.label).toMatch(/^Реєстрація /);
    expect(registration.title).toBe('Входів не було, реєстрація: 01.01.2025');
    expect(describeCardActivity(null, 'uk')).toBeNull();
  });
});
