export const PAGE_SIZE = 20;

// List of invalid date tokens used when no records exist for a real date.
// These values help fetch orphaned records that might have malformed
// `getInTouch` fields.
export const INVALID_DATE_TOKENS = ['', '2099-99-99', '9999-99-99'];

// Maximum amount of days to look back when loading users by date.
// Prevents infinite loops if the database contains sparse or malformed dates.
export const MAX_LOOKBACK_DAYS = 365;
