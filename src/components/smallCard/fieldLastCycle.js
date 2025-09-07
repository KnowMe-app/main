import React from 'react';
import { handleChange, handleSubmit } from './actions';
import { formatDateToDisplay, formatDateToServer } from 'components/inputValidations';
import { UnderlinedInput, AttentionButton, color } from 'components/styles';

const calculateNextDate = dateString => {
  if (!dateString) return '';

  const inputPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (inputPattern.test(dateString)) {
    const [day, month, year] = dateString.split('.');
    dateString = `${year}-${month}-${day}`;
  }

  const storagePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!storagePattern.test(dateString)) {
    console.error('Invalid date format after conversion:', dateString);
    return '';
  }

  const [year, month, day] = dateString.split('-').map(Number);
  const currentDate = new Date(year, month - 1, day);

  if (isNaN(currentDate.getTime())) {
    console.error('Invalid date object:', currentDate);
    return '';
  }

  currentDate.setDate(currentDate.getDate() + 28);

  const dayFormatted = String(currentDate.getDate()).padStart(2, '0');
  const monthFormatted = String(currentDate.getMonth() + 1).padStart(2, '0');
  const yearFormatted = currentDate.getFullYear();

  return `${dayFormatted}.${monthFormatted}.${yearFormatted}`;
};

const parseDate = dateString => {
  if (!dateString) return null;

  const inputPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (inputPattern.test(dateString)) {
    const [day, month, year] = dateString.split('.');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const storagePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (storagePattern.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  return null;
};

const formatDate = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

export const FieldLastCycle = ({ userData, setUsers, setState, isToastOn }) => {
  const [isPregnant, setIsPregnant] = React.useState(false);

  const nextCycle = React.useMemo(() => calculateNextDate(userData.lastCycle), [userData.lastCycle]);

  const handleLastCycleChange = e => {
    const value = e.target.value.trim();
    const weekPattern = /^(\d+)([тtw])$/i;

    if (isPregnant && weekPattern.test(value)) {
      const weeks = parseInt(value, 10);
      const today = new Date();
      const lastCycleDate = new Date(today);
      lastCycleDate.setDate(today.getDate() - weeks * 7);

      const lastDelivery = new Date(lastCycleDate);
      lastDelivery.setDate(lastDelivery.getDate() + 7 * 40);

      const getInTouch = new Date(lastDelivery);
      getInTouch.setMonth(getInTouch.getMonth() + 9);

      const existingLastDelivery = parseDate(userData.lastDelivery);
      const hasUpcomingDelivery = existingLastDelivery && existingLastDelivery > today;
      const ownKids = hasUpcomingDelivery
        ? Number(userData.ownKids || 0)
        : Number(userData.ownKids || 0) + 1;

      handleChange(
        setUsers,
        setState,
        userData.userId,
        'lastCycle',
        formatDateToServer(formatDate(lastCycleDate)),
        true,
        {},
        isToastOn,
      );

      handleChange(
        setUsers,
        setState,
        userData.userId,
        'lastDelivery',
        formatDate(lastDelivery),
        true,
        {},
        isToastOn,
      );

      handleChange(
        setUsers,
        setState,
        userData.userId,
        'getInTouch',
        formatDateToServer(formatDate(getInTouch)),
        true,
        {},
        isToastOn,
      );

      handleChange(
        setUsers,
        setState,
        userData.userId,
        'ownKids',
        ownKids,
        true,
        {},
        isToastOn,
      );
    } else {
      const serverFormattedDate = formatDateToServer(value);
      handleChange(setUsers, setState, userData.userId, 'lastCycle', serverFormattedDate);
    }
  };

  const handlePregnantClick = () => {
    setIsPregnant(prev => {
      const newState = !prev;
      if (!prev) {
        const lastCycleDate = parseDate(userData.lastCycle);
        if (lastCycleDate) {
          const lastDelivery = new Date(lastCycleDate);
          lastDelivery.setDate(lastDelivery.getDate() + 7 * 40);

          const getInTouch = new Date(lastDelivery);
          getInTouch.setMonth(getInTouch.getMonth() + 9);

          const ownKids = Number(userData.ownKids || 0) + 1;

          handleChange(
            setUsers,
            setState,
            userData.userId,
            'lastDelivery',
            formatDate(lastDelivery),
            true,
            {},
            isToastOn,
          );

          handleChange(
            setUsers,
            setState,
            userData.userId,
            'getInTouch',
            formatDateToServer(formatDate(getInTouch)),
            true,
            {},
            isToastOn,
          );

          handleChange(
            setUsers,
            setState,
            userData.userId,
            'ownKids',
            ownKids,
            true,
            {},
            isToastOn,
          );
        }
      }
      return newState;
    });
  };

  return (
    <React.Fragment>
      <style>
        {`
      input::placeholder {
        color: white;
        opacity: 1;
      }
    `}
      </style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
        <UnderlinedInput
          type="text"
          value={formatDateToDisplay(userData.lastCycle) || ''}
          placeholder="міс"
          onChange={handleLastCycleChange}
          onBlur={() => handleSubmit(userData, 'overwrite', isToastOn)}
          style={{
            marginLeft: 0,
            textAlign: 'left',
            color: 'white',
          }}
        />
        <span
          onClick={handlePregnantClick}
          style={{
            cursor: 'pointer',
            marginLeft: '10px',
            marginRight: '5px',
            color: isPregnant ? color.accent : 'white',
          }}
        >
          {isPregnant ? 'вагітна' : 'місячні'}
        </span>
        {!isPregnant && nextCycle && (
          <React.Fragment>
            <span style={{ marginRight: '5px', color: 'white' }}>-</span>
            <AttentionButton
              onClick={() =>
                handleChange(
                  setUsers,
                  setState,
                  userData.userId,
                  'getInTouch',
                  nextCycle,
                  true,
                  {},
                  isToastOn,
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

