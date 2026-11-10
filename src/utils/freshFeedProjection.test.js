import { replaceFeedProjection, replaceFeedProjections } from './freshFeedProjection';

const isProjection = user => Boolean(user?.__matchingSummary);

describe('свіжа проєкція замість кешованої', () => {
  it('стерте поле зникає: знятих програм і міста більше немає', () => {
    const current = { userId: 'a', __matchingSummary: true, city: 'Київ', programsAt: 5, rev: 1 };
    const fresh = { userId: 'a', __matchingSummary: true, rev: 1 };
    const next = replaceFeedProjection(current, fresh);
    expect(next).not.toHaveProperty('city');
    expect(next).not.toHaveProperty('programsAt');
  });

  it('клієнтські позначки лишаються', () => {
    const current = { userId: 'a', __matchingSummary: true, __feedOrderDate: '2026-11-01', name: 'Стара' };
    expect(replaceFeedProjection(current, { userId: 'a', __matchingSummary: true, name: 'Нова' }))
      .toEqual({ userId: 'a', __matchingSummary: true, __feedOrderDate: '2026-11-01', name: 'Нова' });
  });

  it('старіша за показану версією не стає', () => {
    const current = { userId: 'a', __matchingSummary: true, name: 'Нова', rev: 200 };
    expect(replaceFeedProjection(current, { userId: 'a', __matchingSummary: true, name: 'Стара', rev: 100 })).toBe(current);
  });

  it('без змін — той самий обʼєкт і той самий масив', () => {
    const user = { userId: 'a', __matchingSummary: true, name: 'Оксана', rev: 1 };
    const users = [user];
    expect(replaceFeedProjections(users, { a: { userId: 'a', __matchingSummary: true, name: 'Оксана', rev: 1 } }, isProjection)).toBe(users);
  });

  it('повну анкету в списку не чіпає', () => {
    const full = { userId: 'a', name: 'Оксана', surname: 'Коваленко' };
    const users = [full];
    expect(replaceFeedProjections(users, { a: { userId: 'a', __matchingSummary: true, name: 'Інша' } }, isProjection)).toBe(users);
  });
});
