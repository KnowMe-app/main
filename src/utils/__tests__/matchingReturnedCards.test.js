import { listReturnedReactionIds, placeReturnedCardsFirst } from '../matchingReturnedCards';

describe('повернення картки з колекції в «Усі»', () => {
  it('повернене — це зняте з колекції, а не перенесене в протилежну', () => {
    expect(listReturnedReactionIds({
      previousMap: { a: true, b: true, c: true },
      nextMap: { c: true },
      oppositeMap: { b: true },
    })).toEqual(['a']);
  });

  it('нова реакція повернення не дає', () => {
    expect(listReturnedReactionIds({ previousMap: {}, nextMap: { a: true } })).toEqual([]);
  });

  it('повернена картка стоїть першою, навіть коли пагінація її ще не дочитала', () => {
    const users = [{ userId: 'x' }, { userId: 'y' }];
    expect(placeReturnedCardsFirst({ users, returnedCards: [{ userId: 'old' }] }).map(u => u.userId))
      .toEqual(['old', 'x', 'y']);
  });

  it('дочитана пагінацією картка не задвоюється, і береться її свіжа версія', () => {
    const users = [{ userId: 'x' }, { userId: 'old', name: 'свіжа' }];
    const result = placeReturnedCardsFirst({ users, returnedCards: [{ userId: 'old', name: 'стара' }] });
    expect(result.map(u => u.userId)).toEqual(['old', 'x']);
    expect(result[0].name).toBe('свіжа');
  });

  it('картку, на яку відреагували знову, з голови деки знято', () => {
    const users = [{ userId: 'x' }];
    expect(placeReturnedCardsFirst({ users, returnedCards: [{ userId: 'old' }], favoriteUsers: { old: true } }))
      .toBe(users);
  });
});

describe('liftReturnedCards', () => {
  const { liftReturnedCards } = require('../matchingReturnedCards');

  it('піднімає повернене над головами злиття, новіше вище', () => {
    const merged = [{ userId: 'draft' }, { userId: 'x' }, { userId: 'old1' }, { userId: 'old2' }];
    expect(liftReturnedCards(merged, [{ userId: 'old2' }, { userId: 'old1' }]).map(u => u.userId))
      .toEqual(['old2', 'old1', 'draft', 'x']);
  });

  it('не вставляє картку, якої злиття не пропустило', () => {
    const merged = [{ userId: 'x' }];
    expect(liftReturnedCards(merged, [{ userId: 'filtered-out' }])).toBe(merged);
  });
});
