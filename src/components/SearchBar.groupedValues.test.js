import { parseGroupedSearchValues } from './SearchBar';

// Список у квадратних дужках — кілька запитів. Кома їх ділить; пробілом список
// ділиться лише тоді, коли коми немає зовсім.
describe('список запитів у дужках', () => {
  it('ділить комою, а не кожним пробілом', () => {
    expect(parseGroupedSearchValues('[УК СМ Невідомо, 30.10.2025]')).toEqual(['УК СМ Невідомо', '30.10.2025']);
    expect(parseGroupedSearchValues('[Анна Коваль; 380501112233]')).toEqual(['Анна Коваль', '380501112233']);
  });

  it('без коми ділить пробілом, як і досі', () => {
    expect(parseGroupedSearchValues('[380501112233 380671112233]')).toEqual(['380501112233', '380671112233']);
    expect(parseGroupedSearchValues('["Анна Коваль" 380501112233]')).toEqual(['Анна Коваль', '380501112233']);
  });

  it('зберігає цитовані значення після роздільника з пробілом', () => {
    expect(parseGroupedSearchValues('[foo, "Anna Kowal"]')).toEqual(['foo', 'Anna Kowal']);
    expect(parseGroupedSearchValues('[foo; "Anna, Kowal"]')).toEqual(['foo', 'Anna, Kowal']);
  });

  it('рядок без дужок списком не є', () => {
    expect(parseGroupedSearchValues('УК СМ Невідомо 30.10.2025')).toEqual([]);
  });
});
