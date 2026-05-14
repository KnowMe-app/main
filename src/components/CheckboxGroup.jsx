import React from 'react';
import styled from 'styled-components';

const GroupWrapper = styled.div`
  margin-bottom: 10px;
`;

const GroupLabel = styled.span`
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: var(--matching-chip-label, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
  line-height: 1;
`;

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`;

const Chip = styled.button`
  padding: 3px 9px;
  border-radius: 20px;
  border: 1.5px solid ${({ $active }) => ($active ? '#FF8C00' : 'var(--matching-chip-border, #e0e0e0)')};
  background: ${({ $active }) => ($active ? 'rgba(255, 243, 224, 0.92)' : 'var(--matching-chip-bg, #fafafa)')};
  color: ${({ $active }) => ($active ? '#CC5500' : 'var(--matching-chip-text, #666)')};
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  line-height: 1.5;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
  display: inline-flex;
  align-items: center;

  &:hover {
    border-color: #FF8C00;
    color: #CC5500;
  }
`;

export const CheckboxGroup = ({ label, filterName, options, filters, onChange }) => {
  const handleToggle = option => {
    onChange({
      ...filters,
      [filterName]: {
        ...filters[filterName],
        [option]: !filters[filterName][option],
      },
    });
  };

  return (
    <GroupWrapper>
      {label && <GroupLabel>{label}</GroupLabel>}
      <ChipsRow>
        {options.map(({ val, label: optionLabel }) => (
          <Chip
            key={val}
            $active={filters[filterName][val]}
            onClick={() => handleToggle(val)}
            type="button"
          >
            {optionLabel}
          </Chip>
        ))}
      </ChipsRow>
    </GroupWrapper>
  );
};
