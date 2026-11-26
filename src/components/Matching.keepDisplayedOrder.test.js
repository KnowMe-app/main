import { keepDisplayedOrder } from './Matching';

describe('keepDisplayedOrder — порядок колекції під час зняття реакцій', () => {
  it('зняті лишаються на місці, дочитане стає в кінець', () => {
    const shown = { viewMode: 'favorites', ids: ['a', 'b', 'c'] };
    // Після зняття лайка з «a» перелік — вподобані за часом, далі зняті.
    expect(keepDisplayedOrder(shown, ['b', 'c', 'd', 'e', 'a'], 'favorites')).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('інший режим — порядок з нуля', () => {
    const shown = { viewMode: 'dislikes', ids: ['a', 'b'] };
    expect(keepDisplayedOrder(shown, ['b', 'a'], 'favorites')).toEqual(['b', 'a']);
  });

  it('зникле з переліку прибирається', () => {
    const shown = { viewMode: 'favorites', ids: ['a', 'b', 'c'] };
    expect(keepDisplayedOrder(shown, ['c', 'a'], 'favorites')).toEqual(['a', 'c']);
  });

  it('свіжіша реакція, що доїхала після показу, стає нагору, а не в кінець', () => {
    const shown = { viewMode: 'favorites', ids: ['a', 'b', 'c'] };
    expect(keepDisplayedOrder(shown, ['new', 'a', 'b', 'c', 'old'], 'favorites')).toEqual(['new', 'a', 'b', 'c', 'old']);
  });
});
