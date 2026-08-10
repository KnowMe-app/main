import fs from 'fs';
import path from 'path';

describe('ProfileCreationWorkspace search-before-create flow', () => {
  const source = fs.readFileSync(path.join(__dirname, 'ProfileCreationWorkspace.jsx'), 'utf8');

  it('reuses Matching search primitives and blocks creation until a completed not-found search', () => {
    expect(source).toContain("import { auth, fetchUserById, searchUsersOnly } from './config'");
    expect(source).toContain("import SearchBar, { detectSearchParams } from './SearchBar'");
    expect(source).toContain('searchFunc={searchUsersOnly}');
    expect(source).toContain('onSearchError={() => {');
    expect(source).toContain('!searchExecuted || !searchNotFound || searchFailed || searchResults.length > 0');
  });

  it('prefills the new private card from the detected search field', () => {
    expect(source).toContain('const detected = detectSearchParams(search)');
    expect(source).toContain('setDraft({ userId: cardId, ...initialSearchData })');
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
