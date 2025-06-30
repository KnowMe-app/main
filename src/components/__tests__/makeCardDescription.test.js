const { makeCardDescription } = require('../makeCardDescription');

test('makeCardDescription returns enumerated description with literal \\n', () => {
  const user = {
    ownKids: '2',
    lastDelivery: '2023',
    region: 'Kyivska',
    city: 'Kyiv',
    birth: '1990',
    maritalStatus: 'Married',
    csection: 'не було',
    height: '170',
    weight: '60',
    lastCycle: '2024-05-01',
    phone: ['+380123456789', '380987654321'],
    surname: 'Doe',
    name: 'Jane',
    fathersname: 'Petrovna',
  };

  const description = makeCardDescription(user);
  const parts = description.split('\\n');
  expect(parts.length).toBe(9);
  expect(parts[0]).toBe('1. 2-2023');
  expect(parts[1]).toBe('2. Kyivska, Kyiv');
  expect(parts[8]).toBe('9. Doe Jane Petrovna');
});

test('makeCardDescription skips empty fields and enumerates correctly', () => {
  const user = {
    region: 'Lvivska',
    phone: '+380555555555',
    surname: 'Smith',
    name: 'John',
  };

  const description = makeCardDescription(user);
  const parts = description.split('\\n');
  expect(parts).toEqual([
    '1. Lvivska',
    '2. не було',
    '3. 0555555555',
    '4. Smith John',
  ]);
});
