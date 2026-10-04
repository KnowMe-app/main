import { pickRecentPage, resolveRecentDate, toRecentDate } from '../adminRecentFeed';

describe('стрічка адміна за свіжістю картки', () => {
  it('читає дату в будь-якому написанні, яке лежить у базі', () => {
    expect(toRecentDate('2026-10-04')).toBe('2026-10-04');
    expect(toRecentDate('2026-10-04T21:15:00.000Z')).toBe('2026-10-04');
    expect(toRecentDate('04.10.2026')).toBe('2026-10-04');
    expect(toRecentDate(Date.UTC(2026, 9, 4, 12))).toBe('2026-10-04');
    expect(toRecentDate('')).toBe('');
    expect(toRecentDate(false)).toBe('');
  });

  it('бере найсвіжішу з трьох дат картки', () => {
    expect(resolveRecentDate({ lastLogin: '2026-09-01', createdAt: '2026-10-04', feedDate: '2026-08-01' })).toBe('2026-10-04');
    // `feedDate: false` — схована анкета, дати в ній немає.
    expect(resolveRecentDate({ feedDate: false, lastLogin: '2026-09-01' })).toBe('2026-09-01');
    expect(resolveRecentDate({})).toBe('');
  });

  it('нова неопублікована анкета стоїть над старою опублікованою', () => {
    const { page } = pickRecentPage({
      records: {
        published: { feedDate: '2026-08-01' },
        fresh: { createdAt: '2026-10-04' },
        returning: { lastLogin: '2026-09-15' },
      },
      streams: [],
      limit: 10,
    });
    expect(page.map(entry => entry.userId)).toEqual(['fresh', 'returning', 'published']);
  });

  it('не віддає того, що лежить нижче межі повного вікна', () => {
    // Вікно `lastLogin` повне, найнижча його дата — 09-01: картка з входом
    // 08-20 могла лишитись за межею вікна, тож і 08-15 з іншого індексу ще не
    // можна ставити — між ними може бути пропущене.
    const result = pickRecentPage({
      records: {
        a: { lastLogin: '2026-10-01' },
        b: { lastLogin: '2026-09-01' },
        c: { createdAt: '2026-08-15' },
      },
      streams: [
        { dates: ['2026-10-01', '2026-09-01'], full: true },
        { dates: ['2026-08-15'], full: false },
      ],
      limit: 5,
    });
    expect(result.page.map(entry => entry.userId)).toEqual(['a']);
    expect(result.needsWiderWindow).toBe(true);
    expect(result.hasMore).toBe(true);
  });

  it('продовжує від курсора, не повторюючи картку на межі', () => {
    const records = {
      a: { lastLogin: '2026-10-01' },
      b: { lastLogin: '2026-10-01' },
      c: { lastLogin: '2026-09-01' },
    };
    const { page } = pickRecentPage({ records, streams: [], cursor: { date: '2026-10-01', userId: 'b' }, limit: 5 });
    expect(page.map(entry => entry.userId)).toEqual(['a', 'c']);
  });
});

describe('чернетки в стрічці адміна', () => {
  // eslint-disable-next-line global-require
  const { placeOwnDraftsInFeed } = require('../matchingDraftPlacement');

  it('стають за свіжістю картки, а не над кожною неопублікованою', () => {
    const users = [
      { userId: 'fresh', __recentAt: '2026-10-04' },
      { userId: 'older', __recentAt: '2026-09-01' },
    ];
    const drafts = [{ userId: 'draft', __feedOrderDate: '2026-09-15' }];
    expect(placeOwnDraftsInFeed({ drafts, users }).map(card => card.userId)).toEqual(['fresh', 'draft', 'older']);
  });
});
