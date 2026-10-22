import { mergeMatchingCandidateUsers } from '../reactionPriority';

// Чернетка з публічним коментарем («.») у стрічку не йде, але на точний
// запит пошуку мусить показатись: у `searchId` вона є.
describe('публічний коментар і видача пошуку', () => {
  const draft = { userId: '-P4TZrBFKVtLMH1-jHVa', publicComment: ['.'], __matchingAccessAllowed: true };

  it('видача пошуку картку з публічним коментарем показує', () => {
    expect(mergeMatchingCandidateUsers({ users: [draft], viewMode: 'search' }).map(user => user.userId))
      .toEqual([draft.userId]);
  });

  it('стрічка її, як і раніше, не показує', () => {
    expect(mergeMatchingCandidateUsers({ users: [{ ...draft, publish: true }], viewMode: 'default' })).toEqual([]);
  });
});
