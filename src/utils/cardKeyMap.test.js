import { buildFullCardKeyMap } from './cardKeyMap';

describe('buildFullCardKeyMap', () => {
  it('collects all nested keys from every card and reports their source collections', () => {
    const result = buildFullCardKeyMap({
      users: {
        one: { name: 'Anna', contacts: { phone: '1' }, children: [{ name: 'Eva' }] },
        two: { name: 'Bob', contacts: { email: 'b@example.com' } },
      },
      newUsers: {
        three: { status: 'new', children: [{ birth: { year: 2020 } }] },
      },
    });

    expect(result.totalCards).toBe(3);
    expect(result.cardsByCollection).toEqual({ users: 2, newUsers: 1 });
    expect(result.keys).toEqual(expect.arrayContaining([
      'name',
      'contacts.phone',
      'contacts.email',
      'children',
      'children[].name',
      'children[].birth.year',
      'status',
    ]));
    expect(result.keysByCollection.users).toContain('contacts.email');
    expect(result.keysByCollection.newUsers).not.toContain('contacts.email');
    expect(result.totalKeys).toBe(result.keys.length);
  });

  it('can build a map from only one available collection', () => {
    const result = buildFullCardKeyMap({ users: { one: { name: 'Anna' } }, newUsers: null });

    expect(result.totalCards).toBe(1);
    expect(result.keys).toEqual(['name']);
    expect(result.keysByCollection).toEqual({ users: ['name'] });
  });
});
