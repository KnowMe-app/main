import styled from 'styled-components';

export const Form = styled.form`
  width: 320px;
  min-height: calc(100vh - 300px);
`;

export const Label = styled.label`
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
`;

export const Button = styled.button`
  padding: 5px 15px;
  background-color: var(--accent-color);
  color: var(--primary-text-color);
  border: var(--border);
  border-radius: 4px;
  font-weight: 700;
  transition: background-color var(--animation-timing-function);
  &:hover,
  &:focus {
    background-color: var(--accent-color-hover);
  }
`;

export const Input = styled.input`
  max-width: 220px;
  border: var(--border);
  border-radius: 4px;
  background-color: #2c2d31;
  color: var(--primary-text-color);
`;