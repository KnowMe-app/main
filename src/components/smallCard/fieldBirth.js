import { utilCalculateAge } from "./utilCalculateAge";
import { AttentionDiv } from 'components/styles';

export const fieldBirth = birth => {
  const age = utilCalculateAge(birth);

  return age !== null ? (
    <AttentionDiv style={{ backgroundColor: 'lightblue' }}>{age}р</AttentionDiv>
  ) : null;
};
