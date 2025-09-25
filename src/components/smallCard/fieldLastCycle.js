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

const normalizeDate = date => {
  if (!date) return null;
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return normalizeDate(a).getTime() === normalizeDate(b).getTime();
};

const normalizeScheduleEntries = schedule => {
  if (!schedule) return [];
  if (Array.isArray(schedule)) {
    const today = normalizeDate(new Date());
    return schedule
      .map(item => {
        const date = parseDate(item.date);
        if (!date) return null;
        let key = item.key || '';
        if (!key) {
          if (/перенос/.test(item.label || '')) key = 'transfer';
          else if (/ХГЧ/.test(item.label || '')) key = 'hcg';
          else if (/УЗД|ЗД/.test(item.label || '')) key = 'us';
        }
        if (!key) key = `ap-${date.getTime()}`;
        if (key === 'today-placeholder' && !isSameDay(date, today)) {
          key = `ap-${date.getTime()}`;
        }
        return {
          ...item,
          key,
          date,
        };
      })
      .filter(item => item && item.date);
  }

  const lines = String(schedule)
    .split('\n')
    .filter(Boolean);
  const today = normalizeDate(new Date());
  let visitCount = 0;

  return lines
    .map((line, idx) => {
      const parts = line.split('\t');
      const datePart = parts[0]?.trim();
      const storedKey = parts.length > 2 ? parts[1]?.trim() : '';
      const label = parts
        .slice(parts.length > 2 ? 2 : 1)
        .join('\t')
        .trim();
      const date = parseDate(datePart);
      if (!date) return null;
      let key = storedKey;
      if (!key) {
        if (/перенос/.test(label)) key = 'transfer';
        else if (/ХГЧ/.test(label)) key = 'hcg';
        else if (/УЗД|ЗД/.test(label)) key = 'us';
        else if (/й день/.test(label)) {
          visitCount += 1;
          key = `visit${visitCount}`;
        } else if (/(\d+)т/.test(label)) {
          const week = /(\d+)т/.exec(label)[1];
          key = `week${week}`;
        } else {
          key = `ap-${idx}`;
        }
      }
      if (key === 'today-placeholder' && !isSameDay(date, today)) {
        key = `ap-${idx}`;
      }
      return { key, date, label };
    })
    .filter(item => item && item.date);
};

const isDefaultSchedule = (lastCycle, scheduleString) => {
  if (!lastCycle || !scheduleString) return false;
  const baseDate = parseDate(lastCycle);
  if (!baseDate) return false;
  const defaultString = serializeSchedule(generateSchedule(baseDate));
  const normalized = serializeSchedule(normalizeScheduleEntries(scheduleString));
  return defaultString === normalized;
};

const formatDate = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

export const FieldLastCycle = ({ userData, setUsers, setState, isToastOn }) => {
  const [status, setStatus] = React.useState(userData.cycleStatus ?? '');
  const submittedRef = React.useRef(false);
  const [localValue, setLocalValue] = React.useState(formatDateToDisplay(userData.lastCycle) || '');
  const [showConfirm, setShowConfirm] = React.useState(false);
  const pendingValueRef = React.useRef('');

  const nextCycle = React.useMemo(() => calculateNextDate(userData.lastCycle), [userData.lastCycle]);

  const pregnancyDuration = React.useMemo(() => {
    const lastCycleDate = parseDate(userData.lastCycle);
    if (!lastCycleDate) {
      return { weeks: 0, days: 1 };
    }

    const diffMs = Date.now() - lastCycleDate.getTime();
    if (diffMs <= 0) {
      return { weeks: 0, days: 1 };
    }

    const totalDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const weeks = Math.floor(totalDays / 7);
    const days = (totalDays % 7) + 1;

    return { weeks, days };
  }, [userData.lastCycle]);

  const scheduleIsDefault = React.useMemo(
    () => isDefaultSchedule(userData.lastCycle, userData.stimulationSchedule),
    [userData.lastCycle, userData.stimulationSchedule]
  );

  React.useEffect(() => {
    setStatus(userData.cycleStatus ?? '');
  }, [userData.cycleStatus]);

  React.useEffect(() => {
    setLocalValue(formatDateToDisplay(userData.lastCycle) || '');
  }, [userData.lastCycle]);

  const processLastCycle = value => {
    const val = value.trim();
    const date = parseDate(val);
    const normalizedStatus = status || (val ? 'menstruation' : '');

    if (!status && normalizedStatus) {
      setStatus(normalizedStatus);
    }

    if (date) {
      const lastCycleFormatted = formatDateToServer(formatDate(date));

      if (normalizedStatus === 'pregnant') {
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

        const updates = {
          lastCycle: lastCycleFormatted,
          lastDelivery: lastDeliveryFormatted,
          getInTouch: getInTouchFormatted,
          ownKids,
          cycleStatus: normalizedStatus,
        };
        handleChange(setUsers, setState, userData.userId, updates);
        handleSubmit({ userId: userData.userId, ...updates }, 'overwrite', isToastOn);
        submittedRef.current = true;
      } else {
        const updates = normalizedStatus
          ? { lastCycle: lastCycleFormatted, cycleStatus: normalizedStatus }
          : { lastCycle: lastCycleFormatted };
        handleChange(setUsers, setState, userData.userId, updates);
        handleSubmit({ userId: userData.userId, ...updates }, 'overwrite', isToastOn);
        submittedRef.current = true;
      }
    } else {
      const serverFormattedDate = formatDateToServer(val);
      const updates = normalizedStatus
        ? { lastCycle: serverFormattedDate, cycleStatus: normalizedStatus }
        : { lastCycle: serverFormattedDate };
      handleChange(setUsers, setState, userData.userId, updates);
      handleSubmit({ userId: userData.userId, ...updates }, 'overwrite', isToastOn);
      submittedRef.current = true;
    }
  };

  const handleLastCycleChange = e => {
    setLocalValue(e.target.value);
  };

  const handleStatusClick = () => {
    setStatus(prev => {
      const newState =
        prev === 'menstruation' ? 'stimulation' : prev === 'stimulation' ? 'pregnant' : 'menstruation';
      const updates = { cycleStatus: newState };

      if (newState === 'pregnant') {
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

          updates.lastCycle = formatDateToServer(formatDate(lastCycleDate));
          updates.lastDelivery = formatDateToServer(formatDate(lastDelivery));
          updates.getInTouch = formatDateToServer(formatDate(getInTouch));
          updates.ownKids = ownKids;
        }
      } else {
        if (prev === 'pregnant') {
          ['getInTouch', 'lastDelivery', 'ownKids'].forEach(field => {
            if (userData[field] !== undefined) updates[field] = undefined;
          });
        }
        if (prev === 'stimulation' && userData.stimulationSchedule !== undefined) {
          updates.stimulationSchedule = undefined;
        }
      }

      handleChange(setUsers, setState, userData.userId, updates);
      handleSubmit({ userId: userData.userId, ...updates }, 'overwrite', isToastOn);
      submittedRef.current = true;
      return newState;
    });
  };

  const recalcSchedule = React.useCallback(dateString => {
    const baseDate = parseDate(dateString);
    if (!baseDate) return '';
    const sched = generateSchedule(baseDate);
    return serializeSchedule(sched);
  }, []);

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
        handleSubmit(
          { userId: userData.userId, stimulationSchedule: undefined },
          'overwrite',
          isToastOn,
        );
      }
    }
    if (!submittedRef.current) {
      handleSubmit({ userId: userData.userId }, 'overwrite', isToastOn);
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
                handleSubmit(
                  { userId: userData.userId, stimulationSchedule: undefined },
                  'overwrite',
                  isToastOn,
                );
              }
            }
            if (!submittedRef.current) {
              handleSubmit({ userId: userData.userId }, 'overwrite', isToastOn);
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
      handleSubmit(
        { userId: userData.userId, stimulationSchedule: undefined },
        'overwrite',
        isToastOn,
      );
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
        { userId: userData.userId, stimulationSchedule: scheduleString },
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
        handleSubmit(
          { userId: userData.userId, stimulationSchedule: undefined },
          'overwrite',
          isToastOn,
        );
      }
    }
    if (!submittedRef.current) {
      handleSubmit({ userId: userData.userId }, 'overwrite', isToastOn);
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
            <span>{`${pregnancyDuration.weeks}т${pregnancyDuration.days}д`}</span>
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
