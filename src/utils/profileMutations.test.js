import { getEffectiveProfile } from './profileMutations';

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
});
