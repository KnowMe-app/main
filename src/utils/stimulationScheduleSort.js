const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FULL_DMY_RE = /^\d{2}\.\d{2}\.\d{4}$/;
const SHORT_DMY_RE = /^\d{2}\.\d{2}$/;

const normalizeDate = date => {
  if (!date) return null;
  const normalized = new Date(date);
  if (Number.isNaN(normalized.getTime())) {
    return null;
  }
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const parseDate = value => {
  if (!value) return null;
  const str = value.toString().trim();
  if (!str) return null;
  if (ISO_DATE_RE.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return normalizeDate(new Date(year, month - 1, day));
  }
  if (FULL_DMY_RE.test(str)) {
    const [day, month, year] = str.split('.').map(Number);
    return normalizeDate(new Date(year, month - 1, day));
  }
  if (SHORT_DMY_RE.test(str)) {
    const [day, month] = str.split('.').map(Number);
    const currentYear = new Date().getFullYear();
    return normalizeDate(new Date(currentYear, month - 1, day));
  }
  return null;
};

const formatShortDate = date => {
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

const stripLeadingToken = text => text.replace(/^[,.;:\-]+/, '').trim();

const stripDayOfWeekToken = text => {
  if (!text) return '';
  const tokens = text.split(/\s+/);
  if (tokens.length === 0) return '';
  const first = tokens[0];
  if (/^[\p{L}]{1,3}\.?(?:-[\p{L}]{1,3}\.?)*$/u.test(first)) {
    return tokens.slice(1).join(' ').trim();
  }
  return text;
};

const extractDescription = (label, date) => {
  if (!label) return '';
  let rest = label.trim();
  if (!rest) return '';

  const iso = date.toISOString().split('T')[0];
  if (rest.startsWith(iso)) {
    rest = rest.slice(iso.length).trim();
  }

  const full = formatFullDate(date);
  if (rest.startsWith(full)) {
    rest = rest.slice(full.length).trim();
  }

  const short = formatShortDate(date);
  if (rest.startsWith(short)) {
    rest = rest.slice(short.length).trim();
  }

  rest = stripLeadingToken(rest);
  rest = stripDayOfWeekToken(rest);
  rest = stripLeadingToken(rest);

  return rest;
};

const buildEntry = ({ date, label, source }) => {
  const normalizedDate = normalizeDate(date);
  if (!normalizedDate) return null;
  const safeLabel = (label ?? '').toString().trim();
  const description = extractDescription(safeLabel, normalizedDate);
  return {
    date: normalizedDate,
    isoDate: normalizedDate.toISOString().split('T')[0],
    label: safeLabel,
    description,
    hasMeaningfulDescription: Boolean(description),
    source,
  };
};

const parseStringSchedule = scheduleString => {
  return scheduleString
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('\t');
      const datePart = parts[0]?.trim();
      const label = parts
        .slice(parts.length > 2 ? 2 : 1)
        .join('\t')
        .trim();
      const date = parseDate(datePart);
      if (!date) return null;
      return buildEntry({
        date,
        label,
        source: { type: 'string', index, raw: line },
      });
    })
    .filter(Boolean);
};

const parseArraySchedule = scheduleArray => {
  return scheduleArray
    .map((item, index) => {
      const date = parseDate(item?.date);
      if (!date) return null;
      const label = item?.label ?? '';
      return buildEntry({
        date,
        label,
        source: { type: 'array', index, raw: item },
      });
    })
    .filter(Boolean);
};

export const parseStimulationScheduleEntries = schedule => {
  if (!schedule) return [];
  let entries;
  if (typeof schedule === 'string') {
    entries = parseStringSchedule(schedule);
  } else if (Array.isArray(schedule)) {
    entries = parseArraySchedule(schedule);
  } else {
    return [];
  }
  return entries.sort((a, b) => a.date - b.date);
};

const normalizeToday = today => {
  const normalized = normalizeDate(today);
  return normalized ?? normalizeDate(new Date());
};

export const getStimulationScheduleSortInfo = (schedule, { today } = {}) => {
  const entries = parseStimulationScheduleEntries(schedule);
  const normalizedToday = normalizeToday(today ?? new Date());
  const upcoming = entries.filter(entry => entry.date >= normalizedToday);
  const beaconEntry = upcoming.find(entry => entry.hasMeaningfulDescription) || null;
  const nextEntry = upcoming[0] || null;
  const firstEntry = entries[0] || null;

  return {
    entries,
    beaconTimestamp: beaconEntry ? beaconEntry.date.getTime() : null,
    nextTimestamp: nextEntry ? nextEntry.date.getTime() : null,
    firstTimestamp: firstEntry ? firstEntry.date.getTime() : null,
    hasEntries: entries.length > 0,
  };
};

const compareTimestamps = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return 0;
    return a - b;
  }
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return 0;
};

export const compareStimulationScheduleSortInfo = (a, b) => {
  const beaconCompare = compareTimestamps(a?.beaconTimestamp, b?.beaconTimestamp);
  if (beaconCompare !== 0) return beaconCompare;

  const nextCompare = compareTimestamps(a?.nextTimestamp, b?.nextTimestamp);
  if (nextCompare !== 0) return nextCompare;

  const firstCompare = compareTimestamps(a?.firstTimestamp, b?.firstTimestamp);
  if (firstCompare !== 0) return firstCompare;

  if (a?.hasEntries && !b?.hasEntries) return -1;
  if (!a?.hasEntries && b?.hasEntries) return 1;

  return 0;
};

export const sortUsersByStimulationSchedule = (
  users,
  { today, fallbackComparator } = {},
) => {
  const normalizedToday = normalizeToday(today ?? new Date());
  const annotated = users.map(user => ({
    user,
    sortInfo: getStimulationScheduleSortInfo(user?.stimulationSchedule, {
      today: normalizedToday,
    }),
  }));

  annotated.sort((left, right) => {
    const scheduleCompare = compareStimulationScheduleSortInfo(
      left.sortInfo,
      right.sortInfo,
    );
    if (scheduleCompare !== 0) {
      return scheduleCompare;
    }
    if (typeof fallbackComparator === 'function') {
      return fallbackComparator(left.user, right.user);
    }
    const leftId = left.user?.userId || '';
    const rightId = right.user?.userId || '';
    return leftId.localeCompare(rightId);
  });

  return annotated;
};

