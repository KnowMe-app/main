import { normalizeSearchIdInput } from './searchKeyUtils';

const toValues = value => (Array.isArray(value) ? value : [value]);

export const findMatchingProfileMutation = (mutations, detectedSearch) => {
  const field = detectedSearch?.key;
  const searchedValue = detectedSearch?.value;
  if (!field || searchedValue == null) return null;

  const normalizedSearch = field === 'userId'
    ? String(searchedValue).trim().toLowerCase()
    : normalizeSearchIdInput(field, searchedValue).toLowerCase();
  if (!normalizedSearch) return null;

  return (mutations || []).find(mutation => {
    const profile = mutation?.data || {};
    const values = field === 'userId'
      ? [mutation?.cardId, profile.userId]
      : toValues(profile[field]);
    return values.some(value => {
      const normalizedValue = field === 'userId'
        ? String(value || '').trim().toLowerCase()
        : normalizeSearchIdInput(field, value).toLowerCase();
      return normalizedValue === normalizedSearch;
    });
  }) || null;
};
