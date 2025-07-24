const { handleEmptyFetch } = require('../loadMoreUtils');

test('handleEmptyFetch sets hasMore false when results empty and key unchanged', () => {
  const setHasMore = jest.fn();
  const prevKey = 5;
  const res = { users: [], lastKey: 5 };
  const stop = handleEmptyFetch(res, prevKey, setHasMore);
  expect(stop).toBe(true);
  expect(setHasMore).toHaveBeenCalledWith(false);
});

test('handleEmptyFetch returns false when users found or key changed', () => {
  const setHasMore = jest.fn();
  expect(handleEmptyFetch({ users: [{ id: 1 }], lastKey: 6 }, 5, setHasMore)).toBe(false);
  expect(handleEmptyFetch({ users: [], lastKey: 6 }, 5, setHasMore)).toBe(false);
});
