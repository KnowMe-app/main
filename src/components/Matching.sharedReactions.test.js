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
    expect(source).toContain("missingUserIds.length ? fetchUsersByIds(missingUserIds, { collectionSource: 'users' })");
    expect(source).toContain('missingNewUserIds.length ? fetchNewUsersByIdsForMatching(missingNewUserIds)');
    expect(source).not.toContain('const usersMap = await fetchUsersByIds(page.pageIds);');
  });


  it('hydrates uncached reaction cards with photos from both backing collections', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const configSource = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

    expect(matchingSource).toContain("missingUserIds.length ? fetchUsersByIds(missingUserIds, { collectionSource: 'users' })");
    expect(matchingSource).toContain('missingNewUserIds.length ? fetchNewUsersByIdsForMatching(missingNewUserIds)');
    expect(configSource).toContain('getAllUserPhotos(userId)');
    expect(configSource).toContain('photos,');
  });

  it('refreshes mixed users/newUsers reaction pagination when access scope changes in users mode', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const hasAccessScopedNewUsersUserIds = [');
    expect(source).toContain("(collectionSource === 'newUsers' || hasAccessScopedNewUsersUserIds)");
    expect(source).toContain('currentPagination.accessSnapshotKey !== reactionAccessSnapshotKey');
    expect(source).toContain('if (didAccessSnapshotChange) return page.users;');
    expect(source).toContain('const canUseCachedCard = cached && (');
    expect(source).toContain('__fromCardCache: true');
    expect(source).not.toContain('const hasHydratedPhotoState = cachedPhotos.length > 0 || cached?.__photosHydrated === true;');
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


  it('keeps Matching as a single premium active profile without reward or load-more chrome', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const styledSource = fs.readFileSync(path.join(__dirname, 'Matching.styled.jsx'), 'utf8');

    expect(matchingSource).toContain('const activeProfile = filteredUsers[activeProfileIndex] || null;');
    expect(matchingSource).toContain('data-testid="matching-profile-card"');
    expect(matchingSource).toContain('onNavigate(direction === \'left\' ? 1 : -1);');
    expect(matchingSource).toContain('const identityAndLocationKeys =');
    expect(matchingSource).not.toContain('Дозавантажити карточки');
    expect(matchingSource).not.toContain('Більше карточок завтра');
    expect(matchingSource).not.toContain('<LoadMoreButton');
    expect(matchingSource).not.toContain('ModernGallery');
    expect(matchingSource).not.toContain('Gallery</ModernSectionTitle>');
    expect(styledSource).toContain('height: 55%;');
    expect(styledSource).toContain('top: 14px;\n  left: 14px;');
    expect(styledSource).toContain('& + &::before');
    expect(styledSource).toContain('width: 1px;');
    expect(styledSource).toContain('flex: 1 1 0;');
  });

});
