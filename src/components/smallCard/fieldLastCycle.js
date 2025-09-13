import React from 'react';
import { handleChange, handleSubmit } from './actions';
import { formatDateToDisplay, formatDateToServer } from 'components/inputValidations';
import { generateSchedule, serializeSchedule } from '../StimulationSchedule';
import {
  UnderlinedInput,
  AttentionButton,
  AttentionDiv,
} from 'components/styles';

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

  const weekPattern = /^(\d+)([тtw])$/i;
  if (weekPattern.test(dateString)) {
    const weeks = parseInt(dateString, 10);
    const today = new Date();
    const lastCycleDate = new Date(today);
    lastCycleDate.setDate(today.getDate() - weeks * 7);
    return lastCycleDate;
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
  const [status, setStatus] = React.useState('menstruation');
  const submittedRef = React.useRef(false);
  const prevDataRef = React.useRef(null);
  const [localValue, setLocalValue] = React.useState(
    formatDateToDisplay(userData.lastCycle) || ''
  );

  const nextCycle = React.useMemo(() => calculateNextDate(userData.lastCycle), [userData.lastCycle]);

  const weeksSinceLastCycle = React.useMemo(() => {
    const lastCycleDate = parseDate(userData.lastCycle);
    if (!lastCycleDate) return 0;
    return Math.floor(
      (Date.now() - lastCycleDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
  }, [userData.lastCycle]);

  React.useEffect(() => {
    const date = parseDate(userData.lastDelivery);
    if (date && date > new Date()) {
      setStatus('pregnant');
    } else if (userData.stimulation) {
      setStatus('stimulation');
    } else {
      setStatus('menstruation');
    }
  }, [userData.lastDelivery, userData.stimulation]);

  React.useEffect(() => {
    setLocalValue(formatDateToDisplay(userData.lastCycle) || '');
  }, [userData.lastCycle]);

  const processLastCycle = value => {
    const val = value.trim();
    const date = parseDate(val);

    if (date) {
      const lastCycleFormatted = formatDateToServer(formatDate(date));

      if (status === 'pregnant') {
        const lastDelivery = new Date(date);
        lastDelivery.setDate(lastDelivery.getDate() + 7 * 40);

        const getInTouch = new Date(lastDelivery);
        getInTouch.setMonth(getInTouch.getMonth() + 9);

        const existingLastDelivery = parseDate(userData.lastDelivery);
        const today = new Date();
        const hasUpcomingDelivery = existingLastDelivery && existingLastDelivery > today;
        const ownKids = hasUpcomingDelivery
          ? Number(userData.ownKids || 0)
          : Number(userData.ownKids || 0) + 1;

        const lastDeliveryFormatted = formatDateToServer(formatDate(lastDelivery));
        const getInTouchFormatted = formatDateToServer(formatDate(getInTouch));

        handleChange(setUsers, setState, userData.userId, {
          lastCycle: lastCycleFormatted,
          lastDelivery: lastDeliveryFormatted,
          getInTouch: getInTouchFormatted,
          ownKids,
        });

        handleSubmit(
          {
            ...userData,
            lastCycle: lastCycleFormatted,
            lastDelivery: lastDeliveryFormatted,
            getInTouch: getInTouchFormatted,
            ownKids,
          },
          'overwrite',
          isToastOn,
        );
        submittedRef.current = true;
      } else {
        handleChange(setUsers, setState, userData.userId, 'lastCycle', lastCycleFormatted);
        handleSubmit({ ...userData, lastCycle: lastCycleFormatted }, 'overwrite', isToastOn);
        submittedRef.current = true;
      }
    } else {
      const serverFormattedDate = formatDateToServer(val);
      handleChange(setUsers, setState, userData.userId, 'lastCycle', serverFormattedDate);
      handleSubmit({ ...userData, lastCycle: serverFormattedDate }, 'overwrite', isToastOn);
      submittedRef.current = true;
    }
  };

  const handleLastCycleChange = e => {
    setLocalValue(e.target.value);
  };

  const handleStatusClick = () => {
    setStatus(prev => {
      const newState = prev === 'menstruation' ? 'stimulation' : prev === 'stimulation' ? 'pregnant' : 'menstruation';
      if (newState === 'stimulation') {
        const baseDate = parseDate(userData.lastCycle);
        let scheduleString = '';
        if (baseDate) {
          const sched = generateSchedule(baseDate);
          scheduleString = serializeSchedule(sched);
        }
        handleChange(
          setUsers,
          setState,
          userData.userId,
          { stimulation: true, stimulationSchedule: scheduleString },
          true,
          {},
          isToastOn,
        );
        handleSubmit(
          { ...userData, stimulation: true, stimulationSchedule: scheduleString },
          'overwrite',
          isToastOn,
        );
        submittedRef.current = true;
      } else if (prev === 'stimulation') {
        handleChange(
          setUsers,
          setState,
          userData.userId,
          { stimulation: false, stimulationSchedule: '' },
          true,
          {},
          isToastOn,
        );
        handleSubmit(
          { ...userData, stimulation: false, stimulationSchedule: '' },
          'overwrite',
          isToastOn,
        );
        submittedRef.current = true;
      }
      if (newState === 'pregnant') {
        if (!prevDataRef.current) {
          prevDataRef.current = {
            lastCycle: userData.lastCycle,
            lastDelivery: userData.lastDelivery,
            getInTouch: userData.getInTouch,
            ownKids: userData.ownKids,
          };
        }
        const lastCycleDate = parseDate(userData.lastCycle);
        if (lastCycleDate) {
          const lastDelivery = new Date(lastCycleDate);
          lastDelivery.setDate(lastDelivery.getDate() + 7 * 40);

          const getInTouch = new Date(lastDelivery);
          getInTouch.setMonth(getInTouch.getMonth() + 9);

          const existingLastDelivery = parseDate(userData.lastDelivery);
          const today = new Date();
          const hasUpcomingDelivery = existingLastDelivery && existingLastDelivery > today;
          const ownKids = hasUpcomingDelivery
            ? Number(userData.ownKids || 0)
            : Number(userData.ownKids || 0) + 1;

          const lastCycleFormatted = formatDateToServer(formatDate(lastCycleDate));
          const lastDeliveryFormatted = formatDateToServer(formatDate(lastDelivery));
          const getInTouchFormatted = formatDateToServer(formatDate(getInTouch));

          handleChange(setUsers, setState, userData.userId, {
            lastCycle: lastCycleFormatted,
            lastDelivery: lastDeliveryFormatted,
            getInTouch: getInTouchFormatted,
            ownKids,
          });

          handleSubmit(
            {
              ...userData,
              lastCycle: lastCycleFormatted,
              lastDelivery: lastDeliveryFormatted,
              getInTouch: getInTouchFormatted,
              ownKids,
            },
            'overwrite',
            isToastOn,
          );
          submittedRef.current = true;
        }
      } else if (prev === 'pregnant' && prevDataRef.current) {
        handleChange(setUsers, setState, userData.userId, prevDataRef.current);
        handleSubmit(
          { ...userData, ...prevDataRef.current },
          'overwrite',
          isToastOn,
        );
        submittedRef.current = true;
        prevDataRef.current = null;
      }
      return newState;
    });
  };

  const recalcSchedule = React.useCallback(
    dateString => {
      const baseDate = parseDate(dateString);
      if (!baseDate) return;
      const sched = generateSchedule(baseDate);
      const scheduleString = serializeSchedule(sched);
      handleChange(
        setUsers,
        setState,
        userData.userId,
        'stimulationSchedule',
        scheduleString,
      );
    },
    [setUsers, setState, userData.userId],
  );

  const saveSchedule = React.useCallback(() => {
    const scheduleString = userData.stimulationSchedule || '';
    handleChange(
      setUsers,
      setState,
      userData.userId,
      'stimulationSchedule',
      scheduleString,
      false,
      {},
      isToastOn,
    );
    handleSubmit(
      { ...userData, stimulationSchedule: scheduleString },
      'overwrite',
      isToastOn,
    );
  }, [setUsers, setState, userData, isToastOn]);

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
          value={localValue}
          placeholder="міс"
          onChange={handleLastCycleChange}
          onBlur={() => {
            processLastCycle(localValue);
            if (status === 'stimulation') {
              recalcSchedule(localValue);
            }
            if (!submittedRef.current) {
              handleSubmit(userData, 'overwrite', isToastOn);
            }
            submittedRef.current = false;
          }}
          style={{
            textAlign: 'left',
            color: 'white',
          }}
        />
        {status === 'pregnant' ? (
          <React.Fragment>
            <AttentionDiv
              onClick={handleStatusClick}
              style={{
                cursor: 'pointer',
                backgroundColor: 'hotpink',
              }}
            >
              вагітна
            </AttentionDiv>
            <span>{`${weeksSinceLastCycle}т`}</span>
          </React.Fragment>
        ) : status === 'stimulation' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AttentionDiv
              onClick={handleStatusClick}
              style={{
                cursor: 'pointer',
                backgroundColor: 'orange',
              }}
            >
              стимуляція
            </AttentionDiv>
            <AttentionButton
              onClick={saveSchedule}
              style={{ backgroundColor: 'orange' }}
            >
              ↻
            </AttentionButton>
          </div>
        ) : (
          <span
            onClick={handleStatusClick}
            style={{
              cursor: 'pointer',
              color: 'white',
            }}
          >
            місячні
          </span>
        )}
        {status !== 'pregnant' && nextCycle && (
          <React.Fragment>
            <span style={{ color: 'white' }}>-</span>
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

