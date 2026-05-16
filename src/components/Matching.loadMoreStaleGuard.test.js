const fs = require('fs');
const path = require('path');

const loadMoreSource = () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
  const start = source.indexOf('  const loadMore = React.useCallback');
  const end = source.indexOf('  const filteredUsers = useMemo', start);
  return source.slice(start, end);
};

describe('Matching loadMore stale pagination guards', () => {
  it('updates reaction cards before async comment loading while preserving stale guards', () => {
    const source = loadMoreSource();

    expect(source).toContain(`if (!canApplyLoadMoreResult()) return;
        reactionLoadedIdsRef.current[viewMode] = loadedIds;
        loadedIdsRef.current = new Set(loadedIds);`);
    const setUsersIndex = source.indexOf('setUsers(prev => {\n          if (didAccessSnapshotChange) return page.users;');
    const commentsIndex = source.indexOf('void loadCommentsFor(page.users);', setUsersIndex);
    expect(setUsersIndex).toBeGreaterThan(-1);
    expect(commentsIndex).toBeGreaterThan(setUsersIndex);
    expect(source).toContain(`setHasMore(nextHasMore);
        setLastKey(null);`);
  });

  it('guards additional newUsers offset, hasMore, lastKey, and loadedIdsRef writes', () => {
    const source = loadMoreSource();

    expect(source).toContain(`if (!isLatestLoadMore()) return;
        collected.forEach(user => {
          loadedIdsRef.current.add(user.userId);
        });`);
    const setAdditionalIndex = source.indexOf('setAdditionalNewUsers(prev => {');
    const commentsIndex = source.indexOf('void loadCommentsFor(collected);', setAdditionalIndex);
    expect(setAdditionalIndex).toBeGreaterThan(-1);
    expect(commentsIndex).toBeGreaterThan(setAdditionalIndex);
    expect(source).toContain(`setAdditionalNextOffset(nextOffset);
        setHasMore(canLoadMoreAdditional);`);
    expect(source).toContain(`setLastKey(null);
        return;`);
  });

  it('guards default source pagination writes from stale loadMore requests', () => {
    const source = loadMoreSource();
    const fetchIndex = source.indexOf('const res = await fetchChunk(remaining, cursor, dynamicExclude);');
    const staleGuardIndex = source.indexOf("console.log('[loadMore] ignored stale default batch result'", fetchIndex);
    const uniqueIndex = source.indexOf('const unique = res.users.filter', fetchIndex);

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(staleGuardIndex).toBeGreaterThan(fetchIndex);
    expect(staleGuardIndex).toBeLessThan(uniqueIndex);
    expect(source).toContain(`if (!isLatestLoadMore()) return;
      collected.forEach(u => loadedIdsRef.current.add(u.userId));`);
    const defaultSetUsersIndex = source.lastIndexOf('setUsers(prev => {');
    const commentsIndex = source.indexOf('void loadCommentsFor(collected);', defaultSetUsersIndex);
    expect(defaultSetUsersIndex).toBeGreaterThan(-1);
    expect(commentsIndex).toBeGreaterThan(defaultSetUsersIndex);
    expect(source).toContain(`finishLoadMoreIfLatest();`);
  });

  it('does not clear loading state from stale requests after newer loadMore starts', () => {
    const source = loadMoreSource();
    const helperIndex = source.indexOf('const finishLoadMoreIfLatest = () => {');
    const staleBranchIndex = source.indexOf("[loadMore] stale request finished after a newer request; keeping loading state for active request", helperIndex);
    const clearRefIndex = source.indexOf('loadingRef.current = false;', helperIndex);
    const clearStateIndex = source.indexOf('setLoading(false);', helperIndex);
    const finallyIndex = source.indexOf(`} finally {
      finishLoadMoreIfLatest();
    }`, helperIndex);

    expect(helperIndex).toBeGreaterThan(-1);
    expect(source.slice(helperIndex, clearRefIndex)).toContain('if (!isLatestLoadMore())');
    expect(staleBranchIndex).toBeGreaterThan(helperIndex);
    expect(staleBranchIndex).toBeLessThan(clearRefIndex);
    expect(clearRefIndex).toBeLessThan(clearStateIndex);
    expect(finallyIndex).toBeGreaterThan(clearStateIndex);
  });
});
