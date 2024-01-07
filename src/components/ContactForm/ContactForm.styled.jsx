import styled from 'styled-components';

export const Container = styled.div`
  margin-bottom: 30px;
`;

export const InputContainer = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
`;

export const LabelText = styled.h3`
  color: var(--secondary-text-color);
`;

export const Input = styled.input`
  max-width: 220px;
  border: var(--border);
  border-radius: 4px;
  background-color: #2c2d31;
  color: var(--primary-text-color);
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
