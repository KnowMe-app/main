import { cacheLoad2Users, getLoad2Cards, buildLoad2Key } from '../load2Storage';

describe('load2Storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores ids by filters and retrieves cards', async () => {
    const filters = { city: 'Kyiv' };
    cacheLoad2Users({ '1': { title: 'Card 1' } }, filters);
    const { cards, fromCache } = await getLoad2Cards(filters);
    expect(cards[0].title).toBe('Card 1');
    expect(fromCache).toBe(true);
    const queries = JSON.parse(localStorage.getItem('queries'));
    const key = buildLoad2Key(filters);
    expect(queries[key].ids).toEqual(['1']);
  });
});
