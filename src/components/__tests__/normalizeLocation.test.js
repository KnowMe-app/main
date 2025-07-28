const {
  normalizeLocation,
  normalizeRegion,
  normalizeCountry,
} = require('../normalizeLocation');

test('normalizeLocation trims parts and adds oblast if needed', () => {
  const input = 'Харьковская , Слобожанське ';
  const output = normalizeLocation(input);
  expect(output).toBe('Харьковская область, Слобожанське');
});

test('normalizeRegion adds oblast to known region names', () => {
  expect(normalizeRegion('  Київська')).toBe('Київська область');
  expect(normalizeRegion('Львівська область')).toBe('Львівська область');
});

test('normalizeCountry converts Russian Ukraina to Ukrainian', () => {
  expect(normalizeCountry(' \u0423\u043a\u0440\u0430\u0438\u043d\u0430 ')).toBe(
    '\u0423\u043a\u0440\u0430\u0457\u043d\u0430',
  );
  expect(normalizeCountry('\u0423\u043a\u0440\u0430\u0457\u043d\u0430')).toBe(
    '\u0423\u043a\u0440\u0430\u0457\u043d\u0430',
  );
});
