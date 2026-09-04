import { getCurrentValue, hasCurrentValue } from './getCurrentValue';

/*
 * Масив у полі анкети — це історія, а не набір значень.
 *
 * Людина ввела телефон, потім стерла його: у вузлі лишається
 * `['+380...', '']`. У своїй анкеті вона бачить порожнє поле й очікує, що
 * порожнє воно й для інших. Поки резолвер пропускав порожні версії з кінця,
 * стрічка показувала попередній запис — тобто те, що людина вже стерла.
 */
describe('поточне значення — останнє, а не останнє непорожнє', () => {
  it('скаляр віддається як є', () => {
    expect(getCurrentValue('+380501112233')).toBe('+380501112233');
    expect(getCurrentValue(0)).toBe(0);
    expect(getCurrentValue(false)).toBe(false);
    expect(getCurrentValue(undefined)).toBeUndefined();
  });

  it('з масиву версій бере останню', () => {
    expect(getCurrentValue(['+380501112233', '+380671112233'])).toBe('+380671112233');
    expect(getCurrentValue(['Оксана', 'Ксенія'])).toBe('Ксенія');
  });

  it('порожня остання версія означає «немає»', () => {
    expect(getCurrentValue(['+380501112233', ''])).toBeUndefined();
    expect(getCurrentValue(['Оксана', '   '])).toBeUndefined();
    expect(getCurrentValue(['a', 'b', ''])).toBeUndefined();
    expect(getCurrentValue([])).toBeUndefined();
  });

  // `null` усередині масиву — це пропущений індекс, яким SDK добиває дірки в
  // даних бази, а не стирання: стирання людина пише порожнім рядком.
  it('дірку в масиві пропускає, а на порожньому рядку зупиняється', () => {
    expect(getCurrentValue(['Прізвище', null])).toBe('Прізвище');
    expect(getCurrentValue(['Прізвище', undefined])).toBe('Прізвище');
    expect(getCurrentValue(['Прізвище', '', null])).toBeUndefined();
    expect(getCurrentValue([null, 'Прізвище'])).toBe('Прізвище');
  });

  // RTDB віддає масив з дірками обʼєктом із числовими ключами — це той самий
  // масив версій, і правило для нього те саме.
  it('впізнає масив, який база віддала обʼєктом', () => {
    expect(getCurrentValue({ 0: '+380501112233', 1: '+380671112233' })).toBe('+380671112233');
    expect(getCurrentValue({ 0: '+380501112233', 1: '' })).toBeUndefined();
    // Порядок ключів у відповіді бази не гарантований — вирішує номер версії.
    expect(getCurrentValue({ 10: 'десята', 2: 'друга' })).toBe('десята');
  });

  // Обʼєкт з іменованими ключами — це мапа полів, а не історія: «останнього»
  // в ній немає, тож лишається старий обхід.
  it('мапу полів історією не вважає', () => {
    expect(getCurrentValue({ main: 'Оксана', extra: '' })).toBe('Оксана');
  });

  it('вкладену історію розгортає тим самим правилом', () => {
    expect(getCurrentValue([['a', 'b'], ['c', 'd']])).toBe('d');
    expect(getCurrentValue([['a', 'b'], ['c', '']])).toBeUndefined();
  });

  it('hasCurrentValue питає рівно про поточне значення', () => {
    expect(hasCurrentValue(['+380501112233', ''])).toBe(false);
    expect(hasCurrentValue(['', '+380501112233'])).toBe(true);
    expect(hasCurrentValue('')).toBe(false);
    expect(hasCurrentValue(0)).toBe(true);
  });
});
