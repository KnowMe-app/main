import { resolveBirthDateFromAgeShorthand } from './profileDate';

describe('resolveBirthDateFromAgeShorthand', () => {
  const now = new Date(2026, 9, 25);

  it.each(['30р', '30 р', '30р.', '30', '30 років', '30y', ' 30Р '])('reads %p as age', input => {
    expect(resolveBirthDateFromAgeShorthand(input, now)).toBe('01.01.1996');
  });

  it.each(['', '01.01.1996', '1996-01-01', '300р', '5р', '95р', '30м', 'abc'])('leaves %p untouched', input => {
    expect(resolveBirthDateFromAgeShorthand(input, now)).toBe('');
  });
});
