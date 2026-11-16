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
