import { collectDraftProfilesForIndexing } from '../profileDraftIndexing';

/**
 * Чернетка не має картки стрічки, тож зведення анкет із вузлів її не бачить —
 * а перебудова `searchId`, залита заміною вузла, зносила б рівно ті записи,
 * якими чернетка боронить себе від дубля.
 */
describe('чернетки під індексацію', () => {
  const draft = (overrides = {}) => ({
    operation: 'create',
    status: 'private',
    data: { phone: '380671112233' },
    ...overrides,
  });

  it('бере незавершені чернетки створення — з усіх, хто їх завів', () => {
    expect(collectDraftProfilesForIndexing({
      creatorOne: { CARD1: draft() },
      creatorTwo: { CARD2: draft({ status: 'pendingReview', data: { surname: 'Коваленко' } }) },
    })).toEqual({
      CARD1: { phone: '380671112233', userId: 'CARD1' },
      CARD2: { surname: 'Коваленко', userId: 'CARD2' },
    });
  });

  it('id чернетки — це id майбутньої картки, тож він і йде в індекс', () => {
    // `reserveProfileCardId` резервує його один раз, і опублікована анкета
    // лишається під ним же: запис індексу переживає публікацію.
    const drafts = collectDraftProfilesForIndexing({ creator: { CARD3: draft() } });
    expect(drafts.CARD3.userId).toBe('CARD3');
  });

  it('прийняту чернетку не індексує — вона вже живе у вузлах анкети', () => {
    expect(collectDraftProfilesForIndexing({
      creator: {
        CARD4: draft({ status: 'accepted' }),
        CARD5: draft({ status: 'archived' }),
      },
    })).toEqual({});
  });

  it('незбережену правку чужої анкети не індексує', () => {
    // `operation: 'update'` своїх значень в анкету ще не поклав, і відповідати
    // на пошук карткою, у якій набраного немає, — гірше, ніж не відповісти.
    expect(collectDraftProfilesForIndexing({
      creator: { CARD6: draft({ operation: 'update' }) },
    })).toEqual({});
  });

  it('порожнє й покалічене пропускає мовчки, а не падає', () => {
    expect(collectDraftProfilesForIndexing()).toEqual({});
    expect(collectDraftProfilesForIndexing({ creator: null })).toEqual({});
    expect(collectDraftProfilesForIndexing({ creator: { CARD7: draft({ data: null }) } })).toEqual({});
  });
});
