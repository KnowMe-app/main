import { get, onValue, push, ref, remove, runTransaction, serverTimestamp, set, update } from 'firebase/database';
import { auth, removeCardAndSearchId, syncMatchingCardIndex, syncUserSearchIdIndex, updateSearchId } from 'components/config';
import { ADMIN_UIDS, READONLY_ADMIN_UIDS } from './accessLevel';
import { getOverlayForUserCard, saveOverlayForUserCard } from './multiAccountEdits';
import { saveCreateProfileMutation } from './profileMutations';
import { profileProposalService } from './profileProposalRepository';
import { buildCreateProposal, buildUpdateProposal } from './profileProposals';

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  onValue: jest.fn(),
  push: jest.fn(),
  ref: jest.fn(),
  remove: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  auth: { currentUser: null },
  database: {},
  fetchProfileDraftById: jest.fn(),
  normalizeStoredDates: data => data,
  PUBLIC_COMMENTS_ROOT_PATH: 'publicComments',
  removeCardAndSearchId: jest.fn(),
  reportSearchIdIndexFailure: jest.fn(),
  syncMatchingCardIndex: jest.fn(),
  syncUserSearchIdIndex: jest.fn(),
  syncUserSearchKeyIndex: jest.fn(),
  updateSearchId: jest.fn(),
}));

const creatorUid = 'creator-1';
const anotherEditor = 'editor-2';

const overlayLocation = { operation: 'update', cardId: 'canonical-card', createdBy: creatorUid };
const overlayPath = `multiData/edits/${overlayLocation.cardId}/${creatorUid}`;
const phone = ['380507700001', '380507700002', '380507700003'];
const canonical = { userId: overlayLocation.cardId, rev: 8, phone: phone.slice(0, 2), city: null };

const mutationLocation = { operation: 'create', cardId: 'draft-card', createdBy: creatorUid };
const mutationPath = `multiData/profileMutations/${creatorUid}/${mutationLocation.cardId}`;

const createDraft = data => buildCreateProposal({
  id: 'new-proposal', reservedCardId: mutationLocation.cardId, createdBy: creatorUid, at: 1, data,
});

const updateDraft = (edits, replacements) => buildUpdateProposal({
  id: 'change-proposal', targetCardId: overlayLocation.cardId, createdBy: creatorUid, at: 2,
  canonical, edits, replacements,
});

const rtdbValue = value => {
  if (Array.isArray(value)) {
    const items = value.map(rtdbValue);
    return items.some(item => item != null) ? items : null;
  }
  if (value && typeof value === 'object') {
    const children = Object.entries(value)
      .map(([key, child]) => [key, rtdbValue(child)])
      .filter(([, child]) => child != null);
    return children.length ? Object.fromEntries(children) : null;
  }
  return value ?? null;
};

describe('profile proposal service wired to the legacy RTDB adapters', () => {
  let tree;
  let unsubscribe;

  const childKeys = path => path.split('/').filter(Boolean);
  const readAt = path => rtdbValue(childKeys(path).reduce((value, key) => value?.[key], tree));

  const writeAt = (path, value) => {
    const keys = childKeys(path);
    const leaf = keys.pop();
    const parent = keys.reduce((node, key) => {
      if (!node[key]) node[key] = {};
      return node[key];
    }, tree);
    const stored = rtdbValue(value);
    if (stored === null) delete parent[leaf];
    else parent[leaf] = stored;
  };

  const snapshot = value => ({ exists: () => value != null, val: () => rtdbValue(value) });

  const transact = async ({ path }, updater) => {
    const current = readAt(path);
    const next = updater(current);
    if (next === undefined) return { committed: false, snapshot: snapshot(current) };
    writeAt(path, next);
    return { committed: true, snapshot: snapshot(readAt(path)) };
  };

  beforeEach(() => {
    jest.resetAllMocks();
    localStorage.clear();
    tree = {};
    auth.currentUser = { uid: creatorUid };
    unsubscribe = jest.fn();
    let pushed = 0;

    ref.mockImplementation((database, path = '') => ({ path }));
    push.mockImplementation(() => ({ key: `history-${++pushed}` }));
    get.mockImplementation(async ({ path }) => snapshot(readAt(path)));
    onValue.mockImplementation(({ path }, listener) => {
      Promise.resolve().then(() => listener(snapshot(readAt(path))));
      return unsubscribe;
    });
    set.mockImplementation(async ({ path }, value) => writeAt(path, value));
    remove.mockImplementation(async ({ path }) => writeAt(path, null));
    runTransaction.mockImplementation(transact);
    serverTimestamp.mockReturnValue(500);
    syncMatchingCardIndex.mockImplementation(async (cardId, data) => {
      const projection = { name: data.name };
      writeAt(`matchingCards/${cardId}`, projection);
      return projection;
    });
    update.mockImplementation(async ({ path }, fields) => {
      Object.entries(fields).forEach(([key, value]) => writeAt(path ? `${path}/${key}` : key, value));
    });
  });

  it('reads only the requested author leaf when a different author has a proposal on the same card', async () => {
    writeAt(`multiData/edits/${overlayLocation.cardId}/${anotherEditor}`, {
      cardUserId: overlayLocation.cardId,
      editorUserId: anotherEditor,
      updatedAt: 10,
      fields: { phone: { added: [phone[0]] } },
    });

    await expect(profileProposalService.getDraft(overlayLocation)).resolves.toBeNull();

    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(expect.objectContaining({ path: overlayPath }));
  });

  it('round trips a managed replacement and its base metadata through the old overlay path', async () => {
    writeAt(`matchingCards/${overlayLocation.cardId}`, { userId: overlayLocation.cardId });
    const input = updateDraft(
      { city: 'Lviv', phone: [phone[1], phone[2]], name: 'Ada' },
      { phone: [{ from: phone[0], to: phone[2] }] },
    );

    const saved = await profileProposalService.createDraft(input);
    const loaded = await profileProposalService.getDraft(overlayLocation);

    expect(loaded).toEqual(saved);
    expect(loaded).toMatchObject({
      id: input.id,
      createdBy: creatorUid,
      revision: 1,
      baseCardRevision: 8,
      changes: input.changes,
      originalValues: input.originalValues,
    });
    expect(readAt(overlayPath).fields.phone).toEqual({ added: [phone[2]], removed: [phone[0]] });
    expect(readAt(`matchingCards/${overlayLocation.cardId}`)).toEqual({ userId: overlayLocation.cardId });
    await expect(getOverlayForUserCard({
      cardUserId: overlayLocation.cardId,
      editorUserId: creatorUid,
    })).resolves.toMatchObject({ fields: { phone: { added: [phone[2]], removed: [phone[0]] } } });
    await expect(profileProposalService.listDrafts()).resolves.toEqual([loaded]);
  });

  it('rejects a write that loses its overlay transaction to a concurrent editor session', async () => {
    writeAt(`matchingCards/${overlayLocation.cardId}`, { userId: overlayLocation.cardId });
    const saved = await profileProposalService.createDraft(updateDraft({ name: 'Ada' }));
    const competing = { ...readAt(overlayPath), fields: { name: { added: ['Tess'] } } };
    runTransaction.mockImplementationOnce((target, updater) => {
      expect(target.path).toBe(overlayPath);
      writeAt(target.path, competing);
      return transact(target, updater);
    });
    updateSearchId.mockClear();

    await expect(profileProposalService.saveDraft(updateDraft({ name: 'Mar' }), { expected: saved }))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    expect(readAt(overlayPath)).toEqual(competing);
    expect(updateSearchId).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
  });

  it('preserves the stored create ID and history when the existing create flow saves over it', async () => {
    const draft = createDraft({ city: 'Lviv' });
    const saved = await profileProposalService.createDraft(draft);
    await saveCreateProfileMutation({
      cardId: mutationLocation.cardId,
      creatorUid,
      actorUid: creatorUid,
      data: { city: 'Odesa' },
      expectedRevision: saved.revision,
    });

    await expect(profileProposalService.getDraft(mutationLocation)).resolves.toMatchObject({
      id: draft.id,
      revision: 2,
      data: { city: 'Odesa' },
    });
    expect(readAt(mutationPath).proposalId).toBe(draft.id);
    expect(readAt(`multiData/profileMutationHistory/${mutationLocation.cardId}`)).toEqual({
      'history-1': expect.objectContaining({
        revision: 2,
        actorUid: creatorUid,
        change: { from: 'Lviv', to: 'Odesa' },
      }),
    });
  });

  it('recognizes a repeated create when Firebase omits null and empty containers', async () => {
    const draft = createDraft({ city: 'Lviv', birth: null, future: {}, previous: [], visible: false, count: 0, blank: '' });
    const saved = await profileProposalService.createDraft(draft);
    runTransaction.mockClear();

    await expect(profileProposalService.createDraft(draft)).resolves.toEqual(saved);
    await expect(profileProposalService.saveDraft(draft, { expected: saved })).resolves.toEqual(saved);
    expect(readAt(mutationPath).data).toEqual({
      userId: mutationLocation.cardId, city: 'Lviv', visible: false, count: 0, blank: '',
    });
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('returns an editor’s history even after that editor’s current overlay is gone', async () => {
    const history = `multiData/editsHistory/${overlayLocation.cardId}`;
    const editorEntry = { fieldName: 'city', editorUserId: creatorUid, change: { to: 'Lviv' }, at: 5 };
    writeAt(`${history}/own-entry`, editorEntry);
    writeAt(`${history}/other-entry`, { ...editorEntry, editorUserId: anotherEditor });
    auth.currentUser = { uid: ADMIN_UIDS[0] };

    await expect(profileProposalService.getDraftHistory(overlayLocation)).resolves.toEqual([
      expect.objectContaining({ ...editorEntry, actorUid: creatorUid, revision: null, backendEntryId: 'own-entry' }),
    ]);
  });

  it('rejects a create edit when the same draft changes during its transaction', async () => {
    const saved = await profileProposalService.createDraft(createDraft({ city: 'Lviv' }));
    const competing = { ...readAt(mutationPath), revision: 2, data: { city: 'Kyiv' } };
    runTransaction.mockImplementationOnce((target, updater) => {
      expect(target.path).toBe(mutationPath);
      writeAt(target.path, competing);
      return transact(target, updater);
    });

    await expect(profileProposalService.saveDraft(createDraft({ city: 'Odesa' }), { expected: saved }))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });

    expect(readAt(mutationPath)).toEqual(competing);
  });

  it('reports guarded create cleanup as partial when the legacy ID is already used by a canonical card', async () => {
    const saved = await profileProposalService.createDraft(createDraft({ city: 'Lviv' }));
    const canonicalPath = `matchingCards/${mutationLocation.cardId}`;
    writeAt(canonicalPath, { name: 'Canonical profile' });
    auth.currentUser = { uid: ADMIN_UIDS[0] };

    await expect(profileProposalService.deleteDraft(mutationLocation, { expected: saved }))
      .rejects.toMatchObject({ code: 'PARTIAL_WRITE' });

    expect(readAt(mutationPath)).toBeNull();
    expect(readAt(canonicalPath)).toEqual({ name: 'Canonical profile' });
    expect(removeCardAndSearchId).not.toHaveBeenCalled();
  });

  it('keeps the old unconditional overlay writer compatible with legacy readers', async () => {
    await saveOverlayForUserCard({
      cardUserId: overlayLocation.cardId,
      editorUserId: creatorUid,
      fields: { phone: { added: [phone[0]] } },
    });

    expect(readAt(overlayPath)).toEqual({
      cardUserId: overlayLocation.cardId,
      editorUserId: creatorUid,
      fields: { phone: { added: [phone[0]] } },
      updatedAt: expect.any(Number),
    });
    await expect(profileProposalService.getDraft(overlayLocation)).resolves.toMatchObject({
      createdBy: creatorUid,
      revision: null,
      changes: { phone: { added: [phone[0]] } },
    });
  });

  const reviewCreate = (expected, action = 'accept', finalData = expected.data) => profileProposalService.reviewDraft({
    operation: 'create', action, cardId: mutationLocation.cardId, creatorUid, expected, finalData,
  });

  const reviewUpdate = (expectedCurrent, fieldName, value, action = 'accept') => profileProposalService.reviewDraft({
    operation: 'update', action, cardUserId: overlayLocation.cardId, editorUserId: creatorUid,
    fieldName, value, expectedCurrent,
  });

  it('approves a creation with corrections once through the shared service', async () => {
    const draft = await profileProposalService.createDraft(createDraft({ name: 'Anna', surname: 'Original' }));
    const corrected = { ...draft.data, surname: 'Corrected' };
    auth.currentUser = { uid: ADMIN_UIDS[0] };
    await expect(reviewCreate(draft, 'accept', corrected)).resolves.toEqual(corrected);
    expect(readAt(`profileDetails/${mutationLocation.cardId}/surname`)).toBe('Corrected');
    expect(readAt(mutationPath).status).toBe('accepted');

    update.mockClear();
    runTransaction.mockClear();
    await expect(reviewCreate(draft, 'accept', corrected)).resolves.toEqual(corrected);
    expect(update).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('returns a create draft to its author with the record and edit history intact', async () => {
    const draft = await profileProposalService.createDraft(createDraft({ city: 'Lviv' }));
    const revised = await profileProposalService.saveDraft(createDraft({ city: 'Kyiv' }), { expected: draft });
    const history = `multiData/profileMutationHistory/${mutationLocation.cardId}`;
    const previousHistory = readAt(history);
    auth.currentUser = { uid: ADMIN_UIDS[0] };

    await expect(reviewCreate(revised, 'reject')).resolves.toMatchObject({ status: 'private', revision: 3, data: revised.data });
    await expect(reviewCreate(revised, 'accept')).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await expect(reviewCreate(await profileProposalService.getDraft(mutationLocation), 'accept'))
      .rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    expect(readAt(history)).toEqual(previousHistory);
    expect(readAt(`matchingCards/${mutationLocation.cardId}`)).toBeNull();
  });

  it('approves and rejects individual values, refreshes the index revision and refuses a stale second reviewer', async () => {
    const cardId = overlayLocation.cardId;
    const offered = ['380507700003', '380507700004', '380507700005'];
    writeAt(`matchingCards/${cardId}`, { name: 'Profile', rev: 8 });
    writeAt(`profileContacts/${cardId}`, { phone: canonical.phone });
    await profileProposalService.createDraft(updateDraft({ phone: [...canonical.phone, ...offered], city: 'Lviv' }));
    const firstReview = readAt(overlayPath);
    auth.currentUser = { uid: ADMIN_UIDS[0] };
    await expect(reviewUpdate(firstReview, 'phone', offered[0])).resolves.toMatchObject({ value: [...canonical.phone, offered[0]] });

    auth.currentUser = { uid: ADMIN_UIDS[1] };
    await expect(reviewUpdate(firstReview, 'phone', offered[0])).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
    await reviewUpdate(readAt(overlayPath), 'phone', offered[1], 'reject');
    expect(readAt(overlayPath).fields).toEqual({ phone: { added: [offered[2]] }, city: { added: ['Lviv'] } });
    expect(readAt(`profileContacts/${cardId}/phone`)).toEqual([...canonical.phone, offered[0]]);
    expect(readAt(`matchingCards/${cardId}/rev`)).toBe(500);
    expect(syncUserSearchIdIndex).toHaveBeenCalledWith(cardId, { phone: canonical.phone }, { phone: [...canonical.phone, offered[0]] });
  });

  it.each([creatorUid, anotherEditor, READONLY_ADMIN_UIDS[0]])('denies review decisions to %s', async uid => {
    const draft = await profileProposalService.createDraft(createDraft({ city: 'Lviv' }));
    auth.currentUser = { uid };
    await expect(reviewCreate(draft, 'reject')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(reviewCreate(draft)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(reviewUpdate({}, 'phone', phone[0])).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await expect(reviewUpdate({}, 'phone', phone[0], 'reject')).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    expect(readAt(mutationPath).status).toBe('pendingReview');
  });
});
