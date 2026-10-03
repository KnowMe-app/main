const { get, ref, remove } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(() => Promise.resolve()),
  runTransaction: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({ database: {}, updateSearchId: jest.fn() }));
jest.mock('utils/backendDownloadToast', () => ({ withAdminDownloadToast: promise => promise }));

const { clearCardOverlays } = require('./multiAccountEdits');

const snapshot = value => ({ exists: () => Boolean(value), val: () => value });

beforeEach(() => {
  jest.clearAllMocks();
  ref.mockImplementation((db, path) => ({ db, path }));
  remove.mockResolvedValue();
});

it('clears only active overlays and verifies the result', async () => {
  get
    .mockResolvedValueOnce(snapshot({ editor: { fields: { phone: { to: '' } } } }))
    .mockResolvedValueOnce(snapshot(null));

  await clearCardOverlays('card-1');

  expect(remove).toHaveBeenCalledTimes(2);
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/edits/card-1/editor' }));
  expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'multiData/editsByEditor/editor/card-1' }));
  expect(ref.mock.calls.map(([, target]) => target)).not.toEqual(expect.arrayContaining([
    expect.stringContaining('editsHistory'),
    expect.stringContaining('editsContributors'),
  ]));
});

it('rejects when an unauthorized overlay survives', async () => {
  const overlay = { editor: { fields: { phone: { to: '' } } } };
  get.mockResolvedValueOnce(snapshot(overlay)).mockResolvedValueOnce(snapshot(overlay));

  await expect(clearCardOverlays('card-2')).rejects.toThrow('OVERLAY_CLEAR_INCOMPLETE');
});
