const SEARCH_ID_CHECKBOX_KEYS = [
  'instagram',
  'facebook',
  'email',
  'phone',
  'telegram',
  'tiktok',
  'twitter',
  'line',
  'otherLink',
  'other',
  'vk',
  'name',
  'surname',
  'lastAction',
  'getInTouch',
];

const EQUAL_TO_INDEX_KEYS = [
  'instagram',
  'facebook',
  'email',
  'phone',
  'telegram',
  'tiktok',
  'twitter',
  'line',
  'otherLink',
  'vk',
  'other',
  'userId',
  'getInTouch',
  'myComment',
  'lastAction',
  'name',
  'surname',
  'lastLogin2',
  'createdAt',
  'cycleStatus',
  'lastCycle',
  'lastLogin',
];

export const getSearchIdPrefixes = searchIdPrefixes => {
  if (!Array.isArray(searchIdPrefixes) || searchIdPrefixes.length === 0) {
    return SEARCH_ID_CHECKBOX_KEYS;
  }

  const normalizedPrefixes = searchIdPrefixes
    .map(prefix => (typeof prefix === 'string' ? prefix.trim() : ''))
    .filter(Boolean);

  const allowedPrefixes = SEARCH_ID_CHECKBOX_KEYS.filter(prefix =>
    normalizedPrefixes.includes(prefix)
  );

  return allowedPrefixes.length > 0 ? allowedPrefixes : SEARCH_ID_CHECKBOX_KEYS;
};

export const resolveEqualToSearchKeys = equalToKeys => {
  const normalizedSelected = Array.isArray(equalToKeys)
    ? equalToKeys
      .map(key => (typeof key === 'string' ? key.trim() : ''))
      .filter(Boolean)
    : [];

  const allowedSelected = EQUAL_TO_INDEX_KEYS.filter(key =>
    normalizedSelected.includes(key)
  );

  if (
    allowedSelected.length === 0 ||
    allowedSelected.length === EQUAL_TO_INDEX_KEYS.length
  ) {
    return [...EQUAL_TO_INDEX_KEYS];
  }

  return allowedSelected;
};
