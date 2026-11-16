import { detectProgramCountryQuery, programMentionsCountry } from 'utils/programPlaceSearch';

describe('detectProgramCountryQuery', () => {
  it.each([
    ['Грузія', 'GE'], ['програми в Грузії', 'GE'], ['Georgia', 'GE'], ['Грузия', 'GE'],
    ['у Польщі', 'PL'], ['Кіпр', 'CY'], ['на Кіпрі', 'CY'], ['Мексиці', 'MX'], ['США', 'US'],
  ])('%s → %s', (query, code) => {
    expect(detectProgramCountryQuery(query)?.code || null).toBe(code);
  });

  it('імʼя, номер і місто — не країна', () => {
    expect(detectProgramCountryQuery('Ольга')).toBeNull();
    expect(detectProgramCountryQuery('0501234567')).toBeNull();
    expect(detectProgramCountryQuery('Київ')).toBeNull();
  });
});

describe('programMentionsCountry', () => {
  it('місце програми вільним текстом і в будь-якому відмінку', () => {
    expect(programMentionsCountry({ location: 'Тбілісі, Грузія; Київ' }, 'GE')).toBe(true);
    expect(programMentionsCountry({ location: 'Київ', note: 'Перенос у Грузії' }, 'GE')).toBe(true);
    expect(programMentionsCountry({ location: 'Batumi, Georgia' }, 'GE')).toBe(true);
    expect(programMentionsCountry({ location: 'Київ' }, 'GE')).toBe(false);
  });

  it('двобуквені аліаси не дають хибних збігів', () => {
    expect(programMentionsCountry({ location: 'Ukraine, Kyiv' }, 'GB')).toBe(false);
    expect(programMentionsCountry({ location: 'Cyprus' }, 'US')).toBe(false);
    expect(programMentionsCountry({ location: 'Cyprus' }, 'CY')).toBe(true);
  });
});

describe('programMentionsCountry — короткі назви у відмінку (ревʼю #3423)', () => {
  it.each([
    ['Програма в Чехії', 'CZ'], ['Перенос у Литві', 'LT'], ['Клініка в Індії', 'IN'],
  ])('%s → %s', (location, code) => {
    expect(programMentionsCountry({ location }, code)).toBe(true);
  });

  it('коротка основа не ловить чуже', () => {
    expect(programMentionsCountry({ location: 'Київ' }, 'US')).toBe(false);
  });
});

describe('programMentionsCountry — межі слів (ревʼю #3423)', () => {
  it('назва країни всередині чужого слова не рахується', () => {
    expect(programMentionsCountry({ location: 'Lausanne, Switzerland' }, 'US')).toBe(false);
    expect(programMentionsCountry({ location: 'Indiana, United States' }, 'IN')).toBe(false);
    expect(programMentionsCountry({ location: 'Indiana, United States' }, 'US')).toBe(true);
  });

  it('відмінок кириличної назви — так, латинська — лише цілим словом', () => {
    expect(programMentionsCountry({ location: 'на Кіпрі' }, 'CY')).toBe(true);
    expect(programMentionsCountry({ location: 'Перенос у Грузією' }, 'GE')).toBe(true);
    expect(programMentionsCountry({ location: 'Georgiana street' }, 'GE')).toBe(false);
  });
});

describe('programMentionsCountry — чергування приголосних (ревʼю #3423)', () => {
  it('«Мексиці» — це Мексика', () => {
    expect(programMentionsCountry({ location: 'Програма в Мексиці' }, 'MX')).toBe(true);
    expect(programMentionsCountry({ location: 'Мексика' }, 'MX')).toBe(true);
  });
});
