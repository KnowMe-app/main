import { handleChange, handleSubmit } from './actions';
const { OrangeBtn, UnderlinedInput } = require('components/styles');

export const fieldRole = (userData, setUsers, setState, isToastOn) => {
  const handleSetRole = role => {
    handleChange(setUsers, setState, userData.userId, 'role', role, true, {}, isToastOn);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <UnderlinedInput
        type="text"
        value={userData.role || ''}
        onChange={e => handleChange(setUsers, setState, userData.userId, 'role', e.target.value)}
        onBlur={() => handleSubmit(userData, 'overwrite', isToastOn)}
        style={{ marginLeft: 0, textAlign: 'left', width: '6ch' }}
      />
      {['ed', 'ip', 'ag'].map(role => (
        <OrangeBtn
          key={role}
          onClick={() => handleSetRole(role)}
          style={{ width: '25px', height: '25px', marginLeft: '5px', marginRight: 0 }}
        >
          {role}
        </OrangeBtn>
      ))}
    </div>
  );
};
