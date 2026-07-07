import styled from 'styled-components';

export const Container = styled.div`
  max-width: 1280px;
  min-height: calc(100vh - 400px);
  margin: 0 auto 0;
  padding: 30px;
  box-shadow: var(--km-shadow);
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
  padding: 5px 5px;
  width: 40px;
  height: 40px;
  background-color: var(--km-accent);
  color: #fff;
  border: 1px solid var(--km-border);
  border-radius: 50px;
  font-weight: 700;
  transition: background-color 0.18s ease;
  &:hover,
  &:focus {
    background-color: var(--km-accent-mid);
  };
  align-self: flex-end;
`;
