import { mergeMatchingCandidateUsers } from '../reactionPriority';

// Публічний коментар видимості не вирішує: чернетка з коментарем «.» мусить
// показатись і на точний запит пошуку, і в стрічці автора.
describe('публічний коментар і видача пошуку', () => {
  const draft = { userId: '-P4TZrBFKVtLMH1-jHVa', publicComment: ['.'], __matchingAccessAllowed: true };

  it('видача пошуку картку з публічним коментарем показує', () => {
    expect(mergeMatchingCandidateUsers({ users: [draft], viewMode: 'search' }).map(user => user.userId))
      .toEqual([draft.userId]);
  });

  it('стрічка її теж не ховає', () => {
    expect(mergeMatchingCandidateUsers({ users: [{ ...draft, publish: true }], viewMode: 'default' }).map(user => user.userId))
      .toEqual([draft.userId]);
  });
});
