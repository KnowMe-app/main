import { handleChange } from './actions';
const { OrangeBtn, UnderlinedInput } = require('components/styles');

export const fieldWriter = (args, legacySetUsers, legacySetState, legacySubmitOptions = {}) => {
  const {
    userData,
    setUsers,
    setState,
    submitOptions = {},
  } = args && typeof args === 'object' && 'userData' in args
    ? args
    : {
        userData: args,
        setUsers: legacySetUsers,
        setState: legacySetState,
        submitOptions: legacySubmitOptions,
      };
  const handleCodeClick = code => {
    let currentWriter = userData.writer || '';
    let updatedCodes = currentWriter?.split(', ').filter(item => item !== code); // Видаляємо, якщо є
    updatedCodes = [code, ...updatedCodes]; // Додаємо код першим
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'writer',
      updatedCodes.join(', '),
      true,
      submitOptions,
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', width: '100%' }}>
        <UnderlinedInput
          type="text"
          // placeholder="Введіть ім'я"
          value={userData.writer || ''}
          onChange={e => handleChange(setUsers, setState, userData.userId, 'writer', e.target.value)}
          onBlur={e =>
            handleChange(
              setUsers,
              setState,
              userData.userId,
              'writer',
              e.target.value,
              true,
              submitOptions,
            )
          }
          style={{
            flexGrow: 1,
            minWidth: 0,
            maxWidth: '100%',
          }}
        />
      </div>

      {/* Нижній рядок: кнопки */}
      <div style={{ display: 'flex', gap: '2px', flexWrap: 'nowrap', overflowX: 'auto', width: '100%' }}>
        {['IgF', 'IgTT', 'Ср', 'Срр', 'Ik', 'Т', 'V', 'W', 'ТТ', 'Ін'].map(code => (
          <OrangeBtn
            key={code}
            onClick={() => handleCodeClick(code)}
            style={{
              cursor: 'pointer',
              flex: '0 0 auto',
              minWidth: '25px',
              width: '25px',
              height: '24px',
              marginLeft: 0,
              marginRight: 0,
              padding: 0,
              color: 'black',
            }}
          >
            {code}
          </OrangeBtn>
        ))}
      </div>
    </div>
  );
};
