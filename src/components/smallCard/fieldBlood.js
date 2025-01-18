const { AttentionDiv } = require("components/styles");

export const fieldBlood = blood => {

  return (
    <AttentionDiv
      style={{
        backgroundColor: 'orange',
      }}
    >
      РК {blood}
    </AttentionDiv>
  );
};