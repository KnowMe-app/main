const { get } = require('firebase/database');

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  push: jest.fn(),
  ref: jest.fn((db, path) => ({ db, path })),
  remove: jest.fn(),
  set: jest.fn(),
  update: jest.fn(),
}));

jest.mock('components/config', () => ({ database: { app: 'db' } }));
jest.mock('utils/backendDownloadToast', () => ({
  withAdminDownloadToast: promise => promise,
}));

const { getCardLegacyCollection, getOverlaysForCard } = require('./multiAccountEdits');
const snapshotOf = value => ({ exists: () => value != null, val: () => value });

describe('shared card storage and overlay visibility', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves the admin-only marker and filters it for non-admin loading', async () => {
    get.mockResolvedValue(snapshotOf({
      editor1: { fields: { city: { to: 'Lviv' } }, adminOnly: true },
      editor2: { fields: { name: { to: 'Anna' } } },
    }));

    await expect(getOverlaysForCard('card-1')).resolves.toMatchObject({
      editor1: { adminOnly: true },
      editor2: { fields: { name: { to: 'Anna' } } },
    });
    await expect(getOverlaysForCard('card-1', { includeAdminOnly: false })).resolves.toEqual({
      editor2: expect.objectContaining({ fields: { name: { to: 'Anna' } } }),
    });
  });

  it('routes a published push-id card to users based on its existing record', async () => {
    get.mockResolvedValue(snapshotOf({ userId: '-push-id-20-chars---' }));
    await expect(getCardLegacyCollection('-push-id-20-chars---')).resolves.toBe('users');
  });

  it('reports no legacy body for a card that lives only in the profile nodes', async () => {
    get.mockResolvedValue(snapshotOf(null));
    await expect(getCardLegacyCollection('TG0016')).resolves.toBeNull();
  });
});
