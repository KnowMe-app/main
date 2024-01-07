import styled from 'styled-components';

export const Container = styled.div`
  max-width: 700px;
  min-height: calc(100vh - 400px);
  margin: 30px auto 30px;
  padding: 30px;
  /* background-color: var(--primary-background-color); */
  box-shadow: var(--box-shadow);
`;

export const TitleH1 = styled.h1`
  text-align: center;
  margin-bottom: 10px;
`;

export const TitleH2 = styled.h2`
  text-align: center;
  margin-bottom: 10px;
`;

export const Button = styled.button`
  margin-left: 10px;
  /* margin-bottom: 10px; */
  padding: 8px 8px;
  background-color: var(--accent-color);
  color: var(--primary-text-color);
  border: var(--border);
  border-radius: 50px;
  font-weight: 700;
  transition: background-color var(--animation-timing-function);
  &:hover,
  &:focus {
    background-color: var(--accent-color-hover);
  }
`;
