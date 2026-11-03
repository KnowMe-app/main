import { AttentionDiv } from 'components/styles';
import { getCurrentValue } from '../getCurrentValue';

/**
 * `maritalStatus` — поле з історією версій: після перенесення з дубліката
 * (`mergeComparisonValues`) чи правки в базі лежить масив, а не рядок. Поки
 * тут порівнювали саме поле, `['Yes']` не збігався з жодним `case`, і картка
 * адміна показувала сире «Yes» замість «Заміжня». Показуємо поточну версію.
 */
export const fieldMaritalStatus = maritalStatus => {
  const current = getCurrentValue(maritalStatus);
  const value = typeof current === 'string' ? current.trim() : current;
  let text;
  switch (typeof value === 'string' ? value.toLowerCase() : value) {
    case 'yes':
    case 'так':
    case '+':
      text = 'Заміжня';
      break;
    case 'no':
    case 'ні':
    case '-':
      text = 'Незаміжня';
      break;
    default:
      text = value || '';
  }
  return text ? (
    <AttentionDiv style={{ backgroundColor: 'orange' }}>{text}</AttentionDiv>
  ) : null;
};
