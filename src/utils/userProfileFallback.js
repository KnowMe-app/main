export const FULL_PROFILE_FALLBACK_KEY = '__fullProfileFallback';

export const isFullProfileFallbackData = data =>
  data?.[FULL_PROFILE_FALLBACK_KEY] === true;

// Full-profile fallbacks written before the marker was introduced still contain
// profile fields, whereas a successful canonical write leaves only login metadata
// in newUsers. Keep those rollout-era profiles authoritative without mistaking a
// session-only node for a usable profile.
export const isLegacyFullProfileFallbackData = data => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const metadataKeys = new Set([FULL_PROFILE_FALLBACK_KEY, 'lastLogin', 'lastLogin2']);
  return Object.keys(data).some(key => !metadataKeys.has(key));
};

export const markFullProfileFallback = data => ({
  ...(data || {}),
  [FULL_PROFILE_FALLBACK_KEY]: true,
});
