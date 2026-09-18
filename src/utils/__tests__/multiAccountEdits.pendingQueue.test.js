// Черга доповнень, з якої адмін починає перегляд: `listPendingOverlayCards`.
//
// Оберненого індексу «картка → є шар» немає, тож перелік береться з кореня
// `multiData/edits` одним читанням. Перевіряється рівно те, що коштувало б
// розбору на живій базі: читається корінь, а не вузол картки; картка без
// жодного змістовного поля в черзі не зʼявляється (інакше адмін відкриває
// порожній рядок і не розуміє, що з ним робити); і найсвіжіше стоїть зверху.
const { get, ref } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(() => ({ key: 'history-entry' })),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  database: { app: 'db' },
  updateSearchId: jest.fn(async () => undefined),
}));

const { listPendingOverlayCards } = require('../multiAccountEdits');

const snapshotOf = value => ({ exists: () => Boolean(value), val: () => value });

describe('listPendingOverlayCards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
  });

  it('reads the edits root once and groups every editor under their card', async () => {
    get.mockResolvedValueOnce(snapshotOf({
      CARD1: {
        editorA: {
          cardUserId: 'CARD1',
          editorUserId: 'editorA',
          updatedAt: 200,
          fields: { phone: { added: ['380501112233'] } },
        },
        editorB: {
          cardUserId: 'CARD1',
          editorUserId: 'editorB',
          updatedAt: 500,
          fields: { city: { from: 'Київ', to: 'Львів' } },
        },
      },
    }));

    const queue = await listPendingOverlayCards();

    expect(get).toHaveBeenCalledTimes(1);
    expect(ref.mock.calls[0][1]).toBe('multiData/edits');
    expect(queue).toHaveLength(1);
    expect(queue[0].cardUserId).toBe('CARD1');
    expect(queue[0].editorIds.sort()).toEqual(['editorA', 'editorB']);
    expect(queue[0].fieldNames.sort()).toEqual(['city', 'phone']);
    // Свіжість картки — це найсвіжіший із її шарів: саме він і є привід її
    // показати.
    expect(queue[0].updatedAt).toBe(500);
  });

  it('drops overlays that carry only technical fields', async () => {
    get.mockResolvedValueOnce(snapshotOf({
      CARD_TECHNICAL: {
        editorA: {
          cardUserId: 'CARD_TECHNICAL',
          editorUserId: 'editorA',
          updatedAt: 100,
          fields: { lastAction: { to: '2026-09-01' }, cachedAt: { to: '1' } },
        },
      },
      CARD_REAL: {
        editorA: {
          cardUserId: 'CARD_REAL',
          editorUserId: 'editorA',
          updatedAt: 90,
          fields: { name: { to: 'Оксана' } },
        },
      },
    }));

    const queue = await listPendingOverlayCards();

    expect(queue.map(entry => entry.cardUserId)).toEqual(['CARD_REAL']);
  });

  it('puts the freshest card first', async () => {
    get.mockResolvedValueOnce(snapshotOf({
      OLD: {
        editorA: { cardUserId: 'OLD', editorUserId: 'editorA', updatedAt: 10, fields: { name: { to: 'A' } } },
      },
      NEW: {
        editorA: { cardUserId: 'NEW', editorUserId: 'editorA', updatedAt: 90, fields: { name: { to: 'B' } } },
      },
    }));

    const queue = await listPendingOverlayCards();

    expect(queue.map(entry => entry.cardUserId)).toEqual(['NEW', 'OLD']);
  });

  it('returns an empty queue when the node does not exist', async () => {
    get.mockResolvedValueOnce(snapshotOf(null));
    await expect(listPendingOverlayCards()).resolves.toEqual([]);
  });

  it('lets a read failure through instead of reporting an empty queue', async () => {
    // Порожня черга й відмова читання — різні відповіді: найімовірніша причина
    // відмови в тому, що правила бази ще не викотили руками, і тоді «доповнень
    // немає» бреше рівно тоді, коли їх найбільше.
    get.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'PERMISSION_DENIED' }));
    await expect(listPendingOverlayCards()).rejects.toThrow('permission denied');
  });
});
