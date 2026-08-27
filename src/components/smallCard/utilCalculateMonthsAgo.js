import { formatDateToDisplay } from 'components/inputValidations';

/**
 * Скільки місяців минуло від дати — у якому б написанні вона не лежала.
 *
 * Викликається і з уже показаної дати, і з сирого значення анкети, а в базі
 * воно лежить у `РРРР-ММ-ДД`. `formatDateToDisplay` зводить обидві форми до
 * однієї.
 */
export const utilCalculateMonthsAgo = dateString => {
  if (!dateString) return null;
  if (typeof dateString !== 'string') return dateString;

  const display = formatDateToDisplay(dateString);
  const [day, month, year] = String(display).split('.').map(Number);
  if (!day || !month || !year) return null;

  const deliveryDate = new Date(year, month - 1, day);
  const now = new Date();

  const monthsDiff = (now.getFullYear() - deliveryDate.getFullYear()) * 12 + (now.getMonth() - deliveryDate.getMonth());
  return monthsDiff;
};
