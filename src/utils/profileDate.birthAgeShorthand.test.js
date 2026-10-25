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

describe('resolveLastDeliveryFromShorthand', () => {
  const { resolveLastDeliveryFromShorthand } = require('./profileDate');
  const now = new Date(2026, 9, 25);

  it.each([
    ['14т', '19.07.2026'],
    ['14 t', '19.07.2026'],
    ['5м', '25.05.2026'],
    ['2р', '25.10.2024'],
    ['2y', '25.10.2024'],
    ['14р', '25.10.2012'],
  ])('reads %p as delivery date', (input, expected) => {
    expect(resolveLastDeliveryFromShorthand(input, now)).toBe(expected);
  });

  it('clamps month overflow', () => {
    expect(resolveLastDeliveryFromShorthand('3м', new Date(2026, 4, 31))).toBe('28.02.2026');
  });

  it.each(['', '0м', '15р', '30р', '2', '2+', 'кс2'])('leaves %p untouched', input => {
    expect(resolveLastDeliveryFromShorthand(input, now)).toBe('');
  });
});
