export const makeCardDescription = user => {
  const birthsInfo = [user.ownKids, user.lastDelivery]
    .filter(Boolean)
    .join('-');

  const location = [user.region, user.city]
    .filter(Boolean)
    .join(', ');

  const birthDate = user.birth || '';

  const normalizeStr = str => str.toString().trim().toLowerCase();

  const getMaritalStatus = val => {
    if (!val) return '?';
    const normalized = normalizeStr(val);
    if (['yes', '+', 'married', 'одружена', 'заміжня'].includes(normalized))
      return 'заміжня';
    if (
      ['no', '-', 'unmarried', 'single', 'ні', 'незаміжня'].includes(normalized)
    )
      return 'не заміжня';
    return '?';
  };

  const maritalStatus = getMaritalStatus(user.maritalStatus);

  const getCsectionInfo = val => {
    if (val === undefined || val === null || val === '') return '?';
    const normalized = normalizeStr(val);
    if (['не було', 'no', 'ні', '-', '0', 'false'].includes(normalized)) return '-';
    return val;
  };

  const csectionInfo = getCsectionInfo(user.csection);

  const heightWeightBloodParts = [user.height, user.weight, user.blood].filter(
    Boolean,
  );
  const heightWeightBlood =
    heightWeightBloodParts.length > 0
      ? heightWeightBloodParts.join('/')
      : '?';

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
    heightWeightBlood,
    phones,
    fullName,
  ].filter(Boolean);

  const enumerated = parts.map((text, index) => `${index + 1}. ${text}`);

  return enumerated.join('\\n');
};
