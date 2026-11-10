// Кеш повних анкет — один ключ `localStorage`. Дві речі, що коштували дорого:
// запис «негайно» на кожну картку (сторінка — двадцять повних перезаписів) і
// стирання всього ключа, щойно він переріс стелю.

import {
  CARDS_KEY,
  CARDS_CACHE_VERSION,
  MATCHING_CACHE_MAX_CHARS,
  flushPendingMatchingCacheWrites,
  loadCards,
  resetMatchingLocalStorageCache,
  saveCards,
} from './cardIndex';
import { updateCard } from './cardsStorage';

const OWNER = 'ownerUid0000000000000000000';

beforeEach(() => {
  resetMatchingLocalStorageCache('test');
  localStorage.clear();
  localStorage.setItem('ownerId', OWNER);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('пакетний запис карток', () => {
  it('сторінка з двадцяти карток лягає в localStorage одним записом', () => {
    jest.useFakeTimers();
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    for (let index = 0; index < 20; index += 1) {
      updateCard(`card${index}`, { name: `Картка ${index}` });
    }
    // Памʼять вкладки бачить усі одразу.
    expect(Object.keys(loadCards())).toHaveLength(20);
    jest.runOnlyPendingTimers();
    const cardWrites = setItem.mock.calls.filter(([key]) => key === CARDS_KEY);
    expect(cardWrites).toHaveLength(1);
    expect(Object.keys(JSON.parse(cardWrites[0][1]).items)).toHaveLength(20);
  });

  it('pagehide дописує відкладене одразу', () => {
    jest.useFakeTimers();
    updateCard('card1', { name: 'Оксана' });
    flushPendingMatchingCacheWrites();
    expect(JSON.parse(localStorage.getItem(CARDS_KEY)).items.card1).toMatchObject({ name: 'Оксана' });
  });
});

describe('переріс стелю — прибрати найстаріші, а не стерти все', () => {
  it('лишає новіші анкети й знімає найстаріші', () => {
    const filler = 'x'.repeat(60000);
    const now = Date.now();
    const cards = {};
    const count = Math.ceil(MATCHING_CACHE_MAX_CHARS / filler.length) + 10;
    for (let index = 0; index < count; index += 1) {
      cards[`card${index}`] = { userId: `card${index}`, about: filler, cachedAt: now - (count - index) * 1000, cacheVersion: CARDS_CACHE_VERSION };
    }
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    saveCards(cards, { immediate: true });
    const stored = JSON.parse(localStorage.getItem(CARDS_KEY));
    const ids = Object.keys(stored.items);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThan(count);
    // Найновіша лишилась, найстаріша пішла.
    expect(ids).toContain(`card${count - 1}`);
    expect(ids).not.toContain('card0');
    expect(localStorage.getItem(CARDS_KEY).length).toBeLessThanOrEqual(MATCHING_CACHE_MAX_CHARS);
  });
});
