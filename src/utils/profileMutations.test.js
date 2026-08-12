import {
  PROFILE_MUTATIONS_ROOT,
  PROFILE_IDENTITY_CLAIMS_ROOT,
  PROFILE_MUTATION_HISTORY_ROOT,
  getEffectiveProfile,
  buildProfileRevisionHistory,
  getProfileIdentityClaimPath,
  getProfileMutationPath,
  getProfileMutationHistoryPath,
} from './profileMutations';

jest.mock('components/config', () => ({ database: {} }));

describe('profile mutations', () => {
  it('stores creator mutations below multiData', () => {
    expect(PROFILE_MUTATIONS_ROOT).toBe('multiData/profileMutations');
    expect(getProfileMutationPath('creator-1')).toBe('multiData/profileMutations/creator-1');
    expect(getProfileMutationPath('creator-1', 'card-1'))
      .toBe('multiData/profileMutations/creator-1/card-1');
  });

  it('stores identity claims below multiData without a root fallback', () => {
    expect(PROFILE_IDENTITY_CLAIMS_ROOT).toBe('multiData/profileIdentityClaims');
    expect(getProfileIdentityClaimPath('email_test@example_com'))
      .toBe('multiData/profileIdentityClaims/email_test@example_com');
  });

  it('stores direct draft revisions in a card-scoped journal', () => {
    expect(PROFILE_MUTATION_HISTORY_ROOT).toBe('multiData/profileMutationHistory');
    expect(getProfileMutationHistoryPath('card-1'))
      .toBe('multiData/profileMutationHistory/card-1');
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

  it('keeps every direct transition with its actor, time and revision', () => {
    const first = buildProfileRevisionHistory({
      cardId: 'card-1', actorUid: 'author-1', previousData: {}, nextData: { name: 'Ім\'я1' }, at: 10, revision: 1,
    });
    const second = buildProfileRevisionHistory({
      cardId: 'card-1', actorUid: 'admin-1', previousData: { name: 'Ім\'я1' }, nextData: { name: 'Ім\'я2' }, at: 20, revision: 2,
    });
    const third = buildProfileRevisionHistory({
      cardId: 'card-1', actorUid: 'admin-1', previousData: { name: 'Ім\'я2' }, nextData: { name: 'Ім\'я3' }, at: 30, revision: 3,
    });

    expect([...first, ...second, ...third]).toEqual([
      expect.objectContaining({ change: { from: '', to: 'Ім\'я1' }, actorUid: 'author-1', at: 10, revision: 1 }),
      expect.objectContaining({ change: { from: 'Ім\'я1', to: 'Ім\'я2' }, actorUid: 'admin-1', at: 20, revision: 2 }),
      expect.objectContaining({ change: { from: 'Ім\'я2', to: 'Ім\'я3' }, actorUid: 'admin-1', at: 30, revision: 3 }),
    ]);
  });

  it('does not journal unchanged or service fields', () => {
    expect(buildProfileRevisionHistory({
      cardId: 'card-1',
      actorUid: 'author-1',
      previousData: { name: 'Same', userId: 'card-1' },
      nextData: { name: 'Same', userId: 'different-service-value' },
      at: 20,
      revision: 2,
    })).toEqual([]);
  });
});
