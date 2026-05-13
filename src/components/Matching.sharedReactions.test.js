import fs from 'fs';
import path from 'path';

describe('Matching shared reaction card UI', () => {
  it('does not render overlay text for shared liked or disliked cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).not.toContain('Liked by shared owner');
    expect(source).not.toContain('Disliked by shared owner');
    expect(source).not.toContain('ReactionOwnershipBadge');
  });

  it('loads reaction tab cards through mixed users/newUsers fetch hydration', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const fetchReactionCardsByIds = React.useCallback');
    expect(source).toContain('missingUserIds.length ? fetchUsersByIds(missingUserIds)');
    expect(source).toContain('missingNewUserIds.length ? fetchNewUsersByIdsForMatching(missingNewUserIds)');
    expect(source).not.toContain('const usersMap = await fetchUsersByIds(page.pageIds);');
  });

  it('guards stale default shared-candidate requests while allowing reaction tabs across collections', () => {
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
    expect(source).toContain(`sharedReactionIds,
    viewMode,
  ]);

  useEffect(() => {
    loadSharedReactionCandidates();
  }, [loadSharedReactionCandidates]);`);
  });

  it('clears shared candidates when entering search so search renders only returned results', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain(`setSharedReactionCandidateUsers([]);
    viewModeRef.current = 'search';`);
  });


  it('requires searchKeySets for newUsers reaction access instead of falling back to global searchKey', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('requireSearchKeySetKeys: true');
    expect(source).not.toContain("refDb(database, 'searchKey')");
    expect(source).not.toContain("ref2(database, 'searchKey')");
  });

});
