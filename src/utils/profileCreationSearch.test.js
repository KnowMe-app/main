import { findMatchingProfileMutations } from './profileCreationSearch';

describe('findMatchingProfileMutations', () => {
  const mutations = [{
    cardId: 'draft-1',
    status: 'pendingReview',
    data: { name: 'Тест', phone: ['+380 50 599 06 66'], telegram: 'test_user' },
  }, {
    cardId: 'draft-2',
    status: 'pendingReview',
    data: { name: 'Тест', phone: ['+380 67 111 22 33'] },
  }];

  it('finds an own draft using the same normalized phone entered in search', () => {
    expect(findMatchingProfileMutations(mutations, { key: 'phone', value: '0505990666' })).toEqual([mutations[0]]);
  });

  it('finds an own draft by a contact stored as an array value', () => {
    expect(findMatchingProfileMutations(mutations, { key: 'telegram', value: 'test_user' })).toEqual([mutations[0]]);
  });

  it('does not offer an unrelated draft', () => {
    expect(findMatchingProfileMutations(mutations, { key: 'phone', value: '0500000000' })).toEqual([]);
  });

  it('returns every draft that matches, not just the first one', () => {
    expect(findMatchingProfileMutations(mutations, { key: 'name', value: 'Тест' })).toEqual([mutations[0], mutations[1]]);
  });
});
