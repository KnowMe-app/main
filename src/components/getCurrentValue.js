export const getCurrentValue = value => {
  if (Array.isArray(value)) {
    const filtered = value.filter(v => v !== undefined && v !== null && v !== '');
    return filtered[filtered.length - 1];
  }
  if (value && typeof value === 'object') {
    const vals = Object.values(value).filter(v => v !== undefined && v !== null && v !== '');
    return vals[vals.length - 1];
  }
  return value;
};
