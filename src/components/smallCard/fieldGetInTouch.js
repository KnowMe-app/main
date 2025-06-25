import React, { useState, useEffect } from 'react';
import { handleChange, handleSubmit } from './actions';
const { formatDateToDisplay, formatDateAndFormula, formatDateToServer } = require('components/inputValidations');
const { OrangeBtn, UnderlinedInput } = require('components/styles');

export const fieldGetInTouch = (
  userData,
  setUsers,
  setState,
  currentFilter,
  isDateInRange,
) => {
  const handleSendToEnd = () => {
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'getInTouch',
      '2099-99-99',
      true,
      { currentFilter, isDateInRange }
    );
  };

  const handleAddDays = days => {
    const currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + days);

    // Форматуємо дату в локальному часі замість використання UTC
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Додаємо 1, оскільки місяці в Date починаються з 0
    const day = String(currentDate.getDate()).padStart(2, '0');
    const formattedDate = `${year}-${month}-${day}`; // Формат YYYY-MM-DD
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'getInTouch',
      formattedDate,
      true,
      { currentFilter, isDateInRange }
    );
  };

  const ActionButton = ({ label, days, onClick }) => (
    <OrangeBtn
      onClick={() => (onClick ? onClick(days) : null)}
      style={{
        width: '25px' /* Встановіть ширину, яка визначатиме розмір кнопки */,
        height: '25px' /* Встановіть висоту, яка повинна дорівнювати ширині */,
        marginLeft: '5px',
        marginRight: 0,
      }}
    >
      {label}
    </OrangeBtn>
  );

  const GetInTouchInput = () => {
    const [value, setValue] = useState(
      formatDateToDisplay(formatDateAndFormula(userData.getInTouch)) || ''
    );

    useEffect(() => {
      setValue(
        formatDateToDisplay(formatDateAndFormula(userData.getInTouch)) || ''
      );
    }, [userData.getInTouch]);

    const handleBlur = () => {
      const serverFormattedDate = formatDateToServer(
        formatDateAndFormula(value)
      );

      handleChange(
        setUsers,
        setState,
        userData.userId,
        'getInTouch',
        serverFormattedDate,
        false,
        { currentFilter, isDateInRange }
      );

      handleSubmit(userData, 'overwrite');
    };

    return (
      <UnderlinedInput
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={handleBlur}
        style={{ marginLeft: 0, textAlign: 'left' }}
      />
    );
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <GetInTouchInput />
      <ActionButton label="3д" days={3} onClick={handleAddDays} />
      {/* <ActionButton label="7д" days={7} onClick={handleAddDays} /> */}
      <ActionButton label="1м" days={30} onClick={handleAddDays} />
      <ActionButton label="3м" days={90} onClick={handleAddDays} />
      <ActionButton label="6м" days={180} onClick={handleAddDays} />
      <ActionButton label="1р" days={365} onClick={handleAddDays} />
      <ActionButton label="99" onClick={handleSendToEnd} />
    </div>
  );
};
