const { get, push, ref, remove, runTransaction, update } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(),
  runTransaction: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  database: { app: 'db' },
  updateSearchId: jest.fn(async () => undefined),
}));

const { updateSearchId } = require('components/config');

const {
  buildSupersededOverlayEntries,
  pruneOverlaysMatchingCanonical,
  settleOverlayValueForCard,
  settleSupersededOverlayValue,
} = require('../multiAccountEdits');

// Читач замінив номер на ...667, потім поправив свою ж правку на ...666.
// Шар тримає лише поточну різницю, тож ...667 живе самим лише журналом.
const HISTORY = {
  h1: {
    cardUserId: 'card-1', editorUserId: 'editorA', action: 'edit', fieldName: 'phone',
    change: { from: '380509677493', to: '380503355667' }, at: 100,
  },
  h2: {
    cardUserId: 'card-1', editorUserId: 'editorA', action: 'edit', fieldName: 'phone',
    change: { from: '380509677493', to: '380503355666' }, at: 200,
  },
};
const OVERLAYS = {
  editorA: {
    updatedAt: 200,
    cardUserId: 'card-1',
    editorUserId: 'editorA',
    fields: { phone: { from: '380509677493', to: '380503355666' } },
  },
};
const CANONICAL = { userId: 'card-1', phone: '380509677493' };

const mockReads = ({ canonical = CANONICAL, overlays = OVERLAYS, history = HISTORY } = {}) => {
  get.mockImplementation(async ({ path }) => {
    if (path === 'multiData/edits/card-1/editorA') {
      return { exists: () => Boolean(overlays.editorA), val: () => overlays.editorA || null };
    }
    if (path === 'multiData/edits/card-1') return { exists: () => true, val: () => overlays };
    if (path === 'multiData/editsHistory/card-1') return { exists: () => true, val: () => history };
    if (path === 'profileContacts/card-1') return { exists: () => true, val: () => canonical };
    return { exists: () => false, val: () => null };
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  ref.mockImplementation((db, path) => ({ db, path }));
  push.mockImplementation(() => ({ key: 'entry-new' }));
  runTransaction.mockImplementation(async (refObject, updater) => {
    updater(OVERLAYS.editorA);
    return { committed: true };
  });
  mockReads();
});

describe('попередні версії правки', () => {
  it('адмін бачить першу правку поруч із поточною', () => {
    const entries = buildSupersededOverlayEntries({
      historyEntries: Object.values(HISTORY),
      overlaysByEditor: OVERLAYS,
      canonical: CANONICAL,
    });

    expect(entries).toEqual({
      phone: [expect.objectContaining({ value: '380503355667', editorUserId: 'editorA', superseded: true })],
    });
  });

  it('не показує версією те, що вже стоїть у картці чи в поточному шарі', () => {
    const entries = buildSupersededOverlayEntries({
      historyEntries: Object.values(HISTORY),
      overlaysByEditor: OVERLAYS,
      // Написання інше, ключ `searchId` той самий.
      canonical: { userId: 'card-1', phone: ['380509677493', '+38 050 335 56 67'] },
    });

    expect(entries).toEqual({});
  });

  it('показує попередні видалення з правильною ознакою', () => {
    const entries = buildSupersededOverlayEntries({
      historyEntries: [
        { editorUserId: 'editorA', action: 'edit', fieldName: 'phone', change: { from: '380500000004', to: '' }, at: 100 },
        { editorUserId: 'editorA', action: 'edit', fieldName: 'email', change: { removed: ['old@example.com'] }, at: 101 },
      ],
      overlaysByEditor: {},
      canonical: { phone: '380500000004', email: ['old@example.com'] },
    });

    expect(entries.phone).toEqual([
      expect.objectContaining({ value: '380500000004', isDeleted: true, superseded: true }),
    ]);
    expect(entries.email).toEqual([
      expect.objectContaining({ value: 'old@example.com', isDeleted: true, superseded: true }),
    ]);
  });

  it('не ховає видалення, коли поточна заміна лише відштовхується від того самого значення', () => {
    const entries = buildSupersededOverlayEntries({
      historyEntries: [
        { editorUserId: 'editorA', action: 'edit', fieldName: 'phone', change: { from: '380500000004', to: '' }, at: 100 },
      ],
      overlaysByEditor: {
        editorA: { fields: { phone: { from: '380500000004', to: '380500000006' } } },
      },
      canonical: { phone: '380500000004' },
    });

    expect(entries.phone).toEqual([
      expect.objectContaining({ value: '380500000004', isDeleted: true }),
    ]);
  });

  it('не ховає однакові історичні значення різних редакторів', () => {
    const entries = buildSupersededOverlayEntries({
      historyEntries: [
        { editorUserId: 'editorA', action: 'edit', fieldName: 'phone', change: { added: ['380500000005'] }, at: 100 },
        { editorUserId: 'editorB', action: 'edit', fieldName: 'phone', change: { added: ['380500000005'] }, at: 101 },
      ],
      overlaysByEditor: {},
      canonical: {},
    });

    expect(entries.phone.map(entry => entry.editorUserId)).toEqual(['editorA', 'editorB']);
  });

  it('рішення про версію чистить журнал і знімає ключ, якого ніхто не тримає', async () => {
    await settleSupersededOverlayValue({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'phone',
      value: '380503355667',
      action: 'discard',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsHistory/card-1' }),
      { h1: null },
    );
    expect(updateSearchId).toHaveBeenCalledWith('phone', '380503355667', 'card-1', 'remove');
  });

  it('лишає журнал для повтору, коли перевірка searchId не вдалася', async () => {
    get.mockImplementation(async ({ path }) => {
      if (path === 'profileContacts/card-1') throw new Error('network');
      return { exists: () => false, val: () => null };
    });

    await expect(settleSupersededOverlayValue({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'phone',
      value: '380503355667',
      action: 'discard',
    })).rejects.toThrow('network');

    expect(update).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsHistory/card-1' }),
      expect.anything(),
    );
  });
});

describe('рішення адміна не лишає слідів', () => {
  it('прийняте значення знімає записи журналу замість дописати «accept»', async () => {
    await settleOverlayValueForCard({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'phone',
      value: '380503355666',
      action: 'accept',
    });

    expect(push).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsHistory/card-1' }),
      { h2: null },
    );
  });

  it('повідомляє про збій очищення журналу', async () => {
    get.mockImplementation(async ({ path }) => {
      if (path === 'multiData/edits/card-1/editorA') {
        return { exists: () => true, val: () => OVERLAYS.editorA };
      }
      if (path === 'multiData/editsHistory/card-1') throw new Error('history unavailable');
      return { exists: () => false, val: () => null };
    });

    await expect(settleOverlayValueForCard({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'phone',
      value: '380503355666',
      action: 'discard',
    })).rejects.toThrow('history unavailable');
  });
});

describe('шар, який дублює картку', () => {
  it('знімається, щойно картка містить те саме значення', async () => {
    const canonical = { userId: 'card-1', phone: ['380509677493', '380503355666'] };
    mockReads({ canonical });

    const pruned = await pruneOverlaysMatchingCanonical({
      cardUserId: 'card-1',
      canonical,
      overlaysByEditor: OVERLAYS,
    });

    expect(pruned).toBe(1);
    // Шар містив лише це поле — він іде цілком.
    expect(runTransaction.mock.calls[0][1](OVERLAYS.editorA)).toBeNull();
    expect(updateSearchId).not.toHaveBeenCalled();
  });

  it('лишає пропозицію, якої в картці ще немає', async () => {
    const pruned = await pruneOverlaysMatchingCanonical({
      cardUserId: 'card-1',
      canonical: CANONICAL,
      overlaysByEditor: OVERLAYS,
    });

    expect(pruned).toBe(0);
    expect(runTransaction).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('запис журналу з кількома значеннями', () => {
  // Одне збереження дописало A і B, друге поправило B на C.
  const MULTI_HISTORY = {
    m1: {
      cardUserId: 'card-1', editorUserId: 'editorA', action: 'edit', fieldName: 'phone',
      change: { added: ['380500000001', '380500000002'] }, at: 100,
    },
    m2: {
      cardUserId: 'card-1', editorUserId: 'editorA', action: 'edit', fieldName: 'phone',
      change: { added: ['380500000001', '380500000003'] }, at: 200,
    },
  };
  const MULTI_OVERLAY = {
    editorA: {
      updatedAt: 200,
      cardUserId: 'card-1',
      editorUserId: 'editorA',
      fields: { phone: { added: ['380500000001', '380500000003'] } },
    },
  };

  beforeEach(() => {
    let counter = 0;
    push.mockImplementation(() => ({ key: `rewritten-${(counter += 1)}` }));
    runTransaction.mockImplementation(async (refObject, updater) => {
      updater(MULTI_OVERLAY.editorA);
      return { committed: true };
    });
    mockReads({ overlays: MULTI_OVERLAY, history: MULTI_HISTORY });
  });

  it('рішення про A переписує записи з рештою значень, а не зносить їх', async () => {
    await settleOverlayValueForCard({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'phone',
      value: '380500000001',
      action: 'accept',
    });

    const historyUpdate = update.mock.calls.find(([target]) => target.path === 'multiData/editsHistory/card-1');
    expect(historyUpdate[1]).toEqual({
      m1: null,
      'rewritten-1': expect.objectContaining({
        editorUserId: 'editorA', action: 'edit', fieldName: 'phone', at: 100,
        change: { added: ['380500000002'] },
      }),
      m2: null,
      'rewritten-2': expect.objectContaining({
        at: 200,
        change: { added: ['380500000003'] },
      }),
    });

    // B лишається попередньою версією, поки C — поточна пропозиція.
    const remainingHistory = Object.values(historyUpdate[1]).filter(Boolean);
    const entries = buildSupersededOverlayEntries({
      historyEntries: remainingHistory,
      overlaysByEditor: { editorA: { ...MULTI_OVERLAY.editorA, fields: { phone: { added: ['380500000003'] } } } },
      canonical: { userId: 'card-1', phone: ['380500000001'] },
    });
    expect(entries.phone.map(entry => entry.value)).toEqual(['380500000002']);
  });

  it('запис, у якому нічого не лишилось, зноситься цілком', async () => {
    mockReads({
      overlays: MULTI_OVERLAY,
      history: { solo: { ...MULTI_HISTORY.m1, change: { added: ['380500000001'] } } },
    });

    await settleOverlayValueForCard({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'phone',
      value: '380500000001',
      action: 'discard',
    });

    const historyUpdate = update.mock.calls.find(([target]) => target.path === 'multiData/editsHistory/card-1');
    expect(historyUpdate[1]).toEqual({ solo: null });
  });
});
