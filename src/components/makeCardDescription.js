export const makeCardDescription = user => {
  const birthsInfo = [user.ownKids, user.lastDelivery]
    .filter(Boolean)
    .join('-');

  const location = [user.region, user.city]
    .filter(Boolean)
    .join(', ');

  const birthDate = user.birth || '';

  const maritalStatus = user.maritalStatus || '';

  const csectionInfo = user.csection || 'не було';

  const heightWeight = user.height || user.weight
    ? `${user.height || ''}/${user.weight || ''}`
    : '';

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

  const enumerated = parts.map((text, index) => `${index + 1}. ${text}`);

  return enumerated.join('\\n');
};
