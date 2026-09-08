import { formatDeliveryRecency, monthsSinceDate } from '../deliveryRecency';

const NOW = new Date(2026, 8, 8); // 8 вересня 2026

describe('monthsSinceDate', () => {
  it('рахує повні місяці, а не різницю номерів місяця', () => {
    // 20 липня → 8 вересня: два місяці ще не минуло.
    expect(monthsSinceDate('20.07.2026', NOW)).toBe(1);
    expect(monthsSinceDate('2026-07-08', NOW)).toBe(2);
  });

  it('читає обидва написання дати', () => {
    expect(monthsSinceDate('19.07.2024', NOW)).toBe(25);
    expect(monthsSinceDate('2024-07-19', NOW)).toBe(25);
  });

  it('мовчить про нечитабельну і про майбутню дату', () => {
    expect(monthsSinceDate('', NOW)).toBeNull();
    expect(monthsSinceDate('колись', NOW)).toBeNull();
    // Описка в анкеті не має друкуватись відʼємним числом.
    expect(monthsSinceDate('01.01.2030', NOW)).toBeNull();
  });
});

describe('formatDeliveryRecency', () => {
  it('до двох років рахує місяцями', () => {
    expect(formatDeliveryRecency('08.06.2026', 'uk', NOW)).toBe('3 міс');
    expect(formatDeliveryRecency('08.06.2026', 'en', NOW)).toBe('3 mo');
    expect(formatDeliveryRecency('08.10.2024', 'uk', NOW)).toBe('23 міс');
  });

  it('після двох років — роками, донизу', () => {
    // 25 місяців — це ще два роки, а не три.
    expect(formatDeliveryRecency('19.07.2024', 'uk', NOW)).toBe('2 роки');
    expect(formatDeliveryRecency('19.07.2024', 'en', NOW)).toBe('2 years');
    expect(formatDeliveryRecency('01.01.2021', 'uk', NOW)).toBe('5 років');
    expect(formatDeliveryRecency('01.01.2015', 'uk', NOW)).toBe('11 років');
  });

  it('свіжі пологи не стають нулем', () => {
    expect(formatDeliveryRecency('01.09.2026', 'uk', NOW)).toBe('<1 міс');
  });

  it('порожнє значення нічого не малює', () => {
    expect(formatDeliveryRecency('', 'uk', NOW)).toBe('');
  });
});
