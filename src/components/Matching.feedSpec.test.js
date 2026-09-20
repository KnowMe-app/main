import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('matching feed structure', () => {
  const matching = () => read('Matching.jsx');

  it('keeps the list/gallery choice under its own persisted key', () => {
    const source = matching();
    expect(source).toContain("const MATCHING_VIEW_LAYOUT_KEY = 'km.matching.view';");
    expect(source).toContain("const MATCHING_DEFAULT_VIEW_LAYOUT = 'list';");
    expect(source).toContain("localStorage.setItem(MATCHING_VIEW_LAYOUT_KEY, next);");
  });

  it('keeps the query in the URL and debounces it by 250ms', () => {
    const source = matching();
    expect(source).toContain('const MATCHING_SEARCH_DEBOUNCE_MS = 250;');
    // Імʼя параметра живе в одному місці на весь застосунок: форма створення
    // будує ним адресу повернення до видачі (`buildMatchingSearchPath`).
    expect(source).toContain('const MATCHING_QUERY_PARAM = MATCHING_SEARCH_QUERY_PARAM;');
    expect(source).toContain("from 'utils/matchingSearchLocation'");
    expect(source).toContain('debounceMs={MATCHING_SEARCH_DEBOUNCE_MS}');
  });

  it('builds every state of the list in one memo', () => {
    const source = matching();
    const memo = source.slice(
      source.indexOf('const filteredUsers = useMemo(() => {'),
      source.indexOf('const isSearching = searchQuery.trim().length > 0;'),
    );
    // Одна пам'ятка на всі стани списку — але не одне правило: чіпи описують,
    // кого показувати в деці, а запит називає конкретну людину, і ховати її за
    // типом профілю означало б відповісти «немає» на питання «де ось цей».
    expect(memo).toContain("if (viewMode === 'favorites' || viewMode === 'dislikes') return reactionTabUsers;");
    // Пошук і далі не звужується чіпами — але показується вікном, а не цілком:
    // 400 знайдених це 400 рядків у DOM і стільки ж гідратацій.
    expect(memo).toContain("if (viewMode === 'search') return searchRefinedUsers.slice(0, searchRevealCount);");
    expect(source).toContain('const feedSourceWithoutOwnEdits = filteredUsers;');
    // Поверх списку лягає лише власне доповнення читача — і лише там, де воно є:
    // порожня мапа віддає той самий масив, бо від нього залежать і гідратація
    // фото, і пагінація, і шар деталей.
    // Шар доповнення накладається і власний, і — в адміна — стос усіх авторів,
    // тож «накладати нічого» означає, що порожні обидві мапи.
    expect(source).toContain('const hasOverlays = Object.keys(ownOverlayFieldsByCardId).length');
    expect(source).toContain('|| Object.keys(stackedOverlaysByCardId).length;');
    expect(source).toContain('if (!hasOverlays) return feedSourceWithoutOwnEdits;');
    expect(source).toContain('return feedSourceWithoutOwnEdits.map(withOwnEdits);');
    expect(source).toContain('return applyOverlayToCard(user, fields);');
  });

  // Закриття шару повертає читача на ту саму картку. Піксель, знятий на
  // відкритті, для цього вже не годиться сам по собі: поки шар був відкритий,
  // у стрічку могла долягти чергова порція, а в рядках — догідратуватись фото,
  // тож висота списку над збереженою позицією вже інша. Орієнтир — рядок
  // картки; піксель лишається запасним.
  it('opens the detail layer over the feed with a history entry to pop', () => {
    const source = matching();
    expect(source).toContain("window.history.pushState({ matchingDetail: true }, '');");
    expect(source).toContain("window.addEventListener('popstate', handlePopState);");
    expect(source).toContain('const anchor = findCardNodeById(anchorId);');
    expect(source).toContain('if (savedTop) window.scrollTo(0, savedTop);');
  });

  it('never loads more from the detail layer, only from the feed sentinel', () => {
    const source = matching();
    const navigate = source.slice(
      source.indexOf('const navigateActiveProfile = React.useCallback'),
      source.indexOf('useEffect(() => {\n    if (!detailBounce)'),
    );
    expect(navigate).not.toContain('triggerEndOfDeckLoad');
    expect(navigate).toContain('setDetailBounce');
    expect(source).toContain("endOfDeckLoadRef.current('feed-sentinel');");
  });

  it('reaches diagnostics only through a lazy import behind the admin flag', () => {
    const source = matching();
    expect(source).toContain("const MatchingDiagnostics = React.lazy(() => import('./MatchingDiagnostics'));");
    expect(source).toContain("import('./MatchingDiagnostics')");
    expect(source).toContain('const showDiagnostics = diagnosticsEnabled && isAdmin && Boolean(diagnosticsModule);');
    // A static import would put the checks in every user's bundle.
    expect(source).not.toContain("from './MatchingDiagnostics'");
  });

  it('defers filter application to "Показати N"', () => {
    // Кнопка переїхала з підвалу шухляди в поповер рейки, але правило те
    // саме: зміна фільтра — чернетка, доки читач не закрив групу, а число на
    // кнопці рахується по кешу й не коштує жодного круга до бази.
    const source = matching();
    expect(source).toContain('const applyDraftFilters = React.useCallback(() => {');
    expect(source).toContain('applyCount={draftFilteredCount}');
    expect(source).toContain('onApply={applyDraftFilters}');
    expect(read('MatchingFilterRail.jsx')).toContain(
      "uiText('Показати {count}', language, { count: applyCount })"
    );
  });

  it('loads the public feed without an access-level guard', () => {
    const source = matching();
    expect(source).not.toContain('hasFullProfileAccessRef');
    expect(source).not.toContain('accessScopedOnly');
    expect(source).toContain('(isSearching ? [] : collectionChips).map');
  });
});

describe('matching row structure', () => {
  const rowStyles = () => read('MatchingHiddenList.styled.jsx');

  it('lines the metrics digits up down the whole list', () => {
    expect(rowStyles()).toContain('font-variant-numeric: tabular-nums;');
  });

  // Фото стоїть перед усім текстом і на всю ширину картки — саме його в
  // списку й гортають, а плиткою 52 px збоку воно не показувало нічого.
  // Пропорція портретна, а стеля висоти лишає на екрані й імʼя з метриками:
  // рядок не має коштувати гортання, щоб дізнатись, хто на фото. Малюється
  // фото й далі тільки коли воно є: запасний квадрат з ініціалами повторював
  // імʼя, що стоїть просто під ним.
  it('gives the photo the full card width, ahead of the text', () => {
    const styles = rowStyles();
    const photo = styles.slice(styles.indexOf('export const Photo = styled.div`'));
    expect(photo).toContain('aspect-ratio: 4 / 5;');
    expect(photo).toContain('max-height: 58vh;');
    // Від краю до краю картки: підкладку знімає відʼємний відступ на її
    // власне поле, а не окреме правило десь поруч.
    expect(photo).toContain(`margin: -\${CARD_PADDING} -\${CARD_PADDING} 9px;`);
    expect(photo).toContain('object-fit: cover;');
  });

  /*
   * Відступ від лівого краю в картці рівно один, і він під самим імʼям.
   *
   * Рядок метрик стояв у колонці поруч із фото — тобто зсунутим відносно всього,
   * що нижче: контактів, «усіх даних», нотаток, ряду рішень. Разом із плиткою
   * фото це давало в одній картці три різні ліві межі. Тепер метрики стоять під
   * шапкою, на всю ширину, і заразом перестали переноситись на третій рядок.
   */
  it('ставить метрики під шапкою, а не в колонці поруч із фото', () => {
    const row = read('ProfileRow.jsx');
    const top = row.indexOf('</S.Top>');
    expect(top).toBeGreaterThan(-1);
    expect(row.indexOf('<S.FactsRow>')).toBeGreaterThan(top);
    expect(row.slice(row.indexOf('<S.Body>'), top)).not.toContain('<S.FactsRow');
  });

  it('draws no avatar box at all when the profile has no photo', () => {
    const row = read('ProfileRow.jsx');
    expect(row).toContain('{photo && (');
    expect(row).not.toContain('{!photo && getInitials(name)}');
  });

  it('clamps a comment to two lines', () => {
    expect(rowStyles()).toContain('-webkit-line-clamp: 2;');
    expect(rowStyles()).not.toContain('-webkit-line-clamp: 3;');
  });

  it('spends the accent colour only on the favourite action', () => {
    const styles = rowStyles();
    const location = styles.slice(
      styles.indexOf('export const Location = styled.div`'),
      styles.indexOf('export const FactsRow'),
    );
    expect(location).not.toContain('--matching-accent');
    const rowAction = styles.slice(styles.indexOf('export const RowActionButton = styled.button`'));
    expect(rowAction).toContain('$accent');
  });
});

const ADMIN_UIDS = ['3LiD7JGCJTSJoVMU7fdR1ZrcIZH2', '0ghb1LphfASV0Y3b6J010v4CDyD2'];

describe('public comment storage', () => {
  it('keeps public records apart from the private per-owner note', () => {
    const config = read('config.js');
    expect(config).toContain("export const PUBLIC_COMMENTS_ROOT_PATH = 'comments';");
    expect(config).toContain("export const COMMENTS_ROOT_PATH = 'multiData/comments';");
    expect(config).toContain('export const PUBLIC_COMMENT_MAX_LENGTH = 2000;');
    expect(config).toContain("export const PUBLIC_COMMENT_REPLIES_ROOT_PATH = 'replies';");
  });

  it('lets only the author write, and freezes authorId and createdAt', () => {
    const rules = JSON.parse(read('../../database.rules.json'));
    const comment = rules.rules.comments.$profileId.$commentId;

    expect(rules.rules.comments['.read']).toBe('auth != null');
    expect(comment['.write']).toContain("data.child('authorId').val() === auth.uid");
    expect(comment['.write']).toContain("newData.child('authorId').val() === auth.uid");
    expect(comment.text['.validate']).toContain('newData.val().length >= 1');
    expect(comment.text['.validate']).toContain('newData.val().length <= 2000');
    // Друга межа — для перенесених відгуків, і вона теж межа: довший текст
    // приймається лише від адмінів і лише до 10000.
    expect(comment.text['.validate']).toContain('newData.val().length <= 10000');
    ADMIN_UIDS.forEach(uid => expect(comment.text['.validate']).toContain(uid));
    expect(comment.authorId['.validate']).toContain('data.val() === newData.val()');
    expect(comment.createdAt['.validate']).toContain('data.val() === newData.val()');
    expect(comment.visibility['.validate']).toBe("newData.val() === 'public'");
    expect(comment.$other['.validate']).toBe(false);
    expect(rules.rules.replies).toBeDefined();
  });

  // Перенесені відгуки (`utils/legacyImportCommentMigration`) написані людьми без
  // акаунта, тож автора їм ставить адмін. Це окремий шлях запису саме тому, що
  // звичайний `addPublicProfileComment` мусить і далі підписувати рівно того,
  // хто пише, — а дату перенесений відгук приносить свою, не годинника.
  it('records a comment for an author with no account only through the admin path', () => {
    const config = read('config.js');
    const fnBody = config.slice(
      config.indexOf('export const addPublicProfileCommentAs'),
      config.indexOf('export const updatePublicProfileComment'),
    );

    expect(fnBody).toContain('isAdminUid(user.uid)');
    // Межу довжини теж питає uid: перенесений відгук не мусить обриватись на
    // 2000 знаків, а межа звичайного коментаря не мусить зникати для всіх.
    expect(fnBody).toContain('resolvePublicCommentMaxLength(user.uid)');
    expect(config).toContain('export const PUBLIC_COMMENT_ADMIN_MAX_LENGTH = 10000;');
    expect(fnBody).toContain('authorId: resolvedAuthorId');
    expect(fnBody).not.toContain('serverTimestamp()');

    const ownAuthorBody = config.slice(
      config.indexOf('export const addPublicProfileComment ='),
      config.indexOf('export const addPublicProfileCommentAs'),
    );
    expect(ownAuthorBody).toContain('authorId: user.uid,');
  });
});
