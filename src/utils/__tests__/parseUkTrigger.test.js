import { parseUkTriggerQuery } from '../../utils/parseUkTrigger';

describe('parseUkTriggerQuery', () => {
  it('returns null when trigger is missing', () => {
    expect(parseUkTriggerQuery('Просто текст')).toBeNull();
    expect(parseUkTriggerQuery('')).toBeNull();
    expect(parseUkTriggerQuery(null)).toBeNull();
  });

  it('parses trigger without handle', () => {
    const result = parseUkTriggerQuery('УК СМ Анна Марія');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: 'УК СМ Анна Марія',
      name: 'Анна',
      surname: 'Марія',
      handle: null,
      searchPair: { telegram: 'УК СМ Анна Марія' },
    });
  });

  it('parses trigger with handle and names', () => {
    const result = parseUkTriggerQuery('   УК СМ   Анна  Марія   @anna_user ');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: ['УК СМ Анна Марія @anna_user', 'anna_user'],
      name: 'Анна',
      surname: 'Марія',
      handle: 'anna_user',
      searchPair: { telegram: 'УК СМ Анна Марія @anna_user' },
    });
  });

  it('parses trigger with handle but without names', () => {
    const result = parseUkTriggerQuery('УК СМ @just_nickname');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: ['УК СМ @just_nickname', 'just_nickname'],
      name: '',
      handle: 'just_nickname',
      searchPair: { telegram: 'УК СМ @just_nickname' },
    });
  });

  it('supports other triggers (УК ІР, УК IP, УК ДО)', () => {
    expect(parseUkTriggerQuery('УК ІР Іван @ivan').searchPair.telegram).toBe(
      'УК ІР Іван @ivan',
    );
    expect(parseUkTriggerQuery('УК IP Петро').searchPair.telegram).toBe(
      'УК IP Петро',
    );
    expect(parseUkTriggerQuery('УК ДО Марія').searchPair.telegram).toBe(
      'УК ДО Марія',
    );
  });

  it('parses УК Агент trigger without handle', () => {
    const result = parseUkTriggerQuery('УК Агент Надія Сидоренко');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: 'УК АГЕНТ Надія Сидоренко',
      name: 'Надія',
      surname: 'Сидоренко',
      handle: null,
      searchPair: { telegram: 'УК АГЕНТ Надія Сидоренко' },
    });
  });

  it('parses УК Агент trigger with handle', () => {
    const result = parseUkTriggerQuery('УК агент  Надія  @nadia_agent');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: ['УК АГЕНТ Надія @nadia_agent', 'nadia_agent'],
      name: 'Надія',
      handle: 'nadia_agent',
      searchPair: { telegram: 'УК АГЕНТ Надія @nadia_agent' },
    });
  });

  // Дата — частина цього самого контакту, а не прізвище: картка заводилась з
  // `surname: '30.10.2025'`.
  it('не робить дату прізвищем', () => {
    const result = parseUkTriggerQuery('УК СМ Невідомо 30.10.2025');
    expect(result.name).toBe('Невідомо');
    expect(result.surname).toBeUndefined();
    // Шукається й заводиться контакт одним рядком — разом із датою.
    expect(result.searchPair.telegram).toBe('УК СМ Невідомо 30.10.2025');

    const withSurname = parseUkTriggerQuery('УК СМ Анна Коваль 2025-10-30');
    expect(withSurname.name).toBe('Анна');
    expect(withSurname.surname).toBe('Коваль');
  });
});

