import React from 'react';

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
    <div style={{ marginBottom: '8px' }}>
      <span style={{ marginRight: '8px' }}>{label}:</span>
      {options.map(({ val, label: optionLabel }) => (
        <label key={val} style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="checkbox"
            checked={filters[filterName][val]}
            onChange={() => handleToggle(val)}
          />
          {optionLabel}
        </label>
      ))}
    </div>
  );
};
