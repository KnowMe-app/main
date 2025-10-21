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

const isNormalizedSpecialGetInTouchValue = normalized => {
  if (!normalized) return false;
  if (SPECIAL_GET_IN_TOUCH_VALUES.has(normalized)) return true;
  const isoCandidate = normalized.replace(/\./g, '-');
  return SPECIAL_GET_IN_TOUCH_VALUES.has(isoCandidate);
};

const isValidMonthDay = (month, day) => {
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (Number.isNaN(monthNumber) || Number.isNaN(dayNumber)) return false;
  if (monthNumber < 1 || monthNumber > 12) return false;
  if (dayNumber < 1 || dayNumber > 31) return false;
  return true;
};

const REGULAR_DATE_PATTERNS = [
  { regex: /^(\d{4})-(\d{2})-(\d{2})$/, monthIndex: 2, dayIndex: 3 },
  { regex: /^(\d{4})\/(\d{2})\/(\d{2})$/, monthIndex: 2, dayIndex: 3 },
  { regex: /^(\d{2})\.(\d{2})\.(\d{4})$/, monthIndex: 2, dayIndex: 1 },
  { regex: /^(\d{2})-(\d{2})-(\d{4})$/, monthIndex: 2, dayIndex: 1 },
  { regex: /^(\d{2})\/(\d{2})\/(\d{4})$/, monthIndex: 2, dayIndex: 1 },
];

const isOrdinaryDateValue = normalized => {
  if (!normalized) return false;
  if (isNormalizedSpecialGetInTouchValue(normalized)) return false;

  return REGULAR_DATE_PATTERNS.some(({ regex, monthIndex, dayIndex }) => {
    const match = normalized.match(regex);
    if (!match) return false;
    return isValidMonthDay(match[monthIndex], match[dayIndex]);
  });
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
  if (isNormalizedSpecialGetInTouchValue(getInTouch)) {
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

  const normalizedGetInTouch = normalizeGetInTouch(user?.getInTouch);
  if (
    reactionFilters[REACTION_FILTER_KEYS.NONE] === false &&
    isOrdinaryDateValue(normalizedGetInTouch)
  ) {
    return false;
  }

  const category = getReactionCategory(user, favorites, dislikes);
  if (
    category === REACTION_FILTER_KEYS.NONE &&
    isOrdinaryDateValue(normalizedGetInTouch)
  ) {
    return false;
  }

  return Boolean(reactionFilters[category]);
};

export const REACTION_SPECIAL_VALUES = Object.freeze({
  values: Array.from(SPECIAL_GET_IN_TOUCH_VALUES),
});

