export const parseDDMMYYYY = str => {
  if (!str) return undefined;
  const [day, month, year] = str.split('.').map(Number);
  if (!day || !month || !year) return undefined;
  return new Date(year, month - 1, day).getTime();
};

export default parseDDMMYYYY;
