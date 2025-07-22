const { normalizeLocation, normalizeRegion } = require('../normalizeLocation');

test('normalizeLocation trims parts and adds oblast if needed', () => {
  const input = 'Харьковская , Слобожанське ';
  const output = normalizeLocation(input);
  expect(output).toBe('Харьковская область, Слобожанське');
});

test('normalizeRegion adds oblast to known region names', () => {
  expect(normalizeRegion('  Київська')).toBe('Київська область');
  expect(normalizeRegion('Львівська область')).toBe('Львівська область');
});
