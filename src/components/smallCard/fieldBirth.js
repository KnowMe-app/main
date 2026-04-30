import { utilCalculateAge } from "./utilCalculateAge";
import { AttentionDiv } from 'components/styles';

export const fieldBirth = birth => {
  const age = utilCalculateAge(birth);

  return age !== null ? (
    <AttentionDiv style={{ backgroundColor: 'rgba(41,182,246,0.18)', color: '#81d4fa', border: '1px solid rgba(41,182,246,0.25)' }}>{age}р</AttentionDiv>
  ) : null;
};
