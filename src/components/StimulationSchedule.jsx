import React from 'react';
import { handleChange, handleSubmit } from './smallCard/actions';
import { formatDateToServer } from 'components/inputValidations';
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

const formatFullDate = date => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const normalizeDate = date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const weekdayNames = ['нд', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const formatWeeksDaysToken = (weeks, days = 0) => {
  let normalizedWeeks = Number.isFinite(weeks) ? Math.trunc(Number(weeks)) : 0;
  let normalizedDays = Number.isFinite(days) ? Math.trunc(Number(days)) : 0;

  if (normalizedDays < 0) {
    const adjust = Math.ceil(Math.abs(normalizedDays) / 7);
    normalizedWeeks -= adjust;
    normalizedDays += adjust * 7;
  }

  if (normalizedDays >= 7) {
    const extraWeeks = Math.floor(normalizedDays / 7);
    normalizedWeeks += extraWeeks;
    normalizedDays -= extraWeeks * 7;
  }

  if (normalizedWeeks < 0) {
    normalizedWeeks = 0;
  }

  if (normalizedDays < 0) {
    normalizedDays = 0;
  }

  const displayDay = normalizedDays + 1;
  return `${normalizedWeeks}т${displayDay}д`;
};

const normalizeWeeksDaysToken = token => {
  if (!token) return null;
  const match = token.toString().trim().toLowerCase().match(/^(\d+)т(?:(\d+)д?)?$/);
  if (!match) return null;
  const rawWeeks = Number(match[1]);
  const rawDays = match[2] ? Number(match[2]) : 1;
  const safeWeeks = Number.isFinite(rawWeeks) ? Math.max(Math.trunc(rawWeeks), 0) : 0;
  const safeDays = Number.isFinite(rawDays) ? Math.max(Math.trunc(rawDays), 1) : 1;
  const totalDays = safeWeeks * 7 + (safeDays - 1);
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
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

const extractDayPrefix = value => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)\s*й(?:\s+день)?/i);
  if (!match) return null;
  const rawDay = Number(match[1]);
  if (!Number.isFinite(rawDay)) return null;
  const length = match[0].length;
  const rest = trimmed.slice(length).trim();
  return {
    day: Math.max(Math.trunc(rawDay), 0),
    length,
    rest,
    raw: match[0].trim(),
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
    displayDays: days + 1,
    token: formatWeeksDaysToken(weeks, days),
  };
};

const DAY_PREFIX_TRANSFER_WINDOW_DAYS = 30;

const getSchedulePrefixForDate = (date, baseDate, transferDate) => {
  if (!date) return '';

  const normalizedDate = normalizeDate(date);
  const normalizedBase = baseDate ? normalizeDate(baseDate) : null;
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;
  const referenceForDay = normalizedBase || normalizedTransfer;

  if (!referenceForDay) {
    return '';
  }

  let useDayPrefix = true;
  if (normalizedTransfer) {
    const cutoff = new Date(normalizedTransfer);
    cutoff.setDate(cutoff.getDate() + DAY_PREFIX_TRANSFER_WINDOW_DAYS);
    if (normalizedDate.getTime() > cutoff.getTime()) {
      useDayPrefix = false;
    }
  }

  if (useDayPrefix) {
    const dayInfo = getWeeksDaysTokenForDate(normalizedDate, referenceForDay);
    if (dayInfo) {
      const dayNumber = dayInfo.weeks * 7 + dayInfo.days + 1;
      return `${Math.max(dayNumber, 1)}й день`;
    }
  }

  const referenceForWeeks = normalizedBase || normalizedTransfer || referenceForDay;
  if (referenceForWeeks) {
    const tokenInfo = getWeeksDaysTokenForDate(normalizedDate, referenceForWeeks);
    if (tokenInfo?.token) {
      return tokenInfo.token;
    }
  }

  return '';
};

const sanitizeDescription = text => {
  if (!text) return '';
  let result = text.trim();
  const weekdayRegex = /^(нд|пн|вт|ср|чт|пт|сб)(?=\s|$|[.,!?])/i;
  const stripLeadingDelimiters = value => value.replace(/^[\s.,!?]+/, '');
  while (result) {
    const dateMatch = result.match(/^(\d{2}\.\d{2}(?:\.\d{4})?)/);
    if (dateMatch) {
      result = stripLeadingDelimiters(result.slice(dateMatch[1].length));
      continue;
    }
    const weekdayMatch = result.match(weekdayRegex);
    if (weekdayMatch) {
      result = stripLeadingDelimiters(result.slice(weekdayMatch[0].length));
      continue;
    }
    const dayMatch = extractDayPrefix(result);
    if (dayMatch) {
      result = stripLeadingDelimiters(result.slice(dayMatch.length));
      continue;
    }
    const tokenMatch = extractWeeksDaysPrefix(result);
    if (tokenMatch) {
      result = stripLeadingDelimiters(result.slice(tokenMatch.length));
      continue;
    }
    break;
  }
  return result.trim();
};

const normalizeDayNumber = day => {
  const raw = Number(day);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(Math.trunc(raw), 0);
};

const transferRelativeConfig = {
  hcg: {
    baseLabel: 'ХГЧ',
    defaultSuffix: 'ХГЧ',
    prefix: /^хгч/i,
  },
  us: {
    baseLabel: 'УЗД',
    defaultSuffix: 'УЗД, підтвердження вагітності',
    prefix: /^узд/i,
  },
};

const normalizeTransferSuffix = (key, suffix) => {
  const config = transferRelativeConfig[key];
  const sanitized = sanitizeDescription(suffix);
  const trimmed = sanitized.replace(/\s+/g, ' ').trim();
  if (!config) return trimmed;
  if (!trimmed) return config.defaultSuffix;
  const withoutPrefix = trimmed.replace(config.prefix, '').trim();
  if (!withoutPrefix) {
    return config.baseLabel;
  }
  if (/^[,.;:]/.test(withoutPrefix)) {
    return `${config.baseLabel}${withoutPrefix}`;
  }
  return `${config.baseLabel} ${withoutPrefix}`;
};

const buildTransferDayLabel = (key, day, suffix, sign = '') => {
  const normalizedDay = normalizeDayNumber(day);
  const normalizedSuffix = normalizeTransferSuffix(key, suffix);
  const label = `${normalizedDay}й день ${normalizedSuffix}`.trim();
  return sign ? `${label} ${sign}`.trim() : label;
};

const buildHcgLabel = (day, suffix) => buildTransferDayLabel('hcg', day, suffix);

const buildUsLabel = (day, suffix, sign = '') =>
  buildTransferDayLabel('us', day, suffix, sign);

const getTransferRelativeReference = (transferDate, base) => {
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;
  if (normalizedTransfer) return normalizedTransfer;
  return base ? normalizeDate(base) : null;
};

const computeDateFromTransferDay = (day, transferDate, base) => {
  const reference = getTransferRelativeReference(transferDate, base);
  if (!reference) return null;
  const normalizedDay = normalizeDayNumber(day);
  const computed = new Date(reference);
  computed.setDate(reference.getDate() + normalizedDay - 1);
  return computed;
};

const getTransferSuffixFromLabel = (key, label) => {
  const trimmed = (label || '').trim();
  const dayInfo = extractDayPrefix(trimmed);
  const suffix = dayInfo ? dayInfo.rest : trimmed;
  if (suffix) return suffix;
  return transferRelativeConfig[key]?.defaultSuffix || '';
};

const buildPostTransferLabel = (key, labelSource, date, transferReference) => {
  if (!date) {
    return typeof labelSource === 'string' ? labelSource : '';
  }

  const normalizedDate = normalizeDate(date);
  const normalizedReference = transferReference ? normalizeDate(transferReference) : null;
  const suffix = getTransferSuffixFromLabel(key, labelSource);

  if (!normalizedReference) {
    const fallback = typeof labelSource === 'string' ? labelSource.trim() : '';
    if (fallback) return fallback;
    return buildTransferDayLabel(key, 1, suffix);
  }

  const diff = Math.round(
    (normalizedDate.getTime() - normalizedReference.getTime()) / (1000 * 60 * 60 * 24),
  );
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  const dayNumber = Math.abs(diff) + 1;

  return buildTransferDayLabel(key, dayNumber, suffix, sign);
};

const buildCustomEventLabel = (date, baseDate, transferDate, description) => {
  const trimmedDescription = sanitizeDescription(description);
  if (!date) return trimmedDescription;

  const prefix = getSchedulePrefixForDate(date, baseDate, transferDate);
  const parts = [];
  if (prefix) {
    parts.push(prefix);
  }
  if (trimmedDescription) {
    parts.push(trimmedDescription);
  }
  return parts.join(' ').trim();
};

const isSameDay = (a, b) => {
  if (!a || !b) return false;
  return normalizeDate(a).getTime() === normalizeDate(b).getTime();
};

const computeCustomDateAndLabel = (input, baseDate, referenceDate, transferDate) => {
  if (!input) return { date: null, label: '', description: '', raw: '' };
  const normalizedInput = input.trim().replace(/\s+/g, ' ');
  if (!normalizedInput) return { date: null, label: '', description: '', raw: '' };

  const baseNormalized = baseDate ? normalizeDate(baseDate) : null;
  const transferNormalized = transferDate ? normalizeDate(transferDate) : null;
  const referenceNormalized = referenceDate ? normalizeDate(referenceDate) : null;
  const anchor = baseNormalized || transferNormalized || referenceNormalized;

  let workingInput = normalizedInput;
  let date = null;

  const dayInfo = extractDayPrefix(workingInput);
  if (dayInfo && (baseNormalized || transferNormalized || referenceNormalized)) {
    const normalizedDay = Math.max(Math.trunc(dayInfo.day), 1);
    const offset = normalizedDay - 1;
    const candidates = [];

    if (baseNormalized) {
      const candidate = new Date(baseNormalized);
      candidate.setDate(candidate.getDate() + offset);
      candidates.push(candidate);
    }

    if (transferNormalized) {
      const candidate = new Date(transferNormalized);
      candidate.setDate(candidate.getDate() + offset);
      candidates.push(candidate);
    }

    if (!candidates.length && referenceNormalized) {
      const candidate = new Date(referenceNormalized);
      candidate.setDate(candidate.getDate() + offset);
      candidates.push(candidate);
    }

    if (candidates.length) {
      let chosen = candidates[0];
      if (candidates.length > 1) {
        const pivot = referenceNormalized || baseNormalized || transferNormalized || candidates[0];
        let bestDiff = Infinity;
        candidates.forEach(candidate => {
          const diff = Math.abs(candidate.getTime() - pivot.getTime());
          if (diff < bestDiff) {
            bestDiff = diff;
            chosen = candidate;
          }
        });
      }
      date = normalizeDate(chosen);
    }

    workingInput = dayInfo.rest || '';
  }

  const tokens = workingInput.split(' ').filter(Boolean);
  const descriptionTokens = [];

  for (const part of tokens) {
    if (!date) {
      const weeksDays = normalizeWeeksDaysToken(part);
      if (weeksDays && anchor) {
        const computedDate = parseWeeksDaysToken(weeksDays.normalized, anchor);
        if (computedDate) {
          date = computedDate;
          continue;
        }
      }

      const shortMatch = part.match(/^(\d{2})\.(\d{2})$/);
      if (shortMatch) {
        const day = Number(shortMatch[1]);
        const monthIndex = Number(shortMatch[2]) - 1;
        const pivot = referenceNormalized || baseNormalized || transferNormalized || normalizeDate(new Date());
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
        if (transferNormalized) {
          candidateYears.add(transferNormalized.getFullYear());
          candidateYears.add(transferNormalized.getFullYear() + 1);
          candidateYears.add(transferNormalized.getFullYear() - 1);
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
        if (bestCandidate) {
          date = bestCandidate;
          continue;
        }
      }

      const parsedDate = parseDate(part);
      if (parsedDate) {
        date = normalizeDate(parsedDate);
        continue;
      }
    }

    descriptionTokens.push(part);
  }

  const description = sanitizeDescription(descriptionTokens.join(' '));
  if (date) {
    const label = buildCustomEventLabel(date, baseNormalized || referenceNormalized, transferNormalized, description);
    return { date, label, description, raw: normalizedInput };
  }

  const fallbackDescription = description || normalizedInput;
  return { date: null, label: '', description: fallbackDescription, raw: normalizedInput };
};

const parseLeadingDate = (input, anchorDate) => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{2}\.\d{2}(?:\.\d{4})?|\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const rawDate = match[1];
  let parsedDate = null;

  if (/^\d{2}\.\d{2}$/.test(rawDate)) {
    const [dayStr, monthStr] = rawDate.split('.');
    const day = Number(dayStr);
    const monthIndex = Number(monthStr) - 1;
    if (Number.isFinite(day) && Number.isFinite(monthIndex)) {
      const normalizedAnchor = anchorDate ? normalizeDate(anchorDate) : null;
      const pivot = normalizedAnchor || normalizeDate(new Date());
      const candidateYears = new Set([
        pivot.getFullYear(),
        pivot.getFullYear() + 1,
        pivot.getFullYear() - 1,
        new Date().getFullYear(),
      ]);
      let bestCandidate = null;
      let bestDiff = Infinity;
      candidateYears.forEach(year => {
        const candidate = new Date(year, monthIndex, day);
        candidate.setHours(0, 0, 0, 0);
        const diff = Math.abs(candidate.getTime() - pivot.getTime());
        if (diff < bestDiff) {
          bestDiff = diff;
          bestCandidate = candidate;
        }
      });
      parsedDate = bestCandidate;
    }
  } else {
    parsedDate = parseDate(rawDate);
  }

  if (!parsedDate) return null;

  const normalizedDate = normalizeDate(parsedDate);
  let remainder = trimmed.slice(rawDate.length);
  const stripLeading = value => value.replace(/^[-\s,.;:!]+/, '');
  remainder = stripLeading(remainder);
  const weekdayMatch = remainder.match(/^(нд|пн|вт|ср|чт|пт|сб)(?=\s|$|[.,!?-])/i);
  if (weekdayMatch) {
    remainder = remainder.slice(weekdayMatch[0].length);
    remainder = stripLeading(remainder);
  }

  const normalizedRemainder = remainder.trim();

  return {
    date: normalizedDate,
    remainder: normalizedRemainder || undefined,
  };
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
  const transferBase = normalizeDate(transfer.date);
  d = new Date(transferBase);
  d.setDate(d.getDate() + 11);
  const hcgDay = diffDays(d, transferBase);
  visits.push({
    key: 'hcg',
    date: d,
    label: buildHcgLabel(hcgDay),
  });

  // Ultrasound 28 days after transfer
  d = new Date(transferBase);
  d.setDate(d.getDate() + 27);
  let us = adjustForward(d, transferBase);
  visits.push({
    key: 'us',
    date: us.date,
    label: buildUsLabel(us.day, 'УЗД, підтвердження вагітності', us.sign),
  });

  // Pregnancy visits at specific weeks
  const weeks = [8, 10, 12, 16, 18, 28, 36, 38, 40];
  weeks.forEach(week => {
    let wd = new Date(base);
    wd.setDate(wd.getDate() + week * 7);
    const adj = adjustForward(wd, base);
    const prefix = getSchedulePrefixForDate(adj.date, base, transferBase);
    let labelText = prefix;
    if (week === 40) {
      labelText = labelText ? `${labelText} пологи` : 'пологи';
    }
    if (adj.sign) {
      labelText = labelText ? `${labelText} ${adj.sign}` : adj.sign;
    }
    visits.push({
      key: `week${week}`,
      date: adj.date,
      label: labelText.trim(),
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
  const [editingKey, setEditingKey] = React.useState(null);
  const transferRef = React.useRef(null);
  const hasChanges = React.useRef(false);
  const preCycleActive = React.useMemo(
    () =>
      schedule.some(
        item =>
          item.key === 'pre-dipherelin' ||
          item.key === 'pre-visit1' ||
          /диферелін/i.test(String(item.label || '')),
      ),
    [schedule],
  );

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

  const handleActivateDipherelin = React.useCallback(() => {
    if (!base || preCycleActive) return;

    const existingFirst = schedule.find(item => item.key === 'visit1') || schedule[0];
    const normalizedBase = normalizeDate(existingFirst?.date || base);
    const dayOneLabel = existingFirst?.label || '1й день';

    const preDayOne = {
      key: 'pre-visit1',
      date: normalizedBase,
      label: dayOneLabel,
    };

    let dayEightDate = new Date(normalizedBase);
    dayEightDate.setDate(dayEightDate.getDate() + 7);
    const adjustedDayEight = adjustForward(dayEightDate, normalizedBase);
    const preUltrasound = {
      key: 'pre-uzd',
      date: normalizeDate(adjustedDayEight.date),
      label: `${adjustedDayEight.day}й день УЗД`,
    };

    let difEvent = null;
    for (let n = 19; n <= 22; n += 1) {
      const candidate = new Date(normalizedBase);
      candidate.setDate(normalizedBase.getDate() + n - 1);
      if (!isWeekend(candidate)) {
        difEvent = {
          date: normalizeDate(candidate),
          day: diffDays(candidate, normalizedBase),
        };
        break;
      }
    }

    if (!difEvent) {
      const fallback = new Date(normalizedBase);
      fallback.setDate(normalizedBase.getDate() + 21);
      const adjusted = adjustBackward(fallback, normalizedBase);
      difEvent = {
        date: normalizeDate(adjusted.date),
        day: adjusted.day,
      };
    }

    const preDipherelin = {
      key: 'pre-dipherelin',
      date: difEvent.date,
      label: `${difEvent.day}й день Диферелін`,
    };

    const nextCycleStart = new Date(difEvent.date);
    nextCycleStart.setDate(nextCycleStart.getDate() + 9);
    const normalizedNextCycle = normalizeDate(nextCycleStart);

    const nextCycleVisits = generateSchedule(normalizedNextCycle).map(item => ({
      ...item,
      date: normalizeDate(item.date),
    }));

    const combinedSchedule = [preDayOne, preUltrasound, preDipherelin, ...nextCycleVisits];

    setSchedule(combinedSchedule);
    hasChanges.current = true;
    saveSchedule(combinedSchedule);

    const formattedNextCycle = formatDateToServer(formatFullDate(normalizedNextCycle));
    if (formattedNextCycle) {
      const updates = { lastCycle: formattedNextCycle };
      if (setUsers && setState) {
        handleChange(setUsers, setState, userData.userId, updates);
      } else if (setState) {
        setState(prev => ({ ...prev, lastCycle: formattedNextCycle }));
      } else if (setUsers) {
        handleChange(setUsers, null, userData.userId, updates);
      }
      handleSubmit({ userId: userData.userId, ...updates }, 'overwrite', isToastOn);
    }
  }, [
    base,
    preCycleActive,
    schedule,
    saveSchedule,
    setUsers,
    setState,
    userData.userId,
    isToastOn,
  ]);

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

      const hasStoredPreCycle = parsed.some(
        item =>
          item.key === 'pre-visit1' ||
          item.key === 'pre-dipherelin' ||
          /диферелін/i.test(String(item.label || '')),
      );
      if (hasStoredPreCycle) {
        setSchedule(parsed);
      } else {
        const firstDate = parsed[0]?.date;
        if (!firstDate || firstDate.toDateString() !== expectedFirst?.toDateString()) {
          setSchedule(gen);
        } else {
          setSchedule(parsed);
        }
      }
    } else {
      setSchedule(gen);
    }
  }, [userData.stimulationSchedule, effectiveStatus, base, userData.lastCycle]);

  const postTransferKeys = React.useMemo(
    () => Object.keys(transferRelativeConfig),
    [],
  );

  React.useEffect(() => {
    const transferItem = schedule.find(v => v.key === 'transfer');
    if (transferItem) {
      transferRef.current = transferItem.date;
    }
  }, [schedule]);

  const adjustItemForDate = (item, target, { baseDate = base, transferDate, overrideLabel } = {}) => {
    if (!item || !target) return item;
    const normalizedDate = normalizeDate(target);
    const labelSource = typeof overrideLabel === 'string' ? overrideLabel : item.label;
    const baseDateValue = baseDate || null;
    const effectiveTransfer = transferDate || baseDateValue;

    if (postTransferKeys.includes(item.key)) {
      const labelText = buildPostTransferLabel(item.key, labelSource, normalizedDate, effectiveTransfer);
      return {
        ...item,
        date: normalizedDate,
        label: labelText,
      };
    }

    let adjustedDate = normalizedDate;
    let adj =
      baseDateValue && adjustedDate
        ? { date: adjustedDate, day: diffDays(adjustedDate, baseDateValue), sign: '' }
        : { date: adjustedDate, day: null, sign: '' };

    if (item.key.startsWith('week') && baseDateValue) {
      const prefix = getSchedulePrefixForDate(adjustedDate, baseDateValue, transferDate);
      let suffix = sanitizeDescription(labelSource);
      if (suffix) {
        suffix = suffix.replace(/\s*[+-]$/, '').trim();
      }
      let labelText = prefix;
      if (suffix) {
        labelText = labelText ? `${labelText} ${suffix}` : suffix;
      }
      return {
        ...item,
        date: adjustedDate,
        label: labelText.trim(),
      };
    }

    if (item.key === 'visit3' && baseDateValue && adj.day !== null && adj.day < 6) {
      const min = new Date(baseDateValue);
      min.setDate(baseDateValue.getDate() + 5);
      const normalizedMin = normalizeDate(min);
      return adjustItemForDate(item, normalizedMin, { baseDate: baseDateValue, transferDate, overrideLabel });
    }

    if (item.key.startsWith('ap')) {
      const parsed = computeCustomDateAndLabel(labelSource, baseDateValue, item.date, transferDate);
      const description = parsed.description || parsed.raw || labelSource;
      const baseForLabel = baseDateValue || effectiveTransfer || adjustedDate;
      const labelText = buildCustomEventLabel(adjustedDate, baseForLabel, transferDate, description);
      return {
        ...item,
        date: adjustedDate,
        label: labelText,
      };
    }

    if (baseDateValue && adj.day !== null) {
      const prefix = getSchedulePrefixForDate(adjustedDate, baseDateValue, transferDate);
      let suffix = sanitizeDescription(labelSource);
      if (suffix) {
        suffix = suffix.replace(/\s*[+-]$/, '').trim();
      }
      let lbl = prefix;
      if (suffix) {
        lbl = lbl ? `${lbl} ${suffix}` : suffix;
      }
      if (adj.sign) {
        lbl = lbl ? `${lbl} ${adj.sign}` : adj.sign;
      }
      return {
        ...item,
        date: adjustedDate,
        label: lbl.trim(),
      };
    }

    return {
      ...item,
      date: adjustedDate,
      label: labelSource,
    };
  };

  const shiftDate = (idx, delta) => {
    setSchedule(prev => {
      const copy = [...prev];
      const item = copy[idx];
      const newDate = new Date(item.date);
      newDate.setDate(newDate.getDate() + delta);

      const transferDate =
        copy.find(v => v.key === 'transfer')?.date || transferRef.current || base;

      const applyAdjust = (it, d) => {
        const isPostTransferKey = postTransferKeys.includes(it.key);
        const preferredBase = isPostTransferKey && transferDate ? transferDate : base;
        const effectiveBase = preferredBase || base || transferDate || d;
        let adj = { date: d, day: diffDays(d, effectiveBase), sign: '' };
        if (it.key.startsWith('week')) {
          const prefix = getSchedulePrefixForDate(adj.date, base, transferDate);
          let suffix = sanitizeDescription(it.label);
          if (suffix) {
            suffix = suffix.replace(/\s*[+-]$/, '').trim();
          }
          let labelText = prefix;
          if (suffix) {
            labelText = labelText ? `${labelText} ${suffix}` : suffix;
          }
          return {
            ...it,
            date: adj.date,
            label: labelText.trim(),
          };
        }
        if (transferRelativeConfig[it.key]) {
          const normalizedDate = normalizeDate(adj.date);
          const reference = getTransferRelativeReference(transferDate, base);
          const dayNumber = reference ? diffDays(normalizedDate, reference) : adj.day;
          const suffix = getTransferSuffixFromLabel(it.key, it.label);
          const labelText = buildTransferDayLabel(it.key, dayNumber, suffix, adj.sign);
          return {
            ...it,
            date: normalizedDate,
            label: labelText,
          };
        }
        if (postTransferKeys.includes(it.key)) {
          const diff = Math.round((adj.date - transferDate) / (1000 * 60 * 60 * 24));
          const weeks = Math.floor(diff / 7);
          const days = diff % 7;
          let custom = it.label.replace(/^\d+т\d*д?\s*/, '').trim();
          let labelText = formatWeeksDaysToken(weeks, days);
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
          const parsed = computeCustomDateAndLabel(it.label, base, it.date, transferDate);
          const description = parsed.description || parsed.raw || it.label;
          const baseForLabel = base || transferDate || adj.date;
          const labelText = buildCustomEventLabel(adj.date, baseForLabel, transferDate, description);
          return {
            ...it,
            date: adj.date,
            label: labelText,
          };
        }
        const prefix = getSchedulePrefixForDate(adj.date, effectiveBase, transferDate);
        let suffix = sanitizeDescription(it.label);
        if (suffix) {
          suffix = suffix.replace(/\s*[+-]$/, '').trim();
        }
        let lbl = prefix;
        if (suffix) {
          lbl = lbl ? `${lbl} ${suffix}` : suffix;
        }
        if (adj.sign) {
          lbl = lbl ? `${lbl} ${adj.sign}` : adj.sign;
        }
        return { ...it, date: adj.date, label: lbl.trim() };
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
  const displayItems = filtered.filter((item, idx, arr) => {
    if (item.key !== 'today-placeholder') return true;
    const trimmedLabel = (item.label || '').trim();
    const normalizedToken = normalizeWeeksDaysToken(trimmedLabel);
    if (!normalizedToken || normalizedToken.normalized !== trimmedLabel.toLowerCase()) {
      return true;
    }
    return !arr.some(
      (other, otherIdx) =>
        otherIdx !== idx &&
        other.key !== 'today-placeholder' &&
        isSameDay(other.date, item.date),
    );
  });

  displayItems.forEach((item, index) => {
      const dateStr = formatDisplay(item.date);
      const weekday = weekdayNames[item.date.getDay()];
      const prefix = `${dateStr} ${weekday}`;
      const labelValue =
        item.label === null || item.label === undefined ? '' : String(item.label);
      const trimmedLabel = labelValue.trim();
      const labelLower = trimmedLabel.toLowerCase();
      const prefixLower = prefix.toLowerCase();
      let remainder = trimmedLabel;
      let hadPrefix = false;
      if (labelLower.startsWith(prefixLower)) {
        hadPrefix = true;
        remainder = trimmedLabel.slice(prefix.length).trim();
      }
      const tokenInfo = extractWeeksDaysPrefix(remainder);
      let normalizedToken = '';
      let remainderWithoutToken = remainder;
      if (tokenInfo) {
        normalizedToken = tokenInfo.normalized;
        remainderWithoutToken = remainder.slice(tokenInfo.length).trim();
      }
      const dayInfo = extractDayPrefix(remainderWithoutToken);
      let normalizedDayPrefix = '';
      let remainderWithoutDay = remainderWithoutToken;
      if (dayInfo) {
        normalizedDayPrefix = dayInfo.raw || `${Math.max(dayInfo.day, 1)}й день`;
        remainderWithoutDay = dayInfo.rest;
      }
      const sanitizedRemainder = sanitizeDescription(remainderWithoutDay);
      const displayParts = [];
      if (normalizedToken) {
        displayParts.push(normalizedToken);
      }
      if (normalizedDayPrefix) {
        displayParts.push(normalizedDayPrefix);
      }
      if (sanitizedRemainder) {
        displayParts.push(sanitizedRemainder);
      }
      if (displayParts.length === 0 && hadPrefix) {
        displayParts.push(weekday);
      }
      let displayLabel = displayParts.join(' ').trim();
      if (!displayLabel) {
        displayLabel = normalizedToken || sanitizedRemainder || remainder || trimmedLabel;
      }
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
      const isCustomEvent = (item.key || '').startsWith('ap-');
      const inputValue = isCustomEvent ? String(displayLabel || '') : labelValue;

      const isFirstDayRow = item.key === 'visit1' || item.key === 'pre-visit1';
      const showDipherelinButton =
        (!preCycleActive && item.key === 'visit1') || item.key === 'pre-visit1';

      if (isFirstDayRow) {
        rendered.push(
          <div key={item.key} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <div>
                {dateStr} {weekday}
              </div>
              <div
                style={{
                  flex: 1,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {displayLabel}
              </div>
            </div>
            {showDipherelinButton ? (
              <OrangeBtn
                onClick={handleActivateDipherelin}
                style={{
                  minWidth: '88px',
                  height: '24px',
                  borderRadius: '4px',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  padding: '0 8px',
                }}
              >
                Диферелін
              </OrangeBtn>
            ) : null}
          </div>,
        );
      } else {
        const isPlaceholder = item.key === 'today-placeholder';
        const isEditing = editingKey === item.key;
        rendered.push(
          <div key={item.key} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
              <div>
                {dateStr} {weekday}
              </div>
              {isEditing ? (
                <input
                  value={inputValue}
                  autoFocus
                  onChange={e =>
                    setSchedule(prev => {
                      const copy = [...prev];
                      const idx = copy.findIndex(v => v.key === item.key);
                      if (idx === -1) {
                        const next = { ...item, label: e.target.value };
                        const insertAt = copy.findIndex(v => v.date > next.date);
                        if (insertAt === -1) {
                          copy.push(next);
                        } else {
                          copy.splice(insertAt, 0, next);
                        }
                        return copy;
                      }
                      copy[idx] = { ...copy[idx], label: e.target.value };
                      return copy;
                    })
                  }
                  onBlur={() => {
                    setEditingKey(null);
                    setSchedule(prev => {
                      const copy = [...prev];
                      let idx = copy.findIndex(v => v.key === item.key);
                      if (idx === -1) {
                        const next = { ...item };
                        const insertAt = copy.findIndex(v => v.date > next.date);
                        if (insertAt === -1) {
                          copy.push(next);
                          idx = copy.length - 1;
                        } else {
                          copy.splice(insertAt, 0, next);
                          idx = insertAt;
                        }
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
                        } else if (transferRelativeConfig[updated.key]) {
                          const dayInfo = extractDayPrefix(trimmedLabel);
                          if (dayInfo) {
                            const computedDate = computeDateFromTransferDay(
                              dayInfo.day,
                              transferDate,
                              base,
                            );
                            if (computedDate && !isSameDay(computedDate, updated.date)) {
                              updated = {
                                ...updated,
                                date: computedDate,
                              };
                              dateChanged = true;
                            }
                            const suffix = dayInfo.rest || transferRelativeConfig[updated.key].defaultSuffix;
                            updated = {
                              ...updated,
                              label: buildTransferDayLabel(
                                updated.key,
                                dayInfo.day,
                                suffix,
                              ),
                            };
                          }
                        } else if (updated.key.startsWith('ap-')) {
                          const computed = computeCustomDateAndLabel(
                            trimmedLabel,
                            base,
                            updated.date,
                            transferDate,
                          );
                          const nextDate = computed.date || updated.date;
                          const description = computed.description || computed.raw || trimmedLabel;
                          const baseForLabel = base || transferDate || nextDate || updated.date;
                          const nextLabel = nextDate
                            ? buildCustomEventLabel(nextDate, baseForLabel, transferDate, description)
                            : trimmedLabel;
                          dateChanged = !isSameDay(nextDate, updated.date);
                          updated = {
                            ...updated,
                            date: nextDate,
                            label: nextLabel,
                          };
                        } else {
                          const manualAnchor =
                            updated.date ||
                            (postTransferKeys.includes(updated.key) ? transferDate : base);
                          const manualInfo = parseLeadingDate(trimmedLabel, manualAnchor);
                          if (manualInfo && manualInfo.date) {
                            const adjusted = adjustItemForDate(updated, manualInfo.date, {
                              baseDate: base,
                              transferDate,
                              overrideLabel: manualInfo.remainder,
                            });
                            dateChanged = !isSameDay(adjusted.date, current.date);
                            updated = adjusted;
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
                  onClick={() => setEditingKey(item.key)}
                  style={{
                    cursor: 'pointer',
                    flex: 1,
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {displayLabel}
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
      const next = displayItems[index + 1];
      if (!foundToday && next && today > item.date.getTime() && today < next.date.getTime()) {
        rendered.push(
          <div
            key={`today-sep-${index}`}
            style={{ height: '3px', backgroundColor: '#FFECB3' }}
          />,
        );
      }
    });

  if (!foundToday) {
    const first = displayItems[0];
    const last = displayItems[displayItems.length - 1];
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
          className="stimulation-custom-event-input"
          onChange={e => {
            setApDescription(e.target.value);
            setApDerivedDate(null);
          }}
          onBlur={() =>
            setApDescription(prev => {
              const result = computeCustomDateAndLabel(
                prev,
                base,
                apDerivedDate || base,
                transferRef.current,
              );
              if (result.date) {
                setApDerivedDate(result.date);
                return result.label;
              }
              setApDerivedDate(null);
              const fallback = (result.description || result.raw || prev).trim();
              return fallback;
            })
          }
          placeholder="10.08 УЗД"
          style={{ flex: 1 }}
        />
        <OrangeBtn
          onClick={() => {
            const normalizedInput = apDescription.trim();
            const computed = computeCustomDateAndLabel(
              normalizedInput,
              base,
              apDerivedDate || base,
              transferRef.current,
            );
            const sanitizedInput = sanitizeDescription(normalizedInput);
            let date = apDerivedDate || computed.date;
            let descriptionForLabel = computed.description || sanitizedInput;
            if (!date) {
              const match = normalizedInput.match(/(\d{2}\.\d{2}(?:\.\d{4})?)/);
              if (match) {
                const parsedDate = parseDate(match[1]);
                if (parsedDate) {
                  date = normalizeDate(parsedDate);
                  const remainder = normalizedInput.replace(match[1], '').trim();
                  descriptionForLabel = sanitizeDescription(remainder);
                }
              }
            }
            if (!date) {
              date = normalizeDate(new Date());
              if (!descriptionForLabel) {
                descriptionForLabel = sanitizedInput || computed.raw || normalizedInput || 'AP';
              }
            }
            if (!descriptionForLabel && computed.raw) {
              descriptionForLabel = sanitizeDescription(computed.raw);
            }
            if (!descriptionForLabel && normalizedInput) {
              descriptionForLabel = sanitizedInput;
            }
            if (!descriptionForLabel) {
              descriptionForLabel = 'AP';
            }
            const transferForLabel = transferRef.current;
            const baseForLabel = base || transferForLabel || date;
            const label = buildCustomEventLabel(
              date,
              baseForLabel,
              transferForLabel,
              descriptionForLabel,
            );
            const newItem = {
              key: `ap-${Date.now()}`,
              date,
              label,
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
                const labelValue = (it.label || '').trim();
                const prefix = `${dateStr} ${weekday}`;
                const lineLabelLower = labelValue.toLowerCase();
                const prefixLower = prefix.toLowerCase();
                let line = labelValue;
                if (!lineLabelLower.startsWith(prefixLower)) {
                  if (lineLabelLower.startsWith(dateStr.toLowerCase())) {
                    const withoutDate = labelValue.slice(dateStr.length).trim();
                    line = `${prefix} ${withoutDate}`.trim();
                  } else {
                    line = `${prefix} ${labelValue}`.trim();
                  }
                }
                text += `${line}\n`;
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

export {
  sanitizeDescription,
  buildCustomEventLabel,
  computeCustomDateAndLabel,
};

export default StimulationSchedule;

