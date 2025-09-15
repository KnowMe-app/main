import React from 'react';
import { handleChange, handleSubmit } from './actions';
import { formatDateToDisplay, formatDateToServer } from 'components/inputValidations';
import { generateSchedule, serializeSchedule } from '../StimulationSchedule';
import InfoModal from 'components/InfoModal';
import { UnderlinedInput, AttentionButton, AttentionDiv, OrangeBtn, color } from 'components/styles';

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

const isDefaultSchedule = (lastCycle, scheduleString) => {
  if (!lastCycle || !scheduleString) return false;
  const baseDate = parseDate(lastCycle);
  if (!baseDate) return false;
  const defaultString = serializeSchedule(generateSchedule(baseDate));
  return defaultString === scheduleString;
};

const formatDate = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

export const FieldLastCycle = ({ userData, setUsers, setState, isToastOn }) => {
  const [status, setStatus] = React.useState(userData.cycleStatus || 'menstruation');
  const submittedRef = React.useRef(false);
  const prevDataRef = React.useRef(null);
  const [localValue, setLocalValue] = React.useState(formatDateToDisplay(userData.lastCycle) || '');
  const [showConfirm, setShowConfirm] = React.useState(false);
  const pendingValueRef = React.useRef('');

  const nextCycle = React.useMemo(() => calculateNextDate(userData.lastCycle), [userData.lastCycle]);

  const weeksSinceLastCycle = React.useMemo(() => {
    const lastCycleDate = parseDate(userData.lastCycle);
    if (!lastCycleDate) return 0;
    return Math.floor((Date.now() - lastCycleDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
  }, [userData.lastCycle]);

  const scheduleIsDefault = React.useMemo(
    () => isDefaultSchedule(userData.lastCycle, userData.stimulationSchedule),
    [userData.lastCycle, userData.stimulationSchedule]
  );

  React.useEffect(() => {
    setStatus(userData.cycleStatus || 'menstruation');
  }, [userData.cycleStatus]);

  React.useEffect(() => {
    setLocalValue(formatDateToDisplay(userData.lastCycle) || '');
  }, [userData.lastCycle]);

  React.useEffect(() => {
    if (userData.cycleStatus === 'pregnant' && !prevDataRef.current) {
      prevDataRef.current = {
        lastCycle: userData.lastCycle,
        lastDelivery: userData.lastDelivery,
        getInTouch: userData.getInTouch,
        ownKids: userData.ownKids,
      };
    }
  }, [userData]);

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
        const ownKids = hasUpcomingDelivery ? Number(userData.ownKids || 0) : Number(userData.ownKids || 0) + 1;

        const lastDeliveryFormatted = formatDateToServer(formatDate(lastDelivery));
        const getInTouchFormatted = formatDateToServer(formatDate(getInTouch));

        handleChange(setUsers, setState, userData.userId, {
          lastCycle: lastCycleFormatted,
          lastDelivery: lastDeliveryFormatted,
          getInTouch: getInTouchFormatted,
          ownKids,
          cycleStatus: status,
        });

        handleSubmit(
          {
            ...userData,
            lastCycle: lastCycleFormatted,
            lastDelivery: lastDeliveryFormatted,
            getInTouch: getInTouchFormatted,
            ownKids,
            cycleStatus: status,
          },
          'overwrite',
          isToastOn
        );
        submittedRef.current = true;
      } else {
        handleChange(setUsers, setState, userData.userId, {
          lastCycle: lastCycleFormatted,
          cycleStatus: status,
        });
        handleSubmit({ ...userData, lastCycle: lastCycleFormatted, cycleStatus: status }, 'overwrite', isToastOn);
        submittedRef.current = true;
      }
    } else {
      const serverFormattedDate = formatDateToServer(val);
      handleChange(setUsers, setState, userData.userId, {
        lastCycle: serverFormattedDate,
        cycleStatus: status,
      });
      handleSubmit({ ...userData, lastCycle: serverFormattedDate, cycleStatus: status }, 'overwrite', isToastOn);
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
        handleChange(setUsers, setState, userData.userId, { stimulation: true, cycleStatus: 'stimulation' }, true, {}, isToastOn);
        handleSubmit({ ...userData, stimulation: true, cycleStatus: 'stimulation' }, 'overwrite', isToastOn);
        submittedRef.current = true;
      } else if (prev === 'stimulation') {
        const updates = { stimulation: false, cycleStatus: newState };
        const submitObj = { ...userData, stimulation: false, cycleStatus: newState };
        if (userData.stimulationSchedule !== undefined) {
          updates.stimulationSchedule = undefined;
          submitObj.stimulationSchedule = undefined;
        }
        handleChange(setUsers, setState, userData.userId, updates, true, {}, isToastOn);
        handleSubmit(submitObj, 'overwrite', isToastOn);
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
          const ownKids = hasUpcomingDelivery ? Number(userData.ownKids || 0) : Number(userData.ownKids || 0) + 1;

          const lastCycleFormatted = formatDateToServer(formatDate(lastCycleDate));
          const lastDeliveryFormatted = formatDateToServer(formatDate(lastDelivery));
          const getInTouchFormatted = formatDateToServer(formatDate(getInTouch));

          handleChange(setUsers, setState, userData.userId, {
            lastCycle: lastCycleFormatted,
            lastDelivery: lastDeliveryFormatted,
            getInTouch: getInTouchFormatted,
            ownKids,
            cycleStatus: 'pregnant',
          });

          handleSubmit(
            {
              ...userData,
              lastCycle: lastCycleFormatted,
              lastDelivery: lastDeliveryFormatted,
              getInTouch: getInTouchFormatted,
              ownKids,
              cycleStatus: 'pregnant',
            },
            'overwrite',
            isToastOn
          );
          submittedRef.current = true;
        }
      } else if (prev === 'pregnant') {
        const updates = prevDataRef.current ? { ...prevDataRef.current, cycleStatus: newState } : { cycleStatus: newState };
        handleChange(setUsers, setState, userData.userId, updates);
        handleSubmit({ ...userData, ...updates }, 'overwrite', isToastOn);
        submittedRef.current = true;
        prevDataRef.current = null;
      }
      return newState;
    });
  };

  const recalcSchedule = React.useCallback(
    dateString => {
      const baseDate = parseDate(dateString);
      if (!baseDate) return '';
      const sched = generateSchedule(baseDate);
      const scheduleString = serializeSchedule(sched);
      if (userData.stimulationSchedule !== undefined) {
        handleChange(setUsers, setState, userData.userId, 'stimulationSchedule', scheduleString);
      }
      return scheduleString;
    },
    [setUsers, setState, userData.userId, userData.stimulationSchedule]
  );

  const handleBlur = () => {
    const prevDisplay = formatDateToDisplay(userData.lastCycle) || '';
    if (localValue.trim() === prevDisplay.trim()) {
      return;
    }
    if (userData.stimulationSchedule !== undefined && !scheduleIsDefault) {
      pendingValueRef.current = localValue;
      setShowConfirm(true);
      return;
    }
    processLastCycle(localValue);
    let newSchedule;
    if (status === 'stimulation') {
      newSchedule = recalcSchedule(localValue);
      if (isDefaultSchedule(localValue, newSchedule)) {
        handleChange(
          setUsers,
          setState,
          userData.userId,
          { stimulationSchedule: undefined },
          false,
          {},
          isToastOn,
        );
        const submitObj = { ...userData };
        delete submitObj.stimulationSchedule;
        handleSubmit(submitObj, 'overwrite', isToastOn);
      }
    }
    if (!submittedRef.current) {
      handleSubmit(userData, 'overwrite', isToastOn);
    }
    submittedRef.current = false;
  };

  const ConfirmReset = () => (
    <div>
      <p>Змінити дату місячних? Графік стимуляції буде скинуто.</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
        <AttentionButton
          onClick={() => {
            setShowConfirm(false);
            processLastCycle(pendingValueRef.current);
            let newSchedule;
            if (status === 'stimulation') {
              newSchedule = recalcSchedule(pendingValueRef.current);
              if (isDefaultSchedule(pendingValueRef.current, newSchedule)) {
                handleChange(
                  setUsers,
                  setState,
                  userData.userId,
                  { stimulationSchedule: undefined },
                  false,
                  {},
                  isToastOn,
                );
                const submitObj = { ...userData };
                delete submitObj.stimulationSchedule;
                handleSubmit(submitObj, 'overwrite', isToastOn);
              }
            }
            if (!submittedRef.current) {
              handleSubmit(userData, 'overwrite', isToastOn);
            }
            submittedRef.current = false;
          }}
          style={{ backgroundColor: color.accent5 }}
        >
          Так
        </AttentionButton>
        <AttentionButton
          onClick={() => {
            setShowConfirm(false);
            setLocalValue(formatDateToDisplay(userData.lastCycle) || '');
          }}
          style={{ backgroundColor: color.accent5 }}
        >
          Ні
        </AttentionButton>
      </div>
    </div>
  );

  const saveSchedule = React.useCallback(() => {
    const scheduleString = userData.stimulationSchedule || '';
    if (isDefaultSchedule(userData.lastCycle, scheduleString)) {
      handleChange(
        setUsers,
        setState,
        userData.userId,
        { stimulationSchedule: undefined },
        false,
        {},
        isToastOn,
      );
      const submitObj = { ...userData };
      delete submitObj.stimulationSchedule;
      handleSubmit(submitObj, 'overwrite', isToastOn);
    } else {
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
    }
  }, [setUsers, setState, userData, isToastOn]);

  const handleSetToday = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const formatted = `${day}.${month}.${year}`;
    if (userData.stimulationSchedule !== undefined && !scheduleIsDefault) {
      pendingValueRef.current = formatted;
      setShowConfirm(true);
      return;
    }
    processLastCycle(formatted);
    let newSchedule;
    if (status === 'stimulation') {
      newSchedule = recalcSchedule(formatted);
      if (isDefaultSchedule(formatted, newSchedule)) {
        handleChange(
          setUsers,
          setState,
          userData.userId,
          { stimulationSchedule: undefined },
          false,
          {},
          isToastOn,
        );
        const submitObj = { ...userData };
        delete submitObj.stimulationSchedule;
        handleSubmit(submitObj, 'overwrite', isToastOn);
      }
    }
    if (!submittedRef.current) {
      handleSubmit(userData, 'overwrite', isToastOn);
    }
    submittedRef.current = false;
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
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          flexWrap: 'nowrap',
        }}
      >
        <UnderlinedInput
          type="text"
          value={localValue}
          placeholder="міс"
          onChange={handleLastCycleChange}
          onBlur={handleBlur}
          style={{
            textAlign: 'left',
            color: 'white',
          }}
        />
        <OrangeBtn onClick={handleSetToday} style={{ width: '25px', height: '25px', marginLeft: '5px' }}>
          T
        </OrangeBtn>
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
            <AttentionButton onClick={saveSchedule} style={{ backgroundColor: 'orange' }}>
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
              onClick={() => handleChange(setUsers, setState, userData.userId, 'getInTouch', nextCycle, true, {}, isToastOn)}
              style={{ backgroundColor: '#007BFF' }}
            >
              {nextCycle.slice(0, 5)}
            </AttentionButton>
          </React.Fragment>
        )}
      </div>
      {showConfirm && (
        <InfoModal
          onClose={e => {
            if (e.target === e.currentTarget) {
              setShowConfirm(false);
              setLocalValue(formatDateToDisplay(userData.lastCycle) || '');
            }
          }}
          text="dotsMenu"
          Context={ConfirmReset}
        />
      )}
    </React.Fragment>
  );
};
