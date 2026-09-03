import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

/**
 * Видача пошуку більше не приїжджає одним шматком.
 *
 * Раніше `applySearchResults` ставив `hasMore = false`, тож `deckHasMore` у
 * режимі `search` був хибний завжди: сентінел мовчав, `FeedLoadCountdown` не
 * показувався ніколи, а `feedRows` рендерив усі знайдені картки одразу. На
 * запиті, що дає сотні влучань, це були сотні рядків у DOM — і стільки ж
 * повних анкет, прочитаних наперед однією хвилею.
 */
describe('видача пошуку гортається так само, як стрічка', () => {
  const matching = () => read('Matching.jsx');

  it('на екран іде вікно видачі, а не вся видача', () => {
    expect(matching()).toContain(
      "if (viewMode === 'search') return searchRefinedUsers.slice(0, searchRevealCount);"
    );
  });

  it('кінець видачі — така сама причина показати відлік, як і кінець стрічки', () => {
    expect(matching()).toContain(
      "const deckHasMore = hasMore || (viewMode === 'default' && additionalHasMore) || searchHasMore;"
    );
  });

  it('наступна порція видачі — зсув вікна, а не запит у бекенд', () => {
    // Усе знайдене вже в руках: платити за порцію треба гідратацією фото,
    // коментарів і анкети, а не новою сторінкою.
    const loader = matching().slice(
      matching().indexOf('const triggerEndOfDeckLoad = React.useCallback('),
      matching().indexOf("if (viewMode !== 'default' && viewMode !== 'favorites' && viewMode !== 'dislikes') return;"),
    );

    expect(loader).toContain("if (viewMode === 'search') {");
    expect(loader).toContain('setSearchRevealCount(current => Math.min(current + step, searchRevealTargetRef.current));');
  });

  it('перший результат — повний екран, а не порція відліку', () => {
    // Дві картки на старті — це не притишення, а порожня сторінка: відлік
    // стереже довгий скрол, а не перше враження про видачу.
    const source = matching();
    expect(source).toContain('useState(MATCHING_FIRST_PAGE_BATCH)');
    expect(source).toContain('setSearchRevealCount(MATCHING_FIRST_PAGE_BATCH);');
    expect(source).toContain('const INITIAL_LOAD = MATCHING_FIRST_PAGE_BATCH;');
  });

  it('дозавантаження лишається притишеним кроком', () => {
    // Перша порція виросла, ціна довгого скролу — ні.
    const source = matching();
    expect(source).toContain("endOfDeckLoadRef.current('feed-countdown', { limit: MATCHING_THROTTLED_LOAD_BATCH });");
    expect(source).toContain('`Показати ще ${MATCHING_THROTTLED_LOAD_BATCH}`');
  });

  it('уточнення переживає новий запит — воно умова, а не сито', () => {
    // Скидання на кожному «Знайшов» означало б ставити уточнення заново на
    // кожній видачі, ще й устигаючи це зробити раніше, ніж відлік почне
    // видавати картки по дві. Значення описує не цю видачу, а те, що читачеві
    // цікаво, — тож воно й лишається.
    const source = matching();
    const applier = source.slice(
      source.indexOf('const applySearchResults = async res => {'),
      source.indexOf('useEffect(() => {\n    filtersRef.current = filters;'),
    );

    expect(applier).not.toContain('setSearchRefineValue(null)');
    expect(applier).toContain(
      'const { key: activeRefineKey, value: activeRefineValue } = refineStateRef.current;'
    );
    expect(applier).toContain(
      'const refined = applyRefineSelection(filtered, activeRefineKey, activeRefineValue);'
    );
    expect(applier).toContain('searchRevealTargetRef.current = refined.length;');
  });

  it('видача, з якої уточнення прибрало все, називає причину', () => {
    // Інакше мовчазне «Немає доступних профілів» читалось би як «не знайшов» —
    // рівно той страх, заради якого уточнення колись скидали на кожному пошуку.
    expect(matching()).toContain(
      'if (isSearching && searchRefineValue && visibleUsers.length > 0) {'
    );
  });

  it('коментарі читаються для того, що на екрані, а не для всієї видачі', () => {
    // На екран іде вже звужене, тож і читати коментарі для відсіяного нема за що.
    expect(matching()).toContain('void loadCommentsFor(refined.slice(0, FEED_PHOTO_HYDRATION_LIMIT));');
  });

  it('«Знайдено» рахує всю видачу, а не її вікно', () => {
    // Інакше чіп казав би «Знайдено 2» на чотирьохстах знайдених.
    expect(matching()).toContain('count: searchRefinedUsers.length,');
  });
});

/**
 * Видача малюється карткою, а анкета читається на дотик.
 *
 * `readProfileFromNodes` — це чотири вузли плюс рівень доступу плюс дві мапи
 * `multiData` на кожен знайдений id. Картка `matchingCards/{id}` — один вузол
 * на два порядки менший, і саме він малює рядок.
 */
describe('пошук matching просить картку, а не анкету', () => {
  it('сторінка вмикає це явно, а не покладається на дефолт пошуку', () => {
    expect(read('Matching.jsx')).toContain('cardsOnly: true,');
  });

  it('картки може не бути — тоді читається анкета, а знайдене не губиться', () => {
    const config = read('config.js');
    const hydrator = config.slice(
      config.indexOf('const addCardHit = async (userId, users) => {'),
      config.indexOf('const resolveSearchHitAdder'),
    );

    expect(hydrator).toContain('await addSearchHit(userId, users);');
  });

  it('проєкція не лягає в кеш карток — інакше прізвище назавжди стало б ініціалом', () => {
    // `updateCard` зливає нове поверх старого, а `sanitizeMatchingCardForCache`
    // знімає позначку `__matchingSummary` — тобто догідратувати таку картку вже
    // нема за чим. Та сама сторожа стоїть на всіх шляхах стрічки.
    expect(read('Matching.jsx')).toContain('const cacheable = filtered.filter(shouldCacheMatchingCard);');
    expect(read('SearchBar.jsx')).toContain('const updatedArr = skipCardCacheWrite ? arr : arr.map(u => updateCard(u.userId, u));');
  });

  it('id запиту кешуються лише разом із картками', () => {
    // Інакше наступний той самий запит узяв би з кеша ту частину, що потрапила
    // туди іншим шляхом, і мовчки віддав би менше, ніж знайшов.
    expect(read('Matching.jsx')).toContain('if (cacheable.length === filtered.length) {');
    expect(read('SearchBar.jsx')).toContain('if (key && value && !skipCardCacheWrite) {');
  });

  it('урізаний читач лишається на урізаній проєкції попри прохання сторінки', () => {
    // Межа приватності не залежить від того, що зручніше сторінці.
    const config = read('config.js');
    const chooser = config.slice(
      config.indexOf('const resolveSearchHitAdder'),
      config.indexOf('const searchBySearchIdUsers'),
    );

    expect(chooser.indexOf('if (limitedFields) return addLimitedUser;'))
      .toBeLessThan(chooser.indexOf('return cardsOnly ? addCardHit : addSearchHit;'));
  });
});

/**
 * Той самий пошук удруге не коштує нічого.
 *
 * Видача `cardsOnly` — це проєкції, і в загальний кеш карток їх класти не можна
 * (вони замістили б повну анкету десятком полів). Доти, доки в них не було
 * власного кеша, це означало, що повторення того самого запиту читало з
 * бекенду всі знайдені картки заново — на «Анні» це чотириста читань.
 */
describe('видача пошуку кешується і читається з кеша', () => {
  const matching = () => read('Matching.jsx');

  it('спершу кеш проєкцій, і лише потім мережа', () => {
    const source = matching();
    const searcher = source.slice(
      source.indexOf('const searchUsers = async (params, options = {}) => {'),
      source.indexOf('const res = await searchUsersOnly(params, options);'),
    );

    expect(searcher).toContain('const cachedEntry = getIndexIdsByQuery(summaryCacheKey);');
    expect(searcher).toContain('const hydrated = await hydrateMatchingFeedCards(cachedIds);');
  });

  it('неповний кеш добирає лише те, чого бракує, а не всю видачу', () => {
    // `hydrateMatchingFeedCards` читає з бекенду рівно ті id, чиєї проєкції в
    // кеші немає; решта лишається локальною.
    const source = matching();
    expect(source).toContain('const cards = cachedIds.map(id => hydrated?.[id]).filter(Boolean);');
    expect(source).toContain('if (cards.length === cachedIds.length) {');
  });

  it('видача лягає і в кеш проєкцій, і в список id запиту', () => {
    const source = matching();
    expect(source).toContain("setIndexIdsForQuery(summaryCacheKey, filtered.map(u => u.userId), { complete: true });");
    expect(source).toContain('filtered.filter(isMatchingSummaryCard).map(u => [u.userId, u]),');
  });

  it('зміна анкети скидає кешовану видачу — інакше щойно заведену не знайти', () => {
    const config = read('config.js');
    // Створення, збереження й видалення анкети: усі три пишуть у `searchId`.
    expect(config.split('clearMatchingSearchResultCache();').length - 1).toBe(3);
  });

  it('картку, яку вже відкривали, вдруге з бекенду не читають', () => {
    const source = matching();
    const opener = source.slice(
      source.indexOf('const ensureFullProfile = React.useCallback(user => {'),
      source.indexOf('const withLazyPhotos = React.useCallback('),
    );

    expect(opener).toContain('const cached = getCompleteCachedProfile(userId);');
    expect(opener.indexOf('const cached = getCompleteCachedProfile(userId);'))
      .toBeLessThan(opener.indexOf('fetchUsersByIds([userId])'));
  });
});

/**
 * Дофільтр у стрічці не заводить другої моделі стану.
 */
describe('дофільтр у стрічці пише в наявні фільтри', () => {
  it('тап звужує групу шухляди, а не окремий стан сторінки', () => {
    expect(read('Matching.jsx')).toContain(
      'setFilterGroupSelect(previous => ({ token: previous.token + 1, name: spec.filterName, value }));'
    );
  });

  it('активне значення виводиться з фільтрів, а не зберігається окремо', () => {
    // Інакше рядок і шухляда розійшлися б від першого дотику до другої.
    const source = read('Matching.jsx');
    const derived = source.slice(
      source.indexOf('const feedRefineValue = useMemo(() => {'),
      source.indexOf('const refineActiveValue'),
    );

    expect(derived).toContain('const group = filters?.[spec.filterName];');
    expect(derived).toContain('return enabled.length === 1 ? enabled[0] : null;');
  });

  it('«лише це значення» вміє й сама панель фільтрів', () => {
    const panel = read('FilterPanel.jsx');
    expect(panel).toContain('const prevGroupSelectTokenRef = useRef(groupSelectToken);');
    expect(panel).toContain('(acc, option) => ({ ...acc, [option]: option === groupSelectValue }),');
  });
});
