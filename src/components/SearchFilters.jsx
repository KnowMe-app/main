import React from 'react';

export const SearchFilters = ({ filters, onChange }) => {
  const handleChange = (name, value) => {
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
            onChange={() => handleChange('csection', 'off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="csection"
            value="le1"
            checked={filters.csection === 'le1'}
            onChange={() => handleChange('csection', 'le1')}
          />
          ≤1
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="csection"
            value="none"
            checked={filters.csection === 'none'}
            onChange={() => handleChange('csection', 'none')}
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
            onChange={() => handleChange('maritalStatus', 'off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="maritalStatus"
            value="married"
            checked={filters.maritalStatus === 'married'}
            onChange={() => handleChange('maritalStatus', 'married')}
          />
          married
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="maritalStatus"
            value="unmarried"
            checked={filters.maritalStatus === 'unmarried'}
            onChange={() => handleChange('maritalStatus', 'unmarried')}
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
            onChange={() => handleChange('blood', 'off')}
          />
          no filter
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="blood"
            value="pos"
            checked={filters.blood === 'pos'}
            onChange={() => handleChange('blood', 'pos')}
          />
          Rh+
        </label>
        <label style={{ marginLeft: '10px', color: 'black' }}>
          <input
            type="radio"
            name="blood"
            value="neg"
            checked={filters.blood === 'neg'}
            onChange={() => handleChange('blood', 'neg')}
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
            onChange={() => handleChange('age', 'off')}
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
              onChange={() => handleChange('age', ageLimit)}
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
            onChange={() => handleChange('userId', 'off')}
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
              onChange={() => handleChange('userId', val)}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
};
