import {
  buildProfileSearchIndexUpdates,
  getEffectiveProfile,
  getProfileIdentityKeys,
} from './profileMutations';
import {
  buildSearchIdIndexPayloadFromCollections,
  buildSearchKeyIndexPayloadFromCollections,
} from 'components/config';

jest.mock('components/config', () => ({
  database: {},
  buildSearchIdIndexPayloadFromCollections: jest.fn(collections => {
    const [[cardId, profile]] = Object.entries(collections.newUsers);
    return {
      [`email_${profile.email}`]: cardId,
      [`name_${profile.name}`]: cardId,
    };
  }),
  buildSearchKeyIndexPayloadFromCollections: jest.fn(collections => {
    const [[cardId]] = Object.entries(collections.newUsers);
    return { contact: { email: { [cardId]: true } } };
  }),
}));

describe('profile mutations', () => {
  beforeEach(() => {
    buildSearchIdIndexPayloadFromCollections.mockImplementation(collections => {
      const [[cardId, profile]] = Object.entries(collections.newUsers);
      return {
        [`email_${profile.email}`]: cardId,
        [`name_${profile.name}`]: cardId,
      };
    });
    buildSearchKeyIndexPayloadFromCollections.mockImplementation(collections => {
      const [[cardId]] = Object.entries(collections.newUsers);
      return { contact: { email: { [cardId]: true } } };
    });
  });

  it('renders a create mutation without a base profile', () => {
    expect(getEffectiveProfile({ mutation: { operation: 'create', cardId: 'card-1', data: { name: 'Anna' } } }))
      .toEqual({ userId: 'card-1', name: 'Anna' });
  });

  it('merges update data and ignores accepted mutations', () => {
    expect(getEffectiveProfile({ baseProfile: { userId: '1', name: 'A' }, mutation: { operation: 'update', data: { name: 'B' } } }))
      .toEqual({ userId: '1', name: 'B' });
    expect(getEffectiveProfile({ baseProfile: { userId: '1', name: 'A' }, mutation: { status: 'accepted', operation: 'create', data: { name: 'B' } } }))
      .toEqual({ userId: '1', name: 'A' });
  });

  it('builds multi-location searchId and searchKey updates for an accepted profile', () => {
    expect(buildProfileSearchIndexUpdates('card-1', { name: 'Anna', email: 'a@example.com' })).toEqual({
      'searchId/email_a@example.com': 'card-1',
      'searchId/name_Anna': 'card-1',
      'searchKey/contact/email/card-1': true,
    });
  });

  it('reserves unique contact indexes without treating names as identities', () => {
    expect(getProfileIdentityKeys('card-1', { name: 'Anna', email: 'a@example.com' }))
      .toEqual(['email_a@example.com']);
  });
});
