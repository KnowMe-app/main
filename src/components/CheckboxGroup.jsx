import React from 'react';
import styled from 'styled-components';

const GroupWrapper = styled.div`
  margin-bottom: 12px;
`;

const GroupLabel = styled.span`
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: var(--matching-chip-label, var(--km-muted));
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 7px;
  line-height: 1;
`;

const ChipsRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

const Chip = styled.button`
  min-height: 36px;
  padding: 7px 12px;
  border-radius: 20px;
  border: 1.5px solid ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--matching-chip-border, var(--km-border))')};
  background: ${({ $active }) => ($active ? 'var(--km-accent-light)' : 'var(--matching-chip-bg, var(--km-card))')};
  color: ${({ $active }) => ($active ? 'var(--km-accent)' : 'var(--matching-chip-text, var(--km-muted))')};
  font-family: var(--km-font);
  font-size: 12px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: pointer;
  line-height: 1.5;
  transition: border-color 0.15s, background 0.15s, color 0.15s, transform 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    border-color: var(--km-accent);
    color: var(--km-accent);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--km-accent-ring);
    outline-offset: 2px;
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
        {options.map(({ val, label: optionLabel }) => {
          const isActive = Boolean(filters[filterName][val]);
          const readableLabel = typeof optionLabel === 'string' ? optionLabel : val;
          const groupLabel = label || filterName;

          return (
            <Chip
              key={val}
              $active={isActive}
              aria-pressed={isActive}
              aria-label={`${groupLabel}: ${readableLabel}`}
              onClick={() => handleToggle(val)}
              type="button"
            >
              {optionLabel}
            </Chip>
          );
        })}
      </ChipsRow>
    </GroupWrapper>
  );
};
