import fs from 'fs';
import path from 'path';

describe('ProfileCreationWorkspace search-before-create flow', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('reuses Matching search primitives and keeps creation available once a search completed', () => {
    expect(source).toContain("import { addMatchingSearchQuery, auth, fetchDislikeUsers, fetchFavoriteUsers, fetchUserById, fetchUsersByIds, readProfileFromNodes, searchUsersOnly } from './config'");
    expect(source).toContain("import SearchBar, { detectSearchParams } from './SearchBar'");
    expect(source).toContain('searchFunc={searchUsersOnly}');
    expect(source).toContain('onSearchError={() => {');
    // Знайдене більше не вимикає створення: дубль стереже зайнятість контакту
    // в базі, а не ця кнопка. Вимикає її лише незавершений чи впалий пошук.
    expect(source).toContain("disabled={!search.trim() || !searchExecuted || searchLoading || searchFailed}");
    expect(source).toContain('onSearchSettled={() => setSearchLoading(false)}');
  });

  it('records every executed search in the shared search history, like Matching and AddNewProfile', () => {
    expect(source).toContain('addMatchingSearchQuery(value)');
  });

  it('offers to reopen every matching own draft instead of creating a duplicate', () => {
    expect(source).toContain('findMatchingProfileMutations(mutations, detectSearchParams(search))');
    expect(source).toContain('Ваша чернетка, чекає на перевірку');
  });

  it('prefills the new private card from the detected search field', () => {
    expect(source).toContain("const detected = detectSearchParams(typeof queryText === 'string' ? queryText : search)");
    expect(source).toContain('const nextDraft = { userId: cardId, ...initialSearchData }');
    expect(source).toContain('setDraft(nextDraft)');
  });

  // Пошук і далі ходить по індексованих полях — але перелік ключів більше не
  // стоїть на екрані: він відповідав на питання, якого читач не ставив, і разом
  // із памʼяткою про чернетки з'їдав увесь перший екран. Лишився рядок пошуку й
  // один рядок пояснення.
  it('searches the indexed keys without explaining the index on screen', () => {
    expect(source).toContain("import { getSearchIdIndexedFields } from 'utils/searchKeyUtils'");
    expect(source).toContain('const PROFILE_SEARCH_ID_PREFIXES = getSearchIdIndexedFields()');
    expect(source).toContain('const PROFILE_SEARCH_OPTIONS = { searchIdPrefixes: PROFILE_SEARCH_ID_PREFIXES }');
    expect(source).toContain('searchOptions={PROFILE_SEARCH_OPTIONS}');
    expect(source).not.toContain('Пошук карток виконується за ключами:');
    expect(source).not.toContain('Технічні деталі пошуку');
    expect(source).toContain('Почніть із відомого контакту людини');
  });

  // Відповідь «такої ще немає» — перший рядок видачі, а не кнопка під трьома
  // абзацами підказок у кінці екрана: розкладка тут та сама, що й у стрічці.
  it('offers the new card as the first row of the results, the way the feed does', () => {
    expect(source).toContain('<QueryDraftCard data-testid="query-draft-card">');
    expect(source).toContain('const queryDraft = useMemo(() => {');
    expect(source).toContain("const detected = detectSearchParams(trimmed);");
    expect(source).toContain('onClick={() => startNew(search, { allowContactPrefill: !hasExistingMatches })}');
  });

  // Екран називається власними картками — і показує їх, а не порожнечу, поки
  // в рядку пошуку нічого не набрано.
  it('lists the cards this user created when nothing is typed yet', () => {
    expect(source).toContain('loadOwnProfileMutations(userId, { includeAccepted: true })');
    expect(source).toContain('setOwnCreatedCards(items)');
    expect(source).toContain('<span>Мої картки</span>');
    expect(source).toContain('Ви ще не завели жодної картки.');
  });
});
