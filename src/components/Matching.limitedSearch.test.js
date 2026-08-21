import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const rules = JSON.parse(read('../../database.rules.json')).rules;

const limitedProfileFields = (() => {
  const source = read('config.js');
  const line = source.slice(source.indexOf('export const LIMITED_PROFILE_FIELDS = ['));
  const literal = line.slice(line.indexOf('['), line.indexOf(']') + 1);
  // eslint-disable-next-line no-eval
  return eval(literal);
})();

describe('limited search projection', () => {
  it('projects surname, name, age, region and city', () => {
    // "Age" is stored as the birth date and computed for display, so `birth` is
    // what the projection has to carry.
    expect(limitedProfileFields.sort()).toEqual(['birth', 'city', 'name', 'region', 'surname']);
  });

  it.each(['users', 'newUsers'])('opens exactly those fields on %s/$uid and nothing more', collection => {
    const uidRules = rules[collection].$uid;
    const openedFields = Object.keys(uidRules)
      .filter(key => !key.startsWith('.'))
      .filter(key => uidRules[key]['.read'] === 'auth != null');

    // The rules are the enforcement; the field list is only what the client asks
    // for. If they drift apart the projection silently gains or loses a field.
    expect(openedFields.sort()).toEqual(limitedProfileFields.sort());
    expect(Object.keys(uidRules).filter(key => !key.startsWith('.')).sort())
      .toEqual(limitedProfileFields.sort());
  });

  it.each(['users', 'newUsers'])('leaves %s node-level reads gated as before', collection => {
    const nodeRead = rules[collection].$uid['.read'];
    expect(nodeRead).toContain('auth.uid == $uid');
    expect(nodeRead).not.toBe('auth != null');
    // The collection root - what a query would need - stays behind matching access.
    expect(rules[collection]['.read']).toContain("accessLevel').val().contains('matching')");
  });

  it('lets any signed-in user resolve one searchId key but not scan the index', () => {
    expect(rules.searchId.$key['.read']).toBe('auth != null');
    // No read at the searchId root: a lookup needs the exact value, so the index
    // cannot be enumerated.
    expect(rules.searchId['.read']).toBeUndefined();
  });

  it('keeps a limited search off the paths its viewer cannot read', () => {
    const config = read('config.js');
    expect(config).toContain("const isBroadTextSearchEnabled = Boolean(enabledSearchKeys?.broadTextSearch) && !limitedFields;");
    expect(config).toContain("const searchIdOptions = limitedFields\n    ? { ...baseSearchIdOptions, includePrefixMatches: false }");
    expect(config).toContain('const addHit = limitedFields ? addLimitedUser : addUserFromUsers;');
  });

  it('keeps limited hits out of the shared card cache', () => {
    expect(read('SearchBar.jsx')).toContain(
      'const skipCache = Boolean(extraOptions?.limitedFields ?? searchOptions?.limitedFields);'
    );
    expect(read('Matching.jsx')).toContain('const isLimited = Boolean(options?.limitedFields);');
  });

  it('asks for the projection exactly when the viewer lacks full access', () => {
    const matching = read('Matching.jsx');
    expect(matching).toContain('const hasFullProfileAccess = access.isAdmin || access.canAccessMatching;');
    expect(matching).toContain('limitedFields: !hasFullProfileAccess,');
  });

  it('offers search to every signed-in viewer', () => {
    const app = read('App.jsx');
    expect(app).toContain('<Route path="/matching" element={<Matching />} />');
    expect(app).not.toContain('canAccessMatching && <Route path="/matching"');
    // The search field is no longer behind an admin check.
    expect(read('Matching.jsx')).not.toContain('{isAdmin && (\n              <SearchField>');
  });

  it('does not request a feed the viewer cannot read', () => {
    expect(read('Matching.jsx')).toContain('if (!hasFullProfileAccessRef.current) {');
  });
});
