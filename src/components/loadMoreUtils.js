export const handleEmptyFetch = (res, prevLastKey, setHasMore) => {
  const shouldStop = res.users.length === 0 && res.lastKey === prevLastKey;
  if (shouldStop) {
    setHasMore(false);
  }
  return shouldStop;
};
