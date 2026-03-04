const strictEqual = (a, b) => a === b;

export const handleEmptyFetch = (
  res,
  prevLastKey,
  setHasMore,
  isSameCursor = strictEqual
) => {
  const shouldStop = res.users.length === 0 && isSameCursor(res.lastKey, prevLastKey);
  if (shouldStop) {
    console.log('[handleEmptyFetch] stopping further loads');
    setHasMore(false);
  }
  return shouldStop;
};
