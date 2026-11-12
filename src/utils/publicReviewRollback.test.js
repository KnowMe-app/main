import { restorePublicComment } from './publicReviewRollback';

describe('restorePublicComment', () => {
  const a = { id: 'a', text: 'перший', createdAt: 1 };
  const b = { id: 'b', text: 'другий', createdAt: 2 };
  const c = { id: 'c', text: 'третій', createdAt: 3 };

  it('повертає попередній текст правленого відгуку, не чіпаючи інших', () => {
    expect(restorePublicComment([a, { ...b, text: 'правка' }, c], b)).toEqual([a, b, c]);
  });

  it('повертає видалений відгук на його місце за часом', () => {
    expect(restorePublicComment([a, c], b)).toEqual([a, b, c]);
  });

  it('не стирає відгук, що зʼявився після дії', () => {
    const d = { id: 'd', text: 'новий', createdAt: 4 };
    expect(restorePublicComment([a, c, d], b)).toEqual([a, b, c, d]);
  });
});
