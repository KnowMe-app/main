const fs = require('fs');
const path = require('path');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

/**
 * Незалогінена вкладка на `/matching`.
 *
 * Правила бази відкривають навіть картку стрічки лише авторизованому, тож
 * запит без uid повертає `Permission denied`. Відмову ніхто не рахував за
 * витрачену спробу, `hasMore` лишався `true` — і довантаження питало знову й
 * знову: відкритий сокет до бази й десятки запитів на секунду, а на екрані
 * вічний скелетон із написом «Owner not found».
 *
 * Межа входу стоїть на маршруті (`RequireAuth`), але ці гарди — окремий
 * висновок того самого: сесія протухає й посеред перегляду, вже після того, як
 * екран змонтувався.
 */
describe('Matching stops the deck when there is no signed-in viewer', () => {
  it('loadMore refuses to page without a viewer and closes hasMore', () => {
    const source = sliceBetween(
      matchingSource(),
      '  const loadMore = React.useCallback',
      '  const visibleUsers = useMemo',
    );

    expect(source).toContain('if (!getOwnerId()) {');
    expect(source).toContain("markBlockedLoadMore('blocked-no-viewer'");
    expect(source).toContain('hasMoreRef.current = false;');
    expect(source).toContain('additionalHasMoreRef.current = false;');
    expect(source).toContain('setHasMore(false);');
    expect(source).toContain('setLoading(false);');
  });

  it('loadInitial refuses to start without a viewer', () => {
    const source = sliceBetween(
      matchingSource(),
      '  const loadInitial = React.useCallback',
      '  const reloadDefault = React.useCallback',
    );

    expect(source).toContain('if (!getOwnerId()) {');
    expect(source).toContain("writeMatchingDebugLog('initialLoad:blocked:noViewer'");
    expect(source).toContain('setHasMore(false);');
    expect(source).toContain('setLoading(false);');
  });

  // Вихід із сесії — це не «деку ще не гортали»: скид, який ставив `hasMore`
  // назад у `true`, сам і заводив цикл запитів без прав.
  it('signing out closes the deck instead of reopening it', () => {
    const source = matchingSource();
    expect(source).toContain('resetAdditionalMatchingState({ resetHasMore: false, resetLoading: true });');
    expect(source).not.toContain('resetAdditionalMatchingState({ resetHasMore: true, resetLoading: true });');
  });

  // Стеля порожніх спроб стереже самохідний цикл — але рахувала лише порожні
  // відповіді. Відмова летіла повз `.then`, лічильник стояв, стеля не
  // спрацьовувала ніколи.
  it('a failed page counts against the auto-load ceiling', () => {
    const source = sliceBetween(
      matchingSource(),
      '  const runAutoLoadMore = React.useCallback',
      '  const triggerEndOfDeckLoad = React.useCallback',
    );

    expect(source).toContain('const countAutoLoadMoreAttempt = visibleAdded =>');
    expect(source).toContain('}).catch(error => {');
    expect(source).toContain('countAutoLoadMoreAttempt(0);');
  });

  // «Owner not found» був англійським рядком у коді, ні про що не казав і не
  // давав звідси виходу.
  it('a viewerless feed says so in the interface language and offers the way in', () => {
    const source = matchingSource();
    expect(source).not.toContain("'Owner not found'");
    expect(source).toContain("uiText('Щоб бачити анкети, увійдіть у застосунок', language)");
    expect(source).toContain('navigate(LOGIN_ROUTE, { state: { returnTo: buildReturnToFromLocation(routeLocation) } })');
  });
});
