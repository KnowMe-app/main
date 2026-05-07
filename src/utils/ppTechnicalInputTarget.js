export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export const normalizeUrlForStorage = rawValue => {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return '';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^www\./i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
};

export const resolvePpTechnicalInputSocialTarget = rawValue => {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return null;

  const socialUrlMatchers = [
    { fieldName: 'instagram', pattern: /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i },
    { fieldName: 'facebook', pattern: /(?:https?:\/\/)?(?:www\.)?(?:facebook\.com|fb\.com)\/([^/?#]+)/i },
    { fieldName: 'tiktok', pattern: /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/([^/?#]+)/i },
    { fieldName: 'linkedin', pattern: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/([^/?#]+)/i },
    { fieldName: 'youtube', pattern: /(?:https?:\/\/)?(?:m\.|www\.)?(?:youtube\.com|youtu\.be)\/([^/?#]+)/i },
    { fieldName: 'twitter', pattern: /(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([^/?#]+)/i },
    { fieldName: 'telegram', pattern: /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/([^/?#]+)/i },
  ];

  for (const matcher of socialUrlMatchers) {
    const match = trimmed.match(matcher.pattern);
    if (!match?.[1]) continue;

    const normalizedValue = String(match[1]).replace(/^@/, '').trim();
    if (normalizedValue) {
      return { fieldName: matcher.fieldName, value: normalizedValue };
    }
  }

  return null;
};

export const resolvePpTechnicalInputGenericUrlTarget = rawValue => {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return null;

  if (/^(https?:\/\/|www\.)/i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/i.test(trimmed)) {
    return { fieldName: 'otherLink', value: normalizeUrlForStorage(trimmed) };
  }

  return null;
};

export const resolvePpTechnicalInputTarget = (rawValue, { normalizePhone } = {}) => {
  const trimmed = String(rawValue || '').trim();
  if (!trimmed) return null;

  const resolvedSocialTarget = resolvePpTechnicalInputSocialTarget(trimmed);
  if (resolvedSocialTarget) return resolvedSocialTarget;

  if (EMAIL_REGEX.test(trimmed)) {
    return { fieldName: 'email', value: trimmed };
  }

  const normalizedPhone = typeof normalizePhone === 'function' ? normalizePhone(trimmed) : '';
  const looksLikePhone = Boolean(normalizedPhone) && /^[+]?\d[\d\s().-]*$/.test(trimmed);
  if (looksLikePhone) {
    return { fieldName: 'phone', value: normalizedPhone };
  }

  const resolvedGenericUrlTarget = resolvePpTechnicalInputGenericUrlTarget(trimmed);
  if (resolvedGenericUrlTarget) return resolvedGenericUrlTarget;

  return { fieldName: 'name', value: trimmed };
};
