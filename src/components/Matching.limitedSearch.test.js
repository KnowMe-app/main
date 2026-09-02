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

  it('opens exactly those fields on users/$uid and nothing more', () => {
    const uidRules = rules.users.$uid;
    const openedFields = Object.keys(uidRules)
      .filter(key => !key.startsWith('.'))
      .filter(key => uidRules[key]['.read'] === 'auth != null');

    // The rules are the enforcement; the field list is only what the client asks
    // for. If they drift apart the projection silently gains or loses a field.
    expect(openedFields.sort()).toEqual(limitedProfileFields.sort());
    expect(Object.keys(uidRules).filter(key => !key.startsWith('.')).sort())
      .toEqual(limitedProfileFields.sort());
  });

  it('leaves users node-level reads gated as before', () => {
    const nodeRead = rules.users.$uid['.read'];
    expect(nodeRead).toContain('auth.uid == $uid');
    expect(nodeRead).not.toBe('auth != null');
    // The collection root - what a query would need - stays behind matching access.
    expect(rules.users['.read']).toContain("accessLevel').val().contains('matching')");
  });

  it('lets any signed-in user resolve one searchId key but not scan the index', () => {
    expect(rules.searchId.$key['.read']).toBe('auth != null');
    // Read at the searchId root is what a scan needs, and it stays closed to
    // ordinary viewers: for them a lookup still needs the exact value.
    const rootRead = rules.searchId['.read'];
    expect(rootRead).not.toBe('auth != null');
    expect(rootRead).not.toContain("contains('matching')");
  });

  it('opens the searchId index to admins only, on the same terms as contacts', () => {
    // Адмін мусить бачити, що лежить за посиланням у searchId, тож перегляд
    // вузла цілком дано — але тим самим двом uid, що й `profileContacts`:
    // індекс називає чужі контакти, і ширшої аудиторії в нього немає.
    expect(rules.searchId['.read']).toBe(rules.profileContacts['.read']);
    expect(rules.searchId['.read']).toContain("auth.uid == '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'");
    expect(rules.searchId['.read']).toContain("auth.uid == '0ghb1LphfASV0Y3b6J010v4CDyD2'");
  });

  it('keeps a limited search off the paths its viewer cannot read', () => {
    const config = read('config.js');
    expect(config).toContain("const isBroadTextSearchEnabled = Boolean(enabledSearchKeys?.broadTextSearch) && !limitedFields;");
    expect(config).toContain("const searchIdOptions = limitedFields\n    ? { ...baseSearchIdOptions, includePrefixMatches: false }");
    // Урізаний читач лишається на урізаній проєкції незалежно від того, що
    // просить сторінка: `limitedFields` перевіряється першим.
    expect(config).toContain('const addHit = resolveSearchHitAdder({ limitedFields, cardsOnly });');
    expect(config).toContain('  if (limitedFields) return addLimitedUser;');
  });

  it('does not even start the prefix scan for a viewer who may not scan', () => {
    // The scan needs read at the searchId root, and the rules give that to the
    // two admin uids only. Firing it anyway cost one refused request per
    // candidate key on every search - a couple of dozen round trips whose only
    // possible answer is PERMISSION_DENIED. So the step is now gated by the
    // same admin check the rules make, and the catch below stays as a net:
    // rights can change, and a refusal in an optional step must not throw away
    // the ids the exact-key lookup already collected.
    const config = read('config.js');
    expect(config).toContain("if (includePrefixMatches && isAdminUid(auth.currentUser?.uid)) {");
    expect(config).toContain('if (!isSearchIdPermissionDenied(error)) throw error;');
    const scan = config.slice(
      config.indexOf('if (includePrefixMatches && isAdminUid(auth.currentUser?.uid)) {'),
      config.indexOf('return [...uniqueIds];'),
    );
    expect(scan).toContain('try {');
    expect(scan).toContain('} catch (error) {');
    // The rules are the enforcement; the client check only saves the trip.
    expect(rules.searchId['.read']).not.toContain("contains('matching')");
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

  it('loads the public feed independently from full-profile access', () => {
    const matching = read('Matching.jsx');
    expect(matching).not.toContain('hasFullProfileAccessRef');
    expect(matching).toContain('(isSearching ? searchChips : collectionChips).map');
  });
});
