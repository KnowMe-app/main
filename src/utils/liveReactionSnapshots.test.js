import {
  ensureLiveReactionEntry,
  failLiveReactionEntry,
  readLiveReactionSnapshot,
  settleLiveReactionEntry,
} from './liveReactionSnapshots';

describe('знімки підписок на реакції', () => {
  it('віддає знімок підписки без другого читання', async () => {
    const registry = new Map();
    const entry = ensureLiveReactionEntry(registry, 'favorites', 'owner');
    settleLiveReactionEntry(entry, { card1: true });
    const fetchFallback = jest.fn();

    await expect(readLiveReactionSnapshot(registry, 'favorites', 'owner', fetchFallback)).resolves.toEqual({ card1: true });
    expect(fetchFallback).not.toHaveBeenCalled();
  });

  it('чекає першого знімка, якщо підписка ще не відповіла', async () => {
    const registry = new Map();
    const entry = ensureLiveReactionEntry(registry, 'dislikes', 'owner');
    const fetchFallback = jest.fn();
    const pending = readLiveReactionSnapshot(registry, 'dislikes', 'owner', fetchFallback);
    settleLiveReactionEntry(entry, { card2: true });

    await expect(pending).resolves.toEqual({ card2: true });
    expect(fetchFallback).not.toHaveBeenCalled();
  });

  it('читає сам, коли підписки немає, вона знята або впала', async () => {
    const registry = new Map();
    const fetchFallback = jest.fn().mockResolvedValue({ fetched: true });
    await expect(readLiveReactionSnapshot(registry, 'favorites', 'nobody', fetchFallback)).resolves.toEqual({ fetched: true });

    const inactive = ensureLiveReactionEntry(registry, 'favorites', 'gone');
    settleLiveReactionEntry(inactive, { stale: true });
    inactive.active = false;
    await expect(readLiveReactionSnapshot(registry, 'favorites', 'gone', fetchFallback)).resolves.toEqual({ fetched: true });

    const failed = ensureLiveReactionEntry(registry, 'favorites', 'denied');
    failLiveReactionEntry(failed);
    await expect(readLiveReactionSnapshot(registry, 'favorites', 'denied', fetchFallback)).resolves.toEqual({ fetched: true });
    expect(fetchFallback).toHaveBeenCalledTimes(3);
  });

  it('не чекає довше за стелю', async () => {
    jest.useFakeTimers();
    try {
      const registry = new Map();
      ensureLiveReactionEntry(registry, 'favorites', 'silent');
      const fetchFallback = jest.fn().mockResolvedValue({ fetched: true });
      const pending = readLiveReactionSnapshot(registry, 'favorites', 'silent', fetchFallback, { waitMs: 100 });
      jest.advanceTimersByTime(150);
      await expect(pending).resolves.toEqual({ fetched: true });
    } finally {
      jest.useRealTimers();
    }
  });
});
