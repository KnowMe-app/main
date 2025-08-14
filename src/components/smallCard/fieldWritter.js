import { handleChange, handleSubmit } from './actions';
const { OrangeBtn, UnderlinedInput } = require('components/styles');

export const fieldWriter = (userData, setUsers, setState, isToastOn) => {
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
      {},
      isToastOn,
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
          onBlur={() => handleSubmit(userData, 'overwrite', isToastOn)}
          style={{
            flexGrow: 1, // Займає залишковий простір
            maxWidth: '100%', // Обмежує ширину контейнером
          }}
        />
      </div>

      {/* Нижній рядок: кнопки */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', width: '100%' }}>
        {['IgF', 'IgTT', 'Ср', 'Срр', 'Ik', 'Т', 'V', 'W', 'ТТ', 'Ін'].map(code => (
          <OrangeBtn
            key={code}
            onClick={() => handleCodeClick(code)}
            style={{
              cursor: 'pointer',
              flex: '1', // Рівномірно розподіляє кнопки по всій ширині
              width: '25px' /* Встановіть ширину, яка визначатиме розмір кнопки */,
              height: '25px' /* Встановіть висоту, яка повинна дорівнювати ширині */,
              marginLeft: '5px',
              marginRight: 0,
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
