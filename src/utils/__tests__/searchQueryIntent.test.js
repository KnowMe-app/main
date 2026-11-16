import { detectSearchQueryIntent, resolveInflectedPlace } from 'utils/searchRoleIntent';

describe('resolveInflectedPlace', () => {
  it.each([
    ['Києва', 'Київ'], ['Києві', 'Київ'], ['Харкова', 'Харків'], ['Харкові', 'Харків'],
    ['Львова', 'Львів'], ['Одеси', 'Одеса'], ['Одесі', 'Одеса'], ['Дніпра', 'Дніпро'],
    ['Полтави', 'Полтава'], ['Вінниці', 'Вінниця'], ['Київ', 'Київ'],
  ])('%s → %s', (input, city) => {
    expect(resolveInflectedPlace(input)?.uk).toBe(city);
  });

  it('незнайоме слово — не місце', () => {
    expect(resolveInflectedPlace('Олена')).toBeNull();
    expect(resolveInflectedPlace('Марія')).toBeNull();
  });
});

describe('detectSearchQueryIntent', () => {
  it('роль і місто разом', () => {
    expect(detectSearchQueryIntent('Сурогатна мати Київ')).toEqual({ role: 'sm', place: expect.objectContaining({ uk: 'Київ' }) });
    expect(detectSearchQueryIntent('донорка з Харкова')).toEqual({ role: 'ed', place: expect.objectContaining({ uk: 'Харків' }) });
    expect(detectSearchQueryIntent('агенції у Львові')).toEqual({ role: 'ag', place: expect.objectContaining({ uk: 'Львів' }) });
    expect(detectSearchQueryIntent('Київ сурогатна мама')).toEqual({ role: 'sm', place: expect.objectContaining({ uk: 'Київ' }) });
  });

  it('сама роль — як і раніше, без місця', () => {
    expect(detectSearchQueryIntent('Сурогатна мати')).toEqual({ role: 'sm', place: null });
  });

  it('місце з прийменником без ролі', () => {
    expect(detectSearchQueryIntent('з Києва')).toEqual({ role: null, place: expect.objectContaining({ uk: 'Київ' }) });
  });

  it('імʼя з містом чи номер — пошук людини', () => {
    expect(detectSearchQueryIntent('Олена Київ')).toEqual({ role: null, place: null });
    expect(detectSearchQueryIntent('0501234567')).toEqual({ role: null, place: null });
    expect(detectSearchQueryIntent('Олена Сурогатна')).toEqual({ role: null, place: null });
  });
});

describe('detectSearchQueryIntent — вік і резус поруч із роллю', () => {
  it('вік: «до», діапазон, «від», «30+»', () => {
    expect(detectSearchQueryIntent('донорка до 30')).toEqual({ role: 'ed', place: null, age: ['le25', '26_30'] });
    expect(detectSearchQueryIntent('СМ 25-30 років')).toMatchObject({ role: 'sm', age: ['le25', '26_30'] });
    expect(detectSearchQueryIntent('сурогатна мама від 34')).toMatchObject({ role: 'sm', age: ['34_36', '37_plus'] });
    expect(detectSearchQueryIntent('донорка 31+')).toMatchObject({ role: 'ed', age: ['31_33', '34_36', '37_plus'] });
  });

  it('резус словами й буквою групи крові', () => {
    expect(detectSearchQueryIntent('донор резус негативний')).toMatchObject({ role: 'ed', rh: '-' });
    expect(detectSearchQueryIntent('сурогатна мама O-')).toMatchObject({ role: 'sm', rh: '-' });
    expect(detectSearchQueryIntent('донорка rh+')).toMatchObject({ role: 'ed', rh: '+' });
  });

  it('усе разом: роль, місто, вік і резус', () => {
    expect(detectSearchQueryIntent('донорка з Києва до 30 резус негативний')).toEqual({
      role: 'ed', place: expect.objectContaining({ uk: 'Київ' }), age: ['le25', '26_30'], rh: '-',
    });
  });

  it('без ролі вік і резус наміру не дають: це пошук людини чи номера', () => {
    expect(detectSearchQueryIntent('Олена до 30')).toEqual({ role: null, place: null });
    expect(detectSearchQueryIntent('до 30')).toEqual({ role: null, place: null });
    expect(detectSearchQueryIntent('0501234567')).toEqual({ role: null, place: null });
  });
});
