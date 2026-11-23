const { get, onValue, ref, runTransaction, serverTimestamp, update } = require('firebase/database');
const { auth, syncUserSearchIdIndex } = require('components/config');
const { ADMIN_UIDS, READONLY_ADMIN_UIDS } = require('./accessLevel');
const {
  claimOverlayValueForReview, getCanonicalCard, releaseOverlayValueReview, settleOverlayValueForCard,
} = require('./multiAccountEdits');
const { approveOverlayValue } = require('./profileOverlayReview');

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

jest.mock('./persistCanonicalCard', () => ({ persistCanonicalCard: jest.fn() }));

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
  claimOverlayValueForReview.mockImplementation(async ({ expectedCurrent, fieldName, value, acceptedValue }) => ({
    ...expectedCurrent, reviewClaim: { fieldName, value, acceptedValue },
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
