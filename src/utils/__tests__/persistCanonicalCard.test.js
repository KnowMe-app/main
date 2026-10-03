import { persistCanonicalCard } from '../persistCanonicalCard';
import { updateProfileNodesInRTDB, fetchUserById, syncUserSearchIdIndex } from 'components/config';
import { saveDraftProfileRecord } from 'utils/profileRecordSource';

jest.mock('components/config', () => ({
  auth: { currentUser: { uid: 'admin-1' } },
  fetchUserById: jest.fn(async () => ({})),
  syncUserSearchIdIndex: jest.fn(async () => undefined),
  updateDataInFiresoreDB: jest.fn(async () => undefined),
  updateDataInRealtimeDB: jest.fn(async () => undefined),
  updateProfileNodesInRTDB: jest.fn(async () => undefined),
}));

jest.mock('utils/profileRecordSource', () => ({
  ...jest.requireActual('utils/profileRecordSource'),
  saveDraftProfileRecord: jest.fn(async () => ({ revision: 2 })),
}));

beforeEach(() => jest.clearAllMocks());

// Прийняте доповнення чернетки лягає в саму чернетку — у вузлах готової
// анкети воно завело б поруч із нею другу, напівготову картку.
it('пише прийняте доповнення чернетки в чернетку, а не у вузли', async () => {
  const draft = {
    userId: 'draft-1', phone: ['380501112233'],
    __profileMutationOperation: 'create', __profileMutationCreatedBy: 'author-1', __profileMutationRevision: 1,
  };

  await persistCanonicalCard(draft);

  expect(saveDraftProfileRecord).toHaveBeenCalledWith({ submitted: draft, actorUid: 'admin-1', baseRevision: 1 });
  expect(updateProfileNodesInRTDB).not.toHaveBeenCalled();
  expect(syncUserSearchIdIndex).not.toHaveBeenCalled();
  expect(fetchUserById).not.toHaveBeenCalled();
});

it('готову анкету пише у вузли, як і доти', async () => {
  await persistCanonicalCard({ userId: 'card-1', phone: ['380501112233'] });

  expect(saveDraftProfileRecord).not.toHaveBeenCalled();
  expect(updateProfileNodesInRTDB).toHaveBeenCalledWith('card-1', expect.objectContaining({ phone: ['380501112233'] }), 'update', true);
});
