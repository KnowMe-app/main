import { formatDate } from './inputValidations';

/**
 * Поле дати форматує значення на кожен символ — тож перевіряємо саме набір
 * посимвольно, як його робить людина. Поки маска знімала крапки й різала
 * цифри по дві, «1.5.1995» без нулів ставало «15.19.95» і так ішло в базу.
 */
const typeInto = (text, option) => [...text].reduce((value, char) => formatDate(value + char, option), '');

describe('formatDate: набір дати посимвольно', () => {
  it('крапка, набрана людиною, лишається межею частини', () => {
    expect(typeInto('1.5.1995', true)).toBe('01.05.1995');
    expect(typeInto('12.5.2019', true)).toBe('12.05.2019');
    expect(typeInto('1/5/1995', true)).toBe('01.05.1995');
  });

  it('недонабрана дата з роздільниками не перекручується', () => {
    expect(typeInto('1.', true)).toBe('1.');
    expect(typeInto('1.5', true)).toBe('1.5');
    expect(typeInto('1.5.19', true)).toBe('1.5.19');
  });

  it('суцільні цифри, як і раніше, дістають крапки самі', () => {
    expect(typeInto('01051995', true)).toBe('01.05.1995');
  });
});
