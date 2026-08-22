import { getRoleCode, getRoleLabel } from './profileLayoutConfig';

describe('короткий код ролі на картці стрічки', () => {
  it('дає домовлені дві літери', () => {
    expect(getRoleCode('ed')).toBe('ED');
    expect(getRoleCode('sm')).toBe('SM');
    expect(getRoleCode('ip')).toBe('IP');
    expect(getRoleCode('ag')).toBe('AG');
    expect(getRoleCode('cl')).toBe('CL');
  });

  it('не залежить від регістру і пробілів у даних', () => {
    expect(getRoleCode(' Ed ')).toBe('ED');
    expect(getRoleCode('AG')).toBe('AG');
  });

  it('мовчить там, де ролі немає або вона невідома', () => {
    // Краще нічого, ніж позначка, яку нема як прочитати.
    expect(getRoleCode('')).toBe('');
    expect(getRoleCode(undefined)).toBe('');
    expect(getRoleCode('pp')).toBe('');
  });

  it('лишається підмножиною ролей, які має повний підпис', () => {
    // Код — це скорочення підпису, а не окремий словник: розійтись вони не можуть.
    ['ed', 'sm', 'ip', 'ag', 'cl'].forEach(role => {
      expect(getRoleLabel(role)).not.toBe('Profile');
    });
  });
});
