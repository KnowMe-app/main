import { cacheDplUsers, getDplCards } from '../dplStorage';
import { getQueryEntry, resetMatchingLocalStorageCache } from '../cardIndex';

// Стан кеша — у памʼяті й у `localStorage` із затримкою: між тестами його
// скидає `resetMatchingLocalStorageCache`, а читається він через API кеша.
describe('dplStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    resetMatchingLocalStorageCache('test');
  });

  it('stores ids in queries and retrieves cards', async () => {
    cacheDplUsers({ '1': { title: 'Card 1' } });
    const { cards, fromCache } = await getDplCards();
    expect(cards[0].title).toBe('Card 1');
    expect(fromCache).toBe(true);
    expect(getQueryEntry('dpl').ids).toEqual(['1']);
  });
});
