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
    expect(handler()).toContain('setUsers(current => replaceFeedProjections(current, cards, isMatchingSummaryCard));');
    expect(source).not.toContain('freshFeedCardsById');
    expect(source).toContain('feedSource.map(user => withOwnEdits(withLazyPhotos(user)))');
  });
});
