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
    expect(source).toContain('() => filteredUsers.map(user => resolveStoredProjection(user, isMatchingSummaryCard)),');
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
    expect(sync).toContain('forgetCardBodies: forgetCachedCardBodies,');
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
});
