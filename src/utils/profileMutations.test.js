import { buildProfileSearchIndexKeys, getEffectiveProfile } from './profileMutations';

jest.mock('components/config', () => ({ database: {} }));

describe('profile mutations', () => {
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

  it('builds normalized search index candidates for accepted profile data', () => {
    expect([...buildProfileSearchIndexKeys({
      name: 'Anna Maria',
      email: 'ANNA@example.com',
      phone: '050 123 45 67',
    })]).toEqual(expect.arrayContaining([
      'name_anna_space_maria',
      'name_annamaria',
      'email_anna_at_example_dot_com',
      'phone_380501234567',
    ]));
  });
});
