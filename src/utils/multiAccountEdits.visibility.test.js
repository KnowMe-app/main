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

  // Legacy-тіло має рівно анкета акаунта, і про це каже сам id — довгий це
  // Firebase-Auth UID. Читання `users/{id}` тут більше немає: у вебі не
  // лишилось жодного читання цієї колекції.
  it('routes an account profile to users by the shape of its id alone', async () => {
    await expect(getCardLegacyCollection('firebaseAuthUid0123456789012')).resolves.toBe('users');
    expect(get).not.toHaveBeenCalled();
  });

  it('reports no legacy body for a card that lives only in the profile nodes', async () => {
    await expect(getCardLegacyCollection('TG0016')).resolves.toBeNull();
    await expect(getCardLegacyCollection('-push-id-20-chars---')).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
