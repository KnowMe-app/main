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
    <AttentionDiv style={{ backgroundColor: 'rgba(255,152,0,0.18)', color: '#ffcc80', border: '1px solid rgba(255,152,0,0.25)' }}>{text}</AttentionDiv>
  ) : null;
};
