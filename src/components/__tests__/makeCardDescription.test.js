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
  expect(parts.length).toBe(8);
  expect(parts[0]).toBe('1. 2-2023');
  expect(parts[1]).toBe('2. Kyivska, Kyiv');
  expect(parts[7]).toBe('8. Jane Doe Petrovna');
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
    '2. ?',
    '3. ?',
    '4. ?',
    '5. 0555555555',
    '6. John Smith',
  ]);
});

test('makeCardDescription normalizes location', () => {
  const user = {
    region: 'Дніпропетровська ',
    city: "Кам'янське",
  };

  const description = makeCardDescription(user);
  expect(description.startsWith("1. Дніпропетровська область, Кам'янське")).toBe(
    true
  );
});
