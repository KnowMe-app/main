import { hasCurrentValue } from '../components/getCurrentValue';

/*
 * Чи лишилось у чернетці бодай одне заповнене поле.
 *
 * «Очистити все» у формі чернетки не видаляє її, а забиває кожне поле
 * порожнім рядком: історія правок лишається адмінові, а `searchId` і далі
 * веде на цю картку за старим номером. Тож порожня чернетка — це рішення
 * авторки «тут нікого немає», і показувати її нікому, крім адміна, не можна:
 * ні в «Моїх картках», ні в стрічці, ні у видачі пошуку, куди її привів би
 * `searchId`.
 *
 * Питається **поточне** значення (`hasCurrentValue`): стерте поле лежить
 * масивом з порожнім хвостом (`['380…', '']`), і попередня версія в ньому
 * значенням не є. Службові ключі (`userId`, `__…`) людину не описують.
 */
const isDescriptiveKey = key => key !== 'userId' && key !== 'cardId' && !key.startsWith('__');

export const hasFilledProfileDraftData = data => Boolean(data) && typeof data === 'object'
  && Object.entries(data).some(([key, value]) => isDescriptiveKey(key) && hasCurrentValue(value));
