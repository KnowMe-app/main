import { AttentionDiv } from 'components/styles';

export const fieldMaritalStatus = maritalStatus => {
  let text;
  switch (maritalStatus) {
    case 'Yes':
    case 'Так':
    case '+':
      text = 'Заміжня';
      break;
    case 'No':
    case 'Ні':
    case '-':
      text = 'Незаміжня';
      break;
    default:
      text = maritalStatus || '';
  }
  return text ? (
    <AttentionDiv style={{ backgroundColor: 'orange' }}>{text}</AttentionDiv>
  ) : null;
};
