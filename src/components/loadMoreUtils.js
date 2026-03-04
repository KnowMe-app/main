export const handleEmptyFetch = (res, prevLastKey, setHasMore) => {
  const shouldStop = res.users.length === 0 && res.lastKey === prevLastKey;
  if (shouldStop) {
    console.log('[handleEmptyFetch] stopping further loads');
    setHasMore(false);
  }
  return shouldStop;
};
