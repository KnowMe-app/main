import { flattenOwnerValueToString } from '../ownerValueString';

/*
 * На `multiData/getInTouch/$ownerId/$userId` і `multiData/writer/$ownerId/$userId`
 * стоїть `.validate: newData.isString()`. Масив звідти вертається як
 * PERMISSION_DENIED — тим самим кодом, що й відсутній дозвіл, — тож зводити до
 * рядка треба до запису, а не розбиратись потім по відмові.
 */
describe('поля власника зводяться до рядка', () => {
  it('масив кодів стає тим самим рядком, який пише форма картки', () => {
    // Форма збирає `writer` через `updatedCodes.join(', ')`; у старих анкетах
    // туди подекуди записався сам масив, без `join`.
    expect(flattenOwnerValueToString(['Ig', 'Ik'])).toBe('Ig, Ik');
    expect(flattenOwnerValueToString('Т, Ik, ')).toBe('Т, Ik, ');
  });

  it('порожні елементи відкидаються, а не стають комами', () => {
    expect(flattenOwnerValueToString(['Т', '', 'Ik'])).toBe('Т, Ik');
    expect(flattenOwnerValueToString(['V', ''])).toBe('V');
  });

  it('обʼєкт із числовими ключами читається як масив із дірками', () => {
    // Саме так RTDB повертає масив, усередині якого був `null`: порядок дають
    // ключі, а не вставка.
    expect(flattenOwnerValueToString({ 0: 'Т', 2: 'Ik' })).toBe('Т, Ik');
    expect(flattenOwnerValueToString({ 10: 'б', 2: 'а' })).toBe('а, б');
  });
});
