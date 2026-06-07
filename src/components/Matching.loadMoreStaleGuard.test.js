const fs = require('fs');
const path = require('path');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

const loadMoreSource = () => {
  const source = matchingSource();
  const start = source.indexOf('  const loadMore = React.useCallback');
  const end = source.indexOf('  const visibleUsers = useMemo', start);
  return source.slice(start, end);
};

const applySearchResultsSource = () => {
  const source = matchingSource();
  const start = source.indexOf('  const applySearchResults = async res => {');
  const end = source.indexOf('  useEffect(() => {', start);
  return source.slice(start, end);
};

describe('Matching loadMore stale pagination guards', () => {
  it('resets load-only state and invalidates active loads when applying search results', () => {
    const source = applySearchResultsSource();

    expect(source).toContain('loadInitialVersionRef.current += 1;');
    expect(source).toContain('additionalLoadMoreFetchVersionRef.current += 1;');
    expect(source).toContain('additionalMatchingApplyVersionRef.current += 1;');
    expect(source).toContain('loadingRef.current = false;');
    expect(source).toContain('loadingStateRef.current = false;');
    expect(source).toContain('hasMoreRef.current = false;');
    expect(source).toContain("viewModeRef.current = 'search';");
    expect(source).toContain('setUsers(filtered);');
    expect(source).toContain('loadedIdsRef.current = new Set(filtered.map(u => u.userId).filter(Boolean));');
    expect(source).toContain('setAdditionalNewUsers([]);');
    expect(source).toContain('setAdditionalNextOffset(0);');
    expect(source).toContain('setHasMore(false);');
    expect(source).toContain('setLastKey(null);');
    expect(source).toContain('setLoading(false);');
    expect(source).toContain('setSharedReactionCandidateUsers([]);');
    expect(source).toContain("setViewMode('search');");
  });
  it('updates reaction cards before async comment loading while preserving stale guards', () => {
    const source = loadMoreSource();

    expect(source).toContain(`if (!canApplyLoadMoreResultWithFilters()) { logStaleLoadMoreResultIgnored('reaction-branch'); return; }
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
    const additionalLastKeyIndex = source.indexOf('setLastKey(null);', commentsIndex);
    expect(additionalLastKeyIndex).toBeGreaterThan(commentsIndex);
  });

  it('guards default source pagination writes from stale loadMore requests', () => {
    const source = loadMoreSource();
    const fetchIndex = source.indexOf('const res = await fetchChunk(remaining, cursor, dynamicExclude);');
    const staleGuardIndex = source.indexOf("console.log('[loadMore] ignored stale default batch result'", fetchIndex);
    const uniqueIndex = source.indexOf('const unique = res.users.filter', fetchIndex);

    expect(fetchIndex).toBeGreaterThan(-1);
    expect(staleGuardIndex).toBeGreaterThan(fetchIndex);
    expect(staleGuardIndex).toBeLessThan(uniqueIndex);
    const defaultApplyGuardIndex = source.indexOf("logStaleLoadMoreResultIgnored('default-source-apply'", fetchIndex);
    const defaultLoadedIdsIndex = source.indexOf('collected.forEach(u => loadedIdsRef.current.add(u.userId));', fetchIndex);
    expect(defaultApplyGuardIndex).toBeGreaterThan(fetchIndex);
    expect(defaultApplyGuardIndex).toBeLessThan(defaultLoadedIdsIndex);
    const defaultSetUsersIndex = source.lastIndexOf('setUsers(prev => {');
    const commentsIndex = source.indexOf('void loadCommentsFor(collected);', defaultSetUsersIndex);
    expect(defaultSetUsersIndex).toBeGreaterThan(-1);
    expect(commentsIndex).toBeGreaterThan(defaultSetUsersIndex);
    expect(source).toContain(`finishLoadMoreIfLatest();`);
  });


  it('keeps active users indexed filters from falling through to source pagination', () => {
    const source = loadMoreSource();
    const indexedBranchIndex = source.indexOf("if (collectionSource === 'users' && activeIndexFilterGroups.length > 0)");
    const sourcePaginationIndex = source.indexOf('const collected = [];', indexedBranchIndex);
    const indexedBranch = source.slice(indexedBranchIndex, sourcePaginationIndex);
    const indexedReturnIndex = indexedBranch.indexOf('return indexedPage.collected.length;');

    expect(indexedBranchIndex).toBeGreaterThan(-1);
    expect(sourcePaginationIndex).toBeGreaterThan(indexedBranchIndex);
    expect(indexedBranch).toContain('collectMatchingIndexedLoadMorePage({');
    expect(indexedBranch).toContain('setLastKey(indexedPage.finalOffset);');
    expect(indexedBranch).toContain('setHasMore(Boolean(indexedPage.finalHasMore && !indexedPage.cursorStuck));');
    expect(indexedReturnIndex).toBeGreaterThan(indexedBranch.indexOf('setHasMore(Boolean(indexedPage.finalHasMore'));
  });

  it('does not clear loading state from stale requests after newer loadMore starts', () => {
    const source = loadMoreSource();
    const helperIndex = source.indexOf('const finishLoadMoreIfLatest = () => {');
    const staleBranchIndex = source.indexOf("[loadMore] stale request finished after a newer request; keeping loading state for active request", helperIndex);
    const clearRefIndex = source.indexOf('loadingRef.current = false;', helperIndex);
    const clearStateIndex = source.indexOf('setLoading(false);', helperIndex);
    const finallyIndex = source.indexOf('} finally {', helperIndex);
    const finishInFinallyIndex = source.indexOf('finishLoadMoreIfLatest();', finallyIndex);

    expect(helperIndex).toBeGreaterThan(-1);
    expect(source.slice(helperIndex, clearRefIndex)).toContain('if (!isLatestLoadMore())');
    expect(staleBranchIndex).toBeGreaterThan(helperIndex);
    expect(staleBranchIndex).toBeLessThan(clearRefIndex);
    expect(clearRefIndex).toBeLessThan(clearStateIndex);
    expect(finallyIndex).toBeGreaterThan(clearStateIndex);
    expect(finishInFinallyIndex).toBeGreaterThan(finallyIndex);
  });
});
