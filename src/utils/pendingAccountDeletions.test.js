import { listPendingAccountDeletions } from './accountDeletion';
import {
  PENDING_DELETIONS_TTL_MS,
  forgetPendingAccountDeletions,
  readPendingAccountDeletionIds,
} from './pendingAccountDeletions';

jest.mock('./accountDeletion', () => ({ listPendingAccountDeletions: jest.fn() }));

const auth = { currentUser: { uid: 'admin-uid' } };

beforeEach(() => {
  forgetPendingAccountDeletions();
  listPendingAccountDeletions.mockReset();
});

test('returns uids from the deletion queue and shares one read', async () => {
  listPendingAccountDeletions.mockResolvedValue({ items: [{ uid: 'a' }, { uid: 'b' }], error: '' });
  const [first, second] = await Promise.all([
    readPendingAccountDeletionIds({ auth, now: 0 }),
    readPendingAccountDeletionIds({ auth, now: 0 }),
  ]);
  expect([...first]).toEqual(['a', 'b']);
  expect(second).toBe(first);
  expect(listPendingAccountDeletions).toHaveBeenCalledTimes(1);
});

test('remembers the queue until the TTL passes', async () => {
  listPendingAccountDeletions.mockResolvedValue({ items: [{ uid: 'a' }], error: '' });
  await readPendingAccountDeletionIds({ auth, now: 0 });
  await readPendingAccountDeletionIds({ auth, now: PENDING_DELETIONS_TTL_MS - 1 });
  expect(listPendingAccountDeletions).toHaveBeenCalledTimes(1);
  await readPendingAccountDeletionIds({ auth, now: PENDING_DELETIONS_TTL_MS + 1 });
  expect(listPendingAccountDeletions).toHaveBeenCalledTimes(2);
});

test('a failed read is empty and not remembered', async () => {
  listPendingAccountDeletions.mockResolvedValueOnce({ items: [], error: 'functions/permission-denied' });
  expect((await readPendingAccountDeletionIds({ auth, now: 0 })).size).toBe(0);
  listPendingAccountDeletions.mockResolvedValueOnce({ items: [{ uid: 'a' }], error: '' });
  expect([...(await readPendingAccountDeletionIds({ auth, now: 1 }))]).toEqual(['a']);
});

test('without a signed-in viewer the function is not called', async () => {
  expect((await readPendingAccountDeletionIds({ auth: { currentUser: null } })).size).toBe(0);
  expect(listPendingAccountDeletions).not.toHaveBeenCalled();
});
