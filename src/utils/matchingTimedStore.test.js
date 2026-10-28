import { MATCHING_CACHE_TTL_MS } from './matchingCachePolicy';
import { clearMatchingTimedStores, createMatchingTimedStore } from './matchingTimedStore';

// Справжнє сховище, а не мок: мок `localStorage` у кількох сюїтах повертає
// `null` на все (див. CLAUDE.md).
describe('дрібні шари кеша матчингу', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('свіже читається, протухле — ні', () => {
    const store = createMatchingTimedStore('test');
    store.write('a', { x: 1 }, { now: 1000 });
    expect(store.read('a', { now: 2000 })).toEqual({ x: 1 });
    expect(store.read('a', { now: 1001 + MATCHING_CACHE_TTL_MS })).toBeNull();
    expect(store.read('b', { now: 2000 })).toBeNull();
  });

  // Порожня відповідь — теж відповідь: інакше картка без відгуків питала б базу
  // на кожному відкритті.
  it('памʼятає й порожню відповідь', () => {
    const store = createMatchingTimedStore('test');
    store.write('a', [], { now: 1000 });
    expect(store.read('a', { now: 2000 })).toEqual([]);
  });

  it('правка мітки не зсуває, а запису, якого немає, не заводить', () => {
    const store = createMatchingTimedStore('test');
    store.write('a', [1], { now: 1000 });
    store.patch('a', value => [...value, 2]);
    expect(store.read('a', { now: 2000 })).toEqual([1, 2]);
    expect(store.read('a', { now: 1001 + MATCHING_CACHE_TTL_MS })).toBeNull();
    store.patch('b', () => [3]);
    expect(store.read('b', { now: 2000 })).toBeNull();
  });

  it('тримає стелю записів, викидаючи найстаріші', () => {
    const store = createMatchingTimedStore('test', { maxEntries: 2 });
    store.write('a', 1, { now: 1000 });
    store.write('b', 2, { now: 1100 });
    store.write('c', 3, { now: 1200 });
    expect(store.read('a', { now: 1300 })).toBeNull();
    expect(store.read('b', { now: 1300 })).toBe(2);
    expect(store.read('c', { now: 1300 })).toBe(3);
  });

  it('вихід з акаунта стирає всі шари', () => {
    const first = createMatchingTimedStore('one');
    const second = createMatchingTimedStore('two');
    first.write('a', 1);
    second.write('a', 2);
    first.forget('a');
    expect(first.read('a')).toBeNull();
    expect(second.read('a')).toBe(2);
    clearMatchingTimedStores();
    expect(second.read('a')).toBeNull();
  });
});
