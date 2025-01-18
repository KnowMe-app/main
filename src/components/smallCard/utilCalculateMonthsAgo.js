export const utilCalculateMonthsAgo = dateString => {
  if (!dateString) return null;
  if (typeof dateString !== 'string') return dateString;

  const [day, month, year] = dateString?.split('.').map(Number);
  const deliveryDate = new Date(year, month - 1, day);
  const now = new Date();

  const monthsDiff = (now.getFullYear() - deliveryDate.getFullYear()) * 12 + (now.getMonth() - deliveryDate.getMonth());
  return monthsDiff;
};