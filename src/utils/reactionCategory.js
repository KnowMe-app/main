const SPECIAL_GET_IN_TOUCH_VALUES = new Set([
  '2099-99-99',
  '9999-99-99',
  '99.99.2099',
  '99.99.9999',
]);

export const REACTION_FILTER_KEYS = {
  SPECIAL_99: 'special99',
  DISLIKE: 'dislike',
  LIKE: 'like',
  QUESTION: 'question',
  NONE: 'none',
};

export const REACTION_FILTER_DEFAULTS = {
  [REACTION_FILTER_KEYS.SPECIAL_99]: true,
  [REACTION_FILTER_KEYS.DISLIKE]: true,
  [REACTION_FILTER_KEYS.LIKE]: true,
  [REACTION_FILTER_KEYS.QUESTION]: true,
  [REACTION_FILTER_KEYS.NONE]: true,
};

export const REACTION_FILTER_OPTIONS = [
  { key: REACTION_FILTER_KEYS.SPECIAL_99, label: '99' },
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

const isValidDate = value => {
  const normalized = normalizeGetInTouch(value);
  if (!normalized) return false;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const [year, month, day] = normalized.split('-').map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split('.').map(Number);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    return (
      candidate.getUTCFullYear() === year &&
      candidate.getUTCMonth() === month - 1 &&
      candidate.getUTCDate() === day
    );
  }

  return false;
};

const isTruthyMapValue = (collection, key) => {
  if (!collection || typeof collection !== 'object') return false;
  const value = collection[key];
  if (typeof value === 'boolean') return value;
  return Boolean(value);
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

  if (getInTouch && !isValidDate(getInTouch)) {
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

