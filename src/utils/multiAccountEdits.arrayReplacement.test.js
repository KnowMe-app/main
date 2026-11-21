jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));
jest.mock('components/config', () => ({ database: { app: 'db' } }));
jest.mock('utils/backendDownloadToast', () => ({ withAdminDownloadToast: promise => promise }));

const {
  applyOverlayToCard,
  buildOverlayFieldEntries,
  buildSupersededOverlayEntries,
  normalizeOverlayFields,
  splitOverlayChangeByValue,
} = require('./multiAccountEdits');

// Заміна зі списком у `to` (стара форма шару) — це різниця наборів, а не
// одна пропозиція «A,B» в одному полі форми адміна.
describe('overlay replacement that carries a list', () => {
  const overlays = {
    editor1: { fields: { phone: { from: ['380501112233'], to: ['380501112233', '380671234567', '380931234567'] } } },
  };

  it('splits the list into one suggestion per value', () => {
    expect(buildOverlayFieldEntries(overlays).phone).toEqual([
      { value: '380671234567', editorUserId: 'editor1', isDeleted: false },
      { value: '380931234567', editorUserId: 'editor1', isDeleted: false },
    ]);
  });

  it('marks values dropped from the list as removals', () => {
    expect(normalizeOverlayFields({ city: { from: ['Kyiv', 'Lviv'], to: ['Lviv'] } })).toEqual({
      city: { removed: ['Kyiv'] },
    });
  });

  it('settles a single value without touching the rest', () => {
    const change = overlays.editor1.fields.phone;
    expect(splitOverlayChangeByValue(change, '380671234567')).toEqual({
      settledChange: { added: ['380671234567'] },
      remainingChange: { added: ['380931234567'] },
    });
  });

  it('applies as the same set as before', () => {
    expect(applyOverlayToCard({ phone: '380501112233' }, overlays.editor1.fields).phone)
      .toEqual(['380501112233', '380671234567', '380931234567']);
  });

  it('keeps scalar replacements as they are', () => {
    expect(normalizeOverlayFields({ name: { from: 'Ann', to: 'Anna' } })).toEqual({ name: { from: 'Ann', to: 'Anna' } });
  });

  it('reads journal entries with a list per value', () => {
    const superseded = buildSupersededOverlayEntries({
      historyEntries: [{ action: 'edit', fieldName: 'phone', editorUserId: 'e1', at: 1, change: { from: [], to: ['380671234567', '380931234567'] } }],
      overlaysByEditor: {},
      canonical: { phone: '380501112233' },
    });
    expect(superseded.phone.map(entry => entry.value)).toEqual(['380671234567', '380931234567']);
  });
});
