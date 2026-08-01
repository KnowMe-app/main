const EQUAL_TO_INDEX_KEYS = [
  'instagram',
  'ameblo',
  'facebook',
  'email',
  'phone',
  'telegram',
  'tiktok',
  'linkedin',
  'youtube',
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

export const resolveEqualToSearchKeys = equalToKeys => {
  if (!Array.isArray(equalToKeys)) {
    return [...EQUAL_TO_INDEX_KEYS];
  }

  const normalizedSelected = equalToKeys
    .map(key => (typeof key === 'string' ? key.trim() : ''))
    .filter(Boolean);

  const allowedSelected = EQUAL_TO_INDEX_KEYS.filter(key =>
    normalizedSelected.includes(key)
  );

  if (allowedSelected.length === EQUAL_TO_INDEX_KEYS.length) {
    return [...EQUAL_TO_INDEX_KEYS];
  }

  return allowedSelected;
};
