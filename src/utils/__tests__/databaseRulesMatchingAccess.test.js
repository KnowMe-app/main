const fs = require('fs');
const path = require('path');
const { canAccessMatchingByLevel } = require('../accessLevel');

const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'database.rules.json'), 'utf8'),
).rules;
const profileFormSource = fs.readFileSync(
  path.join(__dirname, '..', '..', 'components', 'ProfileForm.jsx'),
  'utf8',
);

const assignableAccessLevels = (() => {
  const block = profileFormSource.slice(
    profileFormSource.indexOf('const accessLevelOptions = ['),
    profileFormSource.indexOf('];', profileFormSource.indexOf('const accessLevelOptions = [')),
  );
  return [...block.matchAll(/\{ value: '([^']*)'/g)].map(match => match[1]).filter(Boolean);
})();

// The rules language has no helpers, so the read conditions are asserted by the
// shape the app depends on: any accessLevel that mentions matching grants read.
const grantsAccessLevelByContains = (readRule, collection) =>
  readRule.includes(
    `root.child('${collection}').child(auth.uid).child('accessLevel').val().contains('matching')`,
  );

describe('database.rules.json matching read access', () => {
  it('exposes the access levels the ProfileForm can assign', () => {
    expect(assignableAccessLevels).toEqual(
      expect.arrayContaining(['matching:view', 'matching:view&write', 'add+matching:view', 'add+matching:view&write']),
    );
  });

  it('lets every matching access level scan the matching cards', () => {
    const readRule = rules.matchingCards['.read'];

    expect(grantsAccessLevelByContains(readRule, 'profileTechnical')).toBe(true);

    assignableAccessLevels
      .filter(level => canAccessMatchingByLevel(level))
      .forEach(level => {
        // `contains('matching')` covers the level only when it literally carries it.
        expect(level).toContain('matching');
      });
  });

  // Роль читача правила беруть з його картки стрічки: legacy `users`
  // закрито й видалено з правил.
  it('keeps admin uids and non-ed roles able to scan the matching cards', () => {
    const readRule = rules.matchingCards['.read'];
    expect(readRule).toContain("auth.uid == '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'");
    expect(readRule).toContain("auth.uid == '0ghb1LphfASV0Y3b6J010v4CDyD2'");
    expect(readRule).toContain("root.child('matchingCards').child(auth.uid).child('role').val() != 'ed'");
  });

  it('has no legacy users node and no rule that asks it', () => {
    expect(rules.users).toBeUndefined();
    expect(JSON.stringify(rules)).not.toContain("child('users')");
  });

  it('grants ordinary matching-role access to contacts only for a dated projection', () => {
    const readRule = rules.profileContacts.$uid['.read'];
    const datedProjectionGate = "root.child('matchingCards').child($uid).child('feedDate')";

    expect(readRule).toContain(`${datedProjectionGate}.isString()`);
    expect(readRule).toContain(`${datedProjectionGate}.val().matches(/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/)`);
    // Checking only for existence would also accept the explicit `false` state.
    expect(readRule).not.toContain(`${datedProjectionGate}.exists()`);
  });
});
