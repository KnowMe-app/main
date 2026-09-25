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
    // Звужена дека питає джерело більшими сторінками: порція там — дві
    // картки після фільтрів, а не дві сирі.
    expect(matching()).toContain(
      'limit: feedFiltersNarrowedRef.current ? MATCHING_REFILL_LIMIT : MATCHING_THROTTLED_LOAD_BATCH,'
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

  // Відновлення позиції — не прокрутка донизу, і завести відлік воно не має
  // права. Орієнтир посувається на фактичну позицію, бо стати на рядок якоря
  // (`scrollIntoView`) — це вже не той піксель, що лежав у сховищі.
  it('не рахує відновлення позиції за жест читача', () => {
    const source = matching();
    const restore = source.slice(
      source.indexOf('    const settle = () => {'),
      source.indexOf('    const tryRestore = () => {'),
    );
    expect(restore).toContain('scrollPositionRef.current = window.scrollY;');
    expect(restore).toContain('restoreRef.current = true;');
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

  /* Ряд колекцій більше не несе чіпів фільтра.
   *
   * Вони там стояли разом із «Усі / Вподобані / Приховані», тобто дві
   * різні вісі (яка дека і які картки в ній) в одному ряду, ще й за «+N».
   * Тепер фільтри стоять своєю рейкою під ним — усі сім груп одразу,
   * нічого ховати за лічильник. */
  it('не змішує чіпи фільтра з чіпами колекцій', () => {
    const source = read('Matching.jsx');
    expect(source).not.toContain('setShowAllFilterChips');
    expect(source).not.toContain('visibleFilterChips');
    const row = source.slice(source.indexOf('<ChipsRow role="group"'), source.indexOf('</ChipsRow>'));
    expect(row).toContain('collectionChips).map');
    expect(row).not.toContain('resetFilterGroup');
  });
});

describe('публічні коментарі', () => {
  const matching = () => read('Matching.jsx');

  it('показує їх і у відкритій анкеті, не лише в рядку списку', () => {
    // Досі блок жив тільки в рядках стрічки: у самій анкеті була лише приватна
    // нотатка переглядача («Мій коментар»), і публічних коментарів не було видно.
    //
    // Тепер блок один на обидва місця: і відкрита анкета, і картка списку
    // показують те саме поле для власного відгуку, а прочитані чужі приїжджають
    // у нього ж. Окремого «гейта», який до читання малював замість поля напис,
    // більше немає.
    const source = matching();
    expect(source.match(/<PublicCommentBlock/g)).toHaveLength(2);
    expect(source).not.toContain('<PublicCommentsGate');
    expect(source).toContain('publicCommentSlot={(');
    expect(source).toContain("{profileUiText('publicComment', language)}");
  });

  // Дві доріжки нотаток стоять у картці будь-якої розкладки: розкладка міняє
  // те, як картку показують, а не те, що про людину вже записали. Поки плитка
  // галереї їх не мала, читач там не бачив власної нотатки — і дописував
  // поверх запису, якого не видно.
  it('показує обидві доріжки і в плитці галереї', () => {
    const source = matching();
    const tile = source.slice(source.indexOf('const GalleryCard'), source.indexOf('const Matching = () =>'));
    expect(tile).toContain('<ProfileNotes');
    expect(tile).toContain('publicSlot={reviewsSlot}');
    expect(tile).toContain('<CommentBlock');
    // Значка «перевірити відгуки» тут більше немає: дотик по плитці й так
    // відкриває картку повністю, а читання чужих починає прапорець
    // `hasPublicReview` картки, а не окремий жест.
    expect(tile).not.toContain('reviewsGateLabel');
  });

  // Нотатка видна всім показаним карткам, а не самій активній: інакше читач
  // дописував би поверх власного запису, якого не бачить. Ціна не росте з
  // кількістю карток — піддерево власника читається одним запитом.
  it('читає власні нотатки для обох розкладок', () => {
    expect(matching()).toContain("void loadCommentsFor(feedRows, { activeOnly: false });");
    expect(matching()).not.toContain("if (viewLayout !== 'list' || !feedRows.length) return;");
  });

  // Блок один, доріжки дві: приватна нотатка й публічний запис розділені не
  // рамкою, а підписом і смужкою, і приватне не може опинитись під виглядом
  // публічного.
  // Спільної шапки «Нотатки» над доріжками немає: підпис над кожною вже каже
  // і що це, і хто це побачить.
  //
  // Публічне стоїть **над** власним: відгук читають, а нотатку пишуть, і
  // відповідь має стояти над полем для власного запису. Поки порядок був
  // зворотний, читач писав свою нотатку, ще не побачивши, що про цю людину вже
  // написали інші. Той самий порядок — у рядку стрічки (`RowNotes`).
  it('тримає публічні коментарі окремо від приватної нотатки — і над нею', () => {
    const source = matching();
    const card = source.slice(
      source.indexOf('<NoteLanes>'),
      source.indexOf('</ModernProfileBody>'),
    );
    expect(card).toContain("{profileUiText('personalNote', language)}");
    expect(card).toContain("{profileUiText('publicComment', language)}");
    // Підказок «Бачите тільки ви» / «Бачать усі» більше немає.
    expect(card).not.toContain('Hint');
    expect(card.indexOf('{publicCommentSlot}'))
      .toBeLessThan(card.indexOf("profileUiText('personalNotePlaceholder', language)"));
  });

  it('читає коментарі відкритої анкети сама, а для стрічки — лише позначені прапорцем', () => {
    // Стрічка не питає коментарів усієї сторінки наперед: раніше вона брала їх
    // для цілої першої сторінки списку — запит на кожне відкриття стрічки
    // заради блока, під яким у більшості анкет порожньо. Тепер вона питає їх
    // сама, але вибірково — лише ті картки, чия проєкція вже несе прапорець
    // `hasPublicReview` (виставляють писачі коментарів у `config.js`), а не всі
    // підряд і не за кліком.
    const source = matching();
    const effect = source.slice(
      source.indexOf('const requestPublicComments = React.useCallback'),
      source.indexOf('const handleCreatePublicComment'),
    );
    expect(effect).toContain('fetchPublicProfileComments([id])');
    expect(effect).toContain('if (!ownerId || !detailOpen) return;');
    expect(effect).toContain('requestPublicComments(activeProfile?.userId);');
    expect(effect).not.toContain("viewLayout === 'list'");
    // Автопідвантаження — за прапорцем картки, а не за всім списком підряд.
    expect(effect).toContain('if (user?.[MATCHING_CARD_REVIEW_FLAG_FIELD]) requestPublicComments(user.userId);');
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
    expect(effect).toContain('throttledCycle.attempts >= maxAttempts');
    expect(effect).toContain('MATCHING_THROTTLED_LOAD_MAX_ATTEMPTS');
    // Під фільтрами порцію рахують картки, що пройшли фільтри.
    expect(effect).toContain('MATCHING_THROTTLED_FILTERED_MAX_ATTEMPTS');
  });

  // Відлік добігає нуля, картки лягають у кінець — і кінець списку виглядає так
  // само, як за секунду до того. Читач бачив блимання лічильника, а не
  // результат, і мусив прокручувати вгору, щоб дізнатись, чи щось приїхало.
  it('називає підсумок порції там, де щойно був відлік', () => {
    const source = matching();
    expect(source).toContain('const [lastBatchSummary, setLastBatchSummary] = useState(null);');
    expect(source).toContain('startPublicCardsLength: publicCardsLengthRef.current,');
    // Нуль — теж відповідь: «під ці фільтри більше нічого не підійшло».
    expect(source).toContain('added: Math.max(0, publicCardsLength - throttledCycle.startPublicCardsLength)');
    expect(source).toContain("Порція не дала нових карток");
    expect(source).toContain('MATCHING_BATCH_SUMMARY_VISIBLE_MS');
    expect(source).toContain("data-testid=\"feed-batch-summary\"");
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
    expect(source).toContain('usersRef.current.length + indexedPage.collected.length >= INITIAL_LOAD || !indexedHasMore');
    expect(source).toContain('usersRef.current.length + collected.length >= INITIAL_LOAD || sourceExhausted || !canLoadMore');
  });

  it('скидає готовність публічного вікна разом із декою під час застосування фільтрів', () => {
    const source = matching();
    const applyFilters = source.slice(
      source.indexOf('const applyFilters = React.useCallback'),
      source.indexOf('const handleFiltersChange = React.useCallback'),
    );
    expect(applyFilters).toContain("if (currentMode === 'default') {");
    expect(applyFilters).toContain('setInitialPublicWindowComplete(false);');
  });

  it('після вичерпання public добирає scoped-картки в межах тієї самої порції', () => {
    const source = matching();
    expect(source).toContain('while (scopedUsers.length < requestedLimit && additionalHasMoreRef.current');
    expect(source).toContain('pagedCardsLength - throttledCycle.startPagedCardsLength >= MATCHING_THROTTLED_LOAD_BATCH');
    expect(source).toContain('(!hasMore && !additionalHasMore)');
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
      source.indexOf('// Плитка галереї — це картка'),
    );
    expect(helper).toContain('MATCHING_CARD_ORDER_FIELD');
    expect(helper).toContain('if (!date || !userId) return null;');
  });
});

describe('дії та роль на картці стрічки', () => {
  it('дає плитці і кнопку «приховати», а не лише серце', () => {
    // Кнопки переїхали з фото в тіло плитки: поверх знімка вони жили тільки
    // тому, що іншого місця не було, — і плитка без фото лишалась без них.
    // Рахувати їх число не варто: поруч із двома реакціями там стоїть ще й
    // «Доповнити дані», і кожна нова дія ламала перевірку, яка про неї не
    // питає. Питання тут одне — чи є в плитці саме «приховати».
    const source = read('Matching.jsx');
    expect(source).toContain('<GalleryActionButton');
    expect(source).toContain("aria-label={uiText(isHidden ? 'Повернути зі схованих' : 'Приховати', language)}");
    expect(source).toContain('onToggleHidden={toggleRowHidden}');
  });

  it('дає те саме рядку списку', () => {
    const source = read('Matching.jsx');
    expect(source).toContain('secondaryAction={{');
    // Реакції рядка стоять унизу картки, під власною нотаткою, і в один ряд —
    // тому й перевіряється саме нижній ряд, а не стовпчик праворуч.
    const rowSource = read('ProfileRow.jsx');
    expect(rowSource).toContain('<S.RowFooterActions');
    expect(rowSource).toContain('{secondaryAction && (');
  });

  // Роль позначає дволітерний код, і той самий на обох виглядах: словом вона
  // казалась по-різному на кожному екрані й мінялась разом із мовою
  // інтерфейсу — «Донорка» в рядку, «Донорка яйцектилін» у відкритій картці,
  // «Donor» англійською. Плашка лишилась на знімку, чіпа під іменем немає.
  it('показує роль кодом на обох виглядах', () => {
    // Плитка галереї кладе роль на знімок тією самою плашкою, що й рядок.
    const gallerySource = read('Matching.jsx');
    expect(gallerySource).toContain('<PhotoRoleBadge $role={role}>{roleCode}</PhotoRoleBadge>');
    expect(gallerySource).toContain('{!photo && roleCode && <RowRoleCode $role={role}>{roleCode}</RowRoleCode>}');
    const rowSource = read('ProfileRow.jsx');
    expect(rowSource).toContain('<S.PhotoRoleBadge $role={rowRole}>{roleCode}</S.PhotoRoleBadge>');
    expect(rowSource).not.toContain('<S.RoleTag');
  });

  // Там, де знімка немає, плашці ролі нема на чому лежати — код переїжджає в
  // рядок імені. Це той самий код, що й на плашці, тож окремого компонента під
  // нього в плитці галереї немає й далі.
  it('ставить код у рядок імені там, де немає фото', () => {
    expect(read('Matching.jsx')).not.toContain('<GalleryRoleCode');
    expect(read('ProfileRow.jsx')).toContain('{!photo && roleCode && <S.RoleCode');
  });
});
