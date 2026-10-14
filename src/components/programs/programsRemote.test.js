// Програми, збережені під схованою анкетою, лягають у свій вузол, але версії
// в картку не ставлять: інакше збереження показало б програми агенції під
// батьками, які в картці лишились (`isProgramsOwnerRoleHidden`).

jest.mock('../config', () => ({ database: {}, isReactionPermissionDeniedError: () => false }));

const mockUpdate = jest.fn();
jest.mock('firebase/database', () => ({
  get: jest.fn(),
  ref: (_db, path = '') => path,
  remove: jest.fn(),
  set: jest.fn(),
  update: (...args) => mockUpdate(...args),
}));

const { writeProgramsToDb } = require('./programsRemote');
const { resetProgramsStoreForTests, saveCardPrograms } = require('../../utils/programsStore');

const program = { id: 'p1', type: 'ed', location: 'Київ', payments: { final: { amount: 1500, currency: 'USD' } } };

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue(undefined);
  resetProgramsStoreForTests();
  window.localStorage.clear();
});

it('пише версію в картку разом із програмами', async () => {
  await writeProgramsToDb('U1', { p1: program }, 5);
  expect(mockUpdate).toHaveBeenCalledWith('', {
    'multiData/programs/U1': { updatedAt: 5, items: { p1: program } },
    'matchingCards/U1/programsAt': 5,
  });
});

it('під схованою роллю-власницею — програми без версії в картці', async () => {
  await writeProgramsToDb('U1', { p1: program }, 5, { advertise: false });
  expect(mockUpdate).toHaveBeenCalledWith('', {
    'multiData/programs/U1': { updatedAt: 5, items: { p1: program } },
    'matchingCards/U1/programsAt': null,
  });
});

it('«Мій профіль» передає це писачеві через сховище програм', async () => {
  await saveCardPrograms('U2', { p1: program }, { advertise: false });
  const [, patch] = mockUpdate.mock.calls[0];
  expect(patch['multiData/programs/U2']).toEqual(expect.objectContaining({ items: expect.any(Object) }));
  expect(patch['matchingCards/U2/programsAt']).toBeNull();
});
