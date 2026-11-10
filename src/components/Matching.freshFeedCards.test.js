// Сторож стану стрічки читає картку цілком (`readCardFeedState`), і рядок з
// кешу пристрою показується вже зі свіжою проєкцією — версією анкети, програм
// і фото, а не тією, що лежала в кеші до шести годин.
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

describe('свіжа картка зі сторожа стану', () => {
  it('сторож віддає прочитані стани в Matching', () => {
    expect(source).toContain('onFreshStates: rememberFreshFeedStates,');
  });

  it('у кеш і на рядок лягає лише видима картка, розгорнута як проєкція', () => {
    const handler = source.slice(
      source.indexOf('const rememberFreshFeedStates = React.useCallback('),
      source.indexOf('const feedRowsUnchecked = useMemo('),
    );
    expect(handler).toContain('if (!state?.card || isFeedStateDeniedForFeed(state)) return;');
    expect(handler).toContain('const expanded = expandMatchingCard(id, state.card);');
    expect(handler).toContain('setCachedMatchingSummaryCards(cards);');
  });

  it('повну анкету рядка свіжа проєкція не підміняє', () => {
    const merge = source.slice(
      source.indexOf('const withFreshFeedCard = React.useCallback('),
      source.indexOf('const rememberFreshFeedStates = React.useCallback('),
    );
    expect(merge).toContain('if (!fresh || !isMatchingSummaryCard(user)) return user;');
    expect(source).toContain('feedSource.map(user => withOwnEdits(withLazyPhotos(withFreshFeedCard(user))))');
  });
});
