import { isBackToCardList, planCardUrlWrite, shouldGoBackInHistory } from './cardListHistory';

describe('AddNewProfile: «назад» з картки, відкритої зі списку', () => {
  it('картка зі списку — новий крок історії, а не заміна адреси списку', () => {
    expect(planCardUrlWrite({ activeUserId: 'A', currentUserIdInUrl: '', cardReturn: null, locationKey: 'list' }))
      .toEqual({ action: 'push' });
  });

  it('картка поверх картки й власні записи дублікатів — заміна', () => {
    const cardReturn = { listKey: 'list', restoring: false };
    expect(planCardUrlWrite({ activeUserId: 'B', currentUserIdInUrl: 'A', cardReturn, locationKey: 'card' }).action)
      .toBe('replace');
    expect(planCardUrlWrite({
      activeUserId: 'A', currentUserIdInUrl: '', cardReturn: null, locationKey: 'list', ownHistoryEntry: true,
    }).action).toBe('replace');
  });

  it('«назад» на запис списку вертає список і не пише адресу картки знову', () => {
    const cardReturn = { listKey: 'list', restoring: false };
    expect(isBackToCardList({ cardReturn, locationKey: 'list', urlUserId: null, activeUserId: 'A' })).toBe(true);
    expect(isBackToCardList({ cardReturn, locationKey: 'card', urlUserId: 'A', activeUserId: 'A' })).toBe(false);
    expect(isBackToCardList({ cardReturn: null, locationKey: 'list', urlUserId: null, activeUserId: 'A' })).toBe(false);

    cardReturn.restoring = true;
    expect(planCardUrlWrite({ activeUserId: 'A', currentUserIdInUrl: '', cardReturn, locationKey: 'list' }))
      .toEqual({ action: 'skip' });
    expect(planCardUrlWrite({ activeUserId: '', currentUserIdInUrl: '', cardReturn, locationKey: 'list' }))
      .toEqual({ action: 'skip', clearReturn: true });
  });

  it('кнопка «Назад до попереднього списку» йде назад історією, коли картка — свій крок', () => {
    expect(shouldGoBackInHistory({ cardReturn: { listKey: 'list', restoring: false }, locationKey: 'card' })).toBe(true);
    expect(shouldGoBackInHistory({ cardReturn: null, locationKey: 'card' })).toBe(false);
    expect(shouldGoBackInHistory({ cardReturn: { listKey: 'list', restoring: true }, locationKey: 'list' })).toBe(false);
  });
});
