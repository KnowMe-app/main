import { isNameLikeQuery, listNameVariants, NAME_VARIANT_LIMIT } from 'utils/nameVariants';

describe('nameVariants', () => {
  it('латиниця знаходить кириличне імʼя з мʼяким знаком — через словник', () => {
    expect(listNameVariants('Olga')).toEqual(expect.arrayContaining(['ольга', 'olha']));
  });

  it('українська й російська форми — одне імʼя', () => {
    expect(listNameVariants('Наталія')).toEqual(expect.arrayContaining(['наталья', 'natalia']));
    expect(listNameVariants('Юлия')).toEqual(expect.arrayContaining(['юлія', 'yulia']));
  });

  it('прізвище поза словником — транслітерацією туди й назад', () => {
    expect(listNameVariants('Коваленко')).toContain('kovalenko');
    expect(listNameVariants('Kovalenko')).toContain('коваленко');
    expect(listNameVariants('Шевченко')).toContain('shevchenko');
    expect(listNameVariants('Shevchenko')).toContain('шевченко');
  });

  it('на початку слова «я/ю/є» — ya/yu/ye, усередині — ia/iu/ie', () => {
    expect(listNameVariants('Ярема')).toContain('yarema');
    expect(listNameVariants('Марʼяна')).toContain('mariana');
  });

  it('контакт, число й змішане письмо варіантів не мають', () => {
    expect(listNameVariants('0501234567')).toEqual([]);
    expect(listNameVariants('olga@mail.com')).toEqual([]);
    expect(listNameVariants('Оlga')).toEqual([]); // кирилична «О»
    expect(listNameVariants('Ольга Петренко')).toEqual([]);
    expect(isNameLikeQuery('a')).toBe(false);
  });

  it('набране не повторюється, варіантів не більше стелі', () => {
    const variants = listNameVariants('ольга');
    expect(variants).not.toContain('ольга');
    expect(variants.length).toBeLessThanOrEqual(NAME_VARIANT_LIMIT);
  });
});
