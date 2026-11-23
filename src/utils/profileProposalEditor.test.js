import {
  buildEditorProposal, proposalEditorKey, recoverEditorDraft, saveEditorProposal,
} from './profileProposalEditor';

const createLocator = { operation: 'create', createdBy: 'owner', cardId: 'draft' };
const updateLocator = { operation: 'update', createdBy: 'editor', cardId: 'card' };

describe('proposal editor persistence', () => {
  it('leaves an unapproved contributed value out of the author’s saved draft', () => {
    const base = { userId: 'draft', name: 'Author', phone: 'original' };
    const visible = { ...base, phone: ['original', 'pending'] };
    const editor = { locator: createLocator, base, visible, protectContributions: true };
    const proposal = buildEditorProposal(editor, { ...visible, name: 'Edited' }, 10);

    expect(proposal.data).toEqual({ ...base, name: 'Edited' });
  });

  it('keeps a field’s original canonical value when an existing proposal is edited', () => {
    const base = { userId: 'card', city: 'Current city' };
    const expected = {
      id: 'old', baseCardRevision: 4, changes: { city: { added: ['Pending city'] } },
      originalValues: { city: { present: true, value: 'Original city' } },
    };
    const proposal = buildEditorProposal({
      locator: updateLocator, expected, base, rawBase: { ...base, rev: 5 }, additive: true,
    }, { ...base, city: ['Current city', 'Different proposal'] }, 10);

    expect(proposal).toMatchObject({
      id: 'old', baseCardRevision: 4,
      changes: { city: { added: ['Different proposal'] } },
      originalValues: { city: { present: true, value: 'Original city' } },
    });
  });

  it('dispatches both kinds to the same service and returns the acknowledged snapshot', async () => {
    const service = { createDraft: jest.fn(), saveDraft: jest.fn() };
    const saved = { id: 'saved', revision: 2 };
    service.createDraft.mockResolvedValue(saved);
    service.saveDraft.mockResolvedValue(saved);
    const expected = { id: 'existing', revision: 1 };

    await expect(saveEditorProposal(service, { locator: createLocator, expected: null }, { name: 'New' })).resolves.toBe(saved);
    await expect(saveEditorProposal(service, {
      locator: updateLocator, base: { userId: 'card' }, expected,
    }, { city: 'Kyiv' })).resolves.toBe(saved);
    expect(service.createDraft).toHaveBeenCalledWith(expect.objectContaining({ operation: 'create' }));
    expect(service.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update' }), { expected });
  });

  it('rejects old local entries and edits based on a changed proposal revision', () => {
    const visible = { userId: 'draft', name: 'Remote' };
    const editor = { locator: createLocator, expected: { revision: 3 }, visible };
    const stale = {
      expected: { revision: 2 }, basis: { userId: 'draft', name: 'Old' },
      draft: { userId: 'draft', name: 'Offline' }, targetKey: proposalEditorKey(createLocator),
    };

    expect(recoverEditorDraft(editor, { draft: stale.draft, at: 1 })).toBeNull();
    expect(recoverEditorDraft(editor, stale)).toBeNull();
  });

  it('replays only edited fields over compatible recovery data', () => {
    const basis = { userId: 'card', city: 'Kyiv', phone: 'old phone' };
    const editor = { locator: updateLocator, expected: null, visible: { ...basis, phone: 'new phone' } };
    const entry = {
      expected: null, basis, draft: { ...basis, city: 'Lviv' }, targetKey: proposalEditorKey(updateLocator),
    };

    expect(recoverEditorDraft(editor, entry)).toEqual({ userId: 'card', city: 'Lviv', phone: 'new phone' });
    expect(recoverEditorDraft({ ...editor, visible: { ...basis, city: 'Odesa' } }, entry)).toBeNull();
    expect(recoverEditorDraft(editor, { ...entry, targetKey: proposalEditorKey(createLocator) })).toBeNull();
  });
});
