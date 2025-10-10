import React from 'react';
import { handleChange, handleSubmit } from './smallCard/actions';
import { formatDateToServer } from 'components/inputValidations';
import { OrangeBtn, color } from 'components/styles';
import { ReactComponent as ClipboardIcon } from 'assets/icons/clipboard.svg';
import { getEffectiveCycleStatus } from 'utils/cycleStatus';

const firstDayActionButtonStyle = {
  minWidth: '88px',
  height: '24px',
  borderRadius: '4px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
  fontWeight: 'bold',
  padding: '0 8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const scheduleControlButtonStyle = {
  width: '24px',
  height: '24px',
  borderRadius: '4px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
  fontSize: '16px',
  fontWeight: 'bold',
};

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

export const formatWeeksDaysToken = (weeks, days = 0) => {
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
  const match = trimmed.match(/^(\d+)(?:\s*[-–—]?\s*(?:й|ий))(?:\s*день)?/i);
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

const deriveDayIndicatorFromNumber = day => {
  const safeDayNumber = Math.max(Math.trunc(day), 1);
  return String(safeDayNumber);
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

export const shouldUsePregnancyToken = (itemDate, transferDate) => {
  if (!itemDate || !transferDate) return false;

  const normalizedItem = normalizeDate(itemDate);
  const normalizedTransfer = normalizeDate(transferDate);

  if (normalizedItem.getTime() < normalizedTransfer.getTime()) {
    return false;
  }

  const diffMs = normalizedItem.getTime() - normalizedTransfer.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return diffDays > DAY_PREFIX_TRANSFER_WINDOW_DAYS;
};

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
  const cutoffReference = referenceForDay;
  if (cutoffReference) {
    const cutoff = new Date(cutoffReference);
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

  let referenceForWeeks = null;
  if (useDayPrefix) {
    referenceForWeeks = referenceForDay || normalizedBase || normalizedTransfer;
  } else {
    referenceForWeeks = normalizedBase || normalizedTransfer || referenceForDay;
  }
  if (referenceForWeeks) {
    const tokenInfo = getWeeksDaysTokenForDate(normalizedDate, referenceForWeeks);
    if (tokenInfo?.token) {
      return tokenInfo.token;
    }
  }

  return '';
};

const stripSchedulePrefixTokens = text => {
  if (!text) return '';

  let working = text.trim();
  let removed = false;
  const stripLeadingDelimiters = value => value.replace(/^[\s.,;:!?+\-–—]+/, '');

  while (working) {
    const dayMatch = extractDayPrefix(working);
    if (dayMatch && Number.isFinite(dayMatch.length)) {
      working = stripLeadingDelimiters(working.slice(dayMatch.length));
      removed = true;
      continue;
    }

    const weekMatch = extractWeeksDaysPrefix(working);
    if (weekMatch && Number.isFinite(weekMatch.length)) {
      working = stripLeadingDelimiters(working.slice(weekMatch.length));
      removed = true;
      continue;
    }
    break;
  }

  return removed ? working.trim() : text.trim();
};

export const sanitizeDescription = text => {
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
      // Залишаємо токен тижнів/днів у підписі, тож припиняємо подальше очищення
      result = result.trimStart();
      break;
    }
    break;
  }
  return result.trim();
};

export const deriveScheduleDisplayInfo = ({ date, label }) => {
  if (!date) {
    return {
      dateStr: '',
      weekday: '',
      secondaryLabel: '',
      displayLabel: '',
      labelValue: label === null || label === undefined ? '' : String(label),
    };
  }

  const dateStr = formatDisplay(date);
  const weekday = weekdayNames[date.getDay()];
  const prefix = `${dateStr} ${weekday}`;
  const labelValue = label === null || label === undefined ? '' : String(label);
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
  let remainderWithoutDay = remainderWithoutToken;
  let formattedDayIndicator = '';
  if (dayInfo) {
    remainderWithoutDay = dayInfo.rest;
    formattedDayIndicator = deriveDayIndicatorFromNumber(dayInfo.day);
  }

  const sanitizedRemainder = sanitizeDescription(remainderWithoutDay);
  const secondaryLabel = normalizedToken || formattedDayIndicator || '';
  const normalizedSecondary = secondaryLabel.trim().toLowerCase();
  const matchesSecondary = candidate =>
    !!candidate &&
    !!normalizedSecondary &&
    (() => {
      const trimmedCandidate = candidate.trim();
      const normalizedCandidate = trimmedCandidate.toLowerCase();
      if (normalizedCandidate === normalizedSecondary) {
        return true;
      }
      const candidateDayInfo = extractDayPrefix(trimmedCandidate);
      if (
        candidateDayInfo &&
        !candidateDayInfo.rest &&
        candidateDayInfo.raw.length === trimmedCandidate.length
      ) {
        const derived = deriveDayIndicatorFromNumber(candidateDayInfo.day)
          .trim()
          .toLowerCase();
        if (derived === normalizedSecondary) {
          return true;
        }
      }
      return false;
    })();

  let displayLabel = sanitizedRemainder || '';
  if (!displayLabel) {
    const candidate = remainderWithoutDay || remainderWithoutToken || '';
    if (!matchesSecondary(candidate)) {
      displayLabel = candidate;
    }
  }

  if (!displayLabel && hadPrefix && !secondaryLabel) {
    displayLabel = weekday;
  }

  if (!displayLabel && !secondaryLabel) {
    displayLabel = remainder || trimmedLabel;
  }

  if (matchesSecondary(displayLabel)) {
    displayLabel = '';
  }

  return {
    dateStr,
    weekday,
    secondaryLabel,
    displayLabel,
    labelValue,
  };
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

const VISIT_DEFAULT_SUFFIX = 'Прийом';

const transferRelativeConfig = {
  hcg: {
    baseLabel: 'ХГЧ',
    defaultSuffix: 'ХГЧ',
    prefix: /^хгч/i,
  },
  meds: {
    baseLabel: 'Оновити ліки',
    defaultSuffix: 'Оновити ліки',
    prefix: /^оновити ліки/i,
  },
  us: {
    baseLabel: 'УЗД',
    defaultSuffix: 'УЗД, підтвердження вагітності',
    prefix: /^узд/i,
  },
  'us-followup': {
    baseLabel: 'УЗД',
    defaultSuffix: 'УЗД',
    prefix: /^узд/i,
  },
};

const PRE_CYCLE_KEYS = new Set(['pre-visit1', 'pre-uzd', 'pre-dipherelin']);

const inferUltrasoundKeyFromLabel = label => {
  const normalizedLabel = typeof label === 'string' ? label.trim() : '';
  if (!normalizedLabel) {
    return 'us';
  }

  if (/підтвердження\s+вагітності/i.test(normalizedLabel)) {
    return 'us';
  }

  const dayMatch = normalizedLabel.match(/(\d+)\s*й\s+день/i);
  if (dayMatch) {
    const parsedDay = Number(dayMatch[1]);
    if (Number.isFinite(parsedDay)) {
      if (parsedDay <= 10) {
        return 'pre-uzd';
      }
      if (parsedDay >= 35) {
        return 'us-followup';
      }
    }
  }

  return 'us';
};

const isPreCycleKey = key => PRE_CYCLE_KEYS.has(key);

const isCustomKey = key => typeof key === 'string' && key.startsWith('ap-');

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

const buildMedsLabel = (day, suffix) => buildTransferDayLabel('meds', day, suffix);

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

const isWithinStimulationRange = (date, baseDate, transferDate) => {
  if (!date) return false;
  if (!baseDate && !transferDate) return false;

  const normalizedDate = normalizeDate(date);
  const normalizedBase = baseDate ? normalizeDate(baseDate) : null;
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;

  if (normalizedTransfer) {
    if (normalizedDate.getTime() < normalizedTransfer.getTime()) {
      if (!normalizedBase) {
        return false;
      }
      return normalizedDate.getTime() >= normalizedBase.getTime();
    }
    return true;
  }

  if (normalizedBase) {
    return normalizedDate.getTime() >= normalizedBase.getTime();
  }

  return false;
};

const resolveCustomLabelBase = (
  date,
  { baseDate = null, preCycleBaseDate = null, transferDate = null, fallbackDate = null } = {},
) => {
  if (!date && !baseDate && !preCycleBaseDate && !transferDate && !fallbackDate) {
    return null;
  }

  const normalizedDate = date ? normalizeDate(date) : null;
  const normalizedBase = baseDate ? normalizeDate(baseDate) : null;
  const normalizedPre = preCycleBaseDate ? normalizeDate(preCycleBaseDate) : null;
  const normalizedTransfer = transferDate ? normalizeDate(transferDate) : null;
  const normalizedFallback = fallbackDate ? normalizeDate(fallbackDate) : null;

  if (normalizedDate && normalizedPre) {
    const eventTime = normalizedDate.getTime();
    const preTime = normalizedPre.getTime();
    const baseTime = normalizedBase ? normalizedBase.getTime() : null;

    if (eventTime >= preTime && (!baseTime || eventTime < baseTime)) {
      return normalizedPre;
    }
  }

  if (normalizedBase) return normalizedBase;
  if (normalizedPre) return normalizedPre;
  if (normalizedTransfer) return normalizedTransfer;
  if (normalizedFallback) return normalizedFallback;
  return normalizedDate;
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

const computeCustomDateAndLabel = (
  input,
  baseDate,
  referenceDate,
  transferDate,
  preCycleBaseDate = null,
) => {
  if (!input) return { date: null, label: '', description: '', raw: '' };
  const normalizedInput = input.trim().replace(/\s+/g, ' ');
  if (!normalizedInput) return { date: null, label: '', description: '', raw: '' };

  const baseNormalized = baseDate ? normalizeDate(baseDate) : null;
  const preCycleNormalized = preCycleBaseDate ? normalizeDate(preCycleBaseDate) : null;
  const transferNormalized = transferDate ? normalizeDate(transferDate) : null;
  const referenceNormalized = referenceDate ? normalizeDate(referenceDate) : null;
  const anchor = baseNormalized || preCycleNormalized || transferNormalized || referenceNormalized;

  let workingInput = normalizedInput;
  let date = null;
  let preserveUserPrefix = false;

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
  if (dayInfo && /день/i.test(dayInfo.raw || '')) {
    if (!transferNormalized) {
      preserveUserPrefix = true;
    }
  }
  if (dayInfo && (baseNormalized || preCycleNormalized || transferNormalized || referenceNormalized)) {
    const normalizedDay = Math.max(Math.trunc(dayInfo.day), 1);
    const offset = normalizedDay - 1;
    const candidates = [];

    if (baseNormalized) {
      const candidate = new Date(baseNormalized);
      candidate.setDate(candidate.getDate() + offset);
      candidates.push(candidate);
    }

    if (!baseNormalized && preCycleNormalized) {
      const candidate = new Date(preCycleNormalized);
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

    if (!candidates.length && preCycleNormalized) {
      const candidate = new Date(preCycleNormalized);
      candidate.setDate(candidate.getDate() + offset);
      candidates.push(candidate);
    }

    if (candidates.length) {
      let chosen = candidates[0];
      if (candidates.length > 1) {
        const pivot =
          referenceNormalized || baseNormalized || preCycleNormalized || transferNormalized || candidates[0];
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
    const baseForLabel = resolveCustomLabelBase(date, {
      baseDate: baseNormalized,
      preCycleBaseDate: preCycleNormalized,
      transferDate: transferNormalized,
      fallbackDate: referenceNormalized,
    });
    if (preserveUserPrefix) {
      return {
        date,
        label: normalizedInput,
        description,
        raw: normalizedInput,
        preserveUserPrefix: true,
      };
    }
    const label = buildCustomEventLabel(date, baseForLabel, transferNormalized, description);
    return { date, label, description, raw: normalizedInput, preserveUserPrefix: false };
  }

  const fallbackDescription = description || normalizedInput;
  return {
    date: null,
    label: '',
    description: fallbackDescription,
    raw: normalizedInput,
    preserveUserPrefix,
  };
};

const prepareCustomEventItem = (
  input,
  {
    derivedDate = null,
    baseDate = null,
    referenceDate = null,
    transferDate = null,
    preCycleBaseDate = null,
  } = {},
) => {
  if (!input) return null;
  const normalizedInput = input.trim();
  if (!normalizedInput) return null;

  const sanitizedInput = sanitizeDescription(normalizedInput);
  const computed = computeCustomDateAndLabel(
    normalizedInput,
    baseDate,
    referenceDate || baseDate || derivedDate || preCycleBaseDate,
    transferDate,
    preCycleBaseDate,
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

  const normalizedDate = date ? normalizeDate(date) : null;
  const baseForLabel = resolveCustomLabelBase(normalizedDate, {
    baseDate,
    preCycleBaseDate,
    transferDate,
    fallbackDate: normalizedDate,
  });
  const label = buildCustomEventLabel(
    normalizedDate,
    baseForLabel,
    transferDate,
    descriptionForLabel,
  );

  return {
    date: normalizedDate,
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
    label: `${first.day}й день ${VISIT_DEFAULT_SUFFIX}`,
  });

  // Day 7 (may shift to 8 but never earlier than 6)
  d = new Date(base);
  d.setDate(base.getDate() + 6);
  let second = adjustBackward(new Date(d), base);
  if (second.day < 6) {
    second = adjustForward(new Date(d), base);
  }
  const visitThreeParts = [`${second.day}й день`];
  if (second.sign) {
    visitThreeParts.push(second.sign);
  }
  visitThreeParts.push(VISIT_DEFAULT_SUFFIX);
  visits.push({
    key: 'visit3',
    date: second.date,
    label: visitThreeParts.join(' '),
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
  const visitFourParts = [`${third.day}й день`];
  if (third.sign) {
    visitFourParts.push(third.sign);
  }
  visitFourParts.push(VISIT_DEFAULT_SUFFIX);
  visits.push({
    key: 'visit4',
    date: third.date,
    label: visitFourParts.join(' '),
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
    label: `${transfer.day}й день Перенос${transfer.sign ? ` ${transfer.sign}` : ''}`,
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

  // Medication update 3 days after HCG
  const medsDate = new Date(d);
  medsDate.setDate(medsDate.getDate() + 3);
  const medsDay = diffDays(medsDate, transferBase);
  visits.push({
    key: 'meds',
    date: medsDate,
    label: buildMedsLabel(medsDay, 'Оновити ліки'),
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

  // Follow-up ultrasound 14 days after confirmation
  const followUpCandidate = new Date(us.date);
  followUpCandidate.setDate(followUpCandidate.getDate() + 14);
  const followUp = adjustForward(followUpCandidate, transferBase);
  visits.push({
    key: 'us-followup',
    date: followUp.date,
    label: buildTransferDayLabel(
      'us-followup',
      followUp.day,
      transferRelativeConfig['us-followup'].defaultSuffix,
      followUp.sign,
    ),
  });

  // Pregnancy visits at specific weeks
  const weeks = [8, 10, 12, 16, 18, 28, 36, 38, 40];
  weeks.forEach(week => {
    let wd = new Date(base);
    wd.setDate(wd.getDate() + week * 7);
    const adj =
      week === 40 || week === 36
        ? buildUnadjustedDayInfo(wd, base)
        : adjustForward(wd, base);
    const prefix = getSchedulePrefixForDate(adj.date, base, transferBase);
    let labelText = prefix;
    if (week === 40) {
      labelText = labelText ? `${labelText} пологи` : 'пологи';
    }
    if (week === 36) {
      labelText = labelText
        ? `${labelText} Переїзд в Київ`
        : 'Переїзд в Київ';
    }
    if (adj.sign) {
      labelText = labelText ? `${labelText} ${adj.sign}` : adj.sign;
    }
    visits.push({
      key: `week${week}`,
      date: adj.date,
      label: labelText.trim(),
    });

    if (week === 36) {
      const nextDay = new Date(base);
      nextDay.setDate(nextDay.getDate() + week * 7 + 1);
      const nextAdj = buildUnadjustedDayInfo(nextDay, base);
      let nextPrefix = getSchedulePrefixForDate(nextAdj.date, base, transferBase);
      let nextLabel = nextPrefix
        ? `${nextPrefix} Підписати обмінну карту`
        : 'Підписати обмінну карту';
      if (nextAdj.sign) {
        nextLabel = nextLabel ? `${nextLabel} ${nextAdj.sign}` : nextAdj.sign;
      }
      visits.push({
        key: 'week36-day2',
        date: nextAdj.date,
        label: nextLabel.trim(),
      });
    }
  });

  return visits;
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
    let suffix = stripSchedulePrefixTokens(sanitizeDescription(labelSource));
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
      normalizedPreBase,
    );
    const description = parsed.description || parsed.raw || labelSource;
    const baseForLabel = resolveCustomLabelBase(adjustedDate, {
      baseDate: baseDateValue,
      preCycleBaseDate: normalizedPreBase,
      transferDate: normalizedTransfer,
      fallbackDate: effectiveTransfer || adjustedDate,
    });
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
    let prefix = getSchedulePrefixForDate(adjustedDate, baseDateValue, normalizedTransfer);
    if (item.key === 'transfer') {
      const transferDayNumber = diffDays(adjustedDate, baseDateValue);
      prefix = `${Math.max(transferDayNumber, 1)}й день`;
    }
    let suffix = stripSchedulePrefixTokens(sanitizeDescription(labelSource));
    if (suffix) {
      suffix = suffix.replace(/\s*[+-]$/, '').trim();
    }
    if (!suffix) {
      const visitMatch = item.key?.match(/^visit(\d+)$/);
      if (visitMatch && Number(visitMatch[1]) > 1) {
        const occursBeforeTransfer =
          !normalizedTransfer || adjustedDate < normalizedTransfer;
        if (occursBeforeTransfer) {
          suffix = VISIT_DEFAULT_SUFFIX;
        }
      }
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
  const [editingOriginalLabel, setEditingOriginalLabel] = React.useState(null);
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
          const nextFirst = sched.find(entry => entry?.key === 'visit1' && entry.date);
          if (nextFirst) {
            return normalizeDate(nextFirst.date);
          }
        }
        return base ? normalizeDate(base) : null;
      })();
      const defaultString = baseForDefaults
        ? serializeSchedule(generateSchedule(baseForDefaults))
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
    (newBaseDate, options = {}) => {
      if (!newBaseDate) return;
      const { updateDelivery = true } = options;
      const context = persistContextRef.current;
      const normalizedDate = normalizeDate(newBaseDate);
      const formattedNextCycle = formatDateToServer(formatFullDate(normalizedDate));
      if (!formattedNextCycle) return;

      let formattedLastDelivery = '';
      let formattedGetInTouch = '';
      const updates = { lastCycle: formattedNextCycle };

      if (updateDelivery) {
        const predictedDeliveryBase = new Date(normalizedDate);
        predictedDeliveryBase.setDate(predictedDeliveryBase.getDate() + 7 * 40);
        const predictedDelivery = normalizeDate(predictedDeliveryBase);
        formattedLastDelivery = formatDateToServer(
          formatFullDate(predictedDelivery),
        );

        if (formattedLastDelivery) {
          updates.lastDelivery = formattedLastDelivery;
          const getInTouchDate = new Date(predictedDelivery);
          getInTouchDate.setMonth(getInTouchDate.getMonth() + 9);
          const normalizedGetInTouch = normalizeDate(getInTouchDate);
          formattedGetInTouch = formatDateToServer(
            formatFullDate(normalizedGetInTouch),
          );
          if (formattedGetInTouch) {
            updates.getInTouch = formattedGetInTouch;
          }
        }
      } else {
        updates.lastDelivery = '';
        updates.getInTouch = '';
      }
      let stateSynced = false;
      if (context.setUsers && context.setState) {
        handleChange(context.setUsers, context.setState, context.userId, updates);
        stateSynced = true;
      } else if (context.setState) {
        context.setState(prev => ({ ...prev, ...updates }));
        stateSynced = true;
      } else if (context.setUsers) {
        handleChange(context.setUsers, null, context.userId, updates);
        stateSynced = true;
      }

      if (typeof onLastCyclePersisted === 'function') {
        onLastCyclePersisted({
          lastCycle: formattedNextCycle,
          lastDelivery: formattedLastDelivery,
          getInTouch: formattedGetInTouch,
          date: normalizedDate,
          needsSync: !stateSynced,
        });
      }

      handleSubmit(
        { userId: context.userId, ...updates },
        'overwrite',
        context.isToastOn,
        updateDelivery ? [] : ['lastDelivery', 'getInTouch'],
      );
    },
    [onLastCyclePersisted],
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
    const adjustedNextCycle =
      adjustToNextWorkingDay(nextCycleStart, normalizedBase) ||
      {
        date: normalizeDate(nextCycleStart),
        day: normalizedBase ? diffDays(nextCycleStart, normalizedBase) : null,
        sign: '',
      };
    const normalizedNextCycle = normalizeDate(adjustedNextCycle.date);

    const nextCycleVisits = generateSchedule(normalizedNextCycle).map(item => ({
      ...item,
      date: normalizeDate(item.date),
    }));

    const combinedSchedule = [preDayOne, preUltrasound, preDipherelin, ...nextCycleVisits];

    setSchedule(combinedSchedule);
    hasChanges.current = true;
    saveSchedule(combinedSchedule);

    persistLastCycleDate(normalizedNextCycle, { updateDelivery: false });
  }, [
    base,
    preCycleActive,
    schedule,
    saveSchedule,
    persistLastCycleDate,
  ]);

  React.useEffect(() => {
    if (!['stimulation', 'pregnant'].includes(effectiveStatus) || !base) return;

    const gen = generateSchedule(base);

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
              else if (/оновити\s+ліки/i.test(label)) key = 'meds';
              else if (/УЗД|ЗД/.test(label)) key = inferUltrasoundKeyFromLabel(label);
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
              else if (/оновити\s+ліки/i.test(item.label || '')) key = 'meds';
              else if (/УЗД|ЗД/.test(item.label || '')) {
                key = inferUltrasoundKeyFromLabel(item.label || '');
              }
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

      const hasStoredPreCycle = sortedParsed.some(
        item =>
          item.key === 'pre-visit1' ||
          item.key === 'pre-dipherelin' ||
          /диферелін/i.test(String(item.label || '')),
      );
      if (hasStoredPreCycle) {
        setSchedule(sortedParsed);
      } else if (sortedParsed.length) {
        setSchedule(sortedParsed);
      } else {
        setSchedule(gen);
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

  const applyHcgDateToDependents = React.useCallback(
    (items, hcgDate) => {
      if (!hcgDate || !Array.isArray(items) || items.length === 0) {
        return items;
      }

      const normalizedHcg = normalizeDate(hcgDate);
      const baseForState =
        items.find(entry => entry.key === 'visit1')?.date || resolvedBaseDate || null;
      const preBaseForState =
        items.find(entry => entry.key === 'pre-visit1')?.date || preCycleBaseDate || null;
      const transferForState =
        items.find(entry => entry.key === 'transfer')?.date || transferRef.current || null;
      const normalizedTransfer = transferForState ? normalizeDate(transferForState) : null;

      let didUpdate = false;
      let next = [...items];

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

      const medsIndex = next.findIndex(entry => entry.key === 'meds');
      if (medsIndex !== -1) {
        const medsCandidate = new Date(normalizedHcg);
        medsCandidate.setDate(medsCandidate.getDate() + 3);
        const medsTarget = normalizeDate(medsCandidate);
        updateWithTarget(medsIndex, medsTarget);
      }

      return didUpdate ? next : items;
    },
    [adjustItemForDateFn, preCycleBaseDate, resolvedBaseDate],
  );

  const applyUsDateToDependents = React.useCallback(
    (items, usDate, transferDate) => {
      if (!Array.isArray(items) || items.length === 0) {
        return items;
      }

      const followUpIndex = items.findIndex(entry => entry.key === 'us-followup');
      if (followUpIndex === -1) {
        return items;
      }

      const normalizedUs = usDate ? normalizeDate(usDate) : null;
      const providedTransfer = transferDate || null;
      const transferFromItems = items.find(entry => entry.key === 'transfer')?.date || null;
      const transferSource = providedTransfer || transferFromItems || transferRef.current || null;
      const normalizedTransfer = transferSource ? normalizeDate(transferSource) : null;

      const baseForState =
        items.find(entry => entry.key === 'visit1')?.date || resolvedBaseDate || null;
      const preBaseForState =
        items.find(entry => entry.key === 'pre-visit1')?.date || preCycleBaseDate || null;

      let didUpdate = false;
      let next = [...items];

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

      let followUpTarget = null;

      if (normalizedUs) {
        const followUpCandidate = new Date(normalizedUs);
        followUpCandidate.setDate(followUpCandidate.getDate() + 14);
        if (normalizedTransfer) {
          const adjustedFollowUp = adjustForward(
            new Date(followUpCandidate),
            normalizedTransfer,
          );
          followUpTarget = adjustedFollowUp?.date
            ? normalizeDate(adjustedFollowUp.date)
            : normalizeDate(followUpCandidate);
        } else {
          const adjustedFollowUp = adjustToNextWorkingDay(
            followUpCandidate,
            normalizedUs,
          );
          followUpTarget = adjustedFollowUp?.date
            ? normalizeDate(adjustedFollowUp.date)
            : normalizeDate(followUpCandidate);
        }
      } else if (normalizedTransfer) {
        const followUpCandidate = new Date(normalizedTransfer);
        followUpCandidate.setDate(followUpCandidate.getDate() + 41);
        const adjustedFollowUp = adjustForward(
          new Date(followUpCandidate),
          normalizedTransfer,
        );
        followUpTarget = adjustedFollowUp?.date
          ? normalizeDate(adjustedFollowUp.date)
          : normalizeDate(followUpCandidate);
      }

      if (followUpTarget) {
        updateWithTarget(followUpIndex, followUpTarget);
      }

      return didUpdate ? next : items;
    },
    [adjustItemForDateFn, preCycleBaseDate, resolvedBaseDate],
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
      let next = [...items];

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
        const hcgTarget = computeDateFromTransferDay(12, normalizedTransfer, baseForState);
        if (hcgTarget) {
          updateWithTarget(hcgIndex, hcgTarget);
        }
        const updatedHcgDate = next[hcgIndex]?.date
          ? normalizeDate(next[hcgIndex].date)
          : hcgTarget
          ? normalizeDate(hcgTarget)
          : null;
        if (updatedHcgDate) {
          const updatedItems = applyHcgDateToDependents(next, updatedHcgDate);
          if (updatedItems !== next) {
            next = updatedItems;
            didUpdate = true;
          }
        }
      }

      const hasHcgWithDate = next.some(entry => entry.key === 'hcg' && entry.date);
      if (!hasHcgWithDate) {
        const medsIndex = next.findIndex(entry => entry.key === 'meds');
        if (medsIndex !== -1) {
          const medsTarget = computeDateFromTransferDay(15, normalizedTransfer, baseForState);
          if (medsTarget) {
            updateWithTarget(medsIndex, medsTarget);
          }
        }
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

      const usDate = next.find(entry => entry.key === 'us')?.date || null;
      const updatedWithFollowUp = applyUsDateToDependents(next, usDate, normalizedTransfer);
      if (updatedWithFollowUp !== next) {
        next = updatedWithFollowUp;
        didUpdate = true;
      }

      return didUpdate ? next : items;
    },
    [
      adjustItemForDateFn,
      applyHcgDateToDependents,
      applyUsDateToDependents,
      preCycleBaseDate,
      resolvedBaseDate,
    ],
  );

  const shiftDate = (idx, delta) => {
    const source = schedule[idx];
    if (!source || !source.date) return;

    let next = [...schedule];
    const item = next[idx];
    if (!item || !item.date) return;

    const newDate = new Date(item.date);
    newDate.setDate(newDate.getDate() + delta);

    const stateBase = next.find(entry => entry.key === 'visit1')?.date || resolvedBaseDate;
    const currentTransfer =
      next.find(entry => entry.key === 'transfer')?.date || transferRef.current || null;
    const stateTransfer = item.key === 'transfer' ? newDate : currentTransfer;
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
    } else if (adjustedItem.key === 'hcg') {
      const updated = applyHcgDateToDependents(next, adjustedItem.date);
      if (updated !== next) {
        next = updated;
      }
    } else if (adjustedItem.key === 'us') {
      const updated = applyUsDateToDependents(next, adjustedItem.date, stateTransfer);
      if (updated !== next) {
        next = updated;
      }
    }

    const persistTarget =
      adjustedItem.key === 'pre-visit1' && adjustedItem.date
        ? normalizeDate(adjustedItem.date)
        : null;

    next.sort((a, b) => a.date - b.date);
    hasChanges.current = true;
    setSchedule(next);
    saveSchedule(next);

    if (persistTarget) {
      persistLastCycleDate(persistTarget);
    }
  };

  const rebaseScheduleFromDayOne = React.useCallback(
    newBaseDate => {
      if (!newBaseDate) return;

      const normalizedNewBase = normalizeDate(newBaseDate);
      const currentBase = resolvedBaseDate ? normalizeDate(resolvedBaseDate) : null;
      if (!currentBase) return;
      if (normalizedNewBase.getTime() === currentBase.getTime()) {
        return;
      }

      if (!Array.isArray(schedule) || schedule.length === 0) {
        return;
      }

      const currentFirst = schedule.find(entry => entry.key === 'visit1' && entry.date);
      const normalizedCurrentBase = currentFirst
        ? normalizeDate(currentFirst.date)
        : currentBase;

      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const deltaDays = Math.round(
        (normalizedNewBase.getTime() - normalizedCurrentBase.getTime()) / MS_PER_DAY,
      );

      const preVisitItem = schedule.find(entry => entry.key === 'pre-visit1');
      const preservedPreBase = preVisitItem?.date ? normalizeDate(preVisitItem.date) : null;

      const preservedPreCycle = schedule.filter(item => isPreCycleKey(item?.key));
      const itemsToShift = schedule.filter(item => !isPreCycleKey(item?.key));

      const regenerated = generateSchedule(normalizedNewBase).map(item => ({
        ...item,
        date: normalizeDate(item.date),
      }));
      const regeneratedMap = new Map(regenerated.map(item => [item.key, item]));
      const regeneratedTransfer = regeneratedMap.get('transfer')?.date || null;
      const normalizedTransfer = regeneratedTransfer ? normalizeDate(regeneratedTransfer) : null;

      const shiftCustomItem = scheduleItem => {
        if (!scheduleItem) return scheduleItem;
        if (isCustomKey(scheduleItem.key)) {
          const normalizedItemDate = scheduleItem.date ? normalizeDate(scheduleItem.date) : null;
          if (!normalizedItemDate) {
            return scheduleItem;
          }

          const parsed = computeCustomDateAndLabel(
            scheduleItem.label,
            normalizedNewBase,
            normalizedItemDate,
            normalizedTransfer,
            preservedPreBase,
          );
          const description = parsed.description || parsed.raw || scheduleItem.label;
          const baseForLabel = resolveCustomLabelBase(normalizedItemDate, {
            baseDate: normalizedNewBase,
            preCycleBaseDate: preservedPreBase,
            transferDate: normalizedTransfer,
            fallbackDate: normalizedItemDate,
          });
          const updatedLabel = buildCustomEventLabel(
            normalizedItemDate,
            baseForLabel,
            normalizedTransfer,
            description,
          );

          if (!updatedLabel || updatedLabel === scheduleItem.label) {
            if (normalizedItemDate.getTime() === scheduleItem.date.getTime()) {
              return scheduleItem;
            }
            return {
              ...scheduleItem,
              date: normalizedItemDate,
            };
          }

          return {
            ...scheduleItem,
            date: normalizedItemDate,
            label: updatedLabel,
          };
        }
        if (!scheduleItem.date) return scheduleItem;
        const normalizedItemDate = normalizeDate(scheduleItem.date);
        if (normalizedItemDate.getTime() < normalizedCurrentBase.getTime()) {
          return scheduleItem;
        }
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
        const normalizedItemDate = scheduleItem.date ? normalizeDate(scheduleItem.date) : null;

        if (
          normalizedItemDate &&
          normalizedItemDate.getTime() < normalizedCurrentBase.getTime()
        ) {
          return scheduleItem;
        }

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
      setSchedule(combined);
      saveSchedule(combined);
      persistLastCycleDate(normalizedNewBase);
    },
    [
      adjustItemForDateFn,
      persistLastCycleDate,
      resolvedBaseDate,
      saveSchedule,
      schedule,
    ],
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

  const pregnancyBaseDate = resolvedBaseDate ? normalizeDate(resolvedBaseDate) : null;
  const transferSource =
    transferRef.current ||
    schedule.find(entry => entry.key === 'transfer' && entry.date)?.date ||
    null;
  const pregnancyTransferDate = transferSource ? normalizeDate(transferSource) : null;

  const filtered = schedule
    .filter(item => item.date)
    .sort((a, b) => {
      if (!a?.date || !b?.date) return 0;
      return a.date - b.date;
    });
  if (!filtered.some(item => item.date.getTime() === today)) {
    const baseForDiff = (() => {
      if (!resolvedBaseDate) return null;

      const resolvedBase = new Date(resolvedBaseDate);
      if (!preCycleBaseDate) {
        return resolvedBase;
      }

      const todayTs = todayDate.getTime();
      const preCycleBase = new Date(preCycleBaseDate);
      if (
        todayTs >= preCycleBase.getTime() &&
        todayTs < resolvedBase.getTime()
      ) {
        return preCycleBase;
      }

      return resolvedBase;
    })();
    if (baseForDiff) {
      const msInDay = 1000 * 60 * 60 * 24;
      const diff = Math.round((todayDate.getTime() - baseForDiff.getTime()) / msInDay);
      const totalDays = Math.max(diff, 0);
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
      const comment = computedPrefix || `${Math.max(totalDays + 1, 1)}й день`;
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
  const dateColumnWidth = '55px';
  const dateColumnStyle = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: '2px',
    flex: `0 0 ${dateColumnWidth}`,
    minWidth: dateColumnWidth,
    maxWidth: dateColumnWidth,
    lineHeight: 1.2,
  };
  const datePrimaryRowStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: '4px',
  };
  const weekdayStyle = { opacity: 0.7, fontSize: '0.85em' };
  const secondaryLabelStyle = {
    fontSize: '0.75em',
    fontWeight: 400,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
    minHeight: '1em',
  };
  const contentColumnStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: '2.4em',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  displayItems.forEach((item, index) => {
      const { dateStr, weekday, secondaryLabel, displayLabel, labelValue } =
        deriveScheduleDisplayInfo({
          date: item.date,
          label: item.label,
        });
      const pregnancyToken = (() => {
        if (
          !pregnancyBaseDate ||
          !pregnancyTransferDate ||
          !item.date ||
          !shouldUsePregnancyToken(item.date, pregnancyTransferDate)
        ) {
          return '';
        }
        const normalizedItemDate = normalizeDate(item.date);
        const tokenInfo = getWeeksDaysTokenForDate(normalizedItemDate, pregnancyBaseDate);
        return tokenInfo?.token || '';
      })();
      const baseSecondaryLabel =
        secondaryLabel && /^\d+$/.test(secondaryLabel.trim())
          ? `${secondaryLabel.trim()}й день`
          : secondaryLabel;
      const displaySecondaryLabel = pregnancyToken || baseSecondaryLabel;
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
        alignItems: 'stretch',
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
      const inputValue = labelValue;

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
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', flex: 1 }}>
              <div style={dateColumnStyle}>
                <span style={datePrimaryRowStyle}>
                  <span>{dateStr}</span>
                  <span style={weekdayStyle}>{weekday}</span>
                </span>
                <span style={secondaryLabelStyle}>{displaySecondaryLabel || ' '}</span>
              </div>
              <div style={contentColumnStyle}>{displayLabel}</div>
            </div>
            <div
              style={{ display: 'flex', gap: '2px', marginLeft: 'auto', alignItems: 'center' }}
            >
              {showAdjustmentButtons ? (
                <React.Fragment>
                  <OrangeBtn
                    onClick={() => handleFirstDayShift(-1)}
                    style={scheduleControlButtonStyle}
                  >
                    -
                  </OrangeBtn>
                  <OrangeBtn
                    onClick={() => handleFirstDayShift(1)}
                    style={scheduleControlButtonStyle}
                  >
                    +
                  </OrangeBtn>
                </React.Fragment>
              ) : null}
              {showDipherelinButton ? (
                <OrangeBtn
                  onClick={handleActivateDipherelin}
                  style={firstDayActionButtonStyle}
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
            <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', flex: 1 }}>
              <div style={dateColumnStyle}>
                <span style={datePrimaryRowStyle}>
                  <span>{dateStr}</span>
                  <span style={weekdayStyle}>{weekday}</span>
                </span>
                <span style={secondaryLabelStyle}>{displaySecondaryLabel || ' '}</span>
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
                      const originalForItem =
                        editingOriginalLabel && editingOriginalLabel.key === item.key
                          ? editingOriginalLabel.label
                          : current.label;
                      const normalizedOriginalLabel = (originalForItem || '').trim();
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
                        const normalizedToday = normalizeDate(new Date());
                        const normalizedScheduleBase = scheduleBaseDate
                          ? normalizeDate(scheduleBaseDate)
                          : null;
                        const normalizedPreBase = preBaseForState
                          ? normalizeDate(preBaseForState)
                          : null;
                        const normalizedTransfer = transferDate
                          ? normalizeDate(transferDate)
                          : null;
                        let placeholderBase = normalizedScheduleBase;
                        if (
                          normalizedScheduleBase &&
                          normalizedPreBase &&
                          normalizedToday.getTime() < normalizedScheduleBase.getTime()
                        ) {
                          placeholderBase = normalizedPreBase;
                        } else if (!placeholderBase && normalizedPreBase) {
                          placeholderBase = normalizedPreBase;
                        }

                        const weeksPrefix = extractWeeksDaysPrefix(trimmedLabel);
                        const dayPrefix = weeksPrefix ? null : extractDayPrefix(trimmedLabel);
                        const rest = weeksPrefix
                          ? trimmedLabel.slice(weeksPrefix.length).trim()
                          : dayPrefix
                            ? dayPrefix.rest || ''
                            : trimmedLabel.trim();

                        let nextPrefix = placeholderBase
                          ? getSchedulePrefixForDate(
                              updated.date,
                              placeholderBase,
                              normalizedTransfer,
                            )
                          : '';
                        if (!nextPrefix && placeholderBase) {
                          const tokenInfo = getWeeksDaysTokenForDate(updated.date, placeholderBase);
                          nextPrefix = tokenInfo?.token || '';
                        }

                        if (nextPrefix) {
                          updated = {
                            ...updated,
                            label: rest ? `${nextPrefix} ${rest}` : nextPrefix,
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
                            preBaseForState,
                          );
                          const nextDate = computed.date || updated.date;
                          const description = computed.description || computed.raw || trimmedLabel;
                          const shouldPreserveCustomPrefix =
                            computed.preserveUserPrefix && !transferDate;
                          const baseForLabel = resolveCustomLabelBase(nextDate || updated.date, {
                            baseDate: scheduleBaseDate,
                            preCycleBaseDate: preBaseForState,
                            transferDate,
                            fallbackDate: nextDate || updated.date,
                          });
                          const nextLabel = nextDate
                            ? shouldPreserveCustomPrefix
                              ? computed.raw || trimmedLabel
                              : buildCustomEventLabel(
                                  nextDate,
                                  baseForLabel,
                                  transferDate,
                                  description,
                                )
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

                      const labelChangedByUser = trimmedLabel !== normalizedOriginalLabel;
                      const labelChangedByAdjustment = updated.label !== current.label;
                      const labelChanged = labelChangedByUser || labelChangedByAdjustment;
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
                      } else if (updated.key === 'hcg') {
                        if (dateChanged) {
                          const adjustedNext = applyHcgDateToDependents(next, updated.date);
                          if (adjustedNext !== next) {
                            next = adjustedNext;
                          }
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
                    setEditingOriginalLabel(null);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.target.blur();
                    }
                  }}
                  style={{
                    ...contentColumnStyle,
                    alignSelf: 'stretch',
                  }}
                />
              ) : (
                <div
                  onClick={() => {
                    setEditingOriginalLabel({
                      key: item.key,
                      label:
                        typeof item.label === 'string'
                          ? item.label
                          : item.label == null
                          ? ''
                          : String(item.label),
                    });
                    setEditingKey(item.key);
                  }}
                  style={{
                    ...contentColumnStyle,
                    cursor: 'pointer',
                  }}
                >
                  {displayLabel}
                </div>
              )}
            </div>
            <div
              style={{ display: 'flex', gap: '2px', marginLeft: 'auto', alignItems: 'center' }}
            >
              {isEditing
                ? null
                : isPlaceholder
                ? (
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
                      style={scheduleControlButtonStyle}
                    >
                      ×
                    </OrangeBtn>
                  )
                : (
                    <React.Fragment>
                      <OrangeBtn
                        onClick={() => {
                          const idx = schedule.findIndex(v => v.key === item.key);
                          if (idx !== -1) shiftDate(idx, -1);
                        }}
                        style={scheduleControlButtonStyle}
                      >
                        -
                      </OrangeBtn>
                      <OrangeBtn
                        onClick={() => {
                          const idx = schedule.findIndex(v => v.key === item.key);
                          if (idx !== -1) shiftDate(idx, 1);
                        }}
                        style={scheduleControlButtonStyle}
                      >
                        +
                      </OrangeBtn>
                      <OrangeBtn
                        onClick={() => requestDeleteItem(item)}
                        style={scheduleControlButtonStyle}
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
                preCycleBaseDate,
              );
              if (result.date) {
                setApDerivedDate(result.date);
                if (result.label) {
                  return result.label;
                }
                const transferForLabel = transferRef.current;
                const baseForLabel = resolveCustomLabelBase(result.date, {
                  baseDate: resolvedBaseDate,
                  preCycleBaseDate: preCycleBaseDate,
                  transferDate: transferForLabel,
                  fallbackDate: result.date,
                });
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
                  preCycleBaseDate,
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
          style={scheduleControlButtonStyle}
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
            ...scheduleControlButtonStyle,
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
              padding: '24px 20px',
              borderRadius: '8px',
              maxWidth: '320px',
              width: '90%',
              color: '#000',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
            }}
          >
            <p style={{ marginBottom: '12px', fontWeight: '600' }}>
              Видалити подію з графіку стимуляції?
            </p>
            {pendingDelete?.label ? (
              <p style={{ margin: '0 0 16px', fontWeight: 'bold', textAlign: 'center' }}>
                {pendingDelete.label}
              </p>
            ) : (
              <p style={{ margin: '0 0 16px', fontWeight: 'bold', textAlign: 'center' }}>
                Подія без назви
              </p>
            )}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
              }}
            >
              <button
                onClick={handleCancelDelete}
                type="button"
                style={{
                  minWidth: '120px',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: '1px solid #ccc',
                  backgroundColor: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Скасувати
              </button>
              <button
                onClick={handleConfirmDelete}
                type="button"
                style={{
                  minWidth: '120px',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: color.accent,
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Видалити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export {
  buildCustomEventLabel,
  computeCustomDateAndLabel,
  splitCustomEventEntries,
};

export default StimulationSchedule;

