import {
  __resetWriteOutboxForTests,
  configureWriteOutbox,
  enqueueOutboxWrite,
  flushWriteOutbox,
  getWriteOutboxPendingCount,
  isRetryableOutboxError,
  registerOutboxRejectionHandler,
  registerOutboxSuccessHandler,
  startWriteOutbox,
  stopWriteOutbox,
} from './writeOutbox';

const prefix = uid => `km.writeOutbox.v1:${uid}:`;
const stored = uid => Object.keys(localStorage)
  .filter(key => key.startsWith(prefix(uid)))
  .map(key => JSON.parse(localStorage.getItem(key)))
  .sort((a, b) => a.createdAt - b.createdAt);
const diskSnapshot = uid => Object.fromEntries(Object.keys(localStorage)
  .filter(key => key.startsWith(prefix(uid)))
  .map(key => [key, localStorage.getItem(key)]));
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
// Запасна оренда між вкладками чекає на перевірку заявки (до 100 мс).
const settleLease = () => new Promise(resolve => setTimeout(resolve, 150));
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
    expect(stored('u1')).toHaveLength(0);
  });

  it('досилає після перезавантаження те, що лишилось на диску', async () => {
    configureWriteOutbox({ send: () => new Promise(() => {}) });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/a': { text: 'x', updatedAt: 1 } } });
    // «Перезавантаження»: памʼять вкладки стерта, диск лишився.
    const disk = diskSnapshot('u1');
    __resetWriteOutboxForTests();
    Object.entries(disk).forEach(([key, value]) => localStorage.setItem(key, value));
    const send = jest.fn(() => Promise.resolve());
    configureWriteOutbox({ send });
    startWriteOutbox('u1');
    expect(send).toHaveBeenCalledWith({ 'multiData/comments/u1/a': { text: 'x', updatedAt: 1 } });
    await flush();
    expect(stored('u1')).toHaveLength(0);
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

  // Лічильник дотиків до контактів: кожен дотик без звʼязку мусить
  // дорахуватись, а не склеїтись з попереднім за спільним шляхом.
  it('запис, що додається (`additive`), не витісняє й не витісняється', () => {
    // Без відправника записи лише стоять у черзі — як без звʼязку.
    const tap = { 'multiData/contactViews/u1/c/count': { '.sv': { increment: 1 } } };
    enqueueOutboxWrite({ uid: 'u1', additive: true, patch: tap });
    enqueueOutboxWrite({ uid: 'u1', additive: true, patch: tap });
    expect(stored('u1')).toHaveLength(2);
    expect(stored('u1').every(entry => entry.additive === true && entry.patch['multiData/contactViews/u1/c/count'])).toBe(true);
  });

  it('звичайний запис того самого шляху не витісняє запису, що додається', () => {
    startWriteOutbox('u1');
    // Записи інших вкладок на диску, ще не відправлені.
    localStorage.setItem(`${prefix('u1')}a1`, JSON.stringify({ id: 'a1', patch: { 'x/count': 1 }, additive: true, createdAt: 1 }));
    enqueueOutboxWrite({ uid: 'u1', patch: { 'x/count': 5 } });
    expect(stored('u1').map(entry => entry.id)).toContain('a1');
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
    expect(handler).toHaveBeenCalledWith(meta, expect.any(Error), { patch: { 'multiData/favorites/u1/a': 1 } });
    expect(stored('u1')).toHaveLength(0);
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
      localStorage.setItem(`${prefix('u2')}old`, JSON.stringify({ id: 'old', patch: { 'a/c': 1 }, createdAt: 1 }));
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
      expect(stored('u1')).toHaveLength(0);
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
    expect(stored('u1')).toHaveLength(0);
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

  it('дві вкладки не стирають записів одна одної', async () => {
    configureWriteOutbox({ send: () => new Promise(() => {}) });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/a': { text: 'з першої' } } });
    // «Друга вкладка»: своя памʼять черги, той самий диск.
    __resetWriteOutboxForTests();
    configureWriteOutbox({ send: () => new Promise(() => {}) });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/b': { text: 'з другої' } } });
    const paths = stored('u1').map(entry => Object.keys(entry.patch)[0]).sort();
    expect(paths).toEqual(['multiData/comments/u1/a', 'multiData/comments/u1/b']);
  });

  it('новіше значення витісняє на диску запис іншої вкладки', () => {
    configureWriteOutbox({ send: () => new Promise(() => {}) });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1 } });
    __resetWriteOutboxForTests();
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': null } });
    const entries = stored('u1');
    expect(entries).toHaveLength(1);
    expect(entries[0].patch).toEqual({ 'multiData/favorites/u1/a': null });
  });

  it('запис, якого вже немає на диску, не відправляється вдруге', () => {
    const send = jest.fn(() => new Promise(() => {}));
    localStorage.setItem(`${prefix('u1')}x`, JSON.stringify({ id: 'x', patch: { 'a/b': 1 }, createdAt: 1 }));
    startWriteOutbox('u1');
    expect(getWriteOutboxPendingCount()).toBe(1);
    // Інша вкладка дослала запис і зняла ключ — ця не шле його ще раз.
    localStorage.removeItem(`${prefix('u1')}x`);
    configureWriteOutbox({ send });
    startWriteOutbox('u1');
    expect(send).not.toHaveBeenCalled();
    expect(getWriteOutboxPendingCount()).toBe(0);
  });

  it('підтвердження після зміни акаунта знімає запис з черги свого читача', async () => {
    const pending = deferred();
    configureWriteOutbox({ send: () => pending.promise });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'a/b': 1 } });
    startWriteOutbox('u2');
    pending.resolve();
    await flush();
    expect(stored('u1')).toHaveLength(0);
  });

  it('продовження після підтвердження знає, чи запис дослано з минулої вкладки', async () => {
    const handler = jest.fn();
    registerOutboxSuccessHandler('reactions', handler);
    configureWriteOutbox({ send: () => Promise.resolve() });
    await enqueueOutboxWrite({ uid: 'u1', patch: { 'a/b': 1 }, meta: { type: 'reactions' } });
    expect(handler).toHaveBeenLastCalledWith({ type: 'reactions' }, { replayed: false, patch: { 'a/b': 1 } });
    localStorage.setItem(`${prefix('u1')}old`, JSON.stringify({ id: 'old', patch: { 'a/c': 1 }, meta: { type: 'reactions' }, createdAt: 1 }));
    startWriteOutbox('u2');
    startWriteOutbox('u1');
    await flush();
    expect(handler).toHaveBeenLastCalledWith({ type: 'reactions' }, { replayed: true, patch: { 'a/c': 1 } });
  });

  it('переносить чергу з першої версії (один масив) в окремі ключі', async () => {
    localStorage.setItem('km.writeOutbox.v1:u1', JSON.stringify({ entries: [{ id: 'legacy', patch: { 'a/b': 1 }, createdAt: 1 }] }));
    const send = jest.fn(() => Promise.resolve());
    configureWriteOutbox({ send });
    startWriteOutbox('u1');
    expect(send).toHaveBeenCalledWith({ 'a/b': 1 });
    expect(localStorage.getItem('km.writeOutbox.v1:u1')).toBeNull();
    await flush();
    expect(stored('u1')).toHaveLength(0);
  });

  it('обробник бачить лише шляхи, що лишились після витіснення', async () => {
    const handler = jest.fn();
    registerOutboxSuccessHandler('reactions', handler);
    // Без відправника обидва записи стоять у черзі; другий витісняє шлях першого.
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': 1, 'multiData/dislikes/u1/a': null }, meta: { type: 'reactions' } });
    enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/favorites/u1/a': null } });
    configureWriteOutbox({ send: () => Promise.resolve() });
    startWriteOutbox('u1');
    await flush();
    expect(handler).toHaveBeenCalledWith({ type: 'reactions' }, { replayed: false, patch: { 'multiData/dislikes/u1/a': null } });
  });

  it('перенос старої черги біля стелі сховища не губить записів', async () => {
    localStorage.setItem('km.writeOutbox.v1:u1', JSON.stringify({ entries: [
      { id: 'a', patch: { 'x/a': 1 }, createdAt: 1 },
      { id: 'b', patch: { 'x/b': 1 }, createdAt: 2 },
      { id: 'c', patch: { 'x/c': 1 }, createdAt: 3 },
    ] }));
    // Сховище приймає лише два нові ключі.
    const realSetItem = Storage.prototype.setItem;
    let writes = 0;
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(key, value) {
      if (key.startsWith('km.writeOutbox.v1:u1:')) {
        writes += 1;
        if (writes > 2) throw new Error('QuotaExceededError');
      }
      return realSetItem.call(this, key, value);
    });
    const send = jest.fn(() => Promise.resolve());
    try {
      configureWriteOutbox({ send });
      startWriteOutbox('u1');
    } finally {
      spy.mockRestore();
    }
    // Відправлено всі три; старий масив тримав їх, доки перенос не вдався,
    // а підтвердження зняли їх і звідти — вдруге не дошлеться нічого.
    expect(send).toHaveBeenCalledTimes(3);
    await flush();
    expect(localStorage.getItem('km.writeOutbox.v1:u1')).toBeNull();
    expect(stored('u1')).toHaveLength(0);
  });

  // Дві вкладки того самого акаунта бачать на диску той самий незавершений
  // лічильник — відправити його мусить лише одна.
  it('запис, що додається, з двох вкладок відправляється один раз', async () => {
    const tap = { 'multiData/contactViews/u1/c/count': 1 };
    const pendingA = deferred();
    const sendA = jest.fn(() => pendingA.promise);
    configureWriteOutbox({ send: sendA });
    startWriteOutbox('u1');
    enqueueOutboxWrite({ uid: 'u1', additive: true, patch: tap });
    await settleLease();
    expect(sendA).toHaveBeenCalledTimes(1);

    let tabB;
    jest.isolateModules(() => {
      tabB = require('./writeOutbox');
    });
    const sendB = jest.fn(() => Promise.resolve());
    tabB.configureWriteOutbox({ send: sendB });
    tabB.startWriteOutbox('u1');
    await settleLease();
    expect(sendB).not.toHaveBeenCalled();

    pendingA.resolve();
    await flush();
    expect(stored('u1')).toHaveLength(0);
    tabB.flushWriteOutbox();
    await settleLease();
    expect(sendB).not.toHaveBeenCalled();
    expect(tabB.getWriteOutboxPendingCount()).toBe(0);
    tabB.__resetWriteOutboxForTests();
  });

  // Дві вкладки відкрились разом і обидві бачать вільну оренду: заявки
  // мусять розвʼязатись до відправки, а не після неї.
  it('дві вкладки, що стартують разом, відправляють лічильник один раз', async () => {
    localStorage.setItem(`${prefix('u1')}a1`, JSON.stringify({
      id: 'a1', patch: { 'x/count': 1 }, additive: true, createdAt: 1,
    }));
    const tabs = [];
    jest.isolateModules(() => { tabs.push(require('./writeOutbox')); });
    jest.isolateModules(() => { tabs.push(require('./writeOutbox')); });
    const sends = [];
    tabs.forEach((tab, index) => tab.configureWriteOutbox({ send: patch => {
      sends.push(index);
      return new Promise(() => {});
    } }));
    // Сховище в двох процесах: обидві вкладки прочитали оренду до того, як
    // будь-яка її записала, — тож обидві бачать її вільною.
    const realGetItem = Storage.prototype.getItem;
    let blindReads = 2;
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function getItem(key) {
      if (String(key).startsWith('km.writeOutboxLease.v1:') && blindReads > 0) {
        blindReads -= 1;
        return null;
      }
      return realGetItem.call(this, key);
    });
    tabs.forEach(tab => tab.startWriteOutbox('u1'));
    await settleLease();
    spy.mockRestore();
    expect(blindReads).toBe(0);
    expect(sends).toHaveLength(1);
    tabs.forEach(tab => tab.__resetWriteOutboxForTests());
  });

  // Поки чекали на замок, увійшов інший читач: запис попереднього не
  // відправляється під новою сесією й лишається на його диску.
  it('запис, замок на який узято після зміни читача, не відправляється', async () => {
    const send = jest.fn(() => Promise.resolve());
    configureWriteOutbox({ send });
    startWriteOutbox('u1');
    enqueueOutboxWrite({ uid: 'u1', additive: true, patch: { 'x/count': 1 } });
    startWriteOutbox('u2');
    await settleLease();
    expect(send).not.toHaveBeenCalled();
    expect(stored('u1')).toHaveLength(1);
  });

  // Без мережі квиток входу протухає, і перший запис після повернення
  // звʼязку база відхиляє як від невідомого. Це не відмова запису: квиток
  // оновлюється, і запис іде ще раз.
  it('відмова правил спершу оновлює квиток входу й повторює запис', async () => {
    const denied = () => Object.assign(new Error('PERMISSION_DENIED: Permission denied'), { code: 'PERMISSION_DENIED' });
    const send = jest.fn()
      .mockImplementationOnce(() => Promise.reject(denied()))
      .mockImplementationOnce(() => Promise.resolve());
    const refreshAuth = jest.fn(() => Promise.resolve('token'));
    const rejected = jest.fn();
    registerOutboxRejectionHandler('memo', rejected);
    configureWriteOutbox({ send, refreshAuth });
    startWriteOutbox('u1');
    const delivered = enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/c': { text: 'T.' } }, meta: { type: 'memo' } });
    await expect(delivered).resolves.toBeUndefined();
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(rejected).not.toHaveBeenCalled();
    expect(stored('u1')).toHaveLength(0);
  });

  it('відмова зі свіжим квитком — остаточна', async () => {
    const denied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
    const send = jest.fn(() => Promise.reject(denied()));
    const refreshAuth = jest.fn(() => Promise.resolve('token'));
    configureWriteOutbox({ send, refreshAuth });
    startWriteOutbox('u1');
    const delivered = enqueueOutboxWrite({ uid: 'u1', patch: { 'x/y': 1 } });
    await expect(delivered).rejects.toBeTruthy();
    expect(send).toHaveBeenCalledTimes(2);
    expect(stored('u1')).toHaveLength(0);
  });

  it('квиток не оновився (немає мережі) — запис лишається в черзі', async () => {
    const denied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
    const send = jest.fn(() => Promise.reject(denied()));
    const refreshAuth = jest.fn(() => Promise.reject(new Error('auth/network-request-failed')));
    configureWriteOutbox({ send, refreshAuth });
    startWriteOutbox('u1');
    enqueueOutboxWrite({ uid: 'u1', patch: { 'x/y': 1 } }).catch(() => {});
    await flush();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(stored('u1')).toHaveLength(1);
  });

  // Поки квиток оновлюється, людина ставить нове значення того самого шляху:
  // повтор старого запису не мусить його перебити.
  it('новіше значення шляху витісняє запис, що чекає на квиток', async () => {
    const denied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
    const sent = [];
    let refreshDone;
    const refreshAuth = jest.fn(() => new Promise(resolve => { refreshDone = resolve; }));
    const send = jest.fn(patch => {
      sent.push(patch['multiData/comments/u1/c']);
      return sent.length === 1 ? Promise.reject(denied()) : Promise.resolve();
    });
    configureWriteOutbox({ send, refreshAuth });
    startWriteOutbox('u1');
    const oldWrite = enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/c': 'old' } });
    await flush();
    expect(refreshAuth).toHaveBeenCalledTimes(1);
    const newWrite = enqueueOutboxWrite({ uid: 'u1', patch: { 'multiData/comments/u1/c': 'new' } });
    await flush();
    refreshDone('token');
    await Promise.all([oldWrite, newWrite]);
    await flush();
    expect(sent).toEqual(['old', 'new']);
    expect(stored('u1')).toHaveLength(0);
  });

  // Відмова → квиток оновлено → обрив → (без звʼязку квиток протух знову) →
  // відмова: друга відмова теж мусить оновити квиток, а не зняти запис.
  it('після обриву наступна відмова знову оновлює квиток', async () => {
    const denied = () => Object.assign(new Error('Permission denied'), { code: 'PERMISSION_DENIED' });
    const offline = () => Object.assign(new Error('Client is offline'), { code: 'unavailable' });
    const outcomes = [denied(), offline(), denied()];
    const send = jest.fn(() => {
      const next = outcomes.shift();
      return next ? Promise.reject(next) : Promise.resolve();
    });
    const refreshAuth = jest.fn(() => Promise.resolve('token'));
    configureWriteOutbox({ send, refreshAuth });
    startWriteOutbox('u1');
    const delivered = enqueueOutboxWrite({ uid: 'u1', patch: { 'x/y': 1 } });
    await flush();
    await flush();
    // Відмова → квиток → повтор → обрив: запис чекає на наступну спробу.
    expect(send).toHaveBeenCalledTimes(2);
    expect(stored('u1')).toHaveLength(1);
    // Звʼязок повернувся (квиток тим часом протух знову): відмова → квиток → запис.
    flushWriteOutbox();
    await expect(delivered).resolves.toBeUndefined();
    expect(refreshAuth).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledTimes(4);
    expect(stored('u1')).toHaveLength(0);
  });
});
