const { AttentionDiv } = require("components/styles");

export const fieldBlood = blood => {

  return (
    <AttentionDiv
      style={{
        backgroundColor: 'rgba(229,57,53,0.18)',
        color: '#ef9a9a',
        border: '1px solid rgba(229,57,53,0.25)',
      }}
    >
      РК {blood}
    </AttentionDiv>
  );
};
