const TRIGGER_PATTERN = /^(ук)\s*(см|ір|ip|до)\s*(.*)$/i;

export const parseUkTriggerQuery = rawQuery => {
  if (typeof rawQuery !== 'string') return null;

  const trimmed = rawQuery.trim();
  if (!trimmed) return null;

  const match = trimmed.match(TRIGGER_PATTERN);
  if (!match) return null;

  const afterTrigger = match[3] || '';
  const compactValue = trimmed.replace(/\s+/g, '');

  const handleMatch = afterTrigger.match(/@([A-Za-z0-9_.]+)/);
  const handle = handleMatch ? handleMatch[1] : null;

  const beforeHandle = handleMatch
    ? afterTrigger.slice(0, handleMatch.index).trim()
    : afterTrigger.trim();

  const nameParts = beforeHandle.split(/\s+/).filter(Boolean);
  const name = nameParts[0] || '';
  const surname = nameParts.slice(1).join(' ') || '';

  const contactValues = [compactValue];
  if (handle) {
    contactValues.push(handle);
  }

  return {
    contactType: 'telegram',
    contactValues,
    name,
    surname,
    handle,
    searchPair: { telegram: contactValues[0] },
  };
};

export default parseUkTriggerQuery;
