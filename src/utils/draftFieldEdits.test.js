import {
  buildChangeValueRows,
  buildFieldVersionHistory,
  buildPendingFieldEdits,
  buildRemovalChange,
  dropVersionsPresentIn,
  splitOverlayChangeValue,
  withEditedValue,
} from './draftFieldEdits';

// draftFieldEdits reuses the overlay normalization/ordering rules, and that
// module reaches Firebase at import time - stub it the way the overlay tests do.
jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({ database: { app: 'db' } }));

describe('buildChangeValueRows', () => {
  it('reads a scalar replacement as one row that remembers what it replaces', () => {
    expect(buildChangeValueRows({ from: "Ім'я6", to: "Ім'я7" })).toEqual([
      { kind: 'replaced', value: "Ім'я7", previousValue: "Ім'я6" },
    ]);
  });

  it('reads a cleared scalar as a deletion of the value that was there', () => {
    expect(buildChangeValueRows({ from: 'Київ', to: '' })).toEqual([
      { kind: 'removed', value: 'Київ', previousValue: '' },
    ]);
  });

  it('treats every value in an array replacement as replaced while retaining its source side', () => {
    expect(buildChangeValueRows({ added: ['380501112233', '380502223344'], removed: ['380503334455'] })).toEqual([
      { kind: 'replaced', sourceKind: 'added', value: '380501112233', previousValue: '' },
      { kind: 'replaced', sourceKind: 'added', value: '380502223344', previousValue: '' },
      { kind: 'replaced', sourceKind: 'removed', value: '380503334455', previousValue: '' },
    ]);
  });

  it('ignores a change that was already settled', () => {
    expect(buildChangeValueRows({ discarded: true })).toEqual([]);
  });
});

describe('buildPendingFieldEdits', () => {
  const overlays = {
    editorB: { updatedAt: 20, fields: { name: { from: "Ім'я6", to: "Ім'я7" } } },
    editorA: { updatedAt: 10, fields: { name: { from: "Ім'я5", to: "Ім'я6" }, phone: { add: ['380501112233'] } } },
  };

  it('groups proposals by field, oldest first', () => {
    const pending = buildPendingFieldEdits(overlays);

    expect(pending.name.map(row => row.value)).toEqual(["Ім'я6", "Ім'я7"]);
    expect(pending.name.map(row => row.editorUserId)).toEqual(['editorA', 'editorB']);
  });

  it('normalizes the legacy `add` shape', () => {
    expect(buildPendingFieldEdits(overlays).phone).toEqual([
      expect.objectContaining({ kind: 'added', value: '380501112233', editorUserId: 'editorA' }),
    ]);
  });
});

describe('buildFieldVersionHistory', () => {
  it('orders versions oldest first and keeps each value once', () => {
    const versions = buildFieldVersionHistory([
      { entryId: 'c', fieldName: 'name', at: 30, action: 'accept', change: { from: "Ім'я6", to: "Ім'я7" } },
      { entryId: 'a', fieldName: 'name', at: 10, action: 'edit', change: { from: '', to: "Ім'я5" } },
      { entryId: 'b', fieldName: 'name', at: 20, action: 'edit', change: { from: "Ім'я5", to: "Ім'я6" } },
      { entryId: 'd', fieldName: 'name', at: 40, action: 'edit', change: { from: "Ім'я6", to: "Ім'я7" } },
    ]);

    expect(versions.name.map(row => row.value)).toEqual(["Ім'я5", "Ім'я6", "Ім'я7"]);
    expect(versions.name.map(row => row.action)).toEqual(['edit', 'edit', 'accept']);
  });

  it('skips entries without a field', () => {
    expect(buildFieldVersionHistory([{ entryId: 'x', at: 1, change: { to: 'a' } }])).toEqual({});
  });

  it('collapses chronological add/remove operations for the same normalized value', () => {
    const versions = buildFieldVersionHistory([
      { entryId: 'a', fieldName: 'name', at: 10, action: 'edit', change: { added: [' Ім\'я7 '] } },
      { entryId: 'b', fieldName: 'name', at: 20, action: 'accept', change: { removed: ['Ім\'я7'] } },
    ]);

    expect(versions.name).toEqual([
      expect.objectContaining({
        kind: 'added',
        currentKind: 'removed',
        value: "Ім'я7",
        action: 'edit',
        transitions: [
          expect.objectContaining({ kind: 'added', at: 10 }),
          expect.objectContaining({ kind: 'removed', at: 20 }),
        ],
      }),
    ]);
  });

  it('keeps every transition when a value is revisited', () => {
    const versions = buildFieldVersionHistory([
      { entryId: 'ab', fieldName: 'name', at: 10, change: { from: 'A', to: 'B' } },
      { entryId: 'bc', fieldName: 'name', at: 20, change: { from: 'B', to: 'C' } },
      { entryId: 'cb', fieldName: 'name', at: 30, change: { from: 'C', to: 'B' } },
    ]);

    expect(versions.name.map(row => row.value)).toEqual(['B', 'C']);
    expect(versions.name[0].transitions).toEqual([
      expect.objectContaining({ backendEntryId: 'ab', previousValue: 'A' }),
      expect.objectContaining({ backendEntryId: 'cb', previousValue: 'C' }),
    ]);
  });

  it('derives the current tone from the latest transition in a replacement chain', () => {
    const entries = [
      { entryId: 'a', fieldName: 'surname', at: 10, change: { added: ['A'] } },
      { entryId: 'ab', fieldName: 'surname', at: 20, change: { added: ['B'], removed: ['A'] } },
      { entryId: 'bc', fieldName: 'surname', at: 30, change: { added: ['C'], removed: ['B'] } },
      { entryId: 'c0', fieldName: 'surname', at: 40, change: { removed: ['C'] } },
    ];

    const versions = buildFieldVersionHistory(entries).surname;
    expect(versions.map(({ value, currentKind }) => ({ value, currentKind }))).toEqual([
      { value: 'A', currentKind: 'replaced' },
      { value: 'B', currentKind: 'replaced' },
      { value: 'C', currentKind: 'removed' },
    ]);

    const readded = buildFieldVersionHistory([
      ...entries,
      { entryId: 'ca', fieldName: 'surname', at: 50, change: { added: ['C'] } },
    ]).surname;
    expect(readded.find(row => row.value === 'C')).toEqual(expect.objectContaining({
      kind: 'replaced',
      currentKind: 'added',
      transitions: expect.arrayContaining([
        expect.objectContaining({ kind: 'removed' }),
        expect.objectContaining({ kind: 'added' }),
      ]),
    }));
  });
});

describe('dropVersionsPresentIn', () => {
  it('hides versions the field already shows', () => {
    const rows = [{ value: "Ім'я5" }, { value: "Ім'я6" }, { value: "Ім'я7" }];

    expect(dropVersionsPresentIn(rows, ["Ім'я6", "Ім'я7"])).toEqual([{ value: "Ім'я5" }]);
  });
});

describe('splitOverlayChangeValue', () => {
  it('settles a scalar change whole', () => {
    expect(splitOverlayChangeValue({ from: 'a', to: 'b' }, { kind: 'replaced', value: 'b' })).toEqual({
      settled: { from: 'a', to: 'b' },
      remaining: null,
    });
  });

  it('keeps the other proposed values of an array field pending', () => {
    const change = { added: ['one', 'two'], removed: ['old'] };

    expect(splitOverlayChangeValue(change, { kind: 'added', value: 'one' })).toEqual({
      settled: { added: ['one'] },
      remaining: { added: ['two'], removed: ['old'] },
    });
  });

  it('settles the last pending value with nothing left over', () => {
    expect(splitOverlayChangeValue({ removed: ['old'] }, { kind: 'removed', value: 'old' })).toEqual({
      settled: { removed: ['old'] },
      remaining: null,
    });
  });

  it('uses the retained source side for a removed replacement row', () => {
    const change = { added: ['new'], removed: ['old'] };

    expect(splitOverlayChangeValue(change, {
      kind: 'replaced', sourceKind: 'removed', value: 'old',
    })).toEqual({
      settled: { removed: ['old'] },
      remaining: { added: ['new'] },
    });
  });
});

describe('withEditedValue', () => {
  it('accepts the corrected value instead of the proposed one', () => {
    expect(withEditedValue({ from: 'a', to: 'b' }, { value: 'b' }, ' B ')).toEqual({ from: 'a', to: 'B' });
    expect(withEditedValue({ added: ['380501112233'] }, { value: '380501112233' }, '+380501112233'))
      .toEqual({ added: ['+380501112233'] });
  });

  it('keeps the proposal when nothing was corrected', () => {
    expect(withEditedValue({ added: ['a'] }, { value: 'a' }, 'a')).toEqual({ added: ['a'] });
    expect(withEditedValue({ added: ['a'] }, { value: 'a' }, '   ')).toEqual({ added: ['a'] });
  });
});

describe('buildRemovalChange', () => {
  it('strips both the proposed value and the one it would replace', () => {
    expect(buildRemovalChange({ value: "Ім'я7", previousValue: "Ім'я6" })).toEqual({ removed: ["Ім'я7", "Ім'я6"] });
    expect(buildRemovalChange({ value: 'a', previousValue: '' })).toEqual({ removed: ['a'] });
  });
});
