import React from 'react';

export const CheckboxGroup = ({
  label,
  filterName,
  options,
  filters,
  onChange,
  compact = false,
  optionHints = {},
}) => {
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
        {options.map(({ val, label: optionLabel }) => {
          const hint = optionHints?.[val];
          const isChecked = Boolean(filters?.[filterName]?.[val]);
          const isDisabled = Boolean(hint?.disabled) && !isChecked;
          const showCount = Number.isFinite(hint?.count);

          return (
            <label
              key={val}
              style={{
                marginLeft: compact ? '4px' : '10px',
                color: isDisabled ? '#bfbfbf' : 'black',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => handleToggle(val)}
              />
              <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.1 }}>
                {showCount && (
                  <span style={{ fontSize: '0.45em', color: isDisabled ? '#cccccc' : '#7a7a7a' }}>
                    {hint.count}
                  </span>
                )}
                <span>{optionLabel}</span>
              </span>
            </label>
          );
        })}
      <hr style={{ borderColor: '#ccc', borderWidth: '1px', borderStyle: 'solid', margin: '4px 0' }} />
    </div>
  );
};
