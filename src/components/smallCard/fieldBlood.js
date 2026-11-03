import { AttentionDiv } from 'components/styles';
import { formatValueVersions } from './valueVersions';

// `blood` — поле з історією версій: адмін бачить усі («РК 3- → 2+»), а не
// склеєні React-ом в один рядок.
export const fieldBlood = blood => {
  const text = formatValueVersions(blood);
  if (!text) return null;

  return (
    <AttentionDiv
      style={{
        backgroundColor: 'yellow',
        color: 'black',
      }}
    >
      РК {text}
    </AttentionDiv>
  );
};
