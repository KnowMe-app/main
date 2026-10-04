import { resolveRecentDate, toRecentDate } from '../adminRecentFeed';
import { placeOwnDraftsInFeed } from '../matchingDraftPlacement';

describe('дата свіжості картки для стрічки адміна', () => {
  it('читає дату в будь-якому написанні, яке лежить у базі', () => {
    expect(toRecentDate('2026-10-04')).toBe('2026-10-04');
    expect(toRecentDate('2026-10-04T21:15:00.000Z')).toBe('2026-10-04');
    expect(toRecentDate('04.10.2026')).toBe('2026-10-04');
    expect(toRecentDate(Date.UTC(2026, 9, 4, 12))).toBe('2026-10-04');
    expect(toRecentDate(['2026-09-01', '2026-10-01', ''])).toBe('2026-10-01');
    expect(toRecentDate('')).toBe('');
    expect(toRecentDate(false)).toBe('');
  });

  it('бере найсвіжішу з дат входу, створення й публікації', () => {
    expect(resolveRecentDate({ lastLogin: '2026-09-01', createdAt2: '2026-10-04', feedDate: '2026-08-01' })).toBe('2026-10-04');
    // Імпорт з таблиці писав мітку часу, стара анкета — дату крапками.
    expect(resolveRecentDate({ createdAt2: Date.UTC(2026, 9, 2), lastLogin: '01.10.2026' })).toBe('2026-10-02');
    // `feedDate: false` — схована анкета, дати в ній немає.
    expect(resolveRecentDate({ feedDate: false, lastLogin2: '2026-09-01' })).toBe('2026-09-01');
    expect(resolveRecentDate({})).toBe('');
  });

  it('бере registrationDate, якщо профіль ще жодного разу не входив', () => {
    expect(resolveRecentDate({ registrationDate: '04.10.2026' }, '2026-10-04')).toBe('2026-10-04');
  });

  it('не бере дату з майбутнього', () => {
    expect(resolveRecentDate({ createdAt: '2099-01-01', lastLogin: '2026-09-01' }, '2026-10-04')).toBe('2026-09-01');
  });
});

describe('чернетки в стрічці адміна', () => {
  it('стають за свіжістю картки, а не над кожною неопублікованою', () => {
    const users = [
      { userId: 'fresh', __recentAt: '2026-10-04' },
      { userId: 'older', __recentAt: '2026-09-01' },
    ];
    const drafts = [{ userId: 'draft', __feedOrderDate: '2026-09-15' }];
    expect(placeOwnDraftsInFeed({ drafts, users }).map(card => card.userId)).toEqual(['fresh', 'draft', 'older']);
  });
});

describe('фільтр видимості в стрічці адміна', () => {
  // eslint-disable-next-line global-require
  const { applyMatchingUiFiltersToUsers } = require('../matchingDataProvider');

  it('пропускає сховану картку з адмінського джерела, а з загального — ні', () => {
    const users = [
      { userId: 'fromAdmin', publish: false, __adminRecent: true },
      { userId: 'fromFeed', publish: false },
    ];
    const kept = applyMatchingUiFiltersToUsers({ users, filters: {} });
    expect(kept.map(user => user.userId)).toEqual(['fromAdmin']);
  });
});
