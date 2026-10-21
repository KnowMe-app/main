import { keepNotesForIds, mergeNotes } from './commentsStateMerge';

describe('commentsStateMerge', () => {
  it('keeps the same object when every note is still shown', () => {
    const prev = { a: 'x', b: ['y'] };
    expect(keepNotesForIds(prev, ['a', 'b', 'c'])).toBe(prev);
  });

  it('drops notes of cards that left the deck', () => {
    expect(keepNotesForIds({ a: 'x', b: 'y' }, ['a'])).toEqual({ a: 'x' });
  });

  it('keeps the same object when a merge brings nothing new', () => {
    const prev = { a: 'x', b: ['y', 'z'] };
    expect(mergeNotes(prev, { a: 'x', b: ['y', 'z'] })).toBe(prev);
  });

  it('returns a new object when a note changed', () => {
    const prev = { a: 'x' };
    const next = mergeNotes(prev, { a: 'x2', b: [] });
    expect(next).not.toBe(prev);
    expect(next).toEqual({ a: 'x2', b: [] });
  });
});
