import fs from 'fs';
import path from 'path';

describe('Matching shared reaction card UI', () => {
  it('does not render overlay text for shared liked or disliked cards', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).not.toContain('Liked by shared owner');
    expect(source).not.toContain('Disliked by shared owner');
    expect(source).not.toContain('ReactionOwnershipBadge');
  });

  it('loads reaction tab cards through one hydration path', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const fetchReactionCardsByIds = React.useCallback');
    expect(source).toContain('const usersMap = missingIds.length ? await hydrateMatchingFeedCards(missingIds) : {};');
    expect(source).not.toContain('const usersMap = await fetchUsersByIds(page.pageIds);');
  });

  it('resolves shared reaction owners before allowing the initial deck request', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const ownerInstall = source.indexOf('setMultiDataOwnerIds(resolvedOwnerIds);');
    const roleResolution = source.indexOf('setCurrentUserRoleResolved(true);', ownerInstall);
    const searchKeyLookup = source.indexOf('await resolveAdditionalSearchKeySetKeysForMatching(profile, user.uid);', roleResolution);

    expect(ownerInstall).toBeGreaterThan(-1);
    expect(roleResolution).toBeGreaterThan(ownerInstall);
    expect(searchKeyLookup).toBeGreaterThan(roleResolution);
    expect(source).toContain('const [currentUserRoleResolved, setCurrentUserRoleResolved] = useState(false);');
  });


  it('hydrates uncached reaction cards with photos', () => {
    // Картки реакцій — рядки стрічки: бракує — дочитується проєкція з
    // аватаром, а решту знімків просить свайп (`requestCardPhotos`). Повна
    // анкета з усіма фото лишилась запасним шляхом для id без проєкції.
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const configSource = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

    expect(matchingSource).toContain('const usersMap = missingIds.length ? await hydrateMatchingFeedCards(missingIds) : {};');
    expect(matchingSource).toContain('const hydrated = await fetchUsersByIds(missingIds);');
    expect(configSource).toContain('getAllUserPhotos(userId)');
    expect(configSource).toContain('return { ...fromNodes, photos: photos || [], __photosHydrated: true };');
  });

  it('refreshes reaction pagination when access scope changes', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('currentPagination.accessSnapshotKey !== reactionAccessSnapshotKey');
    expect(source).toContain('if (didAccessSnapshotChange) return page.users;');
    // Кешовані картки реакцій складаються з тих самих сховищ, що й стрічка.
    expect(source).toContain('const composedCache = composeCachedCards(uniqueIds);');
    expect(source).toContain('if (isValidCachedReactionCard(normalizedCached, id)) {');
    expect(source).toContain('__fromCardCache: true');
    expect(source).not.toContain('const hasHydratedPhotoState = cachedPhotos.length > 0 || cached?.__photosHydrated === true;');
  });

  it('guards stale default shared-candidate requests while allowing reaction tabs across collections', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const sharedReactionCandidateLoadVersionRef = useRef(0);');
    // Результат, що приїхав після скидання кешу, теж застарілий — звідси епоха.
    expect(source).toContain('const canApplySharedCandidateResult = () => cacheEpoch === getMatchingLocalStorageCacheEpoch() && shouldApplySharedReactionCandidateResult({');
    expect(source).toContain('currentViewMode: viewModeRef.current');
    expect(source).toContain(`if (!canApplySharedCandidateResult()) {
      return;
    }

    const loadedUsers = accessibleCandidateIds`);
  });


  // Загальний список — це стрічка, і нічого, крім стрічки: спільні реакції
  // в деку за замовчуванням більше не доливаються, а лише у вкладки реакцій.
  it('reloads shared candidates on mode change, but keeps them out of the default deck', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('const requestViewMode = viewMode;');
    expect(source).toContain(`sharedReactionIds,
    viewMode,
  ]);

  useEffect(() => {
    if (viewModeRef.current === 'default') {
      setSharedReactionCandidateUsers([]);
      return;
    }
    loadSharedReactionCandidates();
  }, [loadSharedReactionCandidates]);`);
  });

  it('clears shared candidates when entering search so search renders only returned results', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain(`setSharedReactionCandidateUsers([]);
    setViewMode('search');`);
  });


  it('requires searchKeySets for additional reaction access instead of falling back to global searchKey', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const indexSource = fs.readFileSync(path.join(__dirname, '../utils/filterSetsIndex.js'), 'utf8');

    // Вимога стала умовчанням самого читача індексу, і ніхто її не знімає.
    expect(indexSource).toContain('requireSearchKeySetKeys = true,');
    expect(source).not.toContain('requireSearchKeySetKeys: false');
    expect(source).not.toContain("refDb(database, 'searchKey')");
    expect(source).not.toContain("ref2(database, 'searchKey')");
  });


  // Шар відкритої картки (`DetailLayer`, `SwipeableCard`) прибрано разом з
  // його стилями: дотик до фото відкриває саме фото, дотик деінде розгортає
  // рядок. Лишилось стежити, що стрічка тримається одного масиву й не
  // обростає ні шаром, ні кнопками дозавантаження.
  it('keeps Matching a single feed without a detail layer or load-more chrome', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(matchingSource).toContain('const feedSourceWithoutOwnEdits = filteredUsers;');
    expect(matchingSource).not.toContain('DetailLayer');
    expect(matchingSource).not.toContain('SwipeableCard');
    expect(matchingSource).not.toContain('Дозавантажити карточки');
    expect(matchingSource).not.toContain('Більше карточок завтра');
    expect(matchingSource).not.toContain('<LoadMoreButton');
    expect(matchingSource).not.toContain('ModernGallery');
    expect(matchingSource).not.toContain('Gallery</ModernSectionTitle>');
  });

});
