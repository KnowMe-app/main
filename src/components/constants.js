export const PAGE_SIZE = 20;
// Number of users to index concurrently when creating indexes
export const BATCH_SIZE = 10;

// List of invalid date tokens used when no records exist for a real date.
// These values help fetch orphaned records that might have malformed
// `getInTouch` fields.
export const INVALID_DATE_TOKENS = [''];

// Maximum amount of days to look back when loading users by date.
// Prevents infinite loops if the database contains sparse or malformed dates.
// Historical constant kept for reference; not used in matching logic
export const MAX_LOOKBACK_DAYS = 365;
