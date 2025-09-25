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

const removeWeekdayFromLineStart = (text, dateStr) => {
  if (!text) return '';

  const normalized = text.trim().replace(/\s+/g, ' ');
  const lowerNormalized = normalized.toLowerCase();
  const lowerDate = dateStr.toLowerCase();

  if (!lowerNormalized.startsWith(lowerDate)) {
    return normalized;
  }

  const remainder = normalized.slice(dateStr.length).trim();
  if (!remainder) {
    return dateStr;
  }

  const [firstToken, ...restTokens] = remainder.split(' ');
  const normalizedFirst = firstToken.toLowerCase();
  const hasWeekday = weekdayNames.some(name => normalizedFirst === name.toLowerCase());

  if (!hasWeekday) {
    return normalized;
  }

  const rest = restTokens.join(' ').trim();
  return rest ? `${dateStr} ${rest}` : dateStr;
};

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

  let referenceForDay = null;
  if (normalizedTransfer && normalizedDate.getTime() > normalizedTransfer.getTime()) {
    referenceForDay = normalizedTransfer;
  } else if (normalizedBase) {
    referenceForDay = normalizedBase;
  } else if (normalizedTransfer) {
    referenceForDay = normalizedTransfer;
  }

  if (!referenceForDay) {
    return '';
  }

  if (normalizedDate.getTime() < referenceForDay.getTime()) {
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

const splitCustomEventEntries = value => {
  if (typeof value !== 'string') return [];
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const stripBullet = line => line.replace(/^[-–—•*]+\s*/, '').trim();

  const newlineParts = normalized
    .split('\n')
    .map(part => stripBullet(part))
    .filter(Boolean);

  if (newlineParts.length > 1) {
    return newlineParts;
  }

  const singleLine = newlineParts[0] || '';
  if (!singleLine) {
    return [];
  }

  const dateRegex = /(\d{2}\.\d{2}(?:\.\d{2,4})?)/g;
  const matches = Array.from(singleLine.matchAll(dateRegex));
  if (matches.length <= 1) {
    return [singleLine];
  }

  const segments = [];
  const leading = singleLine.slice(0, matches[0].index).trim();

  matches.forEach((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : singleLine.length;
    if (typeof start !== 'number' || start < 0) return;
    let segment = singleLine.slice(start, end).trim();
    if (!segment) return;
    if (index === 0 && leading) {
      segment = `${leading} ${segment}`.trim();
    }
    segments.push(stripBullet(segment));
  });

  if (!segments.length) {
    return [singleLine];
  }

  return segments;
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

const PRE_CYCLE_KEYS = new Set(['pre-visit1', 'pre-uzd', 'pre-dipherelin']);

const isPreCycleKey = key => PRE_CYCLE_KEYS.has(key);

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
  const sign = diff < 0 ? '-' : '';
  const dayNumber = Math.abs(diff) + 1;

  return buildTransferDayLabel(key, dayNumber, suffix, sign);
};

const STIMULATION_RANGE_EXTENSION_DAYS = DAY_PREFIX_TRANSFER_WINDOW_DAYS;

const isWithinStimulationRange = (date, baseDate, transferDate) => {
  if (!date) return false;
  if (!baseDate && !transferDate) return false;

  const normalizedDate = normalizeDate(date);
  const normalizedBase = baseDate ? normalizeDate(baseDate) : null;
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;

  const rangeStart = normalizedBase || normalizedTransfer;
  if (!rangeStart) {
    return false;
  }

  if (normalizedDate.getTime() < rangeStart.getTime()) {
    return false;
  }

  let rangeEnd = null;
  if (normalizedTransfer) {
    rangeEnd = new Date(normalizedTransfer);
    rangeEnd.setDate(rangeEnd.getDate() + STIMULATION_RANGE_EXTENSION_DAYS);
  } else if (normalizedBase) {
    rangeEnd = new Date(normalizedBase);
    rangeEnd.setDate(rangeEnd.getDate() + STIMULATION_RANGE_EXTENSION_DAYS);
  }

  if (rangeEnd && normalizedDate.getTime() > rangeEnd.getTime()) {
    return false;
  }

  return true;
};

const buildCustomEventLabel = (date, baseDate, transferDate, description) => {
  const trimmedDescription = sanitizeDescription(description);
  if (!date) return trimmedDescription;

  const normalizedDate = normalizeDate(date);
  const normalizedBase = baseDate ? normalizeDate(baseDate) : null;
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;

  let prefix = '';
  if (isWithinStimulationRange(normalizedDate, normalizedBase, normalizedTransfer)) {
    prefix = getSchedulePrefixForDate(normalizedDate, normalizedBase, normalizedTransfer);
  }

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

  const resolveShortDate = (dayValue, monthValue) => {
    const safeDay = Number.isFinite(dayValue) ? Math.max(Math.trunc(dayValue), 1) : null;
    const safeMonthIndex = Number.isFinite(monthValue) ? Math.trunc(monthValue) : null;
    if (safeDay === null || safeMonthIndex === null) {
      return null;
    }
    const currentYear = new Date().getFullYear();
    const candidate = new Date(currentYear, safeMonthIndex, safeDay);
    candidate.setHours(0, 0, 0, 0);
    return candidate;
  };

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

      const fusedMatch = part.match(/^(\d{2}\.\d{2}(?:\.\d{4})?)(?!\d)/);
      if (fusedMatch) {
        const rawDateToken = fusedMatch[1];
        let candidate = null;
        if (/^\d{2}\.\d{2}$/.test(rawDateToken)) {
          const [dayStr, monthStr] = rawDateToken.split('.');
          candidate = resolveShortDate(Number(dayStr), Number(monthStr) - 1);
        } else {
          const parsed = parseDate(rawDateToken);
          if (parsed) {
            candidate = normalizeDate(parsed);
          }
        }
        if (candidate) {
          date = candidate;
          const remainder = part.slice(rawDateToken.length);
          const trimmedRemainder = remainder.replace(/^[\s.,;:!?(){}\u005B\u005D-]+/, '');
          if (trimmedRemainder) {
            descriptionTokens.push(trimmedRemainder);
          }
          continue;
        }
      }

      const shortMatch = part.match(/^(\d{2})\.(\d{2})$/);
      if (shortMatch) {
        const candidate = resolveShortDate(Number(shortMatch[1]), Number(shortMatch[2]) - 1);
        if (candidate) {
          date = candidate;
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

const prepareCustomEventItem = (
  input,
  { derivedDate = null, baseDate = null, referenceDate = null, transferDate = null } = {},
) => {
  if (!input) return null;
  const normalizedInput = input.trim();
  if (!normalizedInput) return null;

  const sanitizedInput = sanitizeDescription(normalizedInput);
  const computed = computeCustomDateAndLabel(
    normalizedInput,
    baseDate,
    referenceDate || baseDate || derivedDate,
    transferDate,
  );

  let date = derivedDate || computed.date;
  let descriptionForLabel = computed.description || sanitizedInput;

  if (!date) {
    const inlineMatch = normalizedInput.match(/(\d{2}\.\d{2}(?:\.\d{4})?)/);
    if (inlineMatch) {
      const parsedInline = parseDate(inlineMatch[1]);
      if (parsedInline) {
        date = normalizeDate(parsedInline);
        const remainder = normalizedInput.replace(inlineMatch[1], '').trim();
        descriptionForLabel = sanitizeDescription(remainder);
      }
    }
  }

  if (!date) {
    const parsedDirect = parseDate(normalizedInput);
    if (parsedDirect) {
      date = normalizeDate(parsedDirect);
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

  const baseForLabel = baseDate || transferDate || date;
  const label = buildCustomEventLabel(date, baseForLabel, transferDate, descriptionForLabel);

  return {
    date,
    label,
  };
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
      const currentYear = new Date().getFullYear();
      const candidate = new Date(currentYear, monthIndex, day);
      candidate.setHours(0, 0, 0, 0);
      parsedDate = candidate;
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

const adjustToNextWorkingDay = (date, base) => {
  if (!date) return null;
  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);
  const normalizedBase = base ? normalizeDate(base) : null;

  if (!normalizedBase) {
    while (isWeekend(candidate)) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return { date: normalizeDate(candidate), day: null, sign: '' };
  }

  const adjusted = adjustForward(candidate, normalizedBase);
  return { ...adjusted, date: normalizeDate(adjusted.date) };
};

const buildUnadjustedDayInfo = (date, base) => {
  const normalizedDate = normalizeDate(date);
  if (!base) {
    return { date: normalizedDate, day: null, sign: '' };
  }
  const normalizedBase = normalizeDate(base);
  const day = diffDays(normalizedDate, normalizedBase);
  return { date: normalizedDate, day, sign: '' };
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
    const adj = week === 40 ? buildUnadjustedDayInfo(wd, base) : adjustForward(wd, base);
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

const buildDipherelinSchedule = (baseDate, { dayOneLabel } = {}) => {
  if (!baseDate) return null;

  const normalizedBase = normalizeDate(baseDate);
  if (!normalizedBase || Number.isNaN(normalizedBase.getTime())) {
    return null;
  }

  const normalizedLabel = typeof dayOneLabel === 'string' && dayOneLabel.trim()
    ? dayOneLabel.trim()
    : '1й день';

  const preDayOne = {
    key: 'pre-visit1',
    date: normalizedBase,
    label: normalizedLabel,
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
  const adjustedNextCycle =
    adjustToNextWorkingDay(nextCycleStart, normalizedBase) || {
      date: normalizeDate(nextCycleStart),
      day: normalizedBase ? diffDays(nextCycleStart, normalizedBase) : null,
      sign: '',
    };
  const normalizedNextCycle = normalizeDate(adjustedNextCycle.date);

  const nextCycleVisits = generateSchedule(normalizedNextCycle).map(item => ({
    ...item,
    date: normalizeDate(item.date),
  }));

  return {
    schedule: [preDayOne, preUltrasound, preDipherelin, ...nextCycleVisits],
    nextCycleDate: normalizedNextCycle,
  };
};

export const generateScheduleWithDipherelin = base => {
  const built = buildDipherelinSchedule(base);
  return built ? built.schedule : [];
};

export const adjustItemForDate = (
  item,
  target,
  {
    baseDate = null,
    transferDate,
    overrideLabel,
    preCycleBase = null,
    postTransferKeys = Object.keys(transferRelativeConfig),
  } = {},
) => {
  if (!item || !target) return item;

  const normalizedDate = normalizeDate(target);
  const labelSource = typeof overrideLabel === 'string' ? overrideLabel : item.label;
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;
  const normalizedPreBase = preCycleBase ? normalizeDate(preCycleBase) : null;
  const isPreItem = isPreCycleKey(item.key);

  let baseCandidate = baseDate || null;
  if (isPreItem && normalizedPreBase) {
    baseCandidate = normalizedPreBase;
  }
  if (item.key === 'visit1' || item.key === 'pre-visit1') {
    baseCandidate = normalizedDate;
  }

  const baseDateValue = baseCandidate ? normalizeDate(baseCandidate) : null;
  const effectiveTransfer =
    normalizedTransfer || (!isPreItem && baseDateValue ? baseDateValue : null);
  const effectivePostTransferKeys = Array.isArray(postTransferKeys)
    ? postTransferKeys
    : Object.keys(transferRelativeConfig);

  if (effectivePostTransferKeys.includes(item.key)) {
    const labelText = buildPostTransferLabel(
      item.key,
      labelSource,
      normalizedDate,
      effectiveTransfer,
    );
    return {
      ...item,
      date: normalizedDate,
      label: labelText,
    };
  }

  const adjustedDate = normalizedDate;
  const adj =
    baseDateValue && adjustedDate
      ? { date: adjustedDate, day: diffDays(adjustedDate, baseDateValue), sign: '' }
      : { date: adjustedDate, day: null, sign: '' };

  if (item.key?.startsWith('week') && baseDateValue) {
    const prefix = getSchedulePrefixForDate(adjustedDate, baseDateValue, normalizedTransfer);
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
    return adjustItemForDate(item, normalizedMin, {
      baseDate: baseDateValue,
      transferDate: normalizedTransfer || effectiveTransfer,
      overrideLabel,
      preCycleBase: normalizedPreBase || baseDateValue,
      postTransferKeys: effectivePostTransferKeys,
    });
  }

  if (item.key?.startsWith('ap')) {
    const parsed = computeCustomDateAndLabel(
      labelSource,
      baseDateValue,
      item.date,
      normalizedTransfer,
    );
    const description = parsed.description || parsed.raw || labelSource;
    const baseForLabel = baseDateValue || effectiveTransfer || adjustedDate;
    const labelText = buildCustomEventLabel(
      adjustedDate,
      baseForLabel,
      normalizedTransfer,
      description,
    );
    return {
      ...item,
      date: adjustedDate,
      label: labelText,
    };
  }

  if (baseDateValue && adj.day !== null) {
    const prefix = getSchedulePrefixForDate(adjustedDate, baseDateValue, normalizedTransfer);
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

const StimulationSchedule = ({
  userData,
  setUsers,
  setState,
  isToastOn = false,
  onLastCyclePersisted,
}) => {
  const base = React.useMemo(() => parseDate(userData?.lastCycle), [userData?.lastCycle]);
  const effectiveStatus = getEffectiveCycleStatus(userData);
  const [schedule, setSchedule] = React.useState([]);
  const [apDescription, setApDescription] = React.useState('');
  const [apDerivedDate, setApDerivedDate] = React.useState(null);
  const [editingKey, setEditingKey] = React.useState(null);
  const [pendingDelete, setPendingDelete] = React.useState(null);
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

  const isDipherelinApplied = React.useMemo(
    () => schedule.some(item => item.key === 'pre-dipherelin'),
    [schedule],
  );

  const preCycleBaseDate = React.useMemo(() => {
    const preVisit = schedule.find(entry => entry.key === 'pre-visit1' && entry.date);
    if (!preVisit) return null;
    return normalizeDate(preVisit.date);
  }, [schedule]);

  const resolvedBaseDate = React.useMemo(() => {
    const firstDay = schedule.find(entry => entry.key === 'visit1' && entry.date);
    if (firstDay) {
      return normalizeDate(firstDay.date);
    }
    return base ? normalizeDate(base) : null;
  }, [schedule, base]);

  const saveSchedule = React.useCallback(
    sched => {
      if (!hasChanges.current) return;
      const scheduleString = serializeSchedule(sched);
      const baseForDefaults = (() => {
        if (Array.isArray(sched)) {
          const preVisit = sched.find(entry => entry?.key === 'pre-visit1' && entry.date);
          if (preVisit) {
            return normalizeDate(preVisit.date);
          }
          const nextFirst = sched.find(entry => entry?.key === 'visit1' && entry.date);
          if (nextFirst) {
            return normalizeDate(nextFirst.date);
          }
        }
        return base ? normalizeDate(base) : null;
      })();
      const defaultString = baseForDefaults
        ? serializeSchedule(generateScheduleWithDipherelin(baseForDefaults))
        : '';
      const isDefault = Boolean(baseForDefaults) && scheduleString === defaultString;
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

  const persistContextRef = React.useRef({
    setUsers,
    setState,
    userId: userData.userId,
    isToastOn,
  });

  React.useEffect(() => {
    persistContextRef.current = {
      setUsers,
      setState,
      userId: userData.userId,
      isToastOn,
    };
  }, [setUsers, setState, userData.userId, isToastOn]);

  const persistLastCycleDate = React.useCallback(
    newBaseDate => {
      if (!newBaseDate) return;
      const context = persistContextRef.current;
      const normalizedDate = normalizeDate(newBaseDate);
      const formattedNextCycle = formatDateToServer(formatFullDate(normalizedDate));
      if (!formattedNextCycle) return;
      const updates = { lastCycle: formattedNextCycle };
      let stateSynced = false;
      if (context.setUsers && context.setState) {
        handleChange(context.setUsers, context.setState, context.userId, updates);
        stateSynced = true;
      } else if (context.setState) {
        context.setState(prev => ({ ...prev, lastCycle: formattedNextCycle }));
        stateSynced = true;
      } else if (context.setUsers) {
        handleChange(context.setUsers, null, context.userId, updates);
        stateSynced = true;
      }

      if (typeof onLastCyclePersisted === 'function') {
        onLastCyclePersisted({
          lastCycle: formattedNextCycle,
          date: normalizedDate,
          needsSync: !stateSynced,
        });
      }

      handleSubmit(
        { userId: context.userId, ...updates },
        'overwrite',
        context.isToastOn,
      );
    },
    [onLastCyclePersisted],
  );

  const handleDeactivateDipherelin = React.useCallback(() => {
    if (!isDipherelinApplied) {
      return;
    }

    const baseForShortened = preCycleBaseDate || base;
    if (!baseForShortened) {
      return;
    }

    const normalizedBaseForShortened = normalizeDate(baseForShortened);
    const shortenedSchedule = generateSchedule(normalizedBaseForShortened).map(item => ({
      ...item,
      date: normalizeDate(item.date),
    }));

    setSchedule(shortenedSchedule);
    hasChanges.current = true;
    saveSchedule(shortenedSchedule);
    persistLastCycleDate(normalizedBaseForShortened);
  }, [
    isDipherelinApplied,
    preCycleBaseDate,
    base,
    saveSchedule,
    persistLastCycleDate,
  ]);

  const handleDipherelinButtonClick = React.useCallback(() => {
    if (isDipherelinApplied) {
      handleDeactivateDipherelin();
    }
  }, [handleDeactivateDipherelin, isDipherelinApplied]);

  React.useEffect(() => {
    if (!['stimulation', 'pregnant'].includes(effectiveStatus) || !base) return;

    const defaultWithDipherelin = generateScheduleWithDipherelin(base);
    const shortenedDefault = generateSchedule(base);

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

      const sortedParsed = [...parsed].sort((a, b) => a.date - b.date);
      if (sortedParsed.length) {
        setSchedule(sortedParsed);
      } else {
        setSchedule(defaultWithDipherelin.length ? defaultWithDipherelin : shortenedDefault);
      }
    } else {
      setSchedule(defaultWithDipherelin.length ? defaultWithDipherelin : shortenedDefault);
    }
  }, [
    userData.stimulationSchedule,
    effectiveStatus,
    base,
    userData.lastCycle,
  ]);

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

  const adjustItemForDateFn = React.useCallback(
    (item, target, options = {}) =>
      adjustItemForDate(item, target, {
        baseDate: resolvedBaseDate,
        preCycleBase: preCycleBaseDate,
        postTransferKeys,
        ...options,
      }),
    [postTransferKeys, preCycleBaseDate, resolvedBaseDate],
  );

  const applyTransferDateToDependents = React.useCallback(
    (items, transferDate) => {
      if (!transferDate || !Array.isArray(items) || items.length === 0) {
        return items;
      }

      const normalizedTransfer = normalizeDate(transferDate);
      const baseForState =
        items.find(entry => entry.key === 'visit1')?.date || resolvedBaseDate || null;
      const preBaseForState =
        items.find(entry => entry.key === 'pre-visit1')?.date || preCycleBaseDate || null;

      let didUpdate = false;
      const next = [...items];

      const updateWithTarget = (index, targetDate) => {
        if (index === -1 || !targetDate) return;
        const current = next[index];
        if (!current) return;
        const adjusted = adjustItemForDateFn(current, targetDate, {
          baseDate: baseForState,
          transferDate: normalizedTransfer,
          preCycleBase: preBaseForState,
        });
        if (adjusted && adjusted !== current) {
          next[index] = adjusted;
          didUpdate = true;
        }
      };

      const hcgIndex = next.findIndex(entry => entry.key === 'hcg');
      if (hcgIndex !== -1) {
        const hcgTarget = new Date(normalizedTransfer);
        hcgTarget.setDate(hcgTarget.getDate() + 11);
        updateWithTarget(hcgIndex, hcgTarget);
      }

      const usIndex = next.findIndex(entry => entry.key === 'us');
      if (usIndex !== -1) {
        const usCandidate = new Date(normalizedTransfer);
        usCandidate.setDate(usCandidate.getDate() + 27);
        const adjustedUs = adjustForward(new Date(usCandidate), normalizedTransfer);
        const usTarget = adjustedUs?.date
          ? normalizeDate(adjustedUs.date)
          : normalizeDate(usCandidate);
        updateWithTarget(usIndex, usTarget);
      }

      return didUpdate ? next : items;
    },
    [adjustItemForDateFn, preCycleBaseDate, resolvedBaseDate],
  );

  const shiftDate = (idx, delta) => {
    let persistTarget = null;
    setSchedule(prev => {
      let next = [...prev];
      const item = next[idx];
      if (!item || !item.date) return prev;

      const newDate = new Date(item.date);
      newDate.setDate(newDate.getDate() + delta);

      const stateBase = next.find(entry => entry.key === 'visit1')?.date || resolvedBaseDate;
      const currentTransfer =
        next.find(entry => entry.key === 'transfer')?.date || transferRef.current || null;
      const stateTransfer =
        item.key === 'transfer' ? newDate : currentTransfer;
      const statePreBase = next.find(entry => entry.key === 'pre-visit1')?.date || preCycleBaseDate;

      const adjustedItem = adjustItemForDateFn(item, newDate, {
        baseDate: stateBase,
        transferDate: stateTransfer,
        preCycleBase: statePreBase,
      });

      next[idx] = adjustedItem;

      if (adjustedItem.key === 'transfer') {
        transferRef.current = adjustedItem.date;
        next = applyTransferDateToDependents(next, adjustedItem.date);
      }

      if (adjustedItem.key === 'pre-visit1') {
        persistTarget = adjustedItem.date;
      }

      next.sort((a, b) => a.date - b.date);
      hasChanges.current = true;
      saveSchedule(next);
      return next;
    });

    if (persistTarget) {
      persistLastCycleDate(persistTarget);
    }
  };

  const rebaseScheduleFromDayOne = React.useCallback(
    newBaseDate => {
      if (!newBaseDate) return;
      const normalizedNewBase = normalizeDate(newBaseDate);
      let didUpdate = false;

      setSchedule(prev => {
        if (!Array.isArray(prev) || prev.length === 0) return prev;
        const currentFirst = prev.find(entry => entry.key === 'visit1' && entry.date);
        const currentBase = currentFirst ? normalizeDate(currentFirst.date) : resolvedBaseDate;
        if (!currentBase) return prev;
        if (normalizedNewBase.getTime() === currentBase.getTime()) {
          return prev;
        }

        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const deltaDays = Math.round(
          (normalizedNewBase.getTime() - currentBase.getTime()) / MS_PER_DAY,
        );

        const preVisitItem = prev.find(entry => entry.key === 'pre-visit1');
        const preservedPreBase = preVisitItem?.date ? normalizeDate(preVisitItem.date) : null;

        const preservedPreCycle = prev.filter(item => isPreCycleKey(item?.key));
        const itemsToShift = prev.filter(item => !isPreCycleKey(item?.key));

        const regenerated = generateSchedule(normalizedNewBase).map(item => ({
          ...item,
          date: normalizeDate(item.date),
        }));
        const regeneratedMap = new Map(regenerated.map(item => [item.key, item]));
        const regeneratedTransfer = regeneratedMap.get('transfer')?.date || null;
        const normalizedTransfer = regeneratedTransfer ? normalizeDate(regeneratedTransfer) : null;

        const shiftCustomItem = scheduleItem => {
          if (!scheduleItem?.date) return scheduleItem;
          const next = new Date(scheduleItem.date);
          next.setDate(next.getDate() + deltaDays);
          return adjustItemForDateFn(scheduleItem, next, {
            baseDate: normalizedNewBase,
            transferDate: normalizedTransfer,
            preCycleBase: preservedPreBase,
          });
        };

        const shiftedItems = itemsToShift.map(scheduleItem => {
          if (!scheduleItem) return scheduleItem;

          if (scheduleItem.key === 'visit1') {
            const generatedVisit1 = regeneratedMap.get('visit1');
            const overrideLabel = generatedVisit1?.label || scheduleItem.label;
            return adjustItemForDateFn(scheduleItem, normalizedNewBase, {
              baseDate: normalizedNewBase,
              transferDate: normalizedTransfer,
              overrideLabel,
              preCycleBase: preservedPreBase,
            });
          }

          const generatedMatch = regeneratedMap.get(scheduleItem.key);
          if (generatedMatch) {
            return adjustItemForDateFn(scheduleItem, generatedMatch.date, {
              baseDate: normalizedNewBase,
              transferDate: normalizedTransfer,
              overrideLabel: scheduleItem.label,
              preCycleBase: preservedPreBase,
            });
          }

          return shiftCustomItem(scheduleItem);
        });

        const combined = [...preservedPreCycle, ...shiftedItems].filter(Boolean);
        combined.sort((a, b) => {
          if (!a?.date || !b?.date) return 0;
          return a.date - b.date;
        });

        transferRef.current = normalizedTransfer || null;

        hasChanges.current = true;
        saveSchedule(combined);
        didUpdate = true;
        return combined;
      });

      if (didUpdate) {
        persistLastCycleDate(normalizedNewBase);
      }
    },
    [adjustItemForDateFn, persistLastCycleDate, resolvedBaseDate, saveSchedule],
  );

  const requestDeleteItem = React.useCallback(item => {
    if (!item) return;
    setPendingDelete(item);
  }, []);

  const handleCancelDelete = React.useCallback(() => {
    setPendingDelete(null);
  }, []);

  const handleConfirmDelete = React.useCallback(() => {
    if (!pendingDelete) return;

    setSchedule(prev => {
      const updated = prev.filter(v => v.key !== pendingDelete.key);
      if (updated.length === prev.length) {
        return prev;
      }
      hasChanges.current = true;
      saveSchedule(updated);
      return updated;
    });
    setPendingDelete(null);
  }, [pendingDelete, saveSchedule]);

  if (
    !['stimulation', 'pregnant'].includes(effectiveStatus) ||
    !resolvedBaseDate ||
    schedule.length === 0
  )
    return null;

  const todayDate = normalizeDate(new Date());
  const today = todayDate.getTime();
  let foundToday = false;

  const rendered = [];
  let currentYear = null;

  const filtered = schedule.filter(item => item.date);
  if (!filtered.some(item => item.date.getTime() === today)) {
    const baseForDiff = resolvedBaseDate ? new Date(resolvedBaseDate) : null;
    if (baseForDiff) {
      const msInDay = 1000 * 60 * 60 * 24;
      const diff = Math.round((todayDate.getTime() - baseForDiff.getTime()) / msInDay);
      const totalDays = Math.max(diff, 0);
      const weeks = Math.floor(totalDays / 7);
      const days = totalDays % 7;
      const normalizedBaseForPlaceholder = normalizeDate(baseForDiff);
      const transferSource =
        transferRef.current ||
        schedule.find(entry => entry.key === 'transfer' && entry.date)?.date ||
        null;
      const normalizedTransferForPlaceholder = transferSource
        ? normalizeDate(transferSource)
        : null;
      const computedPrefix = getSchedulePrefixForDate(
        todayDate,
        normalizedBaseForPlaceholder,
        normalizedTransferForPlaceholder,
      );
      const comment = computedPrefix || formatWeeksDaysToken(weeks, days);
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

  const baseRowBackgroundColor = 'rgba(16, 16, 16, 0.6)';
  const alternateRowBackgroundColor = (() => {
    const createAlternateShade = (color, differenceFraction = 0.02) => {
      if (typeof color !== 'string') return color;
      const rgbaMatch = color
        .trim()
        .match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+)\s*)?\)$/i);
      if (!rgbaMatch) return color;
      const [, r, g, b, alphaRaw] = rgbaMatch;
      const alpha = alphaRaw !== undefined ? parseFloat(alphaRaw) : 1;
      if (!Number.isFinite(alpha)) return color;
      const adjustedAlpha = Math.max(
        0,
        Math.min(1, Number((alpha * (1 - differenceFraction)).toFixed(3))),
      );
      if (adjustedAlpha === alpha) return color;
      return `rgba(${r.trim()}, ${g.trim()}, ${b.trim()}, ${adjustedAlpha})`;
    };
    return createAlternateShade(baseRowBackgroundColor, 0.02);
  })();
  const scheduleHorizontalPadding = 7;

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
      const isEvenRow = index % 2 === 0;
      const rowBackgroundColor = isToday
        ? '#FFECB3'
        : isEvenRow
          ? baseRowBackgroundColor
          : alternateRowBackgroundColor;
      const rowStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        margin: `0 -${scheduleHorizontalPadding}px 2px`,
        padding: '6px 10px',
        borderRadius: '6px',
        backgroundColor: rowBackgroundColor,
        ...(isToday ? { color: '#000' } : {}),
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
        const firstDayIndex = schedule.findIndex(entry => entry.key === item.key);
        const showAdjustmentButtons = preCycleActive && item.key === 'visit1';
        const handleFirstDayShift = delta => {
          if (item.key === 'visit1') {
            const target = new Date(item.date);
            target.setDate(target.getDate() + delta);
            rebaseScheduleFromDayOne(target);
          } else if (firstDayIndex !== -1) {
            shiftDate(firstDayIndex, delta);
          }
        };

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
            <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
              {showAdjustmentButtons ? (
                <React.Fragment>
                  <OrangeBtn
                    onClick={() => handleFirstDayShift(-1)}
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
                    onClick={() => handleFirstDayShift(1)}
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
                </React.Fragment>
              ) : null}
              {showDipherelinButton ? (
                <OrangeBtn
                  onClick={handleDipherelinButtonClick}
                  style={{
                    width: 'calc(3 * 24px + 2 * 2px)',
                    height: '24px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    padding: '0 8px',
                    boxSizing: 'border-box',
                    textDecoration: isDipherelinApplied ? 'none' : 'line-through',
                  }}
                >
                  Диферелін
                </OrangeBtn>
              ) : null}
            </div>
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
                    let rebaseTarget = null;
                    setSchedule(prev => {
                      let next = [...prev];
                      let idx = next.findIndex(v => v.key === item.key);
                      if (idx === -1) {
                        const inserted = { ...item };
                        const insertAt = next.findIndex(v => v.date > inserted.date);
                        if (insertAt === -1) {
                          next.push(inserted);
                          idx = next.length - 1;
                        } else {
                          next.splice(insertAt, 0, inserted);
                          idx = insertAt;
                        }
                      }
                      const current = next[idx];
                      const trimmedLabel = (current.label || '').trim();
                      let updated = { ...current, label: trimmedLabel };
                      const scheduleBaseDate =
                        next.find(v => v.key === 'visit1')?.date || resolvedBaseDate || base;
                      const preBaseForState =
                        next.find(v => v.key === 'pre-visit1')?.date || preCycleBaseDate || null;
                      const transferDate =
                        next.find(v => v.key === 'transfer')?.date ||
                        transferRef.current ||
                        scheduleBaseDate ||
                        null;
                      let dateChanged = false;

                      if (isPlaceholder) {
                        const tokenInfo = scheduleBaseDate
                          ? getWeeksDaysTokenForDate(updated.date, scheduleBaseDate)
                          : null;
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
                          let reference = scheduleBaseDate;
                          if (isPreCycleKey(updated.key) && preBaseForState) {
                            reference = preBaseForState;
                          }
                          if (postTransferKeys.includes(updated.key)) {
                            reference = transferDate;
                          }
                          if (updated.key.startsWith('ap-')) {
                            reference = scheduleBaseDate || transferDate;
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
                              scheduleBaseDate,
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
                            scheduleBaseDate,
                            updated.date,
                            transferDate,
                          );
                          const nextDate = computed.date || updated.date;
                          const description = computed.description || computed.raw || trimmedLabel;
                          const baseForLabel =
                            scheduleBaseDate || transferDate || nextDate || updated.date;
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
                            (postTransferKeys.includes(updated.key)
                              ? transferDate
                              : isPreCycleKey(updated.key) && preBaseForState
                              ? preBaseForState
                              : scheduleBaseDate);
                          const manualInfo = parseLeadingDate(trimmedLabel, manualAnchor);
                          if (manualInfo && manualInfo.date) {
                            const adjusted = adjustItemForDateFn(updated, manualInfo.date, {
                              baseDate: scheduleBaseDate,
                              transferDate,
                              overrideLabel: manualInfo.remainder,
                              preCycleBase: preBaseForState,
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

                      if (updated.key === 'visit1' && dateChanged) {
                        rebaseTarget = updated.date;
                        return prev;
                      }

                      next[idx] = updated;

                      if (updated.key === 'transfer') {
                        transferRef.current = updated.date;
                        if (dateChanged) {
                          next = applyTransferDateToDependents(next, updated.date);
                        }
                      }

                      if (dateChanged) {
                        next.sort((a, b) => a.date - b.date);
                      }
                      hasChanges.current = true;
                      saveSchedule(next);
                      return next;
                    });
                    if (rebaseTarget) {
                      rebaseScheduleFromDayOne(rebaseTarget);
                    }
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
                    const tokenInfo = resolvedBaseDate
                      ? getWeeksDaysTokenForDate(item.date, resolvedBaseDate)
                      : null;
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
                    onClick={() => requestDeleteItem(item)}
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
              const currentValue = typeof prev === 'string' ? prev.replace(/\r\n/g, '\n') : '';
              const trimmedValue = currentValue.trim();
              if (!trimmedValue) {
                setApDerivedDate(null);
                return '';
              }

              const entries = splitCustomEventEntries(trimmedValue);
              if (entries.length > 1) {
                setApDerivedDate(null);
                return entries.join('\n');
              }

              const singleValue = entries[0] || trimmedValue;

              const result = computeCustomDateAndLabel(
                singleValue,
                resolvedBaseDate,
                apDerivedDate || resolvedBaseDate,
                transferRef.current,
              );
              if (result.date) {
                setApDerivedDate(result.date);
                if (result.label) {
                  return result.label;
                }
                const transferForLabel = transferRef.current;
                const baseForLabel = resolvedBaseDate || transferForLabel || result.date;
                const fallbackDescription =
                  result.description ||
                  sanitizeDescription(result.raw) ||
                  sanitizeDescription(singleValue);
                const fallbackLabel = buildCustomEventLabel(
                  result.date,
                  baseForLabel,
                  transferForLabel,
                  fallbackDescription,
                );
                if (fallbackLabel) {
                  return fallbackLabel;
                }
                const fallbackValue = (result.raw || formatDisplay(result.date) || '').trim();
                return fallbackValue;
              }
              setApDerivedDate(null);
              const fallback = (result.description || result.raw || singleValue).trim();
              return fallback;
            })
          }
          placeholder="10.08 УЗД"
          style={{ flex: 1 }}
        />
        <OrangeBtn
          onClick={() => {
            const normalizedInput = apDescription.replace(/\r\n/g, '\n').trim();
            if (!normalizedInput) return;

            const cleanedLines = splitCustomEventEntries(normalizedInput);

            if (!cleanedLines.length) {
              return;
            }

            const derivedForFirstLine = cleanedLines.length === 1 ? apDerivedDate : null;
            const referenceForCompute = derivedForFirstLine || resolvedBaseDate || null;
            const timestamp = Date.now();

            const newItems = cleanedLines
              .map((line, index) => {
                const prepared = prepareCustomEventItem(line, {
                  derivedDate: index === 0 ? derivedForFirstLine : null,
                  baseDate: resolvedBaseDate,
                  referenceDate: referenceForCompute,
                  transferDate: transferRef.current,
                });
                if (!prepared) {
                  return null;
                }
                return {
                  ...prepared,
                  key: `ap-${timestamp + index}`,
                };
              })
              .filter(Boolean);

            if (!newItems.length) {
              return;
            }

            newItems.sort((a, b) => {
              if (a.date && b.date) {
                const diff = a.date.getTime() - b.date.getTime();
                if (diff !== 0) return diff;
              }
              return a.key.localeCompare(b.key);
            });

            setSchedule(prev => {
              const updated = [...prev];
              newItems.forEach(item => {
                const insertIndex = updated.findIndex(it => it.date > item.date);
                if (insertIndex === -1) {
                  updated.push(item);
                } else {
                  updated.splice(insertIndex, 0, item);
                }
              });
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
                if (y !== yr) {
                  if (text) text += '\n';
                  text += `${y}\n`;
                  yr = y;
                }
                const labelValue = (it.label || '').trim();
                const prefix = dateStr;
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
                const sanitizedLine = removeWeekdayFromLineStart(line, dateStr);
                text += `${sanitizedLine}\n`;
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
      {pendingDelete && (
        <div
          onClick={handleCancelDelete}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={event => event.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              padding: '20px',
              borderRadius: '8px',
              maxWidth: '320px',
              width: '90%',
              color: '#000',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            }}
          >
            <p style={{ marginBottom: '12px' }}>Видалити подію з графіку стимуляції?</p>
            {pendingDelete?.label ? (
              <p style={{ margin: '0 0 16px', fontWeight: 'bold' }}>{pendingDelete.label}</p>
            ) : (
              <p style={{ margin: '0 0 16px', fontWeight: 'bold' }}>Подія без назви</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={handleCancelDelete}
                type="button"
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                }}
              >
                Скасувати
              </button>
              <OrangeBtn onClick={handleConfirmDelete}>Видалити</OrangeBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export {
  sanitizeDescription,
  buildCustomEventLabel,
  computeCustomDateAndLabel,
  splitCustomEventEntries,
};

export default StimulationSchedule;
