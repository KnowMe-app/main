import {
  parseMultiDataAccessUserIds,
  resolveMatchingMultiDataOwnerIds,
} from '../multiDataAccess';

describe('multiDataAccess', () => {
  it('parses array, object, and delimited multiDataAccessUserIds values', () => {
    expect(parseMultiDataAccessUserIds(['ownerA', '', ' ownerB '])).toEqual(['ownerA', 'ownerB']);
    expect(parseMultiDataAccessUserIds({ ownerA: true, ownerB: false, alias: 'ownerC' })).toEqual(['ownerA', 'ownerC']);
    expect(parseMultiDataAccessUserIds('ownerA, ownerB;ownerC ownerD')).toEqual([
      'ownerA',
      'ownerB',
      'ownerC',
      'ownerD',
    ]);
  });

  it('resolves the viewer plus shared owner ids for Matching reads', () => {
    expect(
      resolveMatchingMultiDataOwnerIds({
        viewerId: 'viewer',
        profile: { multiDataAccessUserIds: ['sharedOwner', 'viewer', 'sharedOwner'] },
      })
    ).toEqual(['viewer', 'sharedOwner']);
  });
});
