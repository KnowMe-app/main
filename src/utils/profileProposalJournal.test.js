import { push, ref, update } from 'firebase/database';

jest.mock('firebase/database', () => ({
  push: jest.fn(), ref: jest.fn(), update: jest.fn(),
}));

const prior = process.env.REACT_APP_PROFILE_PROPOSAL_STORAGE;

afterEach(() => {
  if (prior === undefined) delete process.env.REACT_APP_PROFILE_PROPOSAL_STORAGE;
  else process.env.REACT_APP_PROFILE_PROPOSAL_STORAGE = prior;
  jest.clearAllMocks();
});

it.each([
  ['legacy', 'create', 'multiData/profileMutationHistory'],
  ['legacy', 'update', 'multiData/editsHistory'],
  ['unified', 'create', 'multiData/profileProposals/live/history/create'],
  ['unified', 'update', 'multiData/profileProposals/live/history/update'],
])('journals %s %s events on the selected path only', async (mode, operation, path) => {
  process.env.REACT_APP_PROFILE_PROPOSAL_STORAGE = mode;
  let appendProfileProposalJournal;
  jest.isolateModules(() => {
    ({ appendProfileProposalJournal } = require('./profileProposalJournal'));
  });
  const target = { key: 'card' };
  ref.mockReturnValue(target);
  push.mockReturnValue({ key: 'event' });
  const entry = { action: 'edit', fieldName: 'name', change: { from: 'Before', to: 'After' } };

  await appendProfileProposalJournal({}, operation, 'card', [entry]);

  expect(ref).toHaveBeenCalledTimes(1);
  expect(ref).toHaveBeenCalledWith({}, `${path}/card`);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(target, {
    event: mode === 'unified' ? { ...entry, operation, cardId: 'card' } : entry,
  });
});
