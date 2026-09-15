import { formatDateTime } from '../formatDateTime';

/**
 * Дата й час ідуть тією ж мовою, що й підпис поруч.
 *
 * `toLocaleString('uk-UA')` стояло жорстко в кожному місці, де екран називає
 * час, — і поруч з англійським «Updated» стояв український формат.
 */
describe('дата мовою інтерфейсу', () => {
  const stamp = Date.UTC(2026, 8, 15, 10, 5);

  it('порожнє значення не стає ані датою, ані «Invalid Date»', () => {
    expect(formatDateTime(null, 'uk')).toBe('');
    expect(formatDateTime('', 'uk')).toBe('');
    expect(formatDateTime('не дата', 'uk')).toBe('');
  });

  it('обидві мови дають ту саму мить у своєму форматі', () => {
    const uk = formatDateTime(stamp, 'uk');
    const en = formatDateTime(stamp, 'en');

    expect(uk).toContain('2026');
    expect(en).toContain('2026');
    expect(uk).toBe(new Date(stamp).toLocaleString('uk-UA'));
    expect(en).toBe(new Date(stamp).toLocaleString('en-GB'));
  });
});
