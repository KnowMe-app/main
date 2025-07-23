import styled from 'styled-components';

export const Container = styled.div`
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 30px;
  box-shadow: var(--box-shadow);
  display: flex;
  flex-direction: column;
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
  padding: 5px 5px;
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
  };
  align-self: flex-end;
`;
