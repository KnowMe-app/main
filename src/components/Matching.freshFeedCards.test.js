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
    expect(handler()).toContain('const expanded = expandMatchingCard(id, state.card);');
    expect(handler()).toContain('setCachedMatchingSummaryCards(cards);');
  });

  // Накладка лише на показ лишала б розгортання (`feedSourceRef`) на старій
  // версії й переживала б «Оновити стрічку»; у `users` свіжу картку перебиває
  // будь-яка новіша сторінка.
  it('свіжа проєкція лягає в сам стан стрічки, а не накладкою на показ', () => {
    expect(handler()).toContain('const replace = current => replaceFeedProjections(current, cards, isMatchingSummaryCard);');
    // Кожне джерело рядків деки, а не лише `users`: «лише для вподобаних»,
    // надані правилами й спільні реакції доливаються в деку збирачем.
    ['setUsers(replace);', 'setLikedAudienceUsers(replace);', 'setAdditionalAccessUsers(replace);', 'setSharedReactionCandidateUsers(replace);']
      .forEach(line => expect(handler()).toContain(line));
    expect(source).not.toContain('freshFeedCardsById');
    expect(source).toContain('feedSource.map(user => withOwnEdits(withLazyPhotos(user)))');
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
});
