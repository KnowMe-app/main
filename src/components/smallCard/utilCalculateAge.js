import { formatDateToDisplay } from 'components/inputValidations';

/**
 * Вік з дати народження, у якому б написанні вона не лежала.
 *
 * У базі дата зберігається як `РРРР-ММ-ДД`, а людині показується `ДД.ММ.РРРР`
 * — тож рахувати вік доводиться з обох: нові вузли несуть ISO, legacy-анкети
 * ще й крапкову форму. `formatDateToDisplay` зводить їх до одного написання,
 * а далі рахунок той самий, що й був.
 */
export const utilCalculateAge = birthDateString => {
  if (!birthDateString) return null;
  if (typeof birthDateString !== 'string') return birthDateString;

  const display = formatDateToDisplay(birthDateString);
  const [day, month, year] = String(display).split('.').map(Number);
  if (!day || !month || !year) return null;

  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};
