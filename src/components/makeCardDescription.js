export const makeCardDescription = user => {
  const birthsInfo = [user.ownKids, user.lastDelivery]
    .filter(Boolean)
    .join('-');

  const location = [user.region, user.city]
    .filter(Boolean)
    .join(', ');

  const birthDate = user.birth || '';

  const maritalStatus = user.maritalStatus || '';

  // Normalize c-section info: treat placeholders like '-' or 'No' as "не було"
  const normalizeCSection = value => {
    if (!value) return 'не було';
    const cleaned = String(value).trim().toLowerCase();
    if (cleaned === '-' || cleaned === 'no' || cleaned === 'ні' || cleaned === '0') {
      return 'не було';
    }
    return value;
  };
  const csectionInfo = normalizeCSection(user.csection);

  const heightWeightRaw = user.height || user.weight
    ? `${user.height || ''}/${user.weight || ''}`
    : '';
  const heightWeight = [heightWeightRaw, user.blood]
    .filter(Boolean)
    .join(' ');
 
  const lastCycle = user.lastCycle || '';

  const phones = (Array.isArray(user.phone) ? user.phone : [user.phone])
    .filter(Boolean)
    .map(p => String(p).replace(/^\+?38/, ''))
    .join(', ');

  const fullName = [user.surname, user.name, user.fathersname]
    .filter(Boolean)
    .join(' ');

  const parts = [
    birthsInfo,
    location,
    birthDate,
    maritalStatus,
    csectionInfo,
    heightWeight,
    lastCycle,
    phones,
    fullName,
  ].filter(Boolean);

  return parts.map((text, index) => `${index + 1}. ${text}`).join('\n');
};
