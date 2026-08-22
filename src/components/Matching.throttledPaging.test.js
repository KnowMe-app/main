import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('пауза між сторінками стрічки — тільки для не-адміна', () => {
  const matching = () => read('Matching.jsx');

  it('вмикає відлік саме для не-адміна', () => {
    expect(matching()).toContain('const isThrottledFeedPaging = !isAdmin;');
  });

  it('лишає адмінові миттєве дозавантаження по сентинелу', () => {
    const source = matching();
    // Гілка спостерігача: не-адмін лише повідомляє про видимість, адмін вантажить.
    expect(source).toContain('if (isThrottledFeedPaging) {\n        setFeedEndVisible(isVisible);');
    expect(source).toContain("endOfDeckLoadRef.current('feed-sentinel');");
  });

  it('вантажить рівно домовлену порцію, коли відлік добіг нуля', () => {
    expect(matching()).toContain(
      "endOfDeckLoadRef.current('feed-countdown', { limit: MATCHING_THROTTLED_LOAD_BATCH });"
    );
  });

  it('показує відлік лише в кінці видимого списку і лише коли є що вантажити', () => {
    const source = matching();
    const gate = source.slice(
      source.indexOf('const showFeedLoadCountdown = Boolean('),
      source.indexOf('const handleThrottledFeedLoad'),
    );
    ['isThrottledFeedPaging', 'feedEndVisible', 'hasMore', '!loading', '!loadError', 'detailIndex === null']
      .forEach(condition => expect(gate).toContain(condition));
  });

  it('перезапускає відлік після кожної підвантаженої порції', () => {
    // `cycleKey` міняється разом з довжиною стрічки, і саме це змушує ефект
    // всередині відліку початися спочатку — звідси «і так далі».
    expect(matching()).toContain('cycleKey={renderedCardsLength}');
  });

  it('тримає тік у власному компоненті, а не в стані сторінки', () => {
    // Інакше стрічка перемальовувалась би щокадру: поведінку відліку перевіряє
    // FeedLoadCountdown.test.jsx, тут — що сторінка його не всмоктала назад.
    expect(matching()).toContain("import FeedLoadCountdown from './FeedLoadCountdown';");
    expect(matching()).not.toContain('const [remainingMs, setRemainingMs]');
  });
});

describe('пошук на matching', () => {
  it('бере префікси індексу з одного місця, а не з локального списку', () => {
    const source = read('Matching.jsx');
    expect(source).toContain(
      "import { MATCHING_SEARCH_ID_PREFIXES } from '../utils/matchingSearchPrefixes';"
    );
    expect(source).not.toContain("const MATCHING_SEARCH_ID_PREFIXES = ['phone']");
    expect(source).toContain('searchIdPrefixes: MATCHING_SEARCH_ID_PREFIXES,');
  });
});

describe('кеш проєкцій стрічки', () => {
  it('питає локальний кеш перед тим, як іти в бекенд', () => {
    const source = read('Matching.jsx');
    const hydrate = source.slice(
      source.indexOf('const hydrateMatchingFeedCards = React.useCallback('),
      source.indexOf('const fetchChunk = React.useCallback('),
    );
    expect(hydrate).toContain('getCachedMatchingSummaryCards(uniqueIds)');
    expect(hydrate).toContain('const idsToFetch = cachedSummaries.missingIds;');
    expect(hydrate).toContain('if (!idsToFetch.length) return { ...cachedSummaries.cards };');
    expect(hydrate).toContain('setCachedMatchingSummaryCards(cards);');
    // Режим «тільки бекенд» лишається способом обійти кеш повністю.
    expect(hydrate).toContain("const isBackendOnlyMode = matchingDataSourceMode === 'backend';");
  });
});

describe('ряд чіпів', () => {
  it('переносить чіпи замість того, щоб їх обрізати', () => {
    const styled = read('Matching.styled.jsx');
    const group = styled.slice(styled.indexOf('export const ChipsGroup'), styled.indexOf('export const Chip ='));
    expect(group).toContain('flex-wrap: wrap;');
    const chip = styled.slice(styled.indexOf('export const Chip ='), styled.indexOf('export const ChipCount'));
    // `0 1 auto` означав, що кожен зайвий чіп забирає ширину в усіх інших.
    expect(chip).toContain('flex: 0 0 auto;');
  });

  it('розгортає приховані чіпи на місці, а не веде в шухляду фільтрів', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('onClick={() => setShowAllFilterChips(true)}');
    expect(source).toContain('onClick={() => setShowAllFilterChips(false)}');
  });
});
