const TRIGGER_PATTERN = /^(ук)\s*(см|ір|ip|до|агент)\s*(.*)$/i;

const CONTACT_PREFIX_ALIASES = {
  telegram: ['tg', 'telegram', 'телеграм'],
  instagram: ['ig', 'inst', 'instagram', 'інста', 'інстаграм'],
  facebook: ['fb', 'facebook', 'фб', 'фейсбук'],
  tiktok: ['tt', 'tiktok', 'тік ток', 'тікток'],
  linkedin: ['linkedin', 'лінкедін'],
  youtube: ['youtube', 'ютуб'],
  twitter: ['x', 'twitter', 'твітер'],
};

const CONTACT_DOMAINS = [
  { type: 'instagram', pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\//i },
  { type: 'facebook', pattern: /(?:https?:\/\/)?(?:www\.)?facebook\.com\//i },
  { type: 'facebook', pattern: /(?:https?:\/\/)?(?:www\.)?fb\.com\//i },
  { type: 'tiktok', pattern: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\//i },
  { type: 'linkedin', pattern: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\//i },
  { type: 'youtube', pattern: /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\//i },
  { type: 'twitter', pattern: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\//i },
  { type: 'telegram', pattern: /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\//i },
];

const resolveContactTypeByPrefix = query => {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return null;

  const match = normalized.match(/^([\p{L}\p{N}_-]+)\s*[:|]\s+/u);
  if (!match) return null;

  const rawPrefix = match[1];
  return Object.entries(CONTACT_PREFIX_ALIASES).find(([, aliases]) => aliases.includes(rawPrefix))?.[0] || null;
};

const resolveContactTypeByDomain = query => {
  const normalized = String(query || '').trim();
  if (!normalized) return null;

  const byDomain = CONTACT_DOMAINS.find(({ pattern }) => pattern.test(normalized));
  if (byDomain) return byDomain.type;

  if (/@[\p{L}\p{N}_.-]+/u.test(normalized)) {
    return 'telegram';
  }

  return null;
};

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

  const resolvedContactType =
    resolveContactTypeByPrefix(normalizedAfterTrigger) ||
    resolveContactTypeByDomain(normalizedAfterTrigger) ||
    'telegram';

  const contactValues = handle ? [normalizedQuery, handle] : normalizedQuery;

  const result = {
    contactType: resolvedContactType,
    contactValues,
    handle,
    searchPair: { [resolvedContactType]: normalizedQuery },
  };

  result.name = name;
  if (surname) {
    result.surname = surname;
  }

  return result;
};

export default parseUkTriggerQuery;
