import React from 'react';
import { handleChange, handleSubmit } from './smallCard/actions';

const parseDate = str => {
  if (!str) return null;
  const inputPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (inputPattern.test(str)) {
    const [day, month, year] = str.split('.');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const storagePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (storagePattern.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return null;
};

const formatDateToServer = date => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDisplay = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
};

const isWeekend = date => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const diffDays = (date, base) =>
  Math.round((date - base) / (1000 * 60 * 60 * 24)) + 1;

const adjustForward = (date, base) => {
  let day = diffDays(date, base);
  let moved = false;
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
    day = diffDays(date, base);
    moved = true;
  }
  return { date, day, sign: moved ? '+' : '' };
};

const adjustBackward = (date, base) => {
  let day = diffDays(date, base);
  let moved = false;
  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
    day = diffDays(date, base);
    moved = true;
  }
  return { date, day, sign: moved ? '-' : '' };
};

const weekdayNames = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const generateSchedule = base => {
  const visits = [];

  // Day 2
  let d = new Date(base);
  d.setDate(base.getDate() + 1);
  let first = adjustForward(d, base);
  visits.push({
    key: 'visit1',
    date: first.date,
    label: `${first.day}й день${first.sign ? ` - ${first.sign}` : ''}`,
  });
  const shifted = first.day === 4;

  // Day 7 (may shift to 8)
  d = new Date(base);
  d.setDate(base.getDate() + 6 + (shifted ? 1 : 0));
  let second = adjustBackward(d, base);
  visits.push({
    key: 'visit2',
    date: second.date,
    label: `${second.day}й день${second.sign ? ` - ${second.sign}` : ''}`,
  });

  // Days 11-13 or 13-15
  let start = 11 + (shifted ? 2 : 0);
  let third;
  for (let n = start; n <= start + 2; n++) {
    d = new Date(base);
    d.setDate(base.getDate() + n - 1);
    if (!isWeekend(d)) {
      third = { date: d, day: n };
      break;
    }
  }
  if (!third) {
    d = new Date(base);
    d.setDate(base.getDate() + start + 1);
    third = adjustBackward(d, base);
  }
  visits.push({
    key: 'visit3',
    date: third.date,
    label: `${third.day}й день${third.sign ? ` - ${third.sign}` : ''}`,
  });

  // Transfer 19-22
  let transfer;
  for (let n = 19; n <= 22; n++) {
    d = new Date(base);
    d.setDate(base.getDate() + n - 1);
    if (!isWeekend(d)) {
      transfer = { date: d, day: n, sign: '' };
      break;
    }
  }
  if (!transfer) {
    d = new Date(base);
    d.setDate(base.getDate() + 21);
    transfer = adjustBackward(d, base);
  }
  visits.push({
    key: 'transfer',
    date: transfer.date,
    label: `${transfer.day}й день (перенос)${transfer.sign ? ` - ${transfer.sign}` : ''}`,
  });

  // HCG 12 days after transfer
  d = new Date(transfer.date);
  d.setDate(d.getDate() + 12);
  let hcg = adjustForward(d, transfer.date);
  visits.push({
    key: 'hcg',
    date: hcg.date,
    label: `ХГЧ${hcg.sign ? ` - ${hcg.sign}` : ''}`,
  });

  // Ultrasound 28 days after transfer
  d = new Date(transfer.date);
  d.setDate(d.getDate() + 28);
  let us = adjustForward(d, transfer.date);
  visits.push({
    key: 'us',
    date: us.date,
    label: `УЗД${us.sign ? ` - ${us.sign}` : ''}`,
  });

  return visits;
};

const StimulationSchedule = ({ userData, setUsers, setState, isToastOn = false }) => {
  const base = parseDate(userData?.lastCycle);
  const [schedule, setSchedule] = React.useState([]);

  const saveSchedule = React.useCallback(
    sched => {
      const payload = sched.map(item => ({
        key: item.key,
        date: formatDateToServer(item.date),
        label: item.label,
      }));
      if (setUsers && setState) {
        handleChange(
          setUsers,
          setState,
          userData.userId,
          'stimulationSchedule',
          payload,
          true,
          {},
          isToastOn,
        );
      } else if (setState) {
        setState(prev => ({ ...prev, stimulationSchedule: payload }));
        handleSubmit(
          { ...userData, stimulationSchedule: payload },
          'overwrite',
          isToastOn,
        );
      }
    },
    [setUsers, setState, userData, isToastOn],
  );

  React.useEffect(() => {
    if (!userData?.stimulation || !base) return;
    if (userData.stimulationSchedule) {
      const parsed = userData.stimulationSchedule.map(item => ({
        ...item,
        date: parseDate(item.date),
      }));
      setSchedule(parsed);
    } else {
      const gen = generateSchedule(base);
      setSchedule(gen);
      saveSchedule(gen);
    }
  }, [userData.stimulationSchedule, userData.stimulation, base, saveSchedule]);

  const shiftDate = (idx, delta) => {
    setSchedule(prev => {
      const copy = [...prev];
      const item = copy[idx];
      const newDate = new Date(item.date);
      newDate.setDate(newDate.getDate() + delta);

      if (item.key === 'hcg' || item.key === 'us') {
        const adjusted = delta > 0 ? adjustForward(newDate, base) : adjustBackward(newDate, base);
        const labelText = item.key === 'hcg' ? 'ХГЧ' : 'УЗД';
        copy[idx] = {
          ...item,
          date: adjusted.date,
          label: `${labelText}${adjusted.sign ? ` - ${adjusted.sign}` : ''}`,
        };
      } else {
        const adjusted = delta > 0 ? adjustForward(newDate, base) : adjustBackward(newDate, base);
        const newLabel = `${adjusted.day}й день${
          item.key === 'transfer' ? ' (перенос)' : ''
        }${adjusted.sign ? ` - ${adjusted.sign}` : ''}`;
        copy[idx] = { ...item, date: adjusted.date, label: newLabel };
      }

      saveSchedule(copy);
      return copy;
    });
  };

  if (!userData?.stimulation || !base || schedule.length === 0) return null;

  const year = base.getFullYear();

  return (
    <div style={{ marginTop: '8px' }}>
      <div>{year}</div>
      {schedule.map((item, i) => {
        const dateStr = formatDisplay(item.date);
        const weekday = weekdayNames[item.date.getDay()];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={() => shiftDate(i, -1)}>-</button>
            <div>
              {dateStr} - {item.label}
              {i === 1 && ` (${weekday})`}
            </div>
            <button onClick={() => shiftDate(i, 1)}>+</button>
          </div>
        );
      })}
    </div>
  );
};

export default StimulationSchedule;

