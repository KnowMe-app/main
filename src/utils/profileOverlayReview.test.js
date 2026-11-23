const { get, onValue, ref, runTransaction, serverTimestamp, update } = require('firebase/database');
const { auth, syncUserSearchIdIndex } = require('components/config');
const { ADMIN_UIDS, READONLY_ADMIN_UIDS } = require('./accessLevel');
const {
  claimOverlayValueForReview, getCanonicalCard, releaseOverlayValueReview, settleOverlayValueForCard,
} = require('./multiAccountEdits');
const { approveOverlayValue } = require('./profileOverlayReview');
const { loadProfileMutation, saveCreateProfileMutation } = require('./profileMutations');
const { createEditorSnapshot } = require('./profileProposalEditor');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  onValue: jest.fn(),
  ref: jest.fn((_, path) => ({ path })),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => 'server-timestamp'),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({
  auth: { currentUser: null },
  database: {},
  normalizeStoredDates: data => data,
  syncMatchingCardIndex: jest.fn(),
  syncUserSearchIdIndex: jest.fn(),
  syncUserSearchKeyIndex: jest.fn(),
}));

jest.mock('./multiAccountEdits', () => ({
  ...jest.requireActual('./multiAccountEdits'),
  claimOverlayValueForReview: jest.fn(),
  getCanonicalCard: jest.fn(),
  releaseOverlayValueReview: jest.fn(),
  settleOverlayValueForCard: jest.fn(),
}));

jest.mock('./profileMutations', () => ({
  loadProfileMutation: jest.fn(),
  saveCreateProfileMutation: jest.fn(),
}));

const cardUserId = 'review-card';
const editorUserId = 'review-author';
const input = { cardUserId, editorUserId, fieldName: 'phone', value: '380501110001' };
const originalPhone = '380501110000';
const laterPhone = '380501110004';
const overlay = {
  fields: { phone: { added: [input.value, '380501110002', '380501110003'] } },
  proposal: { originalValues: JSON.stringify({ phone: { present: true, value: originalPhone } }) },
};

let canonicalPhone;
const approval = (expectedCurrent = overlay, options = {}) => approveOverlayValue({ ...input, ...options, expectedCurrent });

beforeEach(() => {
  jest.clearAllMocks();
  auth.currentUser = { uid: ADMIN_UIDS[0] };
  canonicalPhone = originalPhone;
  ref.mockImplementation((_, path) => ({ path }));
  serverTimestamp.mockReturnValue('server-timestamp');
  get.mockImplementation(async ({ path }) => ({
    val: () => path.startsWith('matchingCards') ? { name: 'Profile' } : canonicalPhone,
  }));
  getCanonicalCard.mockImplementation(async () => ({ userId: cardUserId, name: 'Profile', phone: canonicalPhone }));
  onValue.mockImplementation((fieldRef, callback) => {
    callback();
    return jest.fn();
  });
  runTransaction.mockImplementation(async (fieldRef, change) => {
    const next = change(canonicalPhone);
    if (next === undefined) return { committed: false };
    canonicalPhone = next;
    return { committed: true };
  });
  claimOverlayValueForReview.mockImplementation(async ({
    expectedCurrent, fieldName, value, acceptedValue, replacement,
  }) => ({
    ...expectedCurrent, reviewClaim: { fieldName, value, acceptedValue, ...(replacement && { replacement }) },
  }));
  releaseOverlayValueReview.mockResolvedValue(undefined);
  settleOverlayValueForCard.mockResolvedValue({ remainingOverlay: { fields: { phone: { added: ['380501110002', '380501110003'] } } } });
});

it('accepts only the selected value and keeps other phone numbers pending', async () => {
  const value = [originalPhone, input.value];
  await expect(approval()).resolves.toMatchObject({ value, remainingOverlay: expect.any(Object) });
  expect(canonicalPhone).toEqual(value);
  expect(runTransaction).toHaveBeenCalledWith({ path: `profileContacts/${cardUserId}/phone` }, expect.any(Function), { applyLocally: false });
  expect(settleOverlayValueForCard).toHaveBeenCalledWith(expect.objectContaining({
    ...input,
    acceptedOriginal: { present: true, value },
    expectedCurrent: { ...overlay, reviewClaim: { fieldName: 'phone', value: input.value, acceptedValue: input.value } },
  }));
});

it('replaces a legacy scalar when its original value is current', async () => {
  await expect(approval({ fields: { phone: { from: originalPhone, to: input.value } } })).resolves.toMatchObject({ value: input.value });
  expect(canonicalPhone).toBe(input.value);
});

it('keeps a different contributor’s accepted addition when the original values still exist', async () => {
  canonicalPhone = [originalPhone, laterPhone];
  const expected = [originalPhone, laterPhone, input.value];
  await expect(approval()).resolves.toMatchObject({ value: expected });
  expect(canonicalPhone).toEqual(expected);
});

it('atomically replaces the selected list member and keeps the rest of the canonical field', async () => {
  const replacement = { from: originalPhone, to: input.value };
  const retainedPhone = '380501110006';
  const correctedPhone = '380501110007';
  canonicalPhone = [originalPhone, retainedPhone];
  const proposal = {
    fields: { phone: { added: [input.value, '380501110002'], removed: [originalPhone] } },
    proposal: {
      replacements: JSON.stringify({ phone: [replacement] }),
      originalValues: JSON.stringify({ phone: { present: true, value: canonicalPhone } }),
    },
  };

  await expect(approval(proposal, { replacement, acceptedValue: correctedPhone })).resolves.toMatchObject({
    value: [retainedPhone, correctedPhone],
  });
  expect(canonicalPhone).toEqual([retainedPhone, correctedPhone]);
  expect(runTransaction).toHaveBeenCalledTimes(1);
  expect(settleOverlayValueForCard).toHaveBeenCalledWith(expect.objectContaining({ replacement }));
});

it('applies a contribution to the exact unpublished draft without copying reader marks', async () => {
  const draft = {
    cardId: cardUserId, createdBy: 'draft-author', revision: 3,
    operation: 'create', status: 'pendingReview', data: { phone: originalPhone, name: 'Draft' },
  };
  getCanonicalCard.mockResolvedValue({
    userId: cardUserId, ...draft.data, writer: 'Reviewer-only mark',
    __profileMutationOperation: 'create', __profileMutationCreatedBy: draft.createdBy,
    __profileMutationRevision: 3,
  });
  loadProfileMutation.mockResolvedValue(draft);
  const next = { ...draft, data: { ...draft.data, phone: [originalPhone, input.value] }, revision: 4 };
  saveCreateProfileMutation.mockResolvedValue(next);

  await expect(approval(overlay, { expectedDraft: createEditorSnapshot(draft) })).resolves.toMatchObject({ draft: next });
  expect(saveCreateProfileMutation).toHaveBeenCalledWith({
    cardId: cardUserId, creatorUid: draft.createdBy, actorUid: ADMIN_UIDS[0],
    data: next.data, expectedCurrent: draft, skipRevisionHistory: true,
  });
  expect(runTransaction).not.toHaveBeenCalled();
});

it('rejects a draft contribution when the displayed draft became a canonical card', async () => {
  const expectedDraft = createEditorSnapshot({
    cardId: cardUserId, createdBy: 'draft-author', data: {}, revision: 3, status: 'pendingReview',
  });
  await expect(approval(overlay, { expectedDraft })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(claimOverlayValueForReview).not.toHaveBeenCalled();
});

it('refuses an approval when the proposed canonical field has changed', async () => {
  canonicalPhone = laterPhone;
  await expect(approval()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(claimOverlayValueForReview).not.toHaveBeenCalled();
  expect(runTransaction).not.toHaveBeenCalled();
  expect(canonicalPhone).toBe(laterPhone);
});

it('releases the reservation if the canonical field changes after the preflight', async () => {
  claimOverlayValueForReview.mockImplementationOnce(async () => {
    canonicalPhone = laterPhone;
    return { ...overlay, reviewClaim: { fieldName: 'phone', value: input.value } };
  });
  await expect(approval()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(canonicalPhone).toBe(laterPhone);
  expect(releaseOverlayValueReview).toHaveBeenCalledWith(expect.objectContaining(input));
  expect(settleOverlayValueForCard).not.toHaveBeenCalled();
});

it('reports an index failure and retries the claimed value without adding it twice', async () => {
  syncUserSearchIdIndex.mockRejectedValueOnce(new Error('Network interrupted'));
  await expect(approval()).rejects.toMatchObject({ code: 'PARTIAL_WRITE' });
  expect(settleOverlayValueForCard).not.toHaveBeenCalled();
  expect(releaseOverlayValueReview).not.toHaveBeenCalled();
  expect(canonicalPhone).toEqual([originalPhone, input.value]);

  const claimed = { ...overlay, reviewClaim: { fieldName: 'phone', value: input.value, acceptedValue: input.value } };
  await expect(approval(claimed)).resolves.toMatchObject({ value: [originalPhone, input.value] });
  expect(canonicalPhone).toEqual([originalPhone, input.value]);
  expect(settleOverlayValueForCard).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledTimes(1);
});

it('leaves canonical data untouched when the inspector or a stale review tries to claim', async () => {
  auth.currentUser = { uid: READONLY_ADMIN_UIDS[0] };
  await expect(approval()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  expect(runTransaction).not.toHaveBeenCalled();

  auth.currentUser = { uid: ADMIN_UIDS[0] };
  claimOverlayValueForReview.mockRejectedValueOnce(Object.assign(new Error('Stale'), { code: 'REVISION_CONFLICT' }));
  await expect(approval()).rejects.toMatchObject({ code: 'REVISION_CONFLICT' });
  expect(runTransaction).not.toHaveBeenCalled();
});
