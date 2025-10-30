const SPECIAL_GET_IN_TOUCH_VALUES = new Set([
  '2099-99-99',
  '9999-99-99',
  '99.99.2099',
  '99.99.9999',
]);

export const REACTION_FILTER_KEYS = {
  SPECIAL_99: 'special99',
  VALID_DATE: 'validDate',
  DISLIKE: 'dislike',
  LIKE: 'like',
  QUESTION: 'question',
  NONE: 'none',
};

export const REACTION_FILTER_DEFAULTS = {
  [REACTION_FILTER_KEYS.SPECIAL_99]: true,
  [REACTION_FILTER_KEYS.VALID_DATE]: true,
  [REACTION_FILTER_KEYS.DISLIKE]: true,
  [REACTION_FILTER_KEYS.LIKE]: true,
  [REACTION_FILTER_KEYS.QUESTION]: true,
  [REACTION_FILTER_KEYS.NONE]: true,
};

export const REACTION_FILTER_OPTIONS = [
  { key: REACTION_FILTER_KEYS.SPECIAL_99, label: '99' },
  { key: REACTION_FILTER_KEYS.VALID_DATE, label: '01' },
  { key: REACTION_FILTER_KEYS.DISLIKE, label: '✖' },
  { key: REACTION_FILTER_KEYS.LIKE, label: '❤️' },
  { key: REACTION_FILTER_KEYS.QUESTION, label: '?' },
  { key: REACTION_FILTER_KEYS.NONE, label: '-' },
];

const normalizeGetInTouch = value => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  return String(value).trim();
};

const isSpecialGetInTouchValue = value => {
  const normalized = normalizeGetInTouch(value);
  if (!normalized) return false;
  if (SPECIAL_GET_IN_TOUCH_VALUES.has(normalized)) return true;
  const isoCandidate = normalized.replace(/\./g, '-');
  return SPECIAL_GET_IN_TOUCH_VALUES.has(isoCandidate);
};

const isTruthyMapValue = (collection, key) => {
  if (!collection || typeof collection !== 'object') return false;
  const value = collection[key];
  if (typeof value === 'boolean') return value;
  return Boolean(value);
};

const DATE_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_DOTTED_REGEX = /^\d{2}\.\d{2}\.\d{4}$/;

const isValidCalendarDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isValidGetInTouchDate = value => {
  if (!value) return false;

  if (DATE_ISO_REGEX.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return isValidCalendarDate(year, month, day);
  }

  if (DATE_DOTTED_REGEX.test(value)) {
    const [day, month, year] = value.split('.').map(Number);
    return isValidCalendarDate(year, month, day);
  }

  return false;
};

export const getReactionCategory = (user, favorites = {}, dislikes = {}) => {
  if (!user || typeof user !== 'object') {
    return REACTION_FILTER_KEYS.NONE;
  }

  const getInTouch = normalizeGetInTouch(user.getInTouch);
  if (isSpecialGetInTouchValue(getInTouch)) {
    return REACTION_FILTER_KEYS.SPECIAL_99;
  }

  const userId = typeof user.userId === 'string' || typeof user.userId === 'number'
    ? String(user.userId)
    : '';

  if (userId && isTruthyMapValue(dislikes, userId)) {
    return REACTION_FILTER_KEYS.DISLIKE;
  }

  if (userId && isTruthyMapValue(favorites, userId)) {
    return REACTION_FILTER_KEYS.LIKE;
  }

  if (getInTouch) {
    if (isValidGetInTouchDate(getInTouch)) {
      return REACTION_FILTER_KEYS.VALID_DATE;
    }
    return REACTION_FILTER_KEYS.QUESTION;
  }

  return REACTION_FILTER_KEYS.NONE;
};

export const passesReactionFilter = (
  user,
  reactionFilters,
  favorites = {},
  dislikes = {},
) => {
  if (!reactionFilters || typeof reactionFilters !== 'object') {
    return true;
  }

  const hasExplicitSelection = Object.values(reactionFilters).some(value => value === false);
  if (!hasExplicitSelection) {
    return true;
  }

  const category = getReactionCategory(user, favorites, dislikes);
  return Boolean(reactionFilters[category]);
};

export const REACTION_SPECIAL_VALUES = Object.freeze({
  values: Array.from(SPECIAL_GET_IN_TOUCH_VALUES),
});

