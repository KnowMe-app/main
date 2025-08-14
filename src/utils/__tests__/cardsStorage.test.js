import { updateCard, getCardsByList, addCardToList } from '../cardsStorage';

describe('cardsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('updates card and triggers remote save', () => {
    const remoteSave = jest.fn().mockResolvedValue(undefined);
    const card = updateCard('1', { title: 'Card 1' }, remoteSave);
    const stored = JSON.parse(localStorage.getItem('cards'));
    expect(stored['1'].title).toBe('Card 1');
    expect(remoteSave).toHaveBeenCalledWith(card);
  });

  it('shares updated data across lists without extra fetch', async () => {
    addCardToList('1', 'load2');
    addCardToList('1', 'favorite');
    updateCard('1', { title: 'Original' });
    updateCard('1', { title: 'Updated' });

    const remoteFetch = jest.fn();
    const load2Cards = await getCardsByList('load2', remoteFetch);
    const favoriteCards = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).not.toHaveBeenCalled();
    expect(load2Cards[0].title).toBe('Updated');
    expect(favoriteCards[0].title).toBe('Updated');
  });

  it('refreshes expired card from backend', async () => {
    const SIX_HOURS = 6 * 60 * 60 * 1000;
    const expired = Date.now() - SIX_HOURS - 1000;
    const oldCard = { id: '1', title: 'Old', updatedAt: expired };
    localStorage.setItem('cards', JSON.stringify({ '1': oldCard }));
    localStorage.setItem('favorite', JSON.stringify(['1']));

    const remoteFetch = jest.fn().mockResolvedValue({ id: '1', title: 'Fresh' });
    const cards = await getCardsByList('favorite', remoteFetch);

    expect(remoteFetch).toHaveBeenCalledWith('1');
    expect(cards[0].title).toBe('Fresh');
    const stored = JSON.parse(localStorage.getItem('cards'));
    expect(stored['1'].title).toBe('Fresh');
  });
});

