import {
  buildCreateProposal,
  buildProposalPreview,
  buildUpdateProposal,
  normalizeLegacyCreateProposal,
  normalizeLegacyOverlayProposal,
} from './profileProposals';

const cardId = 'card-1';
const author = 'editor-1';
const at = 1234;
const firstPhone = '380501112201';
const secondPhone = '380501112202';
const thirdPhone = '380501112203';

const proposeUpdate = (canonical, edits, options = {}) => buildUpdateProposal({
  id: 'proposal-1',
  targetCardId: cardId,
  createdBy: author,
  at,
  canonical,
  edits,
  ...options,
});

describe('create and update proposals', () => {
  it('uses a reserved card ID to preview a new profile without a canonical base', () => {
    const data = { userId: 'untrusted-form-id', name: 'Ada', phone: [firstPhone] };
    const identityKeys = [`phone_${firstPhone}`];
    const proposal = buildCreateProposal({
      id: 'proposal-1', reservedCardId: cardId, createdBy: author, at, data, identityKeys,
    });

    expect(proposal).toMatchObject({
      id: 'proposal-1',
      operation: 'create',
      targetCardId: null,
      reservedCardId: cardId,
      createdBy: author,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      status: 'pendingReview',
      data: { userId: cardId, name: 'Ada', phone: [firstPhone] },
      identityKeys,
    });
    expect(buildProposalPreview(proposal)).toEqual(proposal.data);
    expect(data.userId).toBe('untrusted-form-id');
  });

  it('stores a sparse update and the originals of changed fields at the supplied base revision', () => {
    const canonical = Object.freeze({ userId: cardId, city: 'Kyiv', phone: firstPhone, name: 'Ada' });
    const proposal = proposeUpdate(canonical, { city: 'Lviv', name: 'Ada' }, { baseCardRevision: 8 });

    expect(proposal).toMatchObject({
      id: 'proposal-1',
      operation: 'update',
      targetCardId: cardId,
      createdBy: author,
      createdAt: at,
      updatedAt: at,
      revision: 1,
      status: 'pendingReview',
      baseCardRevision: 8,
    });
    expect(proposal.changes).toEqual({ city: { from: 'Kyiv', to: 'Lviv' } });
    expect(proposal.originalValues).toEqual({ city: { present: true, value: 'Kyiv' } });
    expect(proposal).not.toHaveProperty('data');
    expect(buildProposalPreview(proposal, canonical)).toEqual({ ...canonical, city: 'Lviv' });
  });

  it.each([{}, { name: 'Ada' }, { phone: undefined }, { phone: [secondPhone, firstPhone] }])(
    'returns no proposal for empty or equivalent edits (%p)',
    edits => expect(proposeUpdate({ name: 'Ada', phone: [firstPhone, secondPhone] }, edits)).toBeNull(),
  );

  it('distinguishes filling a missing scalar from replacing one', () => {
    const canonical = { userId: cardId, city: 'Kyiv' };
    const proposal = proposeUpdate(canonical, { city: 'Lviv', phone: firstPhone });

    expect(proposal.changes).toEqual({
      city: { from: 'Kyiv', to: 'Lviv' },
      phone: { added: [firstPhone] },
    });
    expect(proposal.originalValues).toEqual({ city: { present: true, value: 'Kyiv' }, phone: { present: false } });
    expect(buildProposalPreview(proposal, canonical)).toEqual({ userId: cardId, city: 'Lviv', phone: firstPhone });
  });

  it('stores multiple additions as distinct values while retaining the base value', () => {
    const canonical = { userId: cardId, phone: firstPhone };
    const proposal = proposeUpdate(canonical, { phone: [firstPhone, secondPhone, thirdPhone] });

    expect(proposal.changes.phone).toEqual({ added: [secondPhone, thirdPhone] });
    expect(buildProposalPreview(proposal, canonical).phone).toEqual([firstPhone, secondPhone, thirdPhone]);
  });

  it('preserves an explicit replacement within a list and the order of independent additions', () => {
    const canonical = { userId: cardId, phone: [firstPhone, secondPhone] };
    const fourthPhone = '380501112204';
    const edits = { phone: [secondPhone, thirdPhone, fourthPhone] };
    const replacement = { from: firstPhone, to: thirdPhone };
    const proposal = proposeUpdate(canonical, edits, { replacements: { phone: [replacement] } });

    expect(proposal.changes.phone).toEqual({
      added: [thirdPhone, fourthPhone], removed: [firstPhone], replacements: [replacement],
    });
    expect(proposeUpdate(canonical, edits).changes.phone).not.toHaveProperty('replacements');
    expect(buildProposalPreview(proposal, canonical).phone).toEqual(edits.phone);
  });

  it('rejects a list replacement whose declared original remains in the edited list', () => {
    const canonical = { userId: cardId, phone: [firstPhone, secondPhone] };
    expect(() => proposeUpdate(canonical, { phone: [firstPhone, secondPhone, thirdPhone] }, {
      replacements: { phone: [{ from: firstPhone, to: thirdPhone }] },
    })).toThrow('A list replacement requires a removed original and a resulting value');
  });

  it('removes one repeatable value while leaving the other values and fields intact', () => {
    const canonical = { userId: cardId, phone: [firstPhone, secondPhone, thirdPhone], city: 'Kyiv' };
    const proposal = proposeUpdate(canonical, { phone: [firstPhone, thirdPhone] });

    expect(proposal.changes).toEqual({ phone: { removed: [secondPhone] } });
    expect(proposal.originalValues.phone).toEqual({ present: true, value: canonical.phone });
    expect(buildProposalPreview(proposal, canonical)).toEqual({ ...canonical, phone: [firstPhone, thirdPhone] });
  });

  it('compares nested list values by content after the proposal is detached from the base', () => {
    const canonical = { userId: cardId, rev: 'card-revision', tags: [{ name: 'remove' }, { name: 'keep' }] };
    const proposal = proposeUpdate(canonical, { tags: [{ name: 'keep' }, { name: 'add' }] });

    expect(proposal.baseCardRevision).toBe('card-revision');
    expect(proposal.changes.tags).toEqual({ added: [{ name: 'add' }], removed: [{ name: 'remove' }] });
    expect(buildProposalPreview(proposal, canonical).tags).toEqual([{ name: 'keep' }, { name: 'add' }]);
  });

  it('treats null as a clear and leaves an undefined edit untouched', () => {
    const canonical = { userId: cardId, phone: [firstPhone, secondPhone], city: 'Kyiv', name: 'Ada' };
    const proposal = proposeUpdate(canonical, { phone: null, city: null, name: undefined });
    const preview = buildProposalPreview(proposal, canonical);

    expect(preview.phone ?? '').toBe('');
    expect(preview.city ?? '').toBe('');
    expect(preview.name).toBe('Ada');
    expect(proposal.changes).not.toHaveProperty('name');
  });

  it('keeps two authors’ proposals for the same field independent', () => {
    const canonical = { userId: cardId, phone: firstPhone };
    const first = proposeUpdate(canonical, { phone: secondPhone });
    const second = proposeUpdate(canonical, { phone: thirdPhone }, { id: 'proposal-2', createdBy: 'editor-2' });

    expect(first).toMatchObject({ id: 'proposal-1', createdBy: author, targetCardId: cardId });
    expect(second).toMatchObject({ id: 'proposal-2', createdBy: 'editor-2', targetCardId: cardId });
    expect(first.originalValues.phone).toEqual(second.originalValues.phone);
    expect(buildProposalPreview(first, canonical).phone).toBe(secondPhone);
    expect(buildProposalPreview(second, canonical).phone).toBe(thirdPhone);
    expect(canonical.phone).toBe(firstPhone);
  });

  it('returns detached previews of draft data and canonical values, including unchanged nested fields', () => {
    const basePhones = Object.freeze([firstPhone, secondPhone]);
    const canonical = Object.freeze({ userId: cardId, city: 'Kyiv', phone: basePhones });
    const update = proposeUpdate(canonical, { city: 'Lviv' });
    const draftPhones = [firstPhone];
    const create = buildCreateProposal({
      id: 'proposal-create', reservedCardId: 'new-card', createdBy: author, at, data: { phone: draftPhones },
    });

    const updatePreview = buildProposalPreview(update, canonical);
    updatePreview.phone.push(thirdPhone);
    expect(buildProposalPreview(update, canonical).phone).toEqual([firstPhone, secondPhone]);
    expect(canonical).toEqual({ userId: cardId, city: 'Kyiv', phone: [firstPhone, secondPhone] });

    draftPhones.push(secondPhone);
    const createPreview = buildProposalPreview(create);
    createPreview.phone.push(thirdPhone);
    expect(buildProposalPreview(create).phone).toEqual([firstPhone]);
  });

  it('requires a base card to preview an update', () => {
    const proposal = proposeUpdate({ userId: cardId, city: 'Kyiv' }, { city: 'Lviv' });

    expect(buildProposalPreview(proposal)).toBeNull();
    expect(buildProposalPreview(proposal, { userId: 'different-card' })).toBeNull();
  });

  it('preserves zero, false and the difference between a missing and an empty original', () => {
    const proposal = proposeUpdate({ empty: '', count: 0, flag: false }, {
      empty: 'new', missing: 'new', count: 1, flag: true,
    });

    expect(proposal.changes).toEqual({
      empty: { added: ['new'] }, missing: { added: ['new'] },
      count: { from: 0, to: 1 }, flag: { from: false, to: true },
    });
    expect(proposal.originalValues).toEqual({
      empty: { present: true, value: '' }, missing: { present: false },
      count: { present: true, value: 0 }, flag: { present: true, value: false },
    });
  });
});

describe('legacy proposal normalization', () => {
  it('preserves a legacy create draft’s state, identity claims and metadata', () => {
    const legacy = {
      operation: 'create', status: 'private', revision: 4, createdBy: author, cardId,
      createdAt: 10, updatedAt: 11, data: { name: 'Ada' }, identityKeys: [`phone_${firstPhone}`],
    };
    const proposal = normalizeLegacyCreateProposal(legacy);

    expect(proposal).toMatchObject({
      operation: 'create',
      status: 'private',
      revision: 4,
      createdBy: author,
      targetCardId: null,
      reservedCardId: cardId,
      createdAt: 10,
      updatedAt: 11,
      identityKeys: legacy.identityKeys,
    });
    expect(buildProposalPreview(proposal)).toEqual({ name: 'Ada', userId: cardId });
  });

  it('normalizes legacy aliases and list replacements and retains the target draft relation', () => {
    const legacy = {
      editorUserId: author,
      cardUserId: cardId,
      updatedAt: 11,
      adminOnly: true,
      fields: {
        telegram: { add: ['ada'] },
        phone: { from: [firstPhone, secondPhone], to: [secondPhone, thirdPhone] },
      },
    };
    const proposal = normalizeLegacyOverlayProposal(legacy, { targetCreateProposalId: 'proposal-create' });

    expect(proposal).toMatchObject({
      operation: 'update',
      targetCardId: cardId,
      createdBy: author,
      createdAt: null,
      updatedAt: 11,
      revision: null,
      baseCardRevision: null,
    });
    expect(proposal.changes).toEqual({
      telegram: { added: ['ada'] },
      phone: { added: [thirdPhone], removed: [firstPhone] },
    });
    expect(proposal.targetCreateProposalId).toBe('proposal-create');
    expect(proposal.originalValues).toEqual({});
    expect(proposal.legacy).toEqual({
      source: 'edits', cardId, editorUid: author, adminOnly: true, fields: legacy.fields,
    });
    expect(buildProposalPreview(proposal, { userId: cardId, phone: [firstPhone, secondPhone] })).toEqual({
      userId: cardId, telegram: 'ada', phone: [secondPhone, thirdPhone],
    });
    expect(proposal.id).toEqual(normalizeLegacyOverlayProposal(legacy).id);
    expect(proposal.id).not.toEqual(normalizeLegacyOverlayProposal({ ...legacy, editorUserId: 'editor-2' }).id);
  });

  it('uses path keys for older records and refuses to reattribute a mismatched record', () => {
    const overlay = { fields: { phone: { added: [firstPhone] } } };
    const draft = { status: 'publishing', acceptedAt: 12, data: { name: 'Ada' } };
    const create = normalizeLegacyCreateProposal(draft, { creatorUid: author, cardId });
    const update = normalizeLegacyOverlayProposal(overlay, { editorUid: author, cardId });

    expect(create).toMatchObject({ createdBy: author, reservedCardId: cardId, status: 'publishing', acceptedAt: 12 });
    expect(update).toMatchObject({ createdBy: author, targetCardId: cardId, updatedAt: null, revision: null });
    expect(update.id).not.toBe(create.id);
    expect(normalizeLegacyOverlayProposal({ ...overlay, editorUserId: 'another-editor' }, { editorUid: author, cardId }))
      .toBeNull();
    expect(normalizeLegacyCreateProposal({ ...draft, cardId: 'another-card' }, { creatorUid: author, cardId }))
      .toBeNull();
  });

  it('replays a legacy field with both the add alias and list operands using the original precedence', () => {
    const fields = { phone: { add: [thirdPhone], from: [firstPhone], to: [secondPhone] } };
    const proposal = normalizeLegacyOverlayProposal({ fields, editorUserId: author, cardUserId: cardId });

    expect(proposal.legacy.fields).toEqual(fields);
    expect(buildProposalPreview(proposal, { phone: [firstPhone, thirdPhone] }).phone).toEqual([secondPhone]);
  });
});
