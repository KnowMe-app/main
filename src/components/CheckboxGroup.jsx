import React from 'react';

export const CheckboxGroup = ({ label, filterName, options, filters, onChange, compact = false }) => {
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
      <div style={{ marginBottom: compact ? '4px' : '8px' }}>
        {label && <span style={{ marginRight: compact ? '4px' : '8px' }}>{label}:</span>}
        {options.map(({ val, label: optionLabel }) => (
          <label key={val} style={{ marginLeft: compact ? '4px' : '10px', color: 'black' }}>
            <input type="checkbox" checked={filters[filterName][val]} onChange={() => handleToggle(val)} />
            {optionLabel}
          </label>
        ))}
      <hr style={{ borderColor: '#ccc', borderWidth: '1px', borderStyle: 'solid', margin: '4px 0' }} />
    </div>
  );
};
