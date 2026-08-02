export const FULL_PROFILE_FALLBACK_KEY = '__fullProfileFallback';

export const isFullProfileFallbackData = data =>
  data?.[FULL_PROFILE_FALLBACK_KEY] === true;

export const markFullProfileFallback = data => ({
  ...(data || {}),
  [FULL_PROFILE_FALLBACK_KEY]: true,
});
