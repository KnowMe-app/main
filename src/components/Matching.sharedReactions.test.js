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
    // Фото повна анкета бере з вузлів, коли вони вже там, і лише інакше —
    // лістингом Storage (`__photosHydrated`).
    expect(configSource).toContain('const photos = fromNodes.__photosHydrated ? fromNodes.photos : await getAllUserPhotos(userId);');
    expect(configSource).toContain('return { ...fromNodes, photos: photos || [], __photosHydrated: true };');
  });

  it('refreshes reaction pagination when access scope changes', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(source).toContain('currentPagination.accessSnapshotKey !== reactionAccessSnapshotKey');
    expect(source).toContain('if (didAccessSnapshotChange) return page.users;');
    // Картку з кеша бере `composeCachedCards` (повна анкета або проєкція), а
    // чинність перевіряє `isValidCachedReactionCard` — окремої умови
    // `canUseCachedCard` більше немає.
    expect(source).toContain('const composedCache = composeCachedCards(uniqueIds);');
    expect(source).toContain('if (isValidCachedReactionCard(normalizedCached, id)) {');
    expect(source).toContain('__fromCardCache: true');
    expect(source).not.toContain('const hasHydratedPhotoState = cachedPhotos.length > 0 || cached?.__photosHydrated === true;');
  });

  it('guards stale default shared-candidate requests while allowing reaction tabs across collections', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    // Спільні реакції тепер приносить пагінація колекції, а пул лише
    // очищається — і очищається тільки, якщо запит ще чинний (той самий
    // епох кеша, версія, режим і колекція).
    expect(source).toContain('const sharedReactionCandidateLoadVersionRef = useRef(0);');
    expect(source).toContain('const canApplySharedCandidateResult = () => cacheEpoch === getMatchingLocalStorageCacheEpoch() && shouldApplySharedReactionCandidateResult({');
    expect(source).toContain('currentViewMode: viewModeRef.current');
    expect(source).toContain(`if (canApplySharedCandidateResult()) {
      setSharedReactionCandidateUsers([]);
    }`);
  });


  it('reloads shared candidates when returning to default mode without shared id changes', () => {
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
    // Додатковий доступ рахує провайдер стрічки, а не сама сторінка.
    const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const provider = fs.readFileSync(path.join(__dirname, '..', 'utils', 'matchingDataProvider.js'), 'utf8');

    expect(provider).toContain('requireSearchKeySetKeys: true');
    expect(source).not.toContain("refDb(database, 'searchKey')");
    expect(source).not.toContain("ref2(database, 'searchKey')");
  });


  it('keeps Matching a plain feed without reward, load-more chrome or a detail layer', () => {
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    // Відкритої картки в стрічці більше немає: шар деталей повторював рядок
    // із більшим фото й прибраний разом із гортанням деки стрілками (дотик до
    // фото відкриває `PhotoViewer`, дотик деінде розгортає рядок).
    expect(matchingSource).toContain('const feedSourceWithoutOwnEdits = filteredUsers;');
    expect(matchingSource).not.toContain('SwipeableCard');
    expect(matchingSource).not.toContain('DetailLayer');
    expect(matchingSource).not.toContain('Дозавантажити карточки');
    expect(matchingSource).not.toContain('Більше карточок завтра');
    expect(matchingSource).not.toContain('<LoadMoreButton');
    expect(matchingSource).not.toContain('ModernGallery');
    expect(matchingSource).not.toContain('Gallery</ModernSectionTitle>');
  });

});
