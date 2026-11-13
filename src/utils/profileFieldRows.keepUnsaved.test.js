import { appendEmptyFieldRow, keepUnsavedFieldRows } from './profileFieldRows';

describe('keepUnsavedFieldRows', () => {
  it('keeps a row added with "+" when the profile is reloaded from the backend', () => {
    const current = { userId: 'u1', birth: appendEmptyFieldRow('1986-01-01'), name: 'Валентина' };
    const fresh = { userId: 'u1', birth: '1986-01-01', name: 'Валентина', rev: 2 };
    expect(keepUnsavedFieldRows(current, fresh)).toEqual({
      userId: 'u1', birth: ['1986-01-01', undefined], name: 'Валентина', rev: 2,
    });
  });

  it('keeps the row on top of a backend array and survives the cache null', () => {
    const current = { userId: 'u1', telegram: ['a', 'b', null] };
    const fresh = { userId: 'u1', telegram: ['a', 'b', 'c'] };
    expect(keepUnsavedFieldRows(current, fresh).telegram).toEqual(['a', 'b', 'c', undefined]);
  });

  it('trusts the backend for saved erasures and other cards', () => {
    expect(keepUnsavedFieldRows({ userId: 'u1', birth: ['x', ''] }, { userId: 'u1', birth: 'x' }))
      .toEqual({ userId: 'u1', birth: 'x' });
    const fresh = { userId: 'u2', birth: 'x' };
    expect(keepUnsavedFieldRows({ userId: 'u1', birth: ['x', undefined] }, fresh)).toBe(fresh);
  });
});
