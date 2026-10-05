import {
  buildProfileDataSources,
  castTreeInput,
  listSearchIdSourcesForRecord,
  removeFromTree,
  setInTree,
} from 'utils/profileDataTree';

const paths = sources => sources.map(source => source.segments.join('/'));

describe('buildProfileDataSources', () => {
  const ADMIN = 'admin-uid';

  it('називає всі вузли анкети й позначки власника, зокрема графік стимуляції', () => {
    const result = paths(buildProfileDataSources({ cardId: 'AA0001', viewerId: ADMIN }));
    expect(result).toEqual(expect.arrayContaining([
      'matchingCards/AA0001',
      'profileContacts/AA0001',
      'profileDetails/AA0001',
      'profileWorkflow/AA0001',
      'profileTechnical/AA0001',
      `multiData/stimulationSchedule/${ADMIN}/AA0001`,
      `multiData/getInTouch/${ADMIN}/AA0001`,
      `multiData/writer/${ADMIN}/AA0001`,
      `multiData/comments/${ADMIN}/AA0001`,
      'multiData/edits/AA0001',
      'multiData/editsHistory/AA0001',
      'multiData/profileMutationOwners/AA0001',
      'multiData/profileMutationHistory/AA0001',
      'comments/AA0001',
      'multiData/programs/AA0001',
    ]));
  });

  it('веде на запис чернетки, коли автор відомий', () => {
    expect(paths(buildProfileDataSources({ cardId: 'AA0001', viewerId: ADMIN, draftAuthorId: 'author' })))
      .toContain('multiData/profileMutations/author/AA0001');
    expect(paths(buildProfileDataSources({ cardId: 'AA0001', viewerId: ADMIN })).join(' '))
      .not.toContain('multiData/profileMutations/');
  });

  it('legacy users не читає — лише посилання', () => {
    const legacy = buildProfileDataSources({ cardId: 'AA0001', viewerId: ADMIN })
      .filter(source => source.segments[0] === 'users' && !source.store);
    expect(legacy).toHaveLength(1);
    expect(legacy[0].linkOnly).toBe(true);
  });

  it('для акаунта додає його власні вузли — ліниво', () => {
    const uid = 'x'.repeat(28);
    const account = buildProfileDataSources({ cardId: uid, viewerId: ADMIN })
      .filter(source => source.group === 'account');
    expect(paths(account)).toEqual(expect.arrayContaining([
      `multiData/profileMutations/${uid}`,
      `multiData/favorites/${uid}`,
      `multiData/searchQueries/${uid}`,
    ]));
    expect(account.every(source => source.lazy)).toBe(true);
  });

  it('ключі searchId бере зі значень картки, разом з історією версій', () => {
    const sources = listSearchIdSourcesForRecord({ phone: ['380501112233', '380501112233'], surname: 'Іваненко' });
    expect(sources).toHaveLength(2);
    expect(sources.every(source => source.segments[0] === 'searchId')).toBe(true);
  });
});

describe('tree helpers', () => {
  it('зберігає тип значення', () => {
    expect(castTreeInput(5, '7')).toBe(7);
    expect(castTreeInput(true, 'false')).toBe(false);
    expect(castTreeInput('a', '7')).toBe('7');
  });

  it('пише й знімає вкладений ключ', () => {
    expect(setInTree({ a: { b: 1 } }, ['a', 'c'], 2)).toEqual({ a: { b: 1, c: 2 } });
    expect(removeFromTree({ a: { b: 1, c: 2 } }, ['a', 'b'])).toEqual({ a: { c: 2 } });
    expect(removeFromTree({ a: { b: 1 } }, ['a', 'b'])).toBeNull();
    expect(removeFromTree('x', [])).toBeNull();
  });
});
