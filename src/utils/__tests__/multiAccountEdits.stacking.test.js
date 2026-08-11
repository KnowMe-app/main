const { get, push, ref, remove, set, update } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  database: { app: 'db' },
}));

const {
  acceptAllOverlaysForCard,
  acceptOverlayFieldForUserCard,
  applyOverlaysToCard,
  buildOverlayFromDraft,
  getOverlayHistoryForCard,
  getStackedCardViews,
  getStackedOverlayFieldNames,
  removeAllOverlaysForCard,
  saveOverlayForUserCard,
  sortOverlaysByAppliedOrder,
} = require('../multiAccountEdits');

const CANONICAL = { userId: 'card-1', name: 'Ірина', phone: '111', city: 'Київ' };

// editorB saved after editorA, so B's value for a field both touched is the
// one everybody must see.
const OVERLAYS = {
  editorA: {
    updatedAt: 100,
    fields: { name: { from: 'Ірина', to: 'Ірина А.' }, city: { from: 'Київ', to: 'Львів' } },
  },
  editorB: {
    updatedAt: 200,
    fields: { name: { from: 'Ірина А.', to: 'Ірина Б.' }, phone: { added: ['222'] } },
  },
};

describe('stacking every editor overlay onto a card', () => {
  it('replays overlays oldest first, so the newest editor wins a contested field', () => {
    expect(sortOverlaysByAppliedOrder(OVERLAYS).map(overlay => overlay.editorUserId))
      .toEqual(['editorA', 'editorB']);

    expect(applyOverlaysToCard(CANONICAL, OVERLAYS)).toEqual({
      userId: 'card-1',
      name: 'Ірина Б.',
      city: 'Львів',
      phone: ['111', '222'],
    });
  });

  it('orders overlays deterministically when updatedAt is missing or tied', () => {
    const tied = {
      editorB: { updatedAt: 5, fields: { city: { from: 'Київ', to: 'B' } } },
      editorA: { updatedAt: 5, fields: { city: { from: 'Київ', to: 'A' } } },
      legacy: { fields: { city: { from: 'Київ', to: 'Legacy' } } },
    };

    expect(sortOverlaysByAppliedOrder(tied).map(overlay => overlay.editorUserId))
      .toEqual(['legacy', 'editorA', 'editorB']);
    expect(applyOverlaysToCard(CANONICAL, tied).city).toBe('B');
  });

  it('shows one editor a contact another editor deleted', () => {
    const canonical = { userId: 'card-1', phone: ['111', '222'] };
    const overlays = { editorA: { updatedAt: 1, fields: { phone: { removed: ['222'] } } } };

    expect(applyOverlaysToCard(canonical, overlays).phone).toBe('111');
  });

  it('normalizes the legacy `add` alias while stacking', () => {
    const overlays = { editorA: { updatedAt: 1, fields: { phone: { add: ['333'] } } } };

    expect(applyOverlaysToCard(CANONICAL, overlays).phone).toEqual(['111', '333']);
  });

  it('lists the fields with a pending change without saying who changed them', () => {
    expect(getStackedOverlayFieldNames({
      ...OVERLAYS,
      editorC: { updatedAt: 300, fields: { lastAction: { from: 1, to: 2 } } },
    }).sort()).toEqual(['city', 'name', 'phone']);
  });
});

describe('an editor overlay only ever carries that editor own delta', () => {
  it('excludes the editor own overlay from the baseline their next save is diffed against', () => {
    const { stacked, baseWithoutOwnOverlay } = getStackedCardViews({
      canonical: CANONICAL,
      overlaysByEditor: OVERLAYS,
      editorUserId: 'editorB',
    });

    // editorB edits the card everybody sees...
    expect(stacked.name).toBe('Ірина Б.');
    // ...but their baseline still has editorA's pending value for `name`.
    expect(baseWithoutOwnOverlay.name).toBe('Ірина А.');

    // Submitting the form they were shown, with one field of their own
    // changed, must not turn editorA's pending change into editorB's.
    const ownOverlay = buildOverlayFromDraft(baseWithoutOwnOverlay, { ...stacked, city: 'Одеса' });

    expect(ownOverlay.city).toEqual({ from: 'Львів', to: 'Одеса' });
    expect(ownOverlay.name).toEqual({ from: 'Ірина А.', to: 'Ірина Б.' });
    expect(ownOverlay).not.toHaveProperty('userId');
  });

  it('keeps a third editor delta free of both predecessors changes', () => {
    const { stacked, baseWithoutOwnOverlay } = getStackedCardViews({
      canonical: CANONICAL,
      overlaysByEditor: OVERLAYS,
      editorUserId: 'editorC',
    });

    const ownOverlay = buildOverlayFromDraft(baseWithoutOwnOverlay, { ...stacked, city: 'Одеса' });

    expect(Object.keys(ownOverlay)).toEqual(['city']);
    expect(ownOverlay.city).toEqual({ from: 'Львів', to: 'Одеса' });
  });
});

describe('overlay history journal', () => {
  let pushCounter = 0;

  beforeEach(() => {
    jest.clearAllMocks();
    pushCounter = 0;
    ref.mockImplementation((db, path) => ({ db, path }));
    push.mockImplementation(() => {
      pushCounter += 1;
      return { key: `entry-${pushCounter}` };
    });
  });

  it('journals only the fields a save actually changed', async () => {
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ name: { from: 'Ірина', to: 'Ірина А.' } }),
    });

    await saveOverlayForUserCard({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fields: {
        name: { from: 'Ірина', to: 'Ірина А.' },
        city: { from: 'Київ', to: 'Львів' },
      },
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editor-1' }),
      expect.objectContaining({
        fields: {
          name: { from: 'Ірина', to: 'Ірина А.' },
          city: { from: 'Київ', to: 'Львів' },
        },
      }),
    );

    const [historyRef, historyUpdates] = update.mock.calls.at(-1);
    expect(historyRef).toEqual(expect.objectContaining({ path: 'multiData/editsHistory/card-1' }));
    expect(Object.values(historyUpdates)).toEqual([
      expect.objectContaining({
        action: 'edit',
        cardUserId: 'card-1',
        editorUserId: 'editor-1',
        fieldName: 'city',
        change: { from: 'Київ', to: 'Львів' },
      }),
    ]);
  });

  it('never fails a save because the journal could not be written', async () => {
    get.mockResolvedValueOnce({ exists: () => false, val: () => null });
    update.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

    await expect(saveOverlayForUserCard({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fields: { city: { from: 'Київ', to: 'Львів' } },
    })).resolves.toBeUndefined();

    expect(set).toHaveBeenCalled();
  });

  it('returns journal entries newest first', async () => {
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        older: { at: 100, fieldName: 'name', editorUserId: 'editorA', action: 'edit' },
        newer: { at: 300, fieldName: 'city', editorUserId: 'editorB', action: 'accept' },
      }),
    });

    const history = await getOverlayHistoryForCard('card-1');

    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/editsHistory/card-1' }));
    expect(history.map(entry => entry.entryId)).toEqual(['newer', 'older']);
  });
});

describe('admin review actions', () => {
  const mockCardReads = () => {
    get.mockImplementation(async ({ path }) => {
      if (path === 'multiData/edits/card-1') {
        return { exists: () => true, val: () => OVERLAYS };
      }
      if (path === 'users/card-1') {
        return { exists: () => true, val: () => CANONICAL };
      }
      return { exists: () => false, val: () => null };
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
    push.mockImplementation(() => ({ key: 'entry-1' }));
    mockCardReads();
  });

  it('accepts a single field and leaves every other pending change alone', async () => {
    const persistCard = jest.fn();

    const result = await acceptOverlayFieldForUserCard({
      editorUserId: 'editorA',
      cardUserId: 'card-1',
      fieldName: 'city',
      persistCard,
    });

    expect(persistCard).toHaveBeenCalledWith(expect.objectContaining({
      city: 'Львів',
      // editorA's name change was not part of this approval.
      name: 'Ірина',
    }));
    expect(result.change).toEqual({ from: 'Київ', to: 'Львів' });
    // Only the accepted field is cleared - editorB's overlay is untouched.
    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editorA/fields/city' }),
    );
    expect(remove).not.toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editorB' }),
    );
  });

  it('accepts everything at once by persisting the stacked card and clearing the queue', async () => {
    const persistCard = jest.fn();

    await acceptAllOverlaysForCard({ cardUserId: 'card-1', persistCard });

    expect(persistCard).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Ірина Б.',
      city: 'Львів',
      phone: ['111', '222'],
    }));
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/edits/card-1' }));
  });

  it('discards the whole queue without writing anything to the card', async () => {
    await removeAllOverlaysForCard('card-1');

    expect(set).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/edits/card-1' }));

    const journalled = update.mock.calls
      .flatMap(([, updates]) => Object.values(updates || {}))
      .map(entry => entry.action);
    expect(journalled.every(action => action === 'discard')).toBe(true);
    expect(journalled.length).toBeGreaterThan(0);
  });
});
