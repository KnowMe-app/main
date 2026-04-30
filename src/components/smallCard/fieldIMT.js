import { AttentionDiv } from 'components/styles';
import { utilCalculateIMT } from './utilCalculateIMT';

export const fieldIMT = (weight, height) => {
  const imt = utilCalculateIMT(weight, height);
  return imt && imt !== 'N/A' ? (
    <AttentionDiv style={{ backgroundColor: 'purple' }}>{imt}</AttentionDiv>
  ) : null;
};
