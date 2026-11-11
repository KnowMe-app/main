import {
  __resetWriteOutboxForTests,
  configureWriteOutbox,
  enqueueOutboxWrite,
  getWriteOutboxPendingCount,
  isRetryableOutboxError,
  registerOutboxRejectionHandler,
  startWriteOutbox,
  stopWriteOutbox,
} from './writeOutbox';

const storageKey = uid => `km.writeOutbox.v1:${uid}`;
const stored = uid => JSON.parse(localStorage.getItem(storageKey(uid)) || '{"entries":[]}').entries;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const denied = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });

beforeEach(() => {
  localStorage.clear();
  __resetWriteOutboxForTests();
});

describe('черга записів пристрою', () => {
  it('тримає запис на диску, поки база його не підтвердила', async () => {
    const pending = deferred();
    const send = jest.fn(() => pending.promise);
    configureWriteOutbox({ send });
    const delivered = enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 } });
    expect(send).toHaveBeenCalledWith({ 'multiData/favorites/u1/a': 1 });
    expect(stored('u1')).toHaveLength(1);
    expect(getWriteOutboxPendingCount()).toBe(1);
    pending.resolve();
    await delivered;
    expect(stored('u1')).toHaveLength(0);
    expect(localStorage.getItem(storageKey('u1'))).toBeNull();
  });

  it('досилає після перезавантаження те, що лишилось на диску', async () => {
    configureWriteOutbox({ send: () => new Promise(() => {}) });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/a': { text: 'x', updatedAt: 1 } } });
    // «Перезавантаження»: памʼять вкладки стерта, диск лишився.
    const disk = localStorage.getItem(storageKey('u1'));
    __resetWriteOutboxForTests();
    localStorage.setItem(storageKey('u1'), disk);
    const send = jest.fn(() => Promise.resolve());
    configureWriteOutbox({ send });
    startWriteOutbox('u1');
    expect(send).toHaveBeenCalledWith({ 'multiData/comments/u1/a': { text: 'x', updatedAt: 1 } });
    await flush();
    expect(localStorage.getItem(storageKey('u1'))).toBeNull();
  });

  it('новіше значення шляху витісняє старіше, поки те не відправлене', async () => {
    // Без відправника (ще не налаштовано) записи лише стоять у черзі.
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1, 'multiData/dislikes/u1/a': null } });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': null } });
    const entries = stored('u1');
    expect(entries).toHaveLength(2);
    expect(entries[0].patch).toEqual({ 'multiData/dislikes/u1/a': null });
    expect(entries[1].patch).toEqual({ 'multiData/favorites/u1/a': null });
  });

  it('витіснений цілком запис відповідає відповіддю нового', async () => {
    const first = enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 } });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 2 } });
    expect(stored('u1')).toHaveLength(1);
    const send = jest.fn(() => Promise.resolve());
    configureWriteOutbox({ send });
    startWriteOutbox('u1');
    await expect(first).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ 'multiData/favorites/u1/a': 2 });
  });

  it('відмова правил знімає запис і відкочує правку пристрою за даними', async () => {
    const handler = jest.fn();
    registerOutboxRejectionHandler('reactions', handler);
    configureWriteOutbox({ send: () => Promise.reject(denied()) });
    const meta = { type: 'reactions', viewerId: 'u1', changes: [{ kind: 'favorites', ownerId: 'u1', userId: 'a', previous: null }] };
    await expect(enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 }, meta })).rejects.toThrow('PERMISSION_DENIED');
    expect(handler).toHaveBeenCalledWith(meta, expect.any(Error));
    expect(localStorage.getItem(storageKey('u1'))).toBeNull();
  });

  it('подія відмови каже, чи запис дослано з минулої вкладки', async () => {
    const events = [];
    const listener = event => events.push(event.detail);
    window.addEventListener('km:write-outbox-rejected', listener);
    try {
      configureWriteOutbox({ send: () => Promise.reject(denied()) });
      await enqueueOutboxWrite({ uid: 'u1', patch: { 'a/b': 1 } }).catch(() => {});
      expect(events[0].replayed).toBe(false);
      // Запис з диска, на який у вкладці ніхто не чекає.
      localStorage.setItem(storageKey('u2'), JSON.stringify({ entries: [{ id: 'old', patch: { 'a/c': 1 } }] }));
      startWriteOutbox('u2');
      await flush();
      expect(events[1].replayed).toBe(true);
    } finally {
      window.removeEventListener('km:write-outbox-rejected', listener);
    }
  });

  it('скасований запис лишається в черзі до повтору', async () => {
    jest.useFakeTimers();
    try {
      const send = jest.fn()
        .mockImplementationOnce(() => Promise.reject(new Error('write_cancelled')))
        .mockImplementation(() => Promise.resolve());
      configureWriteOutbox({ send });
      const delivered = enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 } });
      await Promise.resolve();
      await Promise.resolve();
      expect(stored('u1')).toHaveLength(1);
      jest.advanceTimersByTime(2000);
      await delivered;
      expect(send).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem(storageKey('u1'))).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('вихід стирає чергу з диска, а пізня відмова її не відкочує', async () => {
    const pending = deferred();
    const handler = jest.fn();
    registerOutboxRejectionHandler('reactions', handler);
    configureWriteOutbox({ send: () => pending.promise });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 }, meta: { type: 'reactions' } }).catch(() => {});
    expect(stored('u1')).toHaveLength(1);
    stopWriteOutbox();
    expect(localStorage.getItem(storageKey('u1'))).toBeNull();
    pending.reject(denied());
    await flush();
    // Кеш реакцій вихід і так стирає — відкочувати нічого.
    expect(handler).not.toHaveBeenCalled();
  });

  it('черги читачів окремі', () => {
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 } });
    startWriteOutbox('u2');
    expect(getWriteOutboxPendingCount()).toBe(0);
    startWriteOutbox('u1');
    expect(getWriteOutboxPendingCount()).toBe(1);
  });

  it('розрізняє відмову й обрив', () => {
    expect(isRetryableOutboxError(denied())).toBe(false);
    expect(isRetryableOutboxError(new Error('set at /x failed: write_cancelled'))).toBe(true);
    expect(isRetryableOutboxError(new Error('something else'))).toBe(false);
  });
});
