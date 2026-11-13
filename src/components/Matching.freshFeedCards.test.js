// Сторож стану стрічки читає картку цілком (`readCardFeedState`), і рядок з
// кешу пристрою показується вже зі свіжою проєкцією — версією анкети, програм
// і фото, а не тією, що лежала в кеші до шести годин.
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
const handler = () => source.slice(
  source.indexOf('const rememberFreshFeedStates = React.useCallback('),
  source.indexOf('const feedRowsUnchecked = useMemo('),
);

describe('свіжа картка зі сторожа стану', () => {
  it('сторож віддає прочитані стани в Matching', () => {
    expect(source).toContain('onFreshStates: rememberFreshFeedStates,');
  });

  it('у кеш лягає лише видима картка, розгорнута як проєкція', () => {
    expect(handler()).toContain('if (!state?.card || isFeedStateDeniedForFeed(state)) return;');
    expect(handler()).toContain('const expanded = expandVerifiedMatchingCard(id, state.card);');
    expect(handler()).toContain('setCachedMatchingSummaryCards(cards);');
  });

  // Свіжа проєкція — в одному сховищі вкладки, а рядок будь-якого джерела
  // деки бере її звідти: латати кожен стан окремо коштувало багів.
  it('свіжа проєкція йде в одне сховище, а рядки беруть її звідти', () => {
    expect(handler()).not.toContain('setUsers(');
    expect(source).toContain('const cardStoreVersion = useSyncExternalStore(subscribeCardStore, getCardStoreVersion);');
    // Свіжа проєкція стоїть у джерелах деки ще до фільтрів: фільтр і показ
    // бачать ту саму версію картки.
    expect(source).toContain('() => resolveStoredProjectionList(users, isMatchingSummaryCard),');
    expect(source).toContain('() => resolveStoredProjectionList(likedAudienceUsers, isMatchingSummaryCard),');
    expect(source).toContain('() => resolveStoredProjectionList(additionalAccessUsers, isMatchingSummaryCard),');
    expect(source).toContain('() => resolveStoredProjectionList(sharedReactionCandidateUsers, isMatchingSummaryCard),');
    const visible = source.slice(source.indexOf('const visibleUsers = useMemo('), source.indexOf('const reactionTabUsers = useMemo('));
    expect(visible).toContain('placeReturnedCardsFirst({ users: storedUsers, returnedCards: storedReturnedToFeedCards,');
    expect(visible).toContain("viewMode === 'default' ? storedReturnedToFeedCards : EMPTY_USERS");
    expect(source).toContain('() => resolveStoredProjectionList(returnedToFeedCards, isMatchingSummaryCard),');
    expect(visible).toContain('likedAudienceUsers: storedLikedAudienceUsers,');
    expect(visible).toContain('additionalAccessUsers: storedAdditionalAccessUsers,');
    expect(visible).toContain('sharedReactionCandidateUsers: storedSharedReactionCandidateUsers,');
    const reactionTab = source.slice(source.indexOf('const reactionTabUsers = useMemo('), source.indexOf('const reactionTabUsersRef'));
    expect(reactionTab).toContain('...storedUsers,');
    expect(reactionTab).not.toMatch(/\.\.\.users,/);
    expect(source).toContain('const feedSourceWithoutOwnEdits = filteredUsers;');
    expect(source).toContain('feedSource.map(user => withOwnEdits(withLazyPhotos(user)))');
    const restart = source.slice(source.indexOf('const restartFeed = React.useCallback('), source.indexOf('const resetFiltersAndCache ='));
    expect(restart).toContain('clearCardStore();');
  });

  // Журнал змін: сторож не читає картки, доки журнал не прочитано, а
  // незмінені підтверджує перевіреним станом пристрою.
  it('сторож чекає на журнал змін', () => {
    expect(source).toContain('ready: cardChangesReady,');
    const start = source.indexOf('const [cardChangesReady, setCardChangesReady]');
    const sync = source.slice(start, source.indexOf('}, [isAdmin, ownerId]);', start));
    expect(sync).toContain('readChangesSince: readMatchingCardChangesSince,');
    expect(sync).toContain('forgetCachedCardBodies(ids);');
    expect(sync).toContain('forgetProfileContactsForViewer(ownerId, ids);');
    expect(sync).toContain('CARD_CHANGES_WAIT_MS');
  });

  // Дочитування стрічки чекає на журнал: інакше воно встигало раніше за
  // синхронізацію й перечитувало всю деку, якої ніхто не міняв.
  it('дочитування стрічки спершу чекає на журнал змін', () => {
    const hydrate = source.slice(
      source.indexOf('const hydrateMatchingFeedCards = React.useCallback('),
      source.indexOf('const isBackendOnlyMode = matchingDataSourceMode'),
    );
    expect(hydrate).toContain('cardChangesSyncRef.current.catch(() => null)');
    expect(hydrate).toContain('setTimeout(resolve, CARD_CHANGES_WAIT_MS)');
    expect(source).toContain('cardChangesSyncRef.current = sync;');
  });

  // Адмін зняв чи повернув публікацію: правка йде й у сховище, інакше
  // прочитана раніше проєкція перебила б її в рядку, а відмова бази
  // повертає обидва.
  it('публікація адміна правує й сховище, а відмова її відкочує', () => {
    const toggle = source.slice(source.indexOf('const togglePublish = React.useCallback('), source.indexOf('const applySearchResults ='));
    expect(toggle).toContain('const storedPatch = patchStoredProjection(userId, patchPublication);');
    expect(toggle).toContain('restoreStoredProjection(userId, storedPatch);');
    expect(toggle.indexOf('revertLocally();')).toBeGreaterThan(toggle.indexOf('} catch (err) {'));
  });
});
