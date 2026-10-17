// Список анкет, вставлений у рядок пошуку AddNewProfile як JSON-обʼєкт
// (`{ "1": { phone, telegram, ... }, "2": {...} }`). Анкети з файлу живуть
// лише в стейті: у базу вони потрапляють поштучно, кліком по полю в таблиці
// порівняння, або через «+» на плитці «не знайдено».

export const JSON_CARD_ID_PREFIX = 'json_';

const isPlainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasSearchContact = profile => Boolean(
  isPlainObject(profile) && (String(profile.phone ?? '').trim() || String(profile.telegram ?? '').trim()),
);

export const parseJsonProfileList = input => {
  if (typeof input !== 'string') return [];
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (!isPlainObject(parsed)) return [];
  // Одна анкета без обгортки теж список — з одного елемента.
  if (hasSearchContact(parsed)) return [{ key: '1', profile: parsed }];
  return Object.entries(parsed)
    .filter(([, profile]) => isPlainObject(profile))
    .map(([key, profile]) => ({ key, profile }));
};

const toList = value => (Array.isArray(value) ? value : [value]);

// Шукаємо лише за телефоном і телеграмом — інші поля файлу (місто, вага)
// дублікат не доводять.
export const buildJsonProfileSearchValues = profile => {
  const phones = toList(profile?.phone)
    .map(value => String(value ?? '').replace(/[^\d]/g, ''))
    .filter(Boolean);
  const telegrams = toList(profile?.telegram)
    .map(value => String(value ?? '').trim().replace(/^@/, ''))
    .filter(Boolean)
    .map(value => `@${value}`);
  return [...new Set([...phones, ...telegrams])];
};

export const buildJsonStateCard = (key, profile) => ({
  ...profile,
  userId: `${JSON_CARD_ID_PREFIX}${key}`,
  _fromJson: true,
  _jsonGroup: key,
});

export const isJsonStateCard = card => Boolean(card?._fromJson);
