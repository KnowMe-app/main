export const normalizePhoneForStorage = value => {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return [...new Set(value.flat(Infinity)
      .map(item => normalizePhoneForStorage(item))
      .filter(item => item !== '' && item !== undefined && item !== null))];
  }
  return String(value).replace(/\D/g, '');
};

export const sanitizeUploadedInfoPhones = uploadedInfo => {
  if (!uploadedInfo || typeof uploadedInfo !== 'object') return uploadedInfo;
  if (!Object.prototype.hasOwnProperty.call(uploadedInfo, 'phone')) return uploadedInfo;
  return { ...uploadedInfo, phone: normalizePhoneForStorage(uploadedInfo.phone) };
};

export const mergeDuplicateProfileValues = (key, currentVal, nextVal) => {
  const normalize = value => String(value).replace(/\s+/g, '').trim();
  const toArray = value => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(normalize).filter(Boolean);
    return String(value).split(/[,;]/).map(normalize).filter(Boolean);
  };
  const seen = new Set();
  const uniqueValues = [...toArray(currentVal).flatMap(toArray), ...toArray(nextVal).flatMap(toArray)]
    .filter(value => !seen.has(value) && seen.add(value));
  return new Set(['cycleStatus', 'lastCycle']).has(key) ? uniqueValues[0] : uniqueValues;
};
