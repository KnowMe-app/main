const { get, push, ref, remove, set, update } = require('firebase/database');

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
}));

const {
  applyOverlayToCard,
  buildOverlayFromDraft,
  getCanonicalCard,
  getOverlayForUserCard,
  getOverlaysForCard,
  patchOverlayField,
  removeOverlayForUserCard,
  saveOverlayForUserCard,
  settleOverlayFieldValue,
} = require('../multiAccountEdits');

describe('multiAccountEdits field history', () => {
  it('appends an entered value instead of replacing the canonical value', () => {
    const fields = buildOverlayFromDraft({ phone: '111' }, { phone: ['222'] });
    expect(fields.phone).toEqual({ added: ['222'], removed: ['111'] });

    // The repeatable form includes the canonical history when it edits an
    // existing value, so the resulting overlay is addition-only.
    const accumulated = buildOverlayFromDraft({ phone: '111' }, { phone: ['111', '222'] });
    expect(accumulated.phone).toEqual({ added: ['222'] });
    expect(applyOverlayToCard({ phone: '111' }, accumulated)).toEqual({ phone: ['111', '222'] });
  });

  it('treats the form empty row as a removal rather than historical card data', () => {
    const fields = buildOverlayFromDraft({ phone: '111' }, { phone: [''] });
    expect(fields.phone).toEqual({ removed: ['111'] });
    expect(applyOverlayToCard({ phone: '111' }, fields)).toEqual({});
  });
});

const LONG_USER_ID = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';

describe('multiAccountEdits storage structure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
    push.mockImplementation(() => ({ key: 'history-entry' }));
  });

  it('saves overlay under cardUserId/editorUserId path', async () => {
    await saveOverlayForUserCard({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fields: {
        name: { from: 'old', to: 'new' },
        empty: { from: 'same', to: 'same' },
      },
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editor-1' }),
      expect.objectContaining({
        cardUserId: 'card-1',
        editorUserId: 'editor-1',
        fields: { name: { from: 'old', to: 'new' } },
      }),
    );
  });

  it('appends one removal entry to the admin history when a value is cleared', async () => {
    get.mockResolvedValueOnce({ exists: () => false });

    await saveOverlayForUserCard({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fields: { phone: { removed: ['111'] } },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsHistory/card-1' }),
      {
        'history-entry': expect.objectContaining({
          action: 'edit',
          cardUserId: 'card-1',
          editorUserId: 'editor-1',
          fieldName: 'phone',
          change: { removed: ['111'] },
        }),
      },
    );
  });

  // The roster outlives both the overlay and the journal: when the card is
  // published, it is the only record of who is entitled to keep it.
  it('records the editor in the card contributor roster on every save', async () => {
    get.mockResolvedValueOnce({ exists: () => false });

    await saveOverlayForUserCard({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fields: { phone: { added: ['222'] } },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsContributors/card-1' }),
      { 'editor-1': expect.any(Number) },
    );
  });

  it('loads all overlays from a card directory', async () => {
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        editorA: { fields: { name: { from: 'a', to: 'b' } }, updatedAt: 1 },
        editorB: { fields: { city: { from: 'x', to: 'y' } }, updatedAt: 2 },
        broken: { hello: 'world' },
      }),
    });

    const overlays = await getOverlaysForCard('card-1');

    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/edits/card-1' }));
    expect(Object.keys(overlays)).toEqual(['editorA', 'editorB']);
    expect(overlays.editorA.fields.name.to).toBe('b');
  });

  it('prefers selected editor overlay but falls back to first available', async () => {
    get.mockResolvedValueOnce({
      exists: () => false,
      val: () => null,
    });

    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        editorA: { fields: { phone: { from: '', to: '+380' } } },
        editorB: { fields: { city: { from: 'A', to: 'B' } } },
      }),
    });

    const preferred = await getOverlayForUserCard({ editorUserId: 'editorB', cardUserId: 'card-1' });
    expect(preferred.editorUserId).toBe('editorB');

    get.mockResolvedValueOnce({
      exists: () => false,
      val: () => null,
    });

    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        editorA: { fields: { phone: { from: '', to: '+380' } } },
      }),
    });

    const fallback = await getOverlayForUserCard({ editorUserId: 'missing', cardUserId: 'card-1' });
    expect(fallback.editorUserId).toBe('editorA');

    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({
        editorC: { fields: { city: { from: 'C', to: 'D' } } },
      }),
    });

    const adminFallback = await getOverlayForUserCard({ cardUserId: 'card-1' });
    expect(adminFallback.editorUserId).toBe('editorC');

  });

  it('removes and patches fields in the new path', async () => {
    await removeOverlayForUserCard({ editorUserId: 'editor-1', cardUserId: 'card-1' });
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/edits/card-1/editor-1' }));

    await patchOverlayField({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fieldName: 'city',
      change: { from: 'A', to: 'B' },
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editor-1/fields' }),
      { city: { from: 'A', to: 'B' } },
    );
  });

  it('deletes overlay when only technical fields remain', async () => {
    get.mockResolvedValueOnce({
      exists: () => true,
      val: () => ({ lastAction: { from: 1, to: 2 }, cachedAt: { from: 1, to: 2 } }),
    });

    await patchOverlayField({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fieldName: 'lastAction',
      change: { from: 1, to: 2 },
    });

    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editor-1' }),
    );
  });

  it('does not save overlay with technical-only fields', async () => {
    await saveOverlayForUserCard({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fields: {
        lastAction: { from: 1, to: 2 },
        cachedAt: { from: 1, to: 2 },
      },
    });

    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editor-1' }),
    );
    expect(set).not.toHaveBeenCalled();
  });
});

describe('getCanonicalCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
  });

  it('reads only users for a long-format userId when found there, never touching newUsers', async () => {
    get.mockImplementation(async ({ path }) => {
      if (path === `users/${LONG_USER_ID}`) {
        return { exists: () => true, val: () => ({ name: 'Canonical' }) };
      }
      throw new Error(`unexpected read: ${path}`);
    });

    const card = await getCanonicalCard(LONG_USER_ID);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: `users/${LONG_USER_ID}` }));
    expect(card).toEqual({ userId: LONG_USER_ID, name: 'Canonical' });
  });

  it('falls back to newUsers for a long-format userId only when users has no record', async () => {
    get.mockImplementation(async ({ path }) => {
      if (path === `users/${LONG_USER_ID}`) return { exists: () => false, val: () => null };
      if (path === `newUsers/${LONG_USER_ID}`) {
        return { exists: () => true, val: () => ({ name: 'Fallback' }) };
      }
      throw new Error(`unexpected read: ${path}`);
    });

    const card = await getCanonicalCard(LONG_USER_ID);

    expect(get).toHaveBeenCalledTimes(2);
    expect(card).toEqual({ userId: LONG_USER_ID, name: 'Fallback' });
  });

  it('still checks both collections in parallel for a short-format userId', async () => {
    get.mockImplementation(async ({ path }) => {
      if (path === 'users/TG0016') return { exists: () => true, val: () => ({ name: 'Users' }) };
      if (path === 'newUsers/TG0016') return { exists: () => true, val: () => ({ extra: 'NewUsers' }) };
      throw new Error(`unexpected read: ${path}`);
    });

    const card = await getCanonicalCard('TG0016');

    expect(get).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: 'users/TG0016' }));
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: 'newUsers/TG0016' }));
    expect(card).toEqual({ userId: 'TG0016', name: 'Users', extra: 'NewUsers' });
  });
});

// The review UI settles an edit by wiping it: the pending change goes, and so
// do the journal entries that described it. Nothing is left in the backend for
// an edit that has already been saved into the card or thrown away.
describe('settleOverlayFieldValue with purgeHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
    push.mockImplementation(() => ({ key: 'history-entry' }));
  });

  it('deletes the journal entries about the settled value instead of adding one', async () => {
    get
      // cleanupOverlayIfOnlyTechnicalFields reads what is left of the overlay
      .mockResolvedValueOnce({ exists: () => true, val: () => ({ phone: { added: ['222'] } }) })
      .mockResolvedValueOnce({
        exists: () => true,
        val: () => ({
          h1: { fieldName: 'name', editorUserId: 'editor-1', change: { from: 'Name6', to: 'Name7' } },
          h2: { fieldName: 'name', editorUserId: 'editor-1', change: { from: '', to: 'Name5' } },
          h3: { fieldName: 'name', editorUserId: 'editor-1', change: { discarded: true } },
          h4: { fieldName: 'phone', editorUserId: 'editor-1', change: { added: ['222'] } },
        }),
      });

    await settleOverlayFieldValue({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fieldName: 'name',
      settledChange: { from: 'Name6', to: 'Name7' },
      remainingChange: null,
      historyAction: 'accept',
      purgeHistory: true,
    });

    expect(remove).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/edits/card-1/editor-1/fields/name' }),
    );
    // h1 is the settled value and h3 is a bare bookkeeping marker - both go.
    // h2 describes a different value of the same field, h4 another field.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsHistory/card-1' }),
      { h1: null, h3: null },
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('still journals the decision when the caller does not ask for a purge', async () => {
    get.mockResolvedValue({ exists: () => true, val: () => ({ phone: { added: ['222'] } }) });

    await settleOverlayFieldValue({
      editorUserId: 'editor-1',
      cardUserId: 'card-1',
      fieldName: 'name',
      settledChange: { from: 'Name6', to: 'Name7' },
      remainingChange: null,
      historyAction: 'accept',
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'multiData/editsHistory/card-1' }),
      expect.objectContaining({
        'history-entry': expect.objectContaining({ action: 'accept', fieldName: 'name' }),
      }),
    );
  });
});
