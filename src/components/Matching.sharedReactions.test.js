import fs from 'fs';
import path from 'path';

describe('Matching shared reaction card UI', () => {
  it('does not render overlay text for shared liked or disliked cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).not.toContain('Liked by shared owner');
    expect(source).not.toContain('Disliked by shared owner');
    expect(source).not.toContain('ReactionOwnershipBadge');
  });

  it('loads reaction tab cards through fetchUserById-compatible photo hydration', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const fetchReactionCardsByIds = React.useCallback');
    expect(source).toContain('await fetchUserById(id)');
    expect(source).not.toContain('const usersMap = await fetchUsersByIds(page.pageIds);');
  });

  it('guards stale default shared-candidate requests before applying them in reaction tabs', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const sharedReactionCandidateLoadVersionRef = useRef(0);');
    expect(source).toContain('const canApplySharedCandidateResult = () => shouldApplySharedReactionCandidateResult({');
    expect(source).toContain('currentViewMode: viewModeRef.current');
    expect(source).toContain('currentCollectionSource: collectionSourceRef.current');
    expect(source).toContain(`if (!canApplySharedCandidateResult()) {
      return;
    }

    loadedUsers.forEach`);
  });


  it('reloads shared candidates when returning to default mode without shared id changes', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const requestViewMode = viewMode;');
    expect(source).toContain('sharedReactionIds,');
    expect(source).toContain('viewMode,');
    expect(source).toContain(`useEffect(() => {
    loadSharedReactionCandidates();
  }, [loadSharedReactionCandidates]);`);
  });

  it('clears shared candidates when entering search so search renders only returned results', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain(`setSharedReactionCandidateUsers([]);
    viewModeRef.current = 'search';`);
  });


  it('merges shared candidates with access-filtered ids and refreshes comments for retained cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain("const allowedCandidateIds = collectionSource === 'newUsers'");
    expect(source).toContain('candidateIds: allowedCandidateIds');
    expect(source).toContain('currentUsers: sharedReactionCandidateUsersRef.current');
    expect(source).toContain('await loadCommentsFor(mergedSharedReactionCandidates);');
  });


  it('prunes stale access-snapshotted shared and additional newUsers without a full reload', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('setAdditionalNewUsers(prev => {');
    expect(source).toContain('setSharedReactionCandidateUsers(prev => {');
    expect(source).toContain("user?.__matchingAccessSnapshotKey === matchingAccessSnapshotKey");
  });


  it('refreshes open reaction tabs against current access and stamps retained cards before syncing snapshot state', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('deferStateSync: true');
    expect(source).toContain("const shouldRefreshReactionIds = collectionSource === 'newUsers' && parsedAdditionalAccessRules.length > 0;");
    expect(source).toContain('revalidateCurrentMatchingAccessPools({');
    expect(source).toContain('sharedAllowedNewUserIds: sharedReactionIds.filter(id => allowedIds.has(id))');
    expect(source).toContain('applyFreshAdditionalProfileState(freshProfileCache, freshProfileCache?.accessLevel);');
  });

  it('stores reaction pagination with the access snapshot used to load the page', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('accessSnapshotKey: matchingAccessSnapshotKeyRef.current');
    expect(source).toContain('const buildEmptyReactionPagination = () => ({ ids: [], nextOffset: 0, hasMore: false, accessSnapshotKey: null });');
  });

});
