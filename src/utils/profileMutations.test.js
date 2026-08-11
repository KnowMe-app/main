import {
  PROFILE_MUTATIONS_ROOT,
  PROFILE_IDENTITY_CLAIMS_ROOT,
  getEffectiveProfile,
  getProfileIdentityClaimPath,
  getProfileMutationPath,
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
});
