import { handleChange, handleSubmit } from './actions';
import { formatDateToDisplay, formatDateToServer } from 'components/inputValidations';
import { UnderlinedInput, AttentionButton } from 'components/styles';
import React from 'react';

const calculateNextDate = dateString => {
  if (!dateString) return '';

  // Перевіряємо, чи введена дата у форматі DD.MM.YYYY
  const inputPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (inputPattern.test(dateString)) {
    // Перетворюємо DD.MM.YYYY у формат YYYY-MM-DD
    const [day, month, year] = dateString.split('.');
    dateString = `${year}-${month}-${day}`;
  }

  // Перевіряємо, чи дата тепер у форматі YYYY-MM-DD
  const storagePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!storagePattern.test(dateString)) {
    console.error('Invalid date format after conversion:', dateString);
    return '';
  }

  // Створюємо об'єкт дати
  const [year, month, day] = dateString.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);

  // Перевіряємо, чи дата валідна
  if (isNaN(currentDate.getTime())) {
    console.error('Invalid date object:', currentDate);
    return '';
  }

  // Додаємо 28 днів
  currentDate.setDate(currentDate.getDate() + 28);

  // Форматуємо результат у форматі DD.MM.YYYY
  const dayFormatted = String(currentDate.getDate()).padStart(2, '0');
  const monthFormatted = String(currentDate.getMonth() + 1).padStart(2, '0');
  const yearFormatted = currentDate.getFullYear();

  return `${dayFormatted}.${monthFormatted}.${yearFormatted}`;
  // return `${dayFormatted}.${monthFormatted}`;
};

export const fieldLastCycle = (userData, setUsers, setState) => {
  const nextCycle = calculateNextDate(userData.lastCycle);

  return (
    <React.Fragment>
      <style>
        {`
      input::placeholder {
        color: white; /* Робимо плейсхолдер білим */
        opacity: 1;   /* Для чіткої видимості */
      }
    `}
      </style>
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <UnderlinedInput
          type="text"
          value={formatDateToDisplay(userData.lastCycle) || ''}
          placeholder="міс"
          onChange={e => {
            // Повертаємо формат YYYY-MM-DD для збереження
            const serverFormattedDate = formatDateToServer(e.target.value);
            handleChange(setUsers, setState, userData.userId, 'lastCycle', serverFormattedDate);
          }}
          onBlur={() => handleSubmit(userData, 'overwrite')}
          // placeholder="01.01.2021"
          style={{
            marginLeft: 0,
            textAlign: 'left',
            color: 'white', // Колір текст
          }}
        />
        {/* {nextCycle && <span> місячні - {nextCycle}</span>} */}
        {nextCycle && (
          <React.Fragment>
            <span style={{ marginLeft: '10px', marginRight: '5px', color: 'white' }}>місячні -</span>
            <AttentionButton
              onClick={() =>
                handleChange(
                  setUsers,
                  setState,
                  userData.userId,
                  'getInTouch',
                  nextCycle,
                  true,
                )
              }
              style={{ backgroundColor: '#007BFF' }}
            >
              {nextCycle.slice(0, 5)}
            </AttentionButton>
          </React.Fragment>
        )}
      </div>
    </React.Fragment>
  );
};
