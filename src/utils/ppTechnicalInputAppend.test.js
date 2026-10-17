import { appendFieldValue, appendTextBlockValue } from './ppTechnicalInputAppend';

describe('appendFieldValue', () => {
  it('не дописує номер, який уже стоїть скаляром, навіть у іншому записі', () => {
    expect(appendFieldValue('+380738663086', '380738663086', 'phone')).toBe('+380738663086');
    expect(appendFieldValue('380738663086', '380738663086', 'phone')).toBe('380738663086');
  });

  it('не дописує значення, яке вже лежить у будь-якому елементі масиву', () => {
    const current = ['380501112233', '380738663086', '380671234567'];
    expect(appendFieldValue(current, '380738663086', 'phone')).toBe(current);
    expect(appendFieldValue(['anna_old', 'anna_smmm'], '@Anna_Smmm', 'telegram')).toEqual(['anna_old', 'anna_smmm']);
  });

  it('дописує нове значення версією', () => {
    expect(appendFieldValue('380501112233', '380738663086', 'phone')).toEqual(['380501112233', '380738663086']);
    expect(appendFieldValue(['a'], 'b', 'telegram')).toEqual(['a', 'b']);
    expect(appendFieldValue('', 'Анна', 'name')).toBe('Анна');
  });

  it('повертає стерте значення поточним', () => {
    expect(appendFieldValue(['380738663086', ''], '380738663086', 'phone')).toEqual(['380738663086', '', '380738663086']);
  });
});

describe('appendTextBlockValue', () => {
  it('не дописує той самий блок нотатки вдруге', () => {
    const note = '🔏Досвід у програмі: 1.\n🔏Пологи: 2.';
    expect(appendTextBlockValue(note, note)).toBe(note);
    expect(appendTextBlockValue(`Стара нотатка\n${note}`, note)).toBe(`Стара нотатка\n${note}`);
  });

  it('дописує новий блок', () => {
    expect(appendTextBlockValue('a', 'b')).toBe('a\nb');
  });
});
