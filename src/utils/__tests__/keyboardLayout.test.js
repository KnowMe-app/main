import { suggestLayoutFix } from 'utils/keyboardLayout';

describe('suggestLayoutFix', () => {
  it('імʼя, набране латинською розкладкою, стає кириличним', () => {
    expect(suggestLayoutFix('Jkmuf')).toBe('Ольга');
    expect(suggestLayoutFix('Rjdfktyrj')).toBe('Коваленко');
    expect(suggestLayoutFix('Jktyf Rjdfktyrj')).toBe('Олена Коваленко');
  });

  it('нік, набраний кириличною розкладкою, стає латинським', () => {
    expect(suggestLayoutFix('щдпф')).toBe('olga');
  });

  it('справжнє слово своєю мовою не перемикає', () => {
    expect(suggestLayoutFix('Smith')).toBe('');
    expect(suggestLayoutFix('Olga')).toBe('');
    expect(suggestLayoutFix('Ольга')).toBe('');
    expect(suggestLayoutFix('Коваленко')).toBe('');
  });

  it('контакт, число, змішане письмо — без підказки', () => {
    expect(suggestLayoutFix('0501234567')).toBe('');
    expect(suggestLayoutFix('olga@mail.com')).toBe('');
    expect(suggestLayoutFix('Оlga')).toBe('');
    expect(suggestLayoutFix('ab')).toBe('');
  });
});
