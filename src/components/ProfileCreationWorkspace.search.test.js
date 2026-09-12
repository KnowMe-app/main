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
    expect(source).toContain('Цей контакт уже є у вашій картці, що очікує перевірки.');
    expect(source).toContain('Відкрити чернетку');
  });

  it('prefills the new private card from the detected search field', () => {
    expect(source).toContain("const detected = detectSearchParams(typeof queryText === 'string' ? queryText : search)");
    expect(source).toContain('const nextDraft = { userId: cardId, ...initialSearchData }');
    expect(source).toContain('setDraft(nextDraft)');
  });

  it('shows which indexed keys are used to find existing cards', () => {
    expect(source).toContain("import { getSearchIdIndexedFields } from 'utils/searchKeyUtils'");
    expect(source).toContain('const PROFILE_SEARCH_ID_PREFIXES = getSearchIdIndexedFields()');
    expect(source).toContain("const PROFILE_SEARCH_KEYS = ['userId', ...PROFILE_SEARCH_ID_PREFIXES]");
    expect(source).toContain('const PROFILE_SEARCH_OPTIONS = { searchIdPrefixes: PROFILE_SEARCH_ID_PREFIXES }');
    expect(source).toContain('searchOptions={PROFILE_SEARCH_OPTIONS}');
    expect(source).toContain('Пошук карток виконується за ключами:');
  });
});
