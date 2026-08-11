import { findMatchingProfileMutation } from './profileCreationSearch';

describe('findMatchingProfileMutation', () => {
  const mutations = [{
    cardId: 'draft-1',
    status: 'pendingReview',
    data: { name: 'Тест', phone: ['+380 50 599 06 66'], telegram: 'test_user' },
  }];

  it('finds an own draft using the same normalized phone entered in search', () => {
    expect(findMatchingProfileMutation(mutations, { key: 'phone', value: '0505990666' })).toBe(mutations[0]);
  });

  it('finds an own draft by a contact stored as an array value', () => {
    expect(findMatchingProfileMutation(mutations, { key: 'telegram', value: 'test_user' })).toBe(mutations[0]);
  });

  it('does not offer an unrelated draft', () => {
    expect(findMatchingProfileMutation(mutations, { key: 'phone', value: '0500000000' })).toBeNull();
  });
});
