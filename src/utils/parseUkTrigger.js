const TRIGGER_PATTERN = /^(ук)\s*(см|ір|ip|до|агент)\s*(.*)$/i;

export const parseUkTriggerQuery = rawQuery => {
  if (typeof rawQuery !== 'string') return null;

  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  const match = trimmed.match(TRIGGER_PATTERN);
  if (!match) return null;

  const afterTrigger = match[3] || '';

  const normalizedAfterTrigger = afterTrigger
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

  const normalizedTriggerPrefix = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
  const normalizedQuery = normalizedAfterTrigger
    ? `${normalizedTriggerPrefix} ${normalizedAfterTrigger}`
    : normalizedTriggerPrefix;


  const handleMatch = afterTrigger.match(/@([\p{L}\p{N}_.-]+)/u);
  const handle = handleMatch ? handleMatch[1] : null;

  const beforeHandle = handleMatch
    ? afterTrigger.slice(0, handleMatch.index).trim()
    : afterTrigger.trim();

  const nameParts = beforeHandle.split(/\s+/).filter(Boolean);
  const name = nameParts[0] || '';
  const surname = nameParts.slice(1).join(' ') || '';

  const contactValues = handle ? [normalizedQuery, handle] : normalizedQuery;

  const result = {
    contactType: 'telegram',
    contactValues,
    handle,
    searchPair: { telegram: normalizedQuery },
  };

  result.name = name;
  result.surname = surname;

  return result;
};

export default parseUkTriggerQuery;
