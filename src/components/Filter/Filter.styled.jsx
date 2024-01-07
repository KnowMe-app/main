import styled from 'styled-components';

export const FilterContainer = styled.div`
  max-width: 400px;
`;

export const Label = styled.label`
  display: flex;
  justify-content: space-between;
  margin-bottom: 15px;
`;

export const Input = styled.input`
  max-width: 220px;
  border: var(--border);
  border-radius: 4px;
  background-color: #2c2d31;
  color: var(--primary-text-color);
`;

export const LabelText = styled.span`
  color: var(--secondary-text-color);
  font-size: 18px;
  font-weight: 600;
`;
