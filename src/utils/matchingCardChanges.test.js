import {
  CARD_CHANGES_MAX_GAP_MS,
  CARD_CHANGES_OVERLAP_MS,
  CARD_CHANGES_PAGE_LIMIT,
  __resetCardChangesSessionForTests,
  distrustVerifiedFeedStates,
  flushVerifiedFeedStates,
  isFeedStateTrusted,
  readCardChangesSyncState,
  readVerifiedFeedState,
  rememberVerifiedFeedState,
  syncCardChanges,
  wasCardChangedThisSession,
} from './matchingCardChanges';
import { createFeedStateReader } from './searchFeedDenial';

const VIEWER = 'viewerUid000000000000000000';
const NOW = 1_762_800_000_000;

const deps = (rows, extra = {}) => ({
  viewerId: VIEWER,
  readChangesSince: jest.fn(async () => rows),
  forgetCardBodies: jest.fn(),
  now: () => NOW,
  ...extra,
});

beforeEach(() => {
  __resetCardChangesSessionForTests();
  localStorage.clear();
});

describe('синхронізація журналу змін', () => {
  it('перша синхронізація нічому не вірить: забуває всі тіла й ставить мітку з журналу', async () => {
    const d = deps([{ id: 'a', at: NOW - 1000 }]);
    const result = await syncCardChanges(d);
    expect(result.trusted).toBe(false);
    expect(d.forgetCardBodies).toHaveBeenCalledWith();
    expect(readCardChangesSyncState(VIEWER)).toEqual({ lastSync: NOW - 1000 });
  });

  it('наступна питає від мітки з перекриттям і забуває лише змінене', async () => {
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    const d = deps([{ id: 'b', at: NOW - 30_000 }]);
    const result = await syncCardChanges(d);
    expect(d.readChangesSince).toHaveBeenCalledWith(NOW - 60_000 - CARD_CHANGES_OVERLAP_MS, CARD_CHANGES_PAGE_LIMIT);
    expect(result.trusted).toBe(true);
    expect([...result.changedIds]).toEqual(['b']);
    expect(d.forgetCardBodies).toHaveBeenCalledWith(['b']);
    expect(wasCardChangedThisSession('b')).toBe(true);
    expect(readCardChangesSyncState(VIEWER)).toEqual({ lastSync: NOW - 30_000 });
  });

  it('без змін мітка не відкочується назад', async () => {
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    const d = deps([]);
    expect((await syncCardChanges(d)).trusted).toBe(true);
    expect(d.forgetCardBodies).not.toHaveBeenCalled();
    expect(readCardChangesSyncState(VIEWER)).toEqual({ lastSync: NOW - 60_000 });
  });

  it('задовга перерва чи змін понад стелю — як уперше', async () => {
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - CARD_CHANGES_MAX_GAP_MS - 1 }));
    expect((await syncCardChanges(deps([]))).trusted).toBe(false);

    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    const many = Array.from({ length: CARD_CHANGES_PAGE_LIMIT }, (_, i) => ({ id: `c${i}`, at: NOW - i }));
    const d = deps(many);
    expect((await syncCardChanges(d)).trusted).toBe(false);
    expect(d.forgetCardBodies).toHaveBeenCalledWith();
  });

  it('журнал не прочитано — нічому не віримо й нічого не забуваємо', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const d = deps([], { readChangesSince: jest.fn(async () => { throw new Error('denied'); }) });
    expect((await syncCardChanges(d)).trusted).toBe(false);
    expect(d.forgetCardBodies).not.toHaveBeenCalled();
    expect(isFeedStateTrusted(VIEWER)).toBe(false);
    console.warn.mockRestore();
  });
});

describe('перевірений стан стрічки', () => {
  it('до синхронізації не вірить навіть записаному з бази', async () => {
    rememberVerifiedFeedState(VIEWER, 'a', { feedDate: '2026-11-01' }, { now: NOW });
    expect(readVerifiedFeedState(VIEWER, 'a', { now: NOW })).toBeUndefined();
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    await syncCardChanges(deps([]));
    expect(readVerifiedFeedState(VIEWER, 'a', { now: NOW })).toEqual({ feedDate: '2026-11-01', audience: null });
  });

  it('змінену в журналі картку забуває — її стан читатиметься з бази', async () => {
    rememberVerifiedFeedState(VIEWER, 'a', { feedDate: '2026-11-01' }, { now: NOW });
    rememberVerifiedFeedState(VIEWER, 'b', { feedDate: '2026-11-02' }, { now: NOW });
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    await syncCardChanges(deps([{ id: 'a', at: NOW - 10 }]));
    expect(readVerifiedFeedState(VIEWER, 'a', { now: NOW })).toBeUndefined();
    expect(readVerifiedFeedState(VIEWER, 'b', { now: NOW })).toEqual({ feedDate: '2026-11-02', audience: null });
  });

  it('стан переживає перезавантаження сторінки', async () => {
    rememberVerifiedFeedState(VIEWER, 'a', { feedDate: false }, { now: NOW });
    flushVerifiedFeedStates();
    __resetCardChangesSessionForTests();
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    await syncCardChanges(deps([]));
    expect(readVerifiedFeedState(VIEWER, 'a', { now: NOW })).toEqual({ feedDate: false, audience: null });
  });

  it('«Оновити стрічку» знімає довіру й забуває стани', async () => {
    localStorage.setItem(`km.matchingCardChanges.v1:${VIEWER}`, JSON.stringify({ lastSync: NOW - 60_000 }));
    await syncCardChanges(deps([]));
    rememberVerifiedFeedState(VIEWER, 'a', { feedDate: '2026-11-01' }, { now: NOW });
    distrustVerifiedFeedStates(VIEWER);
    expect(isFeedStateTrusted(VIEWER)).toBe(false);
    expect(readVerifiedFeedState(VIEWER, 'a', { now: NOW })).toBeUndefined();
  });

  it('читач стану пише відповідь бази й бере довірене без запиту', async () => {
    const store = new Map();
    const persist = { load: id => store.get(id), save: (id, state) => store.set(id, state) };
    const read = jest.fn(async () => ({ feedDate: '2026-11-01', audience: null }));
    const reader = createFeedStateReader(read, { persist });
    await reader.read('a');
    expect(store.get('a')).toEqual({ feedDate: '2026-11-01', audience: null });
    const second = createFeedStateReader(read, { persist });
    expect(second.peek('a')).toEqual({ feedDate: '2026-11-01', audience: null });
    expect(read).toHaveBeenCalledTimes(1);
  });
});
