const PREFIX_PATTERN = /^(?:ук|uk)(?:\s*см)?(?:[\s:/-]+|$)(.+)$/i;

const sanitizeHandle = value => value?.replace(/^@+/, '').trim();
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePhone = raw => {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith('380')) return digits;
  if (digits.length === 11 && digits.startsWith('80')) return `3${digits}`;
  if (digits.length === 10 && digits.startsWith('0')) return `38${digits}`;
  if (digits.length > 12) {
    const tail10 = digits.slice(-10);
    if (/^\d{10}$/.test(tail10)) return `38${tail10}`;
  }
  return null;
};

const FILLER_WORDS = new RegExp(
  [
    "ім['’]я",
    'імя',
    'name',
    'прізвище',
    'surname',
    'телефон',
    'phone',
    'mobile',
    'номер',
    'тг',
    'tg',
    'telegram',
    'телеграм',
    'телега',
    'інста',
    'insta',
    'instagram',
    'інстаграм',
    'tik',
    'tiktok',
    'тікток',
    'tt',
    'sm',
    'см',
    'фб',
    'facebook',
    'vk',
    'вк',
    'email',
    'mail',
    'пошта',
    'city',
    'місто',
    'country',
    'країна',
    'age',
    'вік',
    'років',
  ]
    .map(word => `(?:${word})`)
    .join('|'),
  'gi',
);

const collapseSpaces = value => value.replace(/\s+/g, ' ').trim();

export const parseUkTrigger = input => {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(PREFIX_PATTERN);
  if (!match || !match[1]) return null;

  const withoutPrefix = match[1].trim();
  if (!withoutPrefix) return null;

  let remainder = withoutPrefix;
  const prefill = {};

  const extract = (field, pattern, normalizer = value => value?.trim()) => {
    remainder = remainder.replace(pattern, (fullMatch, captured) => {
      const candidate = normalizer(captured ?? fullMatch, { fullMatch });
      if (candidate && !prefill[field]) {
        prefill[field] = candidate;
      }
      return ' ';
    });
  };

  extract(
    'email',
    /(?:^|\s)([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?=$|\s)/gi,
    value => value?.toLowerCase(),
  );

  extract(
    'phone',
    /((?:\+?38)?0(?:[\s().-]*\d){9})/g,
    value => normalizePhone(value),
  );

  extract(
    'instagram',
    /instagram\.com\/(?:p\/|stories\/|explore\/)?@?([A-Za-z0-9._]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'instagram',
    /(?:^|\s)(?:інстаграм|інста|insta(?:gram)?|ig)\s*[:\-]?\s*@?([A-Za-z0-9._]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'tiktok',
    /tiktok\.com\/@?([A-Za-z0-9._-]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'tiktok',
    /(?:^|\s)(?:тікток|tiktok|tik\s*tok|tt)\s*[:\-]?\s*@?([A-Za-z0-9._-]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'facebook',
    /facebook\.com\/(?:profile\.php\?id=)?([A-Za-z0-9.]+)/gi,
    value => value?.trim(),
  );

  extract(
    'facebook',
    /(?:^|\s)(?:facebook|фб|fb)\s*[:\-]?\s*@?([A-Za-z0-9.]+)/gi,
    value => sanitizeHandle(value) ?? value,
  );

  extract(
    'vk',
    /vk\.com\/(?:id)?([A-Za-z0-9._]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'vk',
    /(?:^|\s)(?:vk|вк)\s*[:\-]?\s*@?([A-Za-z0-9._]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'telegram',
    /t\.me\/@?([A-Za-z0-9._]+)/gi,
    value => sanitizeHandle(value),
  );

  extract(
    'telegram',
    /(?:^|\s)(?:telegram|телеграм|телега|tg|тг)\s*[:\-]?\s*@?([A-Za-z0-9._]+)/gi,
    value => sanitizeHandle(value),
  );

  if (!prefill.telegram) {
    extract(
      'telegram',
      /(?:^|\s)@([A-Za-z0-9_]{4,})(?=$|\s|[.,;])/gi,
      value => sanitizeHandle(value),
    );
  }

  remainder = remainder.replace(FILLER_WORDS, ' ');
  remainder = remainder.replace(/[,:;|/\\]+/g, ' ');
  remainder = remainder.replace(/\s+/g, ' ');

  let normalizedName = collapseSpaces(remainder) || withoutPrefix;

  const contactFields = ['telegram', 'instagram', 'tiktok', 'facebook', 'vk', 'email', 'phone'];
  contactFields.forEach(field => {
    const val = prefill[field];
    if (!val) return;
    const pattern = new RegExp(`\\b${escapeRegExp(String(val))}\\b`, 'gi');
    normalizedName = normalizedName.replace(pattern, ' ');
  });
  normalizedName = collapseSpaces(normalizedName);
  const fallbackBaseline = normalizedName.replace(/[@\s]+/g, '');
  if (!fallbackBaseline || fallbackBaseline.length <= 2) {
    normalizedName = withoutPrefix;
  }

  if (normalizedName && !prefill.name) {
    prefill.name = normalizedName;
  } else if (prefill.name) {
    prefill.name = collapseSpaces(String(prefill.name));
  }

  const triggerMeta = {
    raw: trimmed,
    payload: withoutPrefix,
  };
  if (normalizedName) triggerMeta.normalizedName = normalizedName;
  prefill._ukTrigger = triggerMeta;

  return {
    normalizedName,
    withoutPrefix,
    prefill,
  };
};

export default parseUkTrigger;
