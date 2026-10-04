import { inputUpdateValue } from './inputUpdatedValue';

describe('«Бажана винагорода» — опис, а не число', () => {
  it('лишає текст і суми понад 9999', () => {
    expect(inputUpdateValue('від 15000 $, залежить від програми', { name: 'reward' }))
      .toBe('від 15000 $, залежить від програми');
  });

  it('зберігає перенос рядка', () => {
    expect(inputUpdateValue('1000 $\nплюс дорога', { name: 'reward' })).toBe('1000 $\nплюс дорога');
  });
});
