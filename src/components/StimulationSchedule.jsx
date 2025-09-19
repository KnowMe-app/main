import React from 'react';
import { handleChange, handleSubmit } from './smallCard/actions';
import { OrangeBtn } from 'components/styles';
import { ReactComponent as ClipboardIcon } from 'assets/icons/clipboard.svg';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';

const parseDate = str => {
  if (!str) return null;
  const fullPattern = /^\d{2}\.\d{2}\.\d{4}$/;
  if (fullPattern.test(str)) {
    const [day, month, year] = str.split('.');
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  const shortPattern = /^\d{2}\.\d{2}$/;
  if (shortPattern.test(str)) {
    const [day, month] = str.split('.').map(Number);
    const year = new Date().getFullYear();
    return new Date(year, month - 1, day);
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

const normalizeDate = date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const formatWeeksDaysToken = (weeks, days = 0) => {
  const normalizedWeeks = Number.isFinite(weeks) ? Number(weeks) : 0;
  const normalizedDays = Number.isFinite(days) ? Number(days) : 0;
  return `${normalizedWeeks}т${normalizedDays}д`;
};

const normalizeWeeksDaysToken = token => {
  if (!token) return null;
  const match = token.toString().trim().toLowerCase().match(/^(\d+)т(?:(\d+)д?)?$/);
  if (!match) return null;
  const weeks = Number(match[1]);
  const days = match[2] ? Number(match[2]) : 0;
  return {
    weeks,
    days,
    normalized: formatWeeksDaysToken(weeks, days),
  };
};

const extractWeeksDaysPrefix = value => {
  if (!value) return null;
  const match = value.trim().match(/^(\d+т\d*д?)(?=\s|$)/i);
  if (!match) return null;
  const normalized = normalizeWeeksDaysToken(match[1]);
  if (!normalized) return null;
  return {
    ...normalized,
    raw: match[1],
    length: match[1].length,
  };
};

const parseWeeksDaysToken = (token, baseDate) => {
  if (!token || !baseDate) return null;
  const normalized = normalizeWeeksDaysToken(token);
  if (!normalized) return null;
  const result = normalizeDate(baseDate);
  result.setDate(result.getDate() + normalized.weeks * 7 + normalized.days);
  return result;
};

const getWeeksDaysTokenForDate = (date, reference) => {
  if (!date || !reference) return null;
  const normalizedDate = normalizeDate(date);
  const normalizedRef = normalizeDate(reference);
  const diffMs = normalizedDate.getTime() - normalizedRef.getTime();
  const totalDays = Math.max(Math.round(diffMs / (1000 * 60 * 60 * 24)), 0);
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return {
    weeks,
    days,
    token: formatWeeksDaysToken(weeks, days),
  };
};

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return normalizeDate(a).getTime() === normalizeDate(b).getTime();
};

const computeCustomDateAndLabel = (input, baseDate, referenceDate) => {
  if (!input) return { date: null, label: '' };
  const normalizedInput = input.trim().replace(/\s+/g, ' ');
  if (!normalizedInput) return { date: null, label: '' };
  const [token, ...restParts] = normalizedInput.split(' ');
  const rest = restParts.join(' ');
  const baseNormalized = baseDate ? normalizeDate(baseDate) : null;
  const referenceNormalized = referenceDate ? normalizeDate(referenceDate) : null;
  let date = null;

  if (token) {
    const weeksDays = normalizeWeeksDaysToken(token);
    if (weeksDays) {
      const anchor = baseNormalized || referenceNormalized;
      if (anchor) {
        date = parseWeeksDaysToken(weeksDays.normalized, anchor);
      }
      if (date) {
        const trimmedRest = rest.trim();
        const label = trimmedRest ? `${weeksDays.normalized} ${trimmedRest}` : weeksDays.normalized;
        return { date, label };
      }
    }

    if (!date) {
      const shortMatch = token.match(/^(\d{2})\.(\d{2})$/);
      if (shortMatch) {
        const day = Number(shortMatch[1]);
        const monthIndex = Number(shortMatch[2]) - 1;
        const pivot = referenceNormalized || baseNormalized || normalizeDate(new Date());
        const candidateYears = new Set();
        if (referenceNormalized) {
          candidateYears.add(referenceNormalized.getFullYear());
          candidateYears.add(referenceNormalized.getFullYear() + 1);
          candidateYears.add(referenceNormalized.getFullYear() - 1);
        }
        if (baseNormalized) {
          candidateYears.add(baseNormalized.getFullYear());
          candidateYears.add(baseNormalized.getFullYear() + 1);
          candidateYears.add(baseNormalized.getFullYear() - 1);
        }
        candidateYears.add(new Date().getFullYear());
        let bestCandidate = null;
        let bestDiff = Infinity;
        candidateYears.forEach(year => {
          const candidate = new Date(year, monthIndex, day);
          candidate.setHours(0, 0, 0, 0);
          const diffValue = pivot ? Math.abs(candidate.getTime() - pivot.getTime()) : 0;
          if (diffValue < bestDiff) {
            bestDiff = diffValue;
            bestCandidate = candidate;
          }
        });
        date = bestCandidate;
      } else {
        const parsedDate = parseDate(token);
        if (parsedDate) {
          date = normalizeDate(parsedDate);
        }
      }
    }
  }

  if (date) {
    const trimmedRest = rest.trim();
    const label = `${formatDisplay(date)}${trimmedRest ? ` ${trimmedRest}` : ''}`;
    return { date, label };
  }

  return { date: null, label: normalizedInput };
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
  while (isWeekend(date)) {
    date.setDate(date.getDate() - 1);
    day = diffDays(date, base);
  }
  return { date, day, sign: '' };
};

const weekdayNames = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export const generateSchedule = base => {
  const visits = [];

  // Day 1 (base)
  visits.push({
    key: 'visit1',
    date: new Date(base),
    label: '1й день',
  });

  // Day 2
  let d = new Date(base);
  d.setDate(base.getDate() + 1);
  const first = adjustForward(d, base);
  visits.push({
    key: 'visit2',
    date: first.date,
    label: `${first.day}й день`,
  });

  // Day 7 (may shift to 8 but never earlier than 6)
  d = new Date(base);
  d.setDate(base.getDate() + 6);
  let second = adjustBackward(new Date(d), base);
  if (second.day < 6) {
    second = adjustForward(new Date(d), base);
  }
  visits.push({
    key: 'visit3',
    date: second.date,
    label: `${second.day}й день${second.sign ? ` ${second.sign}` : ''}`,
  });

  // Days 11-13
  let start = 11;
  let third;
  for (let n = start; n <= start + 2; n++) {
    d = new Date(base);
    d.setDate(base.getDate() + n - 1);
    if (!isWeekend(d)) {
      third = { date: d, day: n, sign: '' };
      break;
    }
  }
  if (!third) {
    d = new Date(base);
    d.setDate(base.getDate() + start + 1);
    third = adjustBackward(d, base);
  }
  visits.push({
    key: 'visit4',
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
  const weeks = [8, 10, 12, 16, 18, 28, 36, 38, 40];
  weeks.forEach(week => {
    let wd = new Date(base);
    wd.setDate(wd.getDate() + week * 7);
    const adj = adjustForward(wd, base);
    const baseLabel = week === 40 ? `${week}т пологи` : `${week}т`;
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
    .filter(item => item.date)
    .map(item => {
      const y = item.date.getFullYear();
      const m = String(item.date.getMonth() + 1).padStart(2, '0');
      const d = String(item.date.getDate()).padStart(2, '0');
      const key = item.key || '';
      return `${y}-${m}-${d}\t${key}\t${item.label}`;
    })
    .join('\n');

const StimulationSchedule = ({ userData, setUsers, setState, isToastOn = false }) => {
  const base = React.useMemo(() => parseDate(userData?.lastCycle), [userData?.lastCycle]);
  const effectiveStatus = getEffectiveCycleStatus(userData);
  const [schedule, setSchedule] = React.useState([]);
  const [apDescription, setApDescription] = React.useState('');
  const [apDerivedDate, setApDerivedDate] = React.useState(null);
  const [editingIndex, setEditingIndex] = React.useState(null);
  const transferRef = React.useRef(null);
  const hasChanges = React.useRef(false);

  const saveSchedule = React.useCallback(
    sched => {
      if (!hasChanges.current) return;
      const scheduleString = serializeSchedule(sched);
      const defaultString = base ? serializeSchedule(generateSchedule(base)) : '';
      const isDefault = base && scheduleString === defaultString;
      const update = isDefault
        ? { stimulationSchedule: undefined }
        : { stimulationSchedule: scheduleString };

      if (setUsers && setState) {
        handleChange(setUsers, setState, userData.userId, update);
      } else if (setState) {
        setState(prev => {
          const copy = { ...prev };
          if (isDefault) delete copy.stimulationSchedule;
          else copy.stimulationSchedule = scheduleString;
          return copy;
        });
      } else if (setUsers) {
        handleChange(setUsers, null, userData.userId, update);
      }
      handleSubmit({ userId: userData.userId, ...update }, 'overwrite', isToastOn);
      hasChanges.current = !isDefault;
    },
    [setUsers, setState, userData.userId, isToastOn, base],
  );

  React.useEffect(() => {
    if (!['stimulation', 'pregnant'].includes(effectiveStatus) || !base) return;

    const gen = generateSchedule(base);
    const expectedFirst = gen[0]?.date;

    if (userData.stimulationSchedule) {
      let parsed;
      if (typeof userData.stimulationSchedule === 'string') {
        const lines = userData.stimulationSchedule.split('\n').filter(Boolean);
        let visitCount = 0;
        const todayNormalized = normalizeDate(new Date());
        parsed = lines
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
              else if (/(\d+)т/.test(label)) {
                const week = /(\d+)т/.exec(label)[1];
                key = `week${week}`;
              } else if (/й день/.test(label)) {
                visitCount += 1;
                key = `visit${visitCount}`;
              } else {
                key = `ap-${idx}`;
              }
            }
            if (key === 'today-placeholder' && !isSameDay(date, todayNormalized)) {
              key = `ap-${idx}`;
            }
            return { key, date, label };
          })
          .filter(item => item && item.date);
      } else {
        const todayNormalized = normalizeDate(new Date());
        parsed = userData.stimulationSchedule
          .map(item => {
            const date = parseDate(item.date);
            if (!date) return null;
            let key = item.key || '';
            if (!key) {
              if (/перенос/.test(item.label || '')) key = 'transfer';
              else if (/ХГЧ/.test(item.label || '')) key = 'hcg';
              else if (/УЗД|ЗД/.test(item.label || '')) key = 'us';
              else if (/(\d+)т/.test(item.label || '')) {
                const week = /(\d+)т/.exec(item.label || '')[1];
                key = `week${week}`;
              }
            }
            if (!key) key = `ap-${date.getTime()}`;
            if (key === 'today-placeholder' && !isSameDay(date, todayNormalized)) {
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

      const firstDate = parsed[0]?.date;
      if (!firstDate || firstDate.toDateString() !== expectedFirst?.toDateString()) {
        setSchedule(gen);
      } else {
        setSchedule(parsed);
      }
    } else {
      setSchedule(gen);
    }
  }, [userData.stimulationSchedule, effectiveStatus, base, userData.lastCycle]);

  const postTransferKeys = React.useMemo(() => ['hcg', 'us'], []);

  React.useEffect(() => {
    const transferItem = schedule.find(v => v.key === 'transfer');
    if (transferItem) {
      transferRef.current = transferItem.date;
    }
  }, [schedule]);

  const shiftDate = (idx, delta) => {
    setSchedule(prev => {
      const copy = [...prev];
      const item = copy[idx];
      const newDate = new Date(item.date);
      newDate.setDate(newDate.getDate() + delta);

      const transferDate =
        copy.find(v => v.key === 'transfer')?.date || transferRef.current || base;

      const applyAdjust = (it, d) => {
        const refBase = postTransferKeys.includes(it.key) ? transferDate : base;
        let adj = { date: d, day: diffDays(d, refBase), sign: '' };
        if (it.key.startsWith('week')) {
          const diff = Math.round((adj.date - base) / (1000 * 60 * 60 * 24));
          const weeks = Math.floor(diff / 7);
          const days = diff % 7;
          let custom = it.label.replace(/^\d+т\d*д?\s*/, '').trim();
          let labelText = `${weeks}т${days ? `${days}д` : ''}`;
          if (weeks === 40 && days === 0) {
            labelText += ' пологи';
            if (custom.startsWith('пологи')) custom = custom.replace(/^пологи\s*/, '');
          }
          if (custom) labelText += ` ${custom}`;
          return {
            ...it,
            date: adj.date,
            label: labelText,
          };
        }
        if (postTransferKeys.includes(it.key)) {
          const diff = Math.round((adj.date - transferDate) / (1000 * 60 * 60 * 24));
          const weeks = Math.floor(diff / 7);
          const days = diff % 7;
          let custom = it.label.replace(/^\d+т\d*д?\s*/, '').trim();
          let labelText = `${weeks}т${days ? `${days}д` : ''}`;
          if (weeks === 40 && days === 0) {
            labelText += ' пологи';
            if (custom.startsWith('пологи')) custom = custom.replace(/^пологи\s*/, '');
          }
          if (custom) labelText += ` ${custom}`;
          return {
            ...it,
            date: adj.date,
            label: labelText,
          };
        }
        if (it.key === 'visit3' && adj.day < 6) {
          const min = new Date(base);
          min.setDate(base.getDate() + 5);
          adj = { date: min, day: diffDays(min, base), sign: '' };
        }
        if (it.key.startsWith('ap')) {
          let labelText = it.label;
          const prefix = extractWeeksDaysPrefix(labelText);
          if (prefix) {
            const reference = base || transferDate;
            const recalculated = getWeeksDaysTokenForDate(adj.date, reference);
            if (recalculated) {
              const rest = labelText.slice(prefix.length).trim();
              labelText = rest ? `${recalculated.token} ${rest}` : recalculated.token;
            }
          }
          return {
            ...it,
            date: adj.date,
            label: labelText,
          };
        }
        let lbl = `${adj.day}й день${it.key === 'transfer' ? ' (перенос)' : ''}${adj.sign ? ` ${adj.sign}` : ''}`;
        if (!adj.sign) {
          lbl = lbl.replace(/-$/, '').trim();
        }
        return { ...it, date: adj.date, label: lbl };
      };

      const adjustedItem = applyAdjust(item, newDate);
      copy[idx] = adjustedItem;
      if (item.key === 'transfer') {
        transferRef.current = adjustedItem.date;
      }

      copy.sort((a, b) => a.date - b.date);
      hasChanges.current = true;
      saveSchedule(copy);
      return copy;
    });
  };

  if (!['stimulation', 'pregnant'].includes(effectiveStatus) || !base || schedule.length === 0)
    return null;

  const todayDate = normalizeDate(new Date());
  const today = todayDate.getTime();
  let foundToday = false;

  const rendered = [];
  let currentYear = null;

  const filtered = schedule.filter(item => item.date);
  if (!filtered.some(item => item.date.getTime() === today)) {
    const baseForDiff = base ? normalizeDate(base) : null;
    if (baseForDiff) {
      const msInDay = 1000 * 60 * 60 * 24;
      const diff = Math.round((todayDate.getTime() - baseForDiff.getTime()) / msInDay);
      const totalDays = Math.max(diff, 0);
      const weeks = Math.floor(totalDays / 7);
      const days = totalDays % 7;
      const comment = formatWeeksDaysToken(weeks, days);
      const placeholder = {
        key: 'today-placeholder',
        date: new Date(todayDate),
        label: comment,
      };
      const index = filtered.findIndex(item => item.date.getTime() > today);
      if (index === -1) filtered.push(placeholder);
      else filtered.splice(index, 0, placeholder);
    }
  }
  filtered.forEach((item, i) => {
      const dateStr = formatDisplay(item.date);
      const weekday = weekdayNames[item.date.getDay()];
      const year = item.date.getFullYear();
      const isToday = item.date.getTime() === today;
      const rowStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginBottom: '2px',
        ...(isToday ? { backgroundColor: '#FFECB3', color: '#000' } : {}),
      };
      if (isToday) foundToday = true;
      if (year !== currentYear) {
        if (currentYear !== null) {
          rendered.push(
            <div
              key={`sep-${year}`}
              style={{ borderTop: '1px solid #ccc', margin: '4px 0' }}
            />,
          );
        }
        rendered.push(<div key={`year-${year}`}>{year}</div>);
        currentYear = year;
      }
      if (item.key === 'visit1') {
        rendered.push(
          <div key={item.key} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <div>
                {dateStr} {weekday}
              </div>
              <div style={{ flex: 1 }}>{item.label}</div>
            </div>
          </div>,
        );
      } else {
        const isPlaceholder = item.key === 'today-placeholder';
        rendered.push(
          <div key={item.key} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <div>
                {dateStr} {weekday}
              </div>
              {editingIndex === i ? (
                <input
                  value={item.label}
                  autoFocus
                  onChange={e =>
                    setSchedule(prev => {
                      const copy = [...prev];
                      const idx = copy.findIndex(v => v.key === item.key);
                      if (idx === -1) {
                        copy.push({ ...item, label: e.target.value });
                        return copy;
                      }
                      copy[idx] = { ...copy[idx], label: e.target.value };
                      return copy;
                    })
                  }
                  onBlur={() => {
                    setEditingIndex(null);
                    setSchedule(prev => {
                      const copy = [...prev];
                      let idx = copy.findIndex(v => v.key === item.key);
                      if (idx === -1) {
                        copy.push({ ...item });
                        idx = copy.length - 1;
                      }
                      const current = copy[idx];
                      const trimmedLabel = (current.label || '').trim();
                      let updated = { ...current, label: trimmedLabel };
                      const transferDate =
                        copy.find(v => v.key === 'transfer')?.date || transferRef.current || base;
                      let dateChanged = false;

                      if (isPlaceholder) {
                        const tokenInfo = base ? getWeeksDaysTokenForDate(updated.date, base) : null;
                        const prefix = extractWeeksDaysPrefix(trimmedLabel);
                        const rest = prefix
                          ? trimmedLabel.slice(prefix.length).trim()
                          : trimmedLabel.trim();
                        if (tokenInfo) {
                          updated = {
                            ...updated,
                            label: rest ? `${tokenInfo.token} ${rest}` : tokenInfo.token,
                          };
                        }
                      } else {
                        const prefix = extractWeeksDaysPrefix(trimmedLabel);
                        if (prefix) {
                          const rest = trimmedLabel.slice(prefix.length).trim();
                          let reference = base;
                          if (postTransferKeys.includes(updated.key)) {
                            reference = transferDate;
                          }
                          if (updated.key.startsWith('ap-')) {
                            reference = base || transferDate;
                          }
                          if (reference) {
                            const computedDate = parseWeeksDaysToken(prefix.normalized, reference);
                            if (computedDate && !isSameDay(computedDate, updated.date)) {
                              updated = {
                                ...updated,
                                date: computedDate,
                              };
                              dateChanged = true;
                            }
                          }
                          updated = {
                            ...updated,
                            label: rest ? `${prefix.normalized} ${rest}` : prefix.normalized,
                          };
                        } else if (updated.key.startsWith('ap-')) {
                          const computed = computeCustomDateAndLabel(
                            trimmedLabel,
                            base,
                            updated.date,
                          );
                          if (computed.date) {
                            dateChanged = !isSameDay(computed.date, updated.date);
                            updated = {
                              ...updated,
                              date: computed.date,
                              label: computed.label,
                            };
                          }
                        }
                      }

                      const labelChanged = updated.label !== current.label;
                      dateChanged = dateChanged || !isSameDay(updated.date, current.date);

                      if (!labelChanged && !dateChanged) {
                        return prev;
                      }

                      copy[idx] = updated;
                      if (dateChanged) {
                        copy.sort((a, b) => a.date - b.date);
                      }
                      hasChanges.current = true;
                      saveSchedule(copy);
                      return copy;
                    });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.target.blur();
                    }
                  }}
                  style={{ flex: 1 }}
                />
              ) : (
                <div
                  onClick={() => setEditingIndex(i)}
                  style={{ cursor: 'pointer', flex: 1 }}
                >
                  {item.label}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
              {isPlaceholder ? (
                <OrangeBtn
                  onClick={() => {
                    const tokenInfo = base ? getWeeksDaysTokenForDate(item.date, base) : null;
                    const resetLabel = tokenInfo ? tokenInfo.token : item.label.split(' ')[0] || '';
                    setSchedule(prev => {
                      const copy = [...prev];
                      const idx = copy.findIndex(v => v.key === item.key);
                      if (idx === -1) {
                        copy.push({ ...item, label: resetLabel });
                      } else {
                        copy[idx] = { ...copy[idx], label: resetLabel };
                      }
                      copy.sort((a, b) => a.date - b.date);
                      hasChanges.current = true;
                      saveSchedule(copy);
                      return copy;
                    });
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
                  ×
                </OrangeBtn>
              ) : (
                <React.Fragment>
                  <OrangeBtn
                    onClick={() => {
                      const idx = schedule.findIndex(v => v.key === item.key);
                      if (idx !== -1) shiftDate(idx, -1);
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
                    -
                  </OrangeBtn>
                  <OrangeBtn
                    onClick={() => {
                      const idx = schedule.findIndex(v => v.key === item.key);
                      if (idx !== -1) shiftDate(idx, 1);
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
                    +
                  </OrangeBtn>
                  <OrangeBtn
                    onClick={() =>
                      setSchedule(prev => {
                        const updated = prev.filter(v => v.key !== item.key);
                        hasChanges.current = true;
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
                </React.Fragment>
              )}
            </div>
          </div>,
        );
      }
      const next = filtered[i + 1];
      if (!foundToday && next && today > item.date.getTime() && today < next.date.getTime()) {
        rendered.push(
          <div
            key={`today-sep-${i}`}
            style={{ height: '3px', backgroundColor: '#FFECB3' }}
          />,
        );
      }
    });

  if (!foundToday) {
    const first = filtered[0];
    const last = filtered[filtered.length - 1];
    if (first && today < first.date.getTime()) {
      rendered.unshift(
        <div key="today-start" style={{ height: '3px', backgroundColor: '#FFECB3' }} />,
      );
    } else if (last && today > last.date.getTime()) {
      rendered.push(
        <div key="today-end" style={{ height: '3px', backgroundColor: '#FFECB3' }} />,
      );
    }
  }

  return (
    <div style={{ padding: '7px', position: 'relative' }}>
      <div style={{ display: 'flex', gap: '2px', margin: '4px 0' }}>
        <input
          type="text"
          value={apDescription}
          onChange={e => {
            setApDescription(e.target.value);
            setApDerivedDate(null);
          }}
          onBlur={() =>
            setApDescription(prev => {
              const result = computeCustomDateAndLabel(prev, base, apDerivedDate || base);
              if (result.date) {
                setApDerivedDate(result.date);
                return result.label;
              }
              setApDerivedDate(null);
              return prev.trim();
            })
          }
          placeholder="10.05 УЗД"
          style={{ flex: 1 }}
        />
        <OrangeBtn
          onClick={() => {
            let description = apDescription.trim();
            const computed = computeCustomDateAndLabel(
              description,
              base,
              apDerivedDate || base,
            );
            let date = apDerivedDate || computed.date;
            let label = computed.label;
            if (!date) {
              const match = description.match(/^(\d{2}\.\d{2}(?:\.\d{4})?)/);
              if (match) {
                const parsedDate = parseDate(match[1]);
                if (parsedDate) {
                  date = normalizeDate(parsedDate);
                  const rest = description.slice(match[1].length).trim();
                  label = `${formatDisplay(date)}${rest ? ` ${rest}` : ''}`;
                }
              }
            }
            if (!date) {
              const fallback = normalizeDate(new Date());
              date = fallback;
              label = description || 'AP';
            }
            const newItem = {
              key: `ap-${Date.now()}`,
              date,
              label: label || formatDisplay(date),
            };
            setSchedule(prev => {
              const updated = [...prev];
              const index = updated.findIndex(it => it.date > newItem.date);
              if (index === -1) updated.push(newItem);
              else updated.splice(index, 0, newItem);
              hasChanges.current = true;
              saveSchedule(updated);
              return updated;
            });
            setApDescription('');
            setApDerivedDate(null);
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
          +
        </OrangeBtn>
        <OrangeBtn
          onClick={() => {
            let text = '';
            let yr = null;
            schedule
              .filter(item => item.date)
              .sort((a, b) => a.date - b.date)
              .forEach(it => {
                const y = it.date.getFullYear();
                const dateStr = formatDisplay(it.date);
                const weekday = weekdayNames[it.date.getDay()];
                if (y !== yr) {
                  if (text) text += '\n';
                  text += `${y}\n`;
                  yr = y;
                }
                text += `${dateStr} ${weekday} ${it.label}\n`;
              });
            navigator.clipboard.writeText(text.trim());
          }}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '4px',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
            fontSize: '16px',
            fontWeight: 'bold',
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ClipboardIcon style={{ width: '16px', height: '16px' }} />
        </OrangeBtn>
      </div>
      {rendered}
    </div>
  );
};

export default StimulationSchedule;

