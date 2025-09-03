import { AttentionDiv } from 'components/styles';

export const fieldMaritalStatus = (maritalStatus, userRole) => {
  let text;
  switch (maritalStatus) {
    case 'Yes':
    case 'Так':
    case '+':
      text = userRole === 'ed' ? 'Married' : 'Заміжня';
      break;
    case 'No':
    case 'Ні':
    case '-':
      text = userRole === 'ed' ? 'Single' : 'Незаміжня';
      break;
    default:
      text = maritalStatus || '';
  }
  return text ? (
    <AttentionDiv style={{ backgroundColor: 'orange' }}>{text}</AttentionDiv>
  ) : null;
};
