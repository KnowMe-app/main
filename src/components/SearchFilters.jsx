import React from 'react';
import { CheckboxGroup } from './CheckboxGroup';

export const SearchFilters = ({ filters, onChange }) => {
  const handleFilterChange = (name, value) => {
    onChange({ ...filters, [name]: value });
  };

  return (
    <div style={{ margin: '10px 0', color: 'black' }}>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ marginRight: '8px' }}>C-section:</span>
        <label style={{ color: 'black' }}>
          <input
            type="radio"
            name="csection"
            value="off"
            checked={filters.csection === 'off'}
              onChange={() => handleFilterChange('csection', 'off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="csection"
            value="le1"
            checked={filters.csection === 'le1'}
              onChange={() => handleFilterChange('csection', 'le1')}
          />
          ≤1
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="csection"
            value="none"
            checked={filters.csection === 'none'}
              onChange={() => handleFilterChange('csection', 'none')}
          />
          none (–)
        </label>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ marginRight: '8px' }}>Marital status:</span>
        <label style={{ color: 'black' }}>
          <input
            type="radio"
            name="maritalStatus"
            value="off"
            checked={filters.maritalStatus === 'off'}
              onChange={() => handleFilterChange('maritalStatus', 'off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="maritalStatus"
            value="married"
            checked={filters.maritalStatus === 'married'}
              onChange={() => handleFilterChange('maritalStatus', 'married')}
          />
          married
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="maritalStatus"
            value="unmarried"
            checked={filters.maritalStatus === 'unmarried'}
              onChange={() => handleFilterChange('maritalStatus', 'unmarried')}
          />
          unmarried
        </label>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ marginRight: '8px' }}>Rh factor:</span>
        <label style={{ color: 'black' }}>
          <input
            type="radio"
            name="blood"
            value="off"
            checked={filters.blood === 'off'}
              onChange={() => handleFilterChange('blood', 'off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="blood"
            value="pos"
            checked={filters.blood === 'pos'}
              onChange={() => handleFilterChange('blood', 'pos')}
          />
          Rh+
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="blood"
            value="neg"
            checked={filters.blood === 'neg'}
              onChange={() => handleFilterChange('blood', 'neg')}
          />
          Rh-
        </label>
      </div>
      <div style={{ marginBottom: '8px' }}>
        <span style={{ marginRight: '8px' }}>Age:</span>
        <label style={{ color: 'black' }}>
          <input
            type="radio"
            name="age"
            value="off"
            checked={filters.age === 'off'}
              onChange={() => handleFilterChange('age', 'off')}
          />
          no filter
        </label>
        {['43', '38', '36', '32', '30', '25'].map(ageLimit => (
          <label key={ageLimit} style={{ marginLeft: '10px', color: 'black' }}>
            <input
              type="radio"
              name="age"
              value={ageLimit}
              checked={filters.age === ageLimit}
              onChange={() => handleFilterChange('age', ageLimit)}
            />
            {!isNaN(ageLimit) ? `≤${ageLimit}` : ageLimit}
          </label>
        ))}
      </div>
      <div>
        <span style={{ marginRight: '8px' }}>UserId:</span>
        <label style={{ color: 'black' }}>
          <input
            type="radio"
            name="userId"
            value="off"
            checked={filters.userId === 'off'}
              onChange={() => handleFilterChange('userId', 'off')}
          />
          no filter
        </label>
        {[
          { val: 'vk', label: 'vk' },
          { val: 'ab', label: 'ab' },
          { val: 'aa', label: 'aa' },
          { val: 'dash', label: '-' },
          { val: 'long', label: '>20' },
          { val: 'notlong', label: '\u2264 20' },
        ].map(({ val, label }) => (
          <label key={val} style={{ marginLeft: '10px', color: 'black' }}>
            <input
              type="radio"
              name="userId"
              value={val}
              checked={filters.userId === val}
              onChange={() => handleFilterChange('userId', val)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
};
