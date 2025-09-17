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
      contactValues: ['УКСМАннаМарія'],
      name: 'Анна',
      surname: 'Марія',
      handle: null,
      searchPair: { telegram: 'УКСМАннаМарія' },
    });
  });

  it('parses trigger with handle and names', () => {
    const result = parseUkTriggerQuery('   УК СМ   Анна  Марія   @anna_user ');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: ['УКСМАннаМарія@anna_user', 'anna_user'],
      name: 'Анна',
      surname: 'Марія',
      handle: 'anna_user',
      searchPair: { telegram: 'УКСМАннаМарія@anna_user' },
    });
  });

  it('parses trigger with handle but without names', () => {
    const result = parseUkTriggerQuery('УК СМ @just_nickname');
    expect(result).toEqual({
      contactType: 'telegram',
      contactValues: ['УКСМ@just_nickname', 'just_nickname'],
      name: '',
      surname: '',
      handle: 'just_nickname',
      searchPair: { telegram: 'УКСМ@just_nickname' },
    });
  });

  it('supports other triggers (УК ІР, УК IP, УК ДО)', () => {
    expect(parseUkTriggerQuery('УК ІР Іван @ivan').searchPair.telegram).toBe('УКІРІван@ivan');
    expect(parseUkTriggerQuery('УК IP Петро').searchPair.telegram).toBe('УКIPПетро');
    expect(parseUkTriggerQuery('УК ДО Марія').searchPair.telegram).toBe('УКДОМарія');
  });
});
