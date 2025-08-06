const isMeaningful = v => v !== undefined && v !== null && v !== '';

export const getCurrentValue = value => {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const current = getCurrentValue(value[i]);
      if (isMeaningful(current)) {
        return current;
      }
    }
    return undefined;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    for (let i = keys.length - 1; i >= 0; i--) {
      const current = getCurrentValue(value[keys[i]]);
      if (isMeaningful(current)) {
        return current;
      }
    }
    return undefined;
  }
  return value;
};
