import { normalizeSearchIdInput } from './searchKeyUtils';

const toValues = value => (Array.isArray(value) ? value : [value]);

// Returns every mutation whose value for the detected field matches -
// several drafts can legitimately share a name or a phone number, so callers
// must not assume the first match is the only one.
export const findMatchingProfileMutations = (mutations, detectedSearch) => {
  const field = detectedSearch?.key;
  const searchedValue = detectedSearch?.value;
  if (!field || searchedValue == null) return [];

  const normalizedSearch = field === 'userId'
    ? String(searchedValue).trim().toLowerCase()
    : normalizeSearchIdInput(field, searchedValue).toLowerCase();
  if (!normalizedSearch) return [];

  return (mutations || []).filter(mutation => {
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
  });
};
