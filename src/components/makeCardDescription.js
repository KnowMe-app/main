import { normalizeLocation } from './normalizeLocation';
import { formatDateToDisplay } from 'components/inputValidations';

export const makeCardDescription = user => {
  const birthsInfo = [user.ownKids, formatDateToDisplay(user.lastDelivery)]
    .filter(Boolean)
    .join('-');

  const location = normalizeLocation(
    [user.region, user.city].filter(Boolean).join(', ')
  );

  const birthDate = user.birth || '';

  const normalizeStr = str => str.toString().trim().toLowerCase();

  const getMaritalStatus = val => {
    if (!val) return '';
    const normalized = normalizeStr(val);
    if (['yes', 'так', '+', 'married', 'одружена', 'заміжня'].includes(normalized))
      return 'заміжня';
    if (
      ['no', 'ні', '-', 'unmarried', 'single', 'незаміжня'].includes(normalized)
    )
      return 'не заміжня';
    return '';
  };

  const maritalStatus = getMaritalStatus(user.maritalStatus);

  const getCsectionInfo = val => {
    if (val === undefined || val === null || val === '') return '';
    const normalized = normalizeStr(val);
    if (['не було', 'no', 'ні', '-', '0', 'false'].includes(normalized)) return 'КС-';
    return `КС ${String(val).trim()}`;
  };

  const csectionInfo = getCsectionInfo(user.csection);

  const bloodInfo = user.blood ? `РК-${String(user.blood).trim()}` : 'РК-';

  const heightWeightBloodParts = [user.height, user.weight, bloodInfo].filter(Boolean);
  const heightWeightBlood =
    heightWeightBloodParts.length > 0
      ? heightWeightBloodParts.join('/')
      : '';

  const phones = (Array.isArray(user.phone) ? user.phone : [user.phone])
    .filter(Boolean)
    .map(p => String(p).replace(/^\+?38/, ''))
    .join(', ');

  const fullName = [user.name, user.surname, user.fathersname]
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

  return enumerated.join('; ');
};
