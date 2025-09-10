import { cacheDplUsers, getDplCards } from '../dplStorage';

describe('dplStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores ids in queries and retrieves cards', async () => {
    cacheDplUsers({ '1': { title: 'Card 1' } });
    const { cards, fromCache } = await getDplCards();
    expect(cards[0].title).toBe('Card 1');
    expect(fromCache).toBe(true);
    const queries = JSON.parse(localStorage.getItem('queries'));
    expect(queries['dpl'].ids).toEqual(['1']);
  });
});
