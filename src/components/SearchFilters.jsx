import React from 'react';

export const SearchFilters = ({ filters, onChange }) => {
  const handleCsectionChange = option => {
    if (option === 'le1') {
      onChange({ ...filters, csectionNot2: true, csection0: false });
    } else if (option === 'none') {

      onChange({ ...filters, csectionNot2: true, csection0: true });
    } else {
      onChange({ ...filters, csectionNot2: false, csection0: false });
    }
  };

  const handleToggle = (name, value) => {
    onChange({ ...filters, [name]: value });
  };

  const currentCsection = filters.csection0
    ? 'none'
    : filters.csectionNot2
    ? 'le1'
    : 'off';

  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ marginRight: '8px' }}>C-section:</span>
        <label>
          <input
            type="radio"
            name="csection"
            value="off"
            checked={currentCsection === 'off'}
            onChange={() => handleCsectionChange('off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px' }}>
          <input
            type="radio"
            name="csection"
            value="le1"
            checked={currentCsection === 'le1'}
            onChange={() => handleCsectionChange('le1')}
          />
          ≤1
        </label>
        <label style={{ marginLeft: '10px' }}>
          <input
            type="radio"
            name="csection"
            value="none"
            checked={currentCsection === 'none'}
            onChange={() => handleCsectionChange('none')}
          />
          none (–)
        </label>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ marginRight: '8px' }}>Marital status:</span>
        <label>
          <input
            type="radio"
            name="maritalStatus"
            value="on"
            checked={filters.maritalStatus}
            onChange={() => handleToggle('maritalStatus', true)}
          />
          active
        </label>
        <label style={{ marginLeft: '10px' }}>
          <input
            type="radio"
            name="maritalStatus"
            value="off"
            checked={!filters.maritalStatus}
            onChange={() => handleToggle('maritalStatus', false)}
          />
          disabled
        </label>
      </div>
      <div>
        <span style={{ marginRight: '8px' }}>Rh factor:</span>
        <label>
          <input
            type="radio"
            name="blood"
            value="on"
            checked={filters.blood}
            onChange={() => handleToggle('blood', true)}
          />
          active
        </label>
        <label style={{ marginLeft: '10px' }}>
          <input
            type="radio"
            name="blood"
            value="off"
            checked={!filters.blood}
            onChange={() => handleToggle('blood', false)}
          />
          disabled
        </label>
      </div>
    </div>
  );
};
