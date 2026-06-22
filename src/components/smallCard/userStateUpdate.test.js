import { markUserPendingRemove, updateUserInState } from './userStateUpdate';

describe('userStateUpdate', () => {
  it('updates one user in an array without changing other cards', () => {
    const prev = [
      { userId: 'a', writer: 'old' },
      { userId: 'b', writer: 'keep' },
    ];

    expect(updateUserInState(prev, 'a', user => ({ ...user, writer: 'new' }))).toEqual([
      { userId: 'a', writer: 'new' },
      { userId: 'b', writer: 'keep' },
    ]);
  });

  it('updates one user in an id-keyed map', () => {
    const prev = {
      a: { userId: 'a', role: 'ip' },
      b: { userId: 'b', role: 'pp' },
    };

    expect(updateUserInState(prev, 'b', user => ({ ...user, role: 'ed' }))).toEqual({
      a: { userId: 'a', role: 'ip' },
      b: { userId: 'b', role: 'ed' },
    });
  });

  it('updates a single card object', () => {
    const prev = { userId: 'a', myComment: 'old' };

    expect(updateUserInState(prev, 'a', user => ({ ...user, myComment: 'new' }))).toEqual({
      userId: 'a',
      myComment: 'new',
    });
  });

  it('marks the matching user as pending removal in arrays', () => {
    expect(markUserPendingRemove([{ userId: 'a' }, { userId: 'b' }], 'b')).toEqual([
      { userId: 'a' },
      { userId: 'b', _pendingRemove: true },
    ]);
  });
});
