import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('пауза між сторінками стрічки — тільки для не-адміна', () => {
  const matching = () => read('Matching.jsx');

  it('вмикає відлік саме для не-адміна', () => {
    expect(matching()).toContain('const isThrottledFeedPaging = !access.isAdmin;');
  });

  it('лишає адмінові миттєве дозавантаження по сентинелу', () => {
    const source = matching();
    // Видимість кінця списку потрібна обом шляхам; вантажить одразу лише адмін.
    expect(source).toContain('setFeedEndVisible(isVisible);');
    expect(source).toContain('if (isThrottledFeedPaging || !isVisible) return;');
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
      source.indexOf('const canOfferMoreFeedCards = Boolean('),
      source.indexOf('const showFeedLoadCountdown ='),
    );
    ['isThrottledFeedPaging', 'feedEndVisible', 'deckHasMore', '!loading', '!loadError', 'detailIndex === null']
      .forEach(condition => expect(gate).toContain(condition));
  });

  it('вимагає прокрутки донизу, щоб завести відлік', () => {
    const source = matching();
    expect(source).toContain('const showFeedLoadCountdown = canOfferMoreFeedCards && scrolledDownSinceLoad;');
    expect(source).toContain('const showFeedLoadPrompt = canOfferMoreFeedCards && !scrolledDownSinceLoad;');
  });

  it('витрачає жест на порцію — наступна вимагає нового', () => {
    const source = matching();
    const handler = source.slice(
      source.indexOf('const handleThrottledFeedLoad = React.useCallback('),
      source.indexOf('const handleArmFeedPaging'),
    );
    // Знімається до запиту, інакше відлік перезапустився б сам, поки картки їдуть.
    expect(handler.indexOf('disarmFeedPaging()')).toBeLessThan(handler.indexOf('endOfDeckLoadRef.current'));
  });

  it('лишає спосіб попросити ще, коли стрічка коротша за екран', () => {
    // Тоді крутити нема чого, і жест лишався б недосяжним.
    expect(matching()).toContain('onClick={handleArmFeedPaging}');
  });

  it('перезапускає відлік після кожної підвантаженої публічної порції', () => {
    // `cycleKey` міняється разом з кількістю публічних карток, і саме це змушує ефект
    // всередині відліку початися спочатку.
    expect(matching()).toContain('cycleKey={publicCardsLength}');
  });

  it('тримає тік у власному компоненті, а не в стані сторінки', () => {
    // Інакше стрічка перемальовувалась би з кожним кроком відліку: поведінку
    // перевіряє FeedLoadCountdown.test.jsx, тут — що сторінка його не всмоктала.
    expect(matching()).toContain("import FeedLoadCountdown from './FeedLoadCountdown';");
    expect(matching()).not.toContain('const [remainingMs, setRemainingMs]');
  });
});

describe('стеля на порожні спроби не має бути глухим кутом', () => {
  const matching = () => read('Matching.jsx');

  it('повертає бюджет спроб на прокрутку донизу', () => {
    // Регресія: після двох порожніх спроб `runAutoLoadMore` виходив ще до
    // виклику `loadMore`, і стрічка стояла намертво до перезавантаження
    // сторінки. Стеля ловить самохідний цикл, а не живу людину, яка гортає.
    const source = matching();
    const handler = source.slice(
      source.indexOf("window.history.scrollRestoration = 'manual';"),
      source.indexOf("window.addEventListener('scroll', handleScroll"),
    );
    expect(handler).toContain('if (nextY <= previousY) return;');
    expect(handler).toContain('emptyAutoLoadMoreAttemptsRef.current = 0;');
  });

  it('дає адмінові повторну спробу на прокрутку, бо перетин уже не спрацює', () => {
    // Кінець списку вже видно, тож нової події перетину не буде: без цього
    // стрічка стояла б, доки читач не перезавантажить сторінку.
    const source = matching();
    const effect = source.slice(
      source.indexOf('if (isThrottledFeedPaging || !scrolledDownSinceLoad) return;'),
      source.indexOf("endOfDeckLoadRef.current('feed-scroll');"),
    );
    expect(effect).toContain('if (!feedEndVisible || !deckHasMore || loading || detailIndex !== null) return;');
    // Жест витрачається: одна прокрутка донизу — одна спроба.
    expect(effect).toContain('scrolledDownSinceLoadRef.current = false;');
  });

  it('каже вголос, що порція не дала карток, замість мовчазного відліку', () => {
    // Відлік, після якого нічого не змінюється, читається як зламана сторінка.
    const source = matching();
    expect(source).toContain('setLastLoadAddedNothing(visibleAdded === 0);');
    expect(source).toContain('Минула порція не дала нових карток');
  });

  it('не рахує відновлення позиції за жест читача', () => {
    const source = matching();
    const restore = source.slice(
      source.indexOf('window.scrollTo(0, Number(savedY));'),
      source.indexOf('restoreRef.current = true;'),
    );
    expect(restore).toContain('scrollPositionRef.current = Number(savedY);');
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

describe('публічні коментарі', () => {
  const matching = () => read('Matching.jsx');

  it('показує їх і у відкритій анкеті, не лише в рядку списку', () => {
    // Досі блок жив тільки в рядках стрічки: у самій анкеті була лише приватна
    // нотатка переглядача («Мій коментар»), і публічних коментарів не було видно.
    const source = matching();
    expect(source.match(/<PublicCommentBlock/g)).toHaveLength(2);
    expect(source).toContain('publicCommentSlot={(');
    expect(source).toContain('<ModernSectionTitle>Public comment</ModernSectionTitle>');
  });

  it('тримає публічні коментарі окремо від приватної нотатки', () => {
    const source = matching();
    const card = source.slice(
      source.indexOf('<ModernSectionTitle>My personal comment</ModernSectionTitle>'),
      source.indexOf('</ModernProfileBody>'),
    );
    expect(card).toContain('placeholder="Мій приватний коментар / пам\'ятка для себе"');
    expect(card.indexOf('placeholder="Мій приватний коментар / пам\'ятка для себе"'))
      .toBeLessThan(card.indexOf('{publicCommentSlot}'));
  });

  it('читає коментарі для відкритої анкети, а не тільки для списку', () => {
    // Раніше ефект виходив на `detailOpen`, тож у відкритій анкеті читати не було
    // чого — і в галереї, звідки анкету теж відкривають, поготів.
    const source = matching();
    const effect = source.slice(
      source.indexOf('const visibleIds = detailOpen'),
      source.indexOf('fetchPublicProfileComments(pendingIds)'),
    );
    expect(effect).toContain('[activeProfile?.userId]');
    expect(effect).toContain("viewLayout === 'list'");
  });
});

describe('одна порція — один жест, і рівно дві картки', () => {
  const matching = () => read('Matching.jsx');

  it('добирає до обіцяної порції в межах того самого циклу', () => {
    // `loadMore` рахує те, що віддало джерело; фільтри показу проріджують його
    // ще раз, і ряд галереї виходив напівпорожній — одна картка замість двох.
    const source = matching();
    const effect = source.slice(
      source.indexOf('if (!isThrottledFeedPaging || !throttledCycle || loading) return;'),
      source.indexOf("endOfDeckLoadRef.current('feed-countdown-topup'"),
    );
    expect(effect).toContain('publicCardsLength >= throttledCycle.target');
    // Зі стелею на спроби, інакше добір сам став би потоком.
    expect(effect).toContain('throttledCycle.attempts >= MATCHING_THROTTLED_LOAD_MAX_ATTEMPTS');
  });

  it('ховає відлік і запрошення, поки цикл ще добирає', () => {
    const source = matching();
    const gate = source.slice(
      source.indexOf('const canOfferMoreFeedCards = Boolean('),
      source.indexOf('const showFeedLoadCountdown ='),
    );
    expect(gate).toContain('!throttledCycle');
  });
});

describe('перше публічне вікно не змішується з власними чернетками', () => {
  const matching = () => read('Matching.jsx');

  it('відкриває чернетки лише після десяти публічних карток або вичерпання matchingCards', () => {
    const source = matching();
    expect(source).toContain('const [initialPublicWindowComplete, setInitialPublicWindowComplete] = useState(false);');
    expect(source).toContain('initialPublicWindowComplete ? personalCreateProfiles : EMPTY_USERS');
    expect(source).toContain('cachedPublicCount + res.users.length >= INITIAL_LOAD || sourceExhausted');
  });

  it('рахує наступну порцію від публічних карток, а не від повної деки', () => {
    const source = matching();
    expect(source).toContain('const publicCardsLength = viewMode === \'default\' ? publicVisibleUsers.length : renderedCardsLength;');
    expect(source).toContain('targetVisibleCount: publicCardsLength + visibleBuffer');
    expect(source).toContain('publicCardsLengthRef.current + MATCHING_THROTTLED_LOAD_BATCH');
    expect(source).not.toContain('renderedCardsLengthRef');
  });
});

describe('самохідні шляхи дозавантаження не обходять відлік', () => {
  const matching = () => read('Matching.jsx');

  it('глушить дозаправку, поки на екрані є хоч одна картка', () => {
    // Дозаправка перезапускалась на кожну зміну `filteredUsers` і вважала
    // приводом те, що фільтри зрізали пару карток — а зрізають вони їх щоразу.
    // Виходив потік, що йшов повз відлік.
    expect(matching()).toContain('if (isThrottledFeedPaging && filteredUsers.length > 0) {');
  });

  it('глушить тригер останньої картки', () => {
    // На стрічці з однієї картки активний індекс одразу дорівнює останньому.
    const source = matching();
    const effect = source.slice(
      source.indexOf('const lastRenderedIndex = renderedCardsLength - 1;') - 400,
      source.indexOf('const lastRenderedIndex = renderedCardsLength - 1;'),
    );
    expect(effect).toContain('if (isThrottledFeedPaging) return;');
  });

  it('оголошує прапорець до ефектів, які його читають', () => {
    // Інакше список залежностей ефекту звертався б до нього в TDZ.
    const source = matching();
    expect(source.indexOf('const isThrottledFeedPaging = !access.isAdmin;'))
      .toBeLessThan(source.indexOf('refillBlockedReason: \'throttled-paging-owned-by-countdown\''));
  });
});

describe('перший екран зі стрічкового кеша', () => {
  const matching = () => read('Matching.jsx');

  it('не перечитує з бекенду те, що щойно намалював з кеша', () => {
    const source = matching();
    expect(source).not.toContain('// continue to fetch latest data to refresh cache');
    expect(source).toContain('if (filteredCached.length >= INITIAL_LOAD && cursorFromCache) {');
    expect(source).toContain('setLastKey(cursorFromCache);');
  });

  it('будує курсор наступної сторінки з останньої кешованої картки', () => {
    // Пагінація джерела курсорна: пара (lastLogin2, userId) лежить прямо в
    // картці, тож питати її в бекенду немає за чим.
    const source = matching();
    const helper = source.slice(
      source.indexOf('export const buildMatchingCursorFromCard'),
      source.indexOf('const countChangedMatchingFilterGroups'),
    );
    expect(helper).toContain('MATCHING_CARD_ORDER_FIELD');
    expect(helper).toContain('if (!date || !userId) return null;');
  });
});

describe('дії та роль на картці стрічки', () => {
  it('дає плитці і кнопку «приховати», а не лише серце', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('<GalleryHideButton');
    expect(source).toContain('onToggleHidden={toggleRowHidden}');
  });

  it('дає те саме рядку списку', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('secondaryAction={{');
    expect(read('ProfileRow.jsx')).toContain('{secondaryAction && !isLimited && (');
  });

  it('показує дволітерний код ролі на обох виглядах', () => {
    expect(read('Matching.jsx')).toContain('<GalleryRoleCode');
    expect(read('ProfileRow.jsx')).toContain('<S.RoleCode');
  });
});
