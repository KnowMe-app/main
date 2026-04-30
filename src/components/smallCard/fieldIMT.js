import { AttentionDiv } from 'components/styles';
import { utilCalculateIMT } from './utilCalculateIMT';

export const fieldIMT = (weight, height) => {
  const imt = utilCalculateIMT(weight, height);
  return imt && imt !== 'N/A' ? (
    <AttentionDiv style={{ backgroundColor: 'rgba(123,31,162,0.22)', color: '#ce93d8', border: '1px solid rgba(123,31,162,0.3)' }}>{imt}</AttentionDiv>
  ) : null;
};
