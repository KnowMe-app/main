import { handleChange } from './actions';
const { OrangeBtn, UnderlinedInput } = require('components/styles');

export const fieldRole = (userData, setUsers, setState, submitOptions = {}) => {
  const handleSetRole = role => {
    handleChange(setUsers, setState, userData.userId, 'role', role, true, submitOptions);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <UnderlinedInput
        type="text"
        value={userData.role || ''}
        onChange={e => handleChange(setUsers, setState, userData.userId, 'role', e.target.value)}
        onBlur={e =>
          handleChange(
            setUsers,
            setState,
            userData.userId,
            'role',
            e.target.value,
            true,
            submitOptions,
          )
        }
        style={{ marginLeft: 0, textAlign: 'left', width: '6ch' }}
      />
      {['ed', 'ip', 'ag', 'pp'].map(role => (
        <OrangeBtn
          key={role}
          onClick={() => handleSetRole(role)}
          style={{
            width: '25px',
            height: '25px',
            marginLeft: '5px',
            marginRight: 0,
            opacity: userData.role === role ? 1 : 0.45,
            fontWeight: userData.role === role ? 700 : 400,
            boxShadow: userData.role === role ? '0 0 0 2px rgba(255,255,255,0.4)' : 'none',
          }}
        >
          {role}
        </OrangeBtn>
      ))}
    </div>
  );
};
