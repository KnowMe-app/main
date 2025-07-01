const { AttentionDiv } = require("components/styles");

export const fieldBlood = blood => {

  return (
    <AttentionDiv
      style={{
        backgroundColor: 'yellow',
        color: 'black',
      }}
    >
      РК {blood}
    </AttentionDiv>
  );
};