import { updateCard, getCardsByList, addCardToList } from '../cardsStorage';
import { setIdsForQuery } from '../cardIndex';

describe('cardsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates card and triggers remote save', () => {
    const remoteSave = jest.fn().mockResolvedValue(undefined);
    const card = updateCard('1', { title: 'Card 1' }, remoteSave);
    const stored = JSON.parse(localStorage.getItem('cards'));
    expect(stored['1'].title).toBe('Card 1');
    expect(remoteSave).toHaveBeenCalledWith({ title: 'Card 1', userId: '1' });
    expect(card).toHaveProperty('lastAction');
  });

  it('removes specified keys from card', () => {
    updateCard('1', { title: 'Old', email: 'a' });
    updateCard('1', { title: 'New' }, undefined, ['email']);
    const stored = JSON.parse(localStorage.getItem('cards'));
    expect(stored['1'].email).toBeUndefined();
    expect(stored['1'].title).toBe('New');
  });

  it('shares updated data across lists without extra fetch', async () => {
    addCardToList('1', 'load2');
    addCardToList('1', 'favorite');
    updateCard('1', { title: 'Original' });
    updateCard('1', { title: 'Updated' });

    const remoteFetch = jest.fn();
    const { cards: load2Cards, fromCache: fromCache1 } = await getCardsByList(
      'load2',
      remoteFetch,
    );
    const { cards: favoriteCards, fromCache: fromCache2 } = await getCardsByList(
      'favorite',
      remoteFetch,
    );

    expect(remoteFetch).not.toHaveBeenCalled();
    expect(fromCache1).toBe(true);
    expect(fromCache2).toBe(true);
    expect(load2Cards[0].title).toBe('Updated');
    expect(favoriteCards[0].title).toBe('Updated');
  });

  it('refreshes expired card from backend', async () => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const expired = Date.now() - SIX_HOURS - 1000;
    const oldCard = { userId: '1', title: 'Old', lastAction: expired };
    localStorage.setItem('cards', JSON.stringify({ '1': oldCard }));
    setIdsForQuery('favorite', ['1']);
    // expire list entry
    const queries = JSON.parse(localStorage.getItem('queries'));
    queries['favorite'].lastAction = expired;
    localStorage.setItem('queries', JSON.stringify(queries));

    const remoteFetch = jest
      .fn()
      .mockResolvedValue({ userId: '1', title: 'Fresh' });
    const { cards, fromCache } = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).toHaveBeenCalledWith('1');
    expect(fromCache).toBe(false);
    expect(cards[0].title).toBe('Fresh');
    const stored = JSON.parse(localStorage.getItem('cards'));
    expect(stored['1'].title).toBe('Fresh');
  });

  it('returns stale cards from cache when list is fresh', async () => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const expired = Date.now() - SIX_HOURS - 1000;
    const oldCard = { userId: '1', title: 'Old', lastAction: expired };
    localStorage.setItem('cards', JSON.stringify({ '1': oldCard }));
    setIdsForQuery('favorite', ['1']);

    const remoteFetch = jest.fn();
    const { cards, fromCache } = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).not.toHaveBeenCalled();
    expect(fromCache).toBe(true);
    expect(cards[0].title).toBe('Old');
  });
});

