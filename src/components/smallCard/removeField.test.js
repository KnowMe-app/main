jest.mock('components/config', () => ({
  fetchUserById: jest.fn(),
  updateProfileNodesInRTDB: jest.fn(),
  updateDataInRealtimeDB: jest.fn(),
  updateDataInFiresoreDB: jest.fn(),
}));
jest.mock('utils/cache', () => ({ updateCachedUser: jest.fn() }));
jest.mock('utils/multiAccountEdits', () => ({
  getCardLegacyCollection: jest.fn(async userId => (userId === 'ID0001' ? null : 'users')),
}));

const { updateProfileNodesInRTDB, updateDataInRealtimeDB } = require('components/config');
const { updateCachedUser } = require('utils/cache');
const { getCardLegacyCollection } = require('utils/multiAccountEdits');
const { removeField } = require('./actions');

// Simulates a real React setUsers(prev => ...) state setter: applies the
// updater to whatever the current value is and stores the result.
const makeStateBox = initial => {
  let current = initial;
  const setter = updater => {
    current = typeof updater === 'function' ? updater(current) : updater;
  };
  return { get: () => current, setter };
};

describe('removeField sends a minimal, targeted payload instead of the whole local card snapshot', () => {
  const flushSubmit = () => new Promise(resolve => setTimeout(resolve, 0));
  beforeEach(() => {
    updateProfileNodesInRTDB.mockClear();
    updateDataInRealtimeDB.mockClear();
    updateCachedUser.mockClear();
    getCardLegacyCollection.mockImplementation(async userId => (userId === 'ID0001' ? null : 'users'));
  });

  it('writes only the changed top-level field + lastAction for a long-userId card', async () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    const box = makeStateBox({
      [longUserId]: { userId: longUserId, key1: 'value1', key2: 'value2', writer: 'IgF' },
    });

    removeField(longUserId, 'key1', box.setter, undefined, 'key1');
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [writtenUserId, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(writtenUserId).toBe(longUserId);
    expect(payload).toEqual({ userId: longUserId, key1: null, lastAction: expect.any(Number) });
    // Crucially, the payload must not carry any other field's value.
    expect(payload).not.toHaveProperty('key2');
    expect(payload).not.toHaveProperty('writer');
  });

  it('coalesces two rapid deletions into one write that nulls both fields', async () => {
    const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';
    const box = makeStateBox({
      [longUserId]: { userId: longUserId, key1: 'value1', key2: 'value2' },
    });

    removeField(longUserId, 'key1', box.setter, undefined, 'key1');
    removeField(longUserId, 'key2', box.setter, undefined, 'key2');
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(payload).toEqual({
      userId: longUserId,
      key1: null,
      key2: null,
      lastAction: expect.any(Number),
    });

    // The local (in-memory) state still ends up correctly missing both fields.
    expect(box.get()[longUserId]).toEqual({ userId: longUserId });
  });

  it('writes only to the profile nodes for a card without a legacy body', async () => {
    const box = makeStateBox({
      ID0001: { userId: 'ID0001', key1: 'value1' },
    });

    removeField('ID0001', 'key1', box.setter, undefined, 'key1');
    await flushSubmit();

    expect(updateProfileNodesInRTDB).toHaveBeenCalledTimes(1);
    expect(updateDataInRealtimeDB).not.toHaveBeenCalled();
  });
});

// React виконує updater-колбек setState/setUsers синхронно лише через
// внутрішню оптимізацію "eager state", і лише поки на цьому fiber немає інших
// запланованих оновлень. У списку карток це не виконується: setUsers і setState
// живуть в одному компоненті, тож перший же setState робить fiber брудним, і
// колбек setUsers відкладається до рендеру. Ці тести моделюють саме такий
// setter — updater не виконується в момент виклику.
const makeDeferredStateBox = initial => {
  let current = initial;
  const queue = [];
  const setter = updater => {
    queue.push(updater);
  };
  const flushRender = () => {
    while (queue.length) {
      const updater = queue.shift();
      current = typeof updater === 'function' ? updater(current) : updater;
    }
  };
  return { get: () => current, setter, flushRender };
};

describe('removeField writes to the backend even when React defers the state updaters', () => {
  const flushSubmit = () => new Promise(resolve => setTimeout(resolve, 0));
  const longUserId = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';

  beforeEach(() => {
    updateProfileNodesInRTDB.mockReset();
    updateDataInRealtimeDB.mockReset();
    updateCachedUser.mockReset();
    getCardLegacyCollection.mockImplementation(async userId => (userId === 'ID0001' ? null : 'users'));
  });

  it('mirrors the optimistic card deletion to cache before React flushes its updater', () => {
    const card = { userId: longUserId, name: 'Ada', writer: 'IgF' };
    const users = makeDeferredStateBox({ [longUserId]: card });

    removeField(longUserId, 'writer', users.setter, undefined, 'writer', { cardData: card });

    expect(users.get()[longUserId]).toEqual(card);
    expect(updateCachedUser).toHaveBeenCalledTimes(1);
    expect(updateCachedUser).toHaveBeenCalledWith(
      { userId: longUserId, name: 'Ada' },
      { removeKeys: ['writer'] },
    );
  });

  it('mirrors the accumulated card to cache for every deletion in a rapid burst', () => {
    const card = { userId: longUserId, a: 1, b: 2, c: 3 };
    const users = makeDeferredStateBox({ [longUserId]: card });

    removeField(longUserId, 'a', users.setter, undefined, 'a', { cardData: card });
    removeField(longUserId, 'b', users.setter, undefined, 'b', { cardData: card });

    expect(updateCachedUser).toHaveBeenNthCalledWith(
      1,
      { userId: longUserId, b: 2, c: 3 },
      { removeKeys: ['a'] },
    );
    expect(updateCachedUser).toHaveBeenNthCalledWith(
      2,
      { userId: longUserId, c: 3 },
      { removeKeys: ['b'] },
    );
  });

  it('sends the deletion from the synchronous card snapshot, without waiting for a render', async () => {
    const card = { userId: longUserId, name: '', writer: 'IgF', deviceWidth: 360 };
    const users = makeDeferredStateBox({ [longUserId]: card });
    const profileState = makeDeferredStateBox({ ...card });

    removeField(longUserId, 'name', users.setter, profileState.setter, 'name', { cardData: card });
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [writtenUserId, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(writtenUserId).toBe(longUserId);
    expect(payload).toEqual({ userId: longUserId, name: null, lastAction: expect.any(Number) });
  });

  it('does not write the same deletion twice once the deferred updaters finally run', async () => {
    const card = { userId: longUserId, name: '', writer: 'IgF' };
    const users = makeDeferredStateBox({ [longUserId]: card });
    const profileState = makeDeferredStateBox({ ...card });

    removeField(longUserId, 'writer', users.setter, profileState.setter, 'writer', { cardData: card });
    users.flushRender();
    profileState.flushRender();
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    expect(users.get()[longUserId]).toEqual({ userId: longUserId, name: '' });
    expect(profileState.get()).toEqual({ userId: longUserId, name: '' });
  });

  it('sends a burst of deletions as one write with every key nulled', async () => {
    const card = { userId: longUserId, name: '', writer: 'IgF', deviceWidth: 360 };
    const users = makeDeferredStateBox({ [longUserId]: card });
    const profileState = makeDeferredStateBox({ ...card });

    // Знімок навмисно той самий на всі три кліки: у застосунку React ще не
    // перемалював список, тож замикання відстає рівно так само.
    ['name', 'writer', 'deviceWidth'].forEach(field => {
      removeField(longUserId, field, users.setter, profileState.setter, field, { cardData: card });
    });
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(payload).toEqual({
      userId: longUserId,
      name: null,
      writer: null,
      deviceWidth: null,
      lastAction: expect.any(Number),
    });
  });

  it('never loses a key clicked while the previous write is still in flight', async () => {
    let releaseFirstWrite;
    const firstWrite = new Promise(resolve => { releaseFirstWrite = resolve; });
    let writeCount = 0;
    updateDataInRealtimeDB.mockImplementation(async () => {
      writeCount += 1;
      if (writeCount === 1) await firstWrite;
    });

    const card = { userId: longUserId, a: 1, b: 2, c: 3 };
    const users = makeDeferredStateBox({ [longUserId]: card });

    removeField(longUserId, 'a', users.setter, undefined, 'a', { cardData: card });
    await flushSubmit();
    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);

    // Клікаємо ще два хрестики, поки перший запис висить у польоті.
    removeField(longUserId, 'b', users.setter, undefined, 'b', { cardData: card });
    removeField(longUserId, 'c', users.setter, undefined, 'c', { cardData: card });
    await flushSubmit();
    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);

    releaseFirstWrite();
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(2);
    const [, firstPayload] = updateDataInRealtimeDB.mock.calls[0];
    const [, secondPayload] = updateDataInRealtimeDB.mock.calls[1];
    expect(firstPayload).toEqual({ userId: longUserId, a: null, lastAction: expect.any(Number) });
    expect(secondPayload).toEqual({
      userId: longUserId,
      b: null,
      c: null,
      lastAction: expect.any(Number),
    });
  });

  it('still writes without a card snapshot, once the deferred setUsers updater runs', async () => {
    const users = makeDeferredStateBox({
      [longUserId]: { userId: longUserId, key1: 'value1', key2: 'value2' },
    });

    removeField(longUserId, 'key1', users.setter, undefined, 'key1');
    users.flushRender();
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(payload).toEqual({ userId: longUserId, key1: null, lastAction: expect.any(Number) });
  });

  it('removes a nested path from the snapshot and writes the surviving parent value', async () => {
    const card = { userId: longUserId, language: ['uk', 'en'] };
    const users = makeDeferredStateBox({ [longUserId]: card });

    removeField(longUserId, 'language.0', users.setter, undefined, 'language.0', { cardData: card });
    await flushSubmit();

    expect(updateDataInRealtimeDB).toHaveBeenCalledTimes(1);
    const [, payload] = updateDataInRealtimeDB.mock.calls[0];
    expect(payload).toEqual({ userId: longUserId, language: 'en', lastAction: expect.any(Number) });
  });
});
