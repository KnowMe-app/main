import React from 'react';
import { handleChange, handleSubmit } from './smallCard/actions';
import { OrangeBtn } from 'components/styles';

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
  while (isWeekend(date)) {
    date.setDate(date.getDate() + 1);
    day = diffDays(date, base);
  }
  return { date, day, sign: '' };
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

export const generateSchedule = base => {
  const visits = [];

  // Day 2
  let d = new Date(base);
  d.setDate(base.getDate() + 1);
  let first = adjustForward(d, base);
  visits.push({
    key: 'visit1',
    date: first.date,
    label: `${first.day}й день${first.sign ? ` ${first.sign}` : ''}`,
  });
  const shifted = first.day === 4;

  // Day 7 (may shift to 8 but never earlier than 6)
  d = new Date(base);
  d.setDate(base.getDate() + 6 + (shifted ? 1 : 0));
  let second = adjustBackward(new Date(d), base);
  if (second.day < 6) {
    second = adjustForward(new Date(d), base);
  }
  visits.push({
    key: 'visit2',
    date: second.date,
    label: `${second.day}й день${second.sign ? ` ${second.sign}` : ''}`,
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
    label: `${third.day}й день${third.sign ? ` ${third.sign}` : ''}`,
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
    label: `${transfer.day}й день (перенос)${transfer.sign ? ` ${transfer.sign}` : ''}`,
  });

  // HCG 12 days after transfer
  d = new Date(transfer.date);
  d.setDate(d.getDate() + 12);
  let hcg = adjustForward(d, transfer.date);
  visits.push({
    key: 'hcg',
    date: hcg.date,
    label: `ХГЧ на 12й день${hcg.sign ? ` ${hcg.sign}` : ''}`,
  });

  // Ultrasound 28 days after transfer
  d = new Date(transfer.date);
  d.setDate(d.getDate() + 28);
  let us = adjustForward(d, transfer.date);
  visits.push({
    key: 'us',
    date: us.date,
    label: `УЗД${us.sign ? ` ${us.sign}` : ''}`,
  });

  // Pregnancy visits at specific weeks
  const weeks = [8, 10, 12, 16, 18, 28, 36, 40];
  weeks.forEach(week => {
    let wd = new Date(transfer.date);
    wd.setDate(wd.getDate() + week * 7);
    const adj = adjustForward(wd, transfer.date);
    const baseLabel =
      week === 40
        ? `Прийом на ${week}й тиждень - пологи`
        : `Прийом на ${week}й тиждень`;
    visits.push({
      key: `week${week}`,
      date: adj.date,
      label: `${baseLabel}${adj.sign ? ` ${adj.sign}` : ''}`,
    });
  });

  return visits;
};

export const serializeSchedule = sched =>
  sched
    .map(item => `${formatDisplay(item.date)} - ${item.label}`)
    .join('\n');

const StimulationSchedule = ({ userData, setUsers, setState, isToastOn = false }) => {
  const base = parseDate(userData?.lastCycle);
  const [schedule, setSchedule] = React.useState([]);
  const [apDescription, setApDescription] = React.useState('');

  const saveSchedule = React.useCallback(
    sched => {
      const scheduleString = serializeSchedule(sched);
      if (setUsers && setState) {
        handleChange(
          setUsers,
          setState,
          userData.userId,
          'stimulationSchedule',
          scheduleString,
          true,
          {},
          isToastOn,
        );
      } else if (setState) {
        setState(prev => ({ ...prev, stimulationSchedule: scheduleString }));
        handleSubmit(
          { ...userData, stimulationSchedule: scheduleString },
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
      if (typeof userData.stimulationSchedule === 'string') {
        const lines = userData.stimulationSchedule.split('\n').filter(Boolean);
        let visitCount = 0;
        const parsed = lines.map((line, idx) => {
          const [datePart, ...labelParts] = line.split(' - ');
          const label = labelParts.join(' - ').trim();
          const date = parseDate(datePart.trim());
          let key = '';
          if (/перенос/.test(label)) key = 'transfer';
          else if (/ХГЧ/.test(label)) key = 'hcg';
          else if (/УЗД|ЗД/.test(label)) key = 'us';
          else if (/Прийом на (\d+)й тиждень/.test(label)) {
            const week = /Прийом на (\d+)й тиждень/.exec(label)[1];
            key = `week${week}`;
          } else if (/й день/.test(label)) {
            visitCount += 1;
            key = `visit${visitCount}`;
          } else {
            key = `ap-${idx}`;
          }
          return { key, date, label };
        });
        setSchedule(parsed);
      } else {
        const parsed = userData.stimulationSchedule.map(item => ({
          ...item,
          date: parseDate(item.date),
        }));
        setSchedule(parsed);
      }
    } else {
      const gen = generateSchedule(base);
      setSchedule(gen);
    }
  }, [userData.stimulationSchedule, userData.stimulation, base]);

  const postTransferKeys = React.useMemo(
    () => [
      'hcg',
      'us',
      'week8',
      'week10',
      'week12',
      'week16',
      'week18',
      'week28',
      'week36',
      'week40',
    ],
    [],
  );

  const shiftDate = (idx, delta) => {
    setSchedule(prev => {
      const copy = [...prev];
      const item = copy[idx];
      const baseDate = item.date;
      const newDate = new Date(baseDate);
      newDate.setDate(newDate.getDate() + delta);

      const applyAdjust = (it, d, refBase) => {
        let adj = delta > 0 ? adjustForward(d, refBase) : adjustBackward(d, refBase);
        if (it.key === 'visit2' && adj.day < 6) {
          const min = new Date(base);
          min.setDate(base.getDate() + 5);
          adj = adjustForward(min, base);
        }
        if (postTransferKeys.includes(it.key)) {
          const labelMap = {
            hcg: 'ХГЧ на 12й день',
            us: 'УЗД',
            week8: 'Прийом на 8й тиждень',
            week10: 'Прийом на 10й тиждень',
            week12: 'Прийом на 12й тиждень',
            week16: 'Прийом на 16й тиждень',
            week18: 'Прийом на 18й тиждень',
            week28: 'Прийом на 28й тиждень',
            week36: 'Прийом на 36й тиждень',
            week40: 'Прийом на 40й тиждень - пологи',
          };
          const labelText = labelMap[it.key];
          return {
            ...it,
            date: adj.date,
            label: `${labelText}${adj.sign ? ` ${adj.sign}` : ''}`,
          };
        }
        if (it.key.startsWith('ap')) {
          return {
            ...it,
            date: adj.date,
            label: `${it.label}${adj.sign ? ` ${adj.sign}` : ''}`,
          };
        }
        const lbl = `${adj.day}й день${it.key === 'transfer' ? ' (перенос)' : ''}${
          adj.sign ? ` ${adj.sign}` : ''
        }`;
        return { ...it, date: adj.date, label: lbl };
      };

      // adjust changed item and compute actual shift
      const adjustedItem = applyAdjust(
        item,
        newDate,
        postTransferKeys.includes(item.key)
          ? copy.find(v => v.key === 'transfer')?.date || base
          : base,
      );
      const actualDelta = Math.round((adjustedItem.date - baseDate) / (1000 * 60 * 60 * 24));
      copy[idx] = adjustedItem;

      // shift subsequent items by actualDelta
      const usIndex = copy.findIndex(v => v.key === 'us');
      const limit = usIndex !== -1 && idx < usIndex ? usIndex : idx;
      for (let j = idx + 1; j < copy.length && j <= limit; j++) {
        const it = copy[j];
        const ref = postTransferKeys.includes(it.key)
          ? copy.find(v => v.key === 'transfer')?.date || base
          : base;
        const nd = new Date(it.date);
        nd.setDate(nd.getDate() + actualDelta);
        copy[j] = applyAdjust(it, nd, ref);
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
      <div style={{ display: 'flex', gap: '2px', margin: '4px 0' }}>
        <input
          type="text"
          value={apDescription}
          onChange={e => setApDescription(e.target.value)}
          placeholder="опис"
          style={{ flex: 1 }}
        />
        <OrangeBtn
          onClick={() => {
            const today = new Date();
            const adj = adjustForward(today, today);
            const newItem = {
              key: `ap-${Date.now()}`,
              date: adj.date,
              label: apDescription || 'AP',
            };
            setSchedule(prev => {
              const updated = [...prev];
              const index = updated.findIndex(it => it.date > newItem.date);
              if (index === -1) updated.push(newItem);
              else updated.splice(index, 0, newItem);
              saveSchedule(updated);
              return updated;
            });
            setApDescription('');
          }}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
            fontSize: '16px',
            fontWeight: 'bold',
          }}
        >
          AP
        </OrangeBtn>
      </div>
      {schedule.map((item, i) => {
        const dateStr = formatDisplay(item.date);
        const weekday = weekdayNames[item.date.getDay()];
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <div>
              {dateStr} - {item.label} ({weekday})
            </div>
            <div
              style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}
            >
              <OrangeBtn
                onClick={() => shiftDate(i, -1)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                -
              </OrangeBtn>
              <OrangeBtn
                onClick={() => shiftDate(i, 1)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                +
              </OrangeBtn>
              <OrangeBtn
                onClick={() =>
                  setSchedule(prev => {
                    const updated = prev.filter((_, idx) => idx !== i);
                    saveSchedule(updated);
                    return updated;
                  })
                }
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '4px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                  fontSize: '16px',
                  fontWeight: 'bold',
                }}
              >
                ×
              </OrangeBtn>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default StimulationSchedule;

