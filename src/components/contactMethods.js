import { getCurrentValue } from './getCurrentValue';

export const CONTACT_FIELDS = [
  'phone',
  'email',
  'telegram',
  'whatsapp',
  'viber',
  'facebook',
  'instagram',
  'ameblo',
  'tiktok',
  'vk',
  'linkedin',
  'youtube',
  'twitter',
  'website',
  'otherLink',
];

const hasProtocol = value => /^[a-z][a-z\d+\-.]*:/i.test(value);
const stripAt = value => String(value || '').trim().replace(/^@/, '');
const compactPhone = value => String(value || '').replace(/[\s()\-.]/g, '');
const digitsOnlyPhone = value => compactPhone(value).replace(/^\+/, '');
const buildPlatformUrl = (value, domain, pathPrefix = '') => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  if (hasProtocol(rawValue)) return rawValue;
  const withoutAt = stripAt(rawValue);
  if (withoutAt.startsWith(`${domain}/`) || withoutAt.startsWith(`www.${domain}/`)) {
    return normalizeExternalUrl(withoutAt);
  }
  return normalizeExternalUrl(`${domain}/${pathPrefix}${withoutAt}`);
};

export const normalizeExternalUrl = value => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  if (hasProtocol(rawValue)) return rawValue;
  return `https://${rawValue}`;
};

export const buildLinkedinUrl = value => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  if (hasProtocol(rawValue)) return rawValue;
  const normalizedValue = rawValue.replace(/^\/+/, '');
  if (normalizedValue.startsWith('in/') || normalizedValue.startsWith('company/')) {
    return `https://www.linkedin.com/${normalizedValue}`;
  }
  return `https://www.linkedin.com/in/${normalizedValue}`;
};

export const buildTwitterUrl = value => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  if (hasProtocol(rawValue)) return rawValue;
  return `https://x.com/${stripAt(rawValue)}`;
};

export const buildYoutubeUrl = value => {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '';
  if (hasProtocol(rawValue)) return rawValue;

  const normalizedValue = stripAt(rawValue).replace(/^\/+/, '');
  if (/^(?:(?:m\.|www\.)?youtube\.com|youtu\.be)\//i.test(normalizedValue)) {
    return normalizeExternalUrl(normalizedValue);
  }

  if (/^(?:channel|c|user)\//i.test(normalizedValue)) {
    return `https://www.youtube.com/${normalizedValue}`;
  }

  return `https://www.youtube.com/@${normalizedValue}`;
};

export const CONTACT_LINK_BUILDERS = {
  phone: value => `tel:${compactPhone(value)}`,
  email: value => `mailto:${String(value || '').trim()}`,
  telegram: value => `https://t.me/${stripAt(value)}`,
  whatsapp: value => `https://wa.me/${digitsOnlyPhone(value) || stripAt(value)}`,
  viber: value => `viber://chat?number=%2B${digitsOnlyPhone(value)}`,
  facebook: value => buildPlatformUrl(value, 'facebook.com'),
  instagram: value => buildPlatformUrl(value, 'instagram.com'),
  ameblo: value => buildPlatformUrl(value, 'ameblo.jp'),
  tiktok: value => buildPlatformUrl(value, 'www.tiktok.com', '@'),
  vk: value => buildPlatformUrl(value, 'vk.com'),
  linkedin: buildLinkedinUrl,
  youtube: buildYoutubeUrl,
  twitter: buildTwitterUrl,
  website: normalizeExternalUrl,
  otherLink: normalizeExternalUrl,
  telegramFromPhone: value => `https://t.me/${compactPhone(value)}`,
  viberFromPhone: value => `viber://chat?number=%2B${digitsOnlyPhone(value)}`,
  whatsappFromPhone: value => `https://wa.me/${digitsOnlyPhone(value)}`,
};

export const isHiddenTelegramValue = value => String(value ?? '').trim().startsWith('УК СМ');

const valueList = (value, currentValueGetter = getCurrentValue) => {
  const current = currentValueGetter(value);
  if (Array.isArray(current)) return current;
  return current ? [current] : [];
};

export const getContactValues = (data, key, currentValueGetter) => {
  const values = valueList(data?.[key], currentValueGetter)
    .map(value => (typeof value === 'string' ? value.trim() : value))
    .filter(value => value !== null && value !== undefined && String(value).trim() !== '');

  if (key === 'telegram') {
    return values.filter(value => !isHiddenTelegramValue(value));
  }

  return values;
};

export const getAvailableContactFields = data =>
  CONTACT_FIELDS.filter(key => getContactValues(data, key).length > 0);

export const getContactEntries = data =>
  CONTACT_FIELDS.flatMap(key =>
    getContactValues(data, key).map((value, index) => ({
      key,
      value,
      href: CONTACT_LINK_BUILDERS[key]?.(value) || '',
      index,
    }))
  );
