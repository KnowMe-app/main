import { get as firebaseGet } from 'firebase/database';
import {
  buildCardBackendExtraSources,
  getCardBackendExtras,
  loadCardBackendExtras,
  resetCardBackendExtras,
} from './cardBackendExtras';

jest.mock('firebase/database', () => ({
  get: jest.fn(),
  ref: (db, path) => ({ path }),
}));
jest.mock('components/config', () => ({ auth: { currentUser: null }, database: {} }));
jest.mock('utils/cardIndex', () => ({ getCard: () => null }));
jest.mock('utils/realtimeConnectionManager', () => ({ noteRealtimeDemand: jest.fn() }));

const VIEWER = 'viewerUid0000000000000000001';
const ADMIN = '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2';

const snap = value => ({ exists: () => value !== null && value !== undefined, val: () => value });

describe('cardBackendExtras', () => {
  beforeEach(() => {
    resetCardBackendExtras();
    firebaseGet.mockReset();
  });

  it('питає нотатки, відгуки, позначки, доповнення й програми картки', () => {
    const paths = buildCardBackendExtraSources('AA123', VIEWER).map(source => source.path);
    expect(paths).toEqual(expect.arrayContaining([
      `multiData/comments/${VIEWER}/AA123`,
      `multiData/comments/${ADMIN}/AA123`,
      'comments/AA123',
      `multiData/favorites/${VIEWER}/AA123`,
      'multiData/edits/AA123',
      'multiData/programs/AA123',
    ]));
  });

  it('читає з бази щоразу й не ховає відмову за порожнечею', async () => {
    firebaseGet.mockImplementation(async ({ path }) => {
      if (path === 'comments/AA123') return snap({ c1: { text: 'Відгук', authorId: 'x' } });
      if (path === `multiData/comments/${VIEWER}/AA123`) return snap({ text: 'Моя', updatedAt: 1 });
      if (path === 'multiData/edits/AA123') throw new Error('PERMISSION_DENIED: Permission denied');
      return snap(null);
    });

    await loadCardBackendExtras('AA123', { viewerId: VIEWER });
    const { entries } = getCardBackendExtras('AA123');
    const byPath = Object.fromEntries(entries.map(entry => [entry.path, entry]));

    expect(byPath['comments/AA123'].value).toEqual({ c1: { text: 'Відгук', authorId: 'x' } });
    expect(byPath[`multiData/comments/${VIEWER}/AA123`].value.text).toBe('Моя');
    expect(byPath['multiData/edits/AA123'].error).toBe('немає доступу (правила бази)');
    // Порожня чужа нотатка — не дані картки.
    expect(byPath[`multiData/comments/${ADMIN}/AA123`]).toBeUndefined();

    const callsBefore = firebaseGet.mock.calls.length;
    await loadCardBackendExtras('AA123', { viewerId: VIEWER });
    expect(firebaseGet.mock.calls.length).toBe(callsBefore * 2);
  });
});
