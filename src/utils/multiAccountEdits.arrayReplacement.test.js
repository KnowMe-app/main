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
  splitOverlayReviewChange,
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

describe('managed paired list replacements', () => {
  const first = { from: '111', to: '333' };
  const second = { from: '222', to: '444' };
  const record = {
    fields: { phone: { added: ['333', '444', '555'], removed: ['111', '222', '666'] } },
    proposal: { replacements: JSON.stringify({ phone: [first, second] }) },
  };

  it('shows one review row per pair alongside independent additions and removals', () => {
    expect(buildOverlayFieldEntries({ editor1: { fields: record.fields } }, {
      recordsByEditor: { editor1: record },
    }).phone).toEqual([
      { value: '333', previousValue: '111', editorUserId: 'editor1', isDeleted: false, replacement: first },
      { value: '444', previousValue: '222', editorUserId: 'editor1', isDeleted: false, replacement: second },
      { value: '555', editorUserId: 'editor1', isDeleted: false },
      { value: '666', editorUserId: 'editor1', isDeleted: true },
    ]);
  });

  it('settles both sides of the chosen pair and leaves every unrelated operation', () => {
    expect(splitOverlayReviewChange(record, 'phone', '333', first)).toEqual({
      settledChange: { added: ['333'], removed: ['111'] },
      remainingChange: { added: ['444', '555'], removed: ['222', '666'] },
      replacement: first,
      remainingReplacements: [second],
    });
    expect(splitOverlayReviewChange(record, 'phone', '111').settledChange).toBeNull();
    expect(splitOverlayReviewChange(record, 'phone', '333', { from: '666', to: '333' }).settledChange).toBeNull();
  });

  it('requires pair identity when two replacements share one target', () => {
    const secondToSameValue = { from: second.from, to: first.to };
    const shared = {
      fields: { phone: { added: ['333'], removed: ['111', '222'] } },
      proposal: { replacements: JSON.stringify({ phone: [first, secondToSameValue] }) },
    };
    expect(buildOverlayFieldEntries({ editor1: shared }).phone).toHaveLength(2);
    expect(splitOverlayReviewChange(shared, 'phone', '333').settledChange).toBeNull();
    expect(splitOverlayReviewChange(shared, 'phone', '333', first).remainingChange).toEqual({
      added: ['333'], removed: ['222'],
    });
  });

  it('replaces an old value even when its paired target was already present', () => {
    const preexisting = { from: '111', to: '444' };
    const overlay = {
      fields: { phone: { removed: ['111'] } },
      proposal: { replacements: JSON.stringify({ phone: [preexisting] }) },
    };
    expect(buildOverlayFieldEntries({ editor1: overlay }).phone).toEqual([
      { value: '444', previousValue: '111', editorUserId: 'editor1', isDeleted: false, replacement: preexisting },
    ]);
    expect(splitOverlayReviewChange(overlay, 'phone', '444', preexisting).settledChange).toEqual({
      added: ['444'], removed: ['111'],
    });
  });
});
