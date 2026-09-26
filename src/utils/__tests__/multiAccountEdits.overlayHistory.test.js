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
