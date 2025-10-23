import {
  getReactionCategory,
  REACTION_FILTER_KEYS,
} from '../reactionCategory';

describe('getReactionCategory', () => {
  it('returns NONE for users without getInTouch', () => {
    expect(getReactionCategory({})).toBe(REACTION_FILTER_KEYS.NONE);
  });

  it('returns NONE for users with valid ISO getInTouch date', () => {
    expect(getReactionCategory({ getInTouch: '2024-05-20' })).toBe(
      REACTION_FILTER_KEYS.NONE,
    );
  });

  it('returns NONE for users with valid dotted getInTouch date', () => {
    expect(getReactionCategory({ getInTouch: '05.06.2024' })).toBe(
      REACTION_FILTER_KEYS.NONE,
    );
  });

  it('returns QUESTION for users with invalid getInTouch date', () => {
    expect(getReactionCategory({ getInTouch: 'someday' })).toBe(
      REACTION_FILTER_KEYS.QUESTION,
    );
  });

  it('returns SPECIAL_99 for special getInTouch values', () => {
    expect(getReactionCategory({ getInTouch: '9999-99-99' })).toBe(
      REACTION_FILTER_KEYS.SPECIAL_99,
    );
  });
});
