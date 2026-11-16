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
