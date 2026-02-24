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
  getOverlayForUserCard,
  getOverlaysForCard,
  patchOverlayField,
  removeOverlayForUserCard,
  saveOverlayForUserCard,
} = require('../multiAccountEdits');

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
      exists: () => true,
      val: () => ({
        editorA: { fields: { phone: { from: '', to: '+380' } } },
        editorB: { fields: { city: { from: 'A', to: 'B' } } },
      }),
    });

    const preferred = await getOverlayForUserCard({ editorUserId: 'editorB', cardUserId: 'card-1' });
    expect(preferred.editorUserId).toBe('editorB');

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
});
