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

  it('нова видача починається з першої порції і без чужого дофільтра', () => {
    const source = matching();
    expect(source).toContain('setSearchRefineValue(null);');
    expect(source).toContain(
      'setSearchRevealCount(isThrottledFeedPaging ? MATCHING_THROTTLED_LOAD_BATCH : LOAD_MORE);'
    );
  });

  it('коментарі читаються для того, що на екрані, а не для всієї видачі', () => {
    expect(matching()).toContain('void loadCommentsFor(filtered.slice(0, FEED_PHOTO_HYDRATION_LIMIT));');
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
