import { formatDateToDisplay } from 'components/inputValidations';
import { getCurrentValue } from '../getCurrentValue';

/**
 * Вік з дати народження, у якому б написанні вона не лежала.
 *
 * У базі дата зберігається як `РРРР-ММ-ДД`, а людині показується `ДД.ММ.РРРР`
 * — тож рахувати вік доводиться з обох: нові вузли несуть ISO, legacy-анкети
 * ще й крапкову форму. `formatDateToDisplay` зводить їх до одного написання,
 * а далі рахунок той самий, що й був.
 *
 * `birth` — теж поле з історією версій (`getCurrentValue`): після редагування
 * дати в базі лежить масив, а не сам рядок. Без розгортання масив не впізнавав
 * жоден із регулярних виразів нижче — картка показувала нерозібрану дату
 * замість віку.
 */
export const utilCalculateAge = birthDateString => {
  const current = getCurrentValue(birthDateString);
  if (!current) return null;
  if (typeof current !== 'string') return current;

  const display = formatDateToDisplay(current);
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
