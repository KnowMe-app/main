import {
  isCardFullyReacted,
  listUnreactedAnketaRoles,
  reactionCoversAnketa,
  removeAnketaFromReactionValue,
  toggleAnketaReactionValue,
} from './anketaReactions';

const donorAgent = { userId: 'x', role: ['ed', 'ag'] };
const donor = { userId: 'd', role: 'ed' };

describe('реакція на анкету', () => {
  it('старе значення — людина цілком', () => {
    expect(reactionCoversAnketa(true, 'ed')).toBe(true);
    expect(reactionCoversAnketa(1712000000000, 'ag')).toBe(true);
    expect(reactionCoversAnketa('ed', 'ag')).toBe(false);
    expect(reactionCoversAnketa('ed', 'ed')).toBe(true);
    expect(reactionCoversAnketa('ed', '')).toBe(true);
  });

  it('лайк донорської анкети не лайкає агентську', () => {
    const value = toggleAnketaReactionValue({ value: undefined, anketaRole: 'ed', cardRoles: ['ed', 'ag'], fullValue: true });
    expect(value).toBe('ed');
    expect(toggleAnketaReactionValue({ value, anketaRole: 'ag', cardRoles: ['ed', 'ag'], fullValue: true })).toBe(true);
    expect(toggleAnketaReactionValue({ value, anketaRole: 'ed', cardRoles: ['ed', 'ag'], fullValue: true })).toBeUndefined();
    expect(toggleAnketaReactionValue({ value: true, anketaRole: 'ag', cardRoles: ['ed', 'ag'], fullValue: true })).toBe('ed');
  });

  it('лайк знімає дизлайк лише тієї самої анкети', () => {
    expect(removeAnketaFromReactionValue({ value: 123, anketaRole: 'ed', cardRoles: ['ed', 'ag'] })).toBe('ag');
    expect(removeAnketaFromReactionValue({ value: 'ag', anketaRole: 'ed', cardRoles: ['ed', 'ag'] })).toBe('ag');
    expect(removeAnketaFromReactionValue({ value: 'ed', anketaRole: 'ed', cardRoles: ['ed', 'ag'] })).toBeUndefined();
  });

  it('картка лишається в деці, доки є невирішена анкета', () => {
    expect(listUnreactedAnketaRoles(donorAgent, { x: 'ed' }, {})).toEqual(['ag']);
    expect(isCardFullyReacted(donorAgent, { x: 'ed' }, {})).toBe(false);
    expect(isCardFullyReacted(donorAgent, { x: 'ed' }, { x: 'ag' })).toBe(true);
    // Донорці донорська анкета й так схована.
    expect(isCardFullyReacted(donorAgent, { x: 'ag' }, {}, ['ed'])).toBe(true);
    expect(isCardFullyReacted(donor, { d: true }, {})).toBe(true);
    expect(isCardFullyReacted(donor, {}, {})).toBe(false);
  });
});
