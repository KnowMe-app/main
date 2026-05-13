import fs from 'fs';
import path from 'path';

describe('Matching shared reaction card UI', () => {
  it('renders a single active luxury profile without load-more controls', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const activeProfile = filteredUsers[activeProfileIndex] || null;');
    expect(source).toContain('data-testid="matching-profile-card"');
    expect(source).not.toContain('Дозавантажити карточки');
    expect(source).not.toContain('Більше карточок завтра');
    expect(source).not.toContain('<LoadMoreButton');
  });

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


  it('hydrates uncached reaction cards with storage photos before caching', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const configSource = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

    expect(matchingSource).toContain('const hydrateMatchingProfilePhotos = async (userId, data = {}) =>');
    expect(matchingSource).toContain('const hydratedData = await hydrateMatchingProfilePhotos(userId, rawData);');
    expect(matchingSource).toContain("cached.__photosHydrated === true");
    expect(configSource).toContain('const hasHydratedPhotos = Array.isArray(mergedData.photos) && mergedData.photos.some(Boolean);');
    expect(configSource).toContain('const photos = hasHydratedPhotos ? mergedData.photos : await getAllUserPhotos(id);');
    expect(configSource).toContain('__photosHydrated: true');
  });

  it('refreshes mixed users-mode reaction ids when access-scoped newUsers are present', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const hasAccessScopedNewUserReactionIds = [...fullReactionIds, ...(currentPagination.ids || [])].some(isShortId);');
    expect(source).toContain('const shouldRefreshReactionIds = parsedAdditionalAccessRules.length > 0 && hasAccessScopedNewUserReactionIds;');
    expect(source).toContain('return Array.from(map.values()).filter(user => reactionIds.includes(user.userId));');
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
