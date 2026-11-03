import { AttentionDiv } from 'components/styles';
import { formatValueVersions } from './valueVersions';

export const formatMaritalStatus = value => {
  switch (String(value).trim().toLowerCase()) {
    case 'yes':
    case 'так':
    case '+':
      return 'Заміжня';
    case 'no':
    case 'ні':
    case '-':
      return 'Незаміжня';
    default:
      return value;
  }
};

/**
 * `maritalStatus` — поле з історією версій: після перенесення з дубліката
 * (`mergeComparisonValues`) у базі лежить масив. Поки тут порівнювали саме
 * поле, `['Yes']` не збігався з жодним `case`, і картка адміна показувала
 * сире «Yes». Адмін бачить усі версії, кожну перекладеною, і стирання теж
 * («Заміжня → стерто»).
 */
export const fieldMaritalStatus = maritalStatus => {
  const text = formatValueVersions(maritalStatus, formatMaritalStatus);
  return text ? (
    <AttentionDiv style={{ backgroundColor: 'orange' }}>{text}</AttentionDiv>
  ) : null;
};
