import styled from 'styled-components';

export const ItemContainer = styled.div`
  display: flex;
  justify-content: space-between;
`;

export const ItemText = styled.span`
  color: #777777;
`;

export const Button = styled.button`
  margin-left: 10px;
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
