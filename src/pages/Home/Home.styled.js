import styled from 'styled-components';

export const Container = styled.div`
  min-height: calc(100vh - 300px);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
`;

export const Title = styled.h1`
  font-weight: 500;
  font-size: 48px;
  text-align: center;
`;

export const Advice = styled.h2`
  font-weight: 400;
  font-size: 15px;
  text-align: center;
`;

export const Accent = styled.span`
  color: yellow;
`;
