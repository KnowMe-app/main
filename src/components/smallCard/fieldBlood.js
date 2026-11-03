import { AttentionDiv } from 'components/styles';
import { getCurrentValue } from '../getCurrentValue';

// `blood` — поле з історією версій: масив показуємо поточною версією, а не
// склеєними всіма («РК 2+3-»).
export const fieldBlood = blood => {
  const current = getCurrentValue(blood);
  if (current === undefined || current === null || String(current).trim() === '') return null;

  return (
    <AttentionDiv
      style={{
        backgroundColor: 'yellow',
        color: 'black',
      }}
    >
      РК {current}
    </AttentionDiv>
  );
};
