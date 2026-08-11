const { get, ref, remove, set, update } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
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

  it('keeps an explicit empty history item used to clear a visible value', () => {
    const fields = buildOverlayFromDraft({ phone: '111' }, { phone: ['111', ''] });
    expect(fields.phone).toEqual({ added: [''] });
    expect(applyOverlayToCard({ phone: '111' }, fields)).toEqual({ phone: ['111', ''] });
  });
});

const LONG_USER_ID = 'Oghb1LphfASVOY3b6JO1Ov4CDyD2';

describe('multiAccountEdits storage structure', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ref.mockImplementation((db, path) => ({ db, path }));
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
