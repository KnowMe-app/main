export const normalizeLastAction = value => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isNaN(num)) return num;
    }
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
      const [day, month, year] = trimmed.split('.').map(Number);
      return new Date(year, month - 1, day).getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(year, month - 1, day).getTime();
    }
  }
  return undefined;
};

export default normalizeLastAction;
