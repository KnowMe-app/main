import styled from 'styled-components';

export const Container = styled.div`
  max-width: 1280px;
  min-height: calc(100vh - 400px);
  margin: 0 auto 0;
  padding: 30px;
  /* background-color: var(--primary-background-color); */
  box-shadow: var(--box-shadow);
  display: flex;
  flex-direction: column;
  /* background: linear-gradient(to bottom, #ffa500, #ff8c00); */
`;

export const TitleH1 = styled.h1`
  text-align: center;
  margin-bottom: 10px;
`;

export const TitleH2 = styled.h2`
  text-align: center;
  margin-bottom: 10px;
`;

export const Button = styled.button.attrs({ className: 'accent-block' })`
  width: 40px;
  height: 40px;
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
  align-self: flex-end;
`;
