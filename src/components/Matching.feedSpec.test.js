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
    expect(source).toContain("const MATCHING_QUERY_PARAM = 'q';");
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
    expect(memo).toContain("if (viewMode === 'search') return visibleUsers;");
    expect(source).toContain("const feedSource = isSearching && searchTab === 'similar' ? similarUsers : filteredUsers;");
  });

  it('opens the detail layer over the feed with a history entry to pop', () => {
    const source = matching();
    expect(source).toContain("window.history.pushState({ matchingDetail: true }, '');");
    expect(source).toContain("window.addEventListener('popstate', handlePopState);");
    expect(source).toContain('requestAnimationFrame(() => window.scrollTo(0, savedTop));');
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
    const source = matching();
    expect(source).toContain('const applyDraftFilters = React.useCallback(() => {');
    expect(source).toContain('Показати {draftFilteredCount}');
  });

  it('loads the public feed without an access-level guard', () => {
    const source = matching();
    expect(source).not.toContain('hasFullProfileAccessRef');
    expect(source).not.toContain('accessScopedOnly');
    expect(source).toContain('(isSearching ? searchChips : collectionChips).map');
  });
});

describe('matching row structure', () => {
  const rowStyles = () => read('MatchingHiddenList.styled.jsx');

  it('lines the metrics digits up down the whole list', () => {
    expect(rowStyles()).toContain('font-variant-numeric: tabular-nums;');
  });

  it('pins the avatar box so no row differs in height', () => {
    const styles = rowStyles();
    const photo = styles.slice(styles.indexOf('export const Photo = styled.div`'));
    expect(photo).toContain('height: 58px;');
    expect(photo).toContain('min-height: 58px;');
    expect(photo).toContain('max-height: 58px;');
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
    expect(comment.authorId['.validate']).toContain('data.val() === newData.val()');
    expect(comment.createdAt['.validate']).toContain('data.val() === newData.val()');
    expect(comment.visibility['.validate']).toBe("newData.val() === 'public'");
    expect(comment.$other['.validate']).toBe(false);
    expect(rules.rules.replies).toBeDefined();
  });
});
