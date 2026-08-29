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

  it('lets every matching access level read users', () => {
    const readRule = rules.users['.read'];

    expect(grantsAccessLevelByContains(readRule, 'users')).toBe(true);

    assignableAccessLevels
      .filter(level => canAccessMatchingByLevel(level))
      .forEach(level => {
        // `contains('matching')` covers the level only when it literally carries it.
        expect(level).toContain('matching');
      });
  });

  it('keeps admin uids and non-ed roles able to read the collection', () => {
    const readRule = rules.users['.read'];
    expect(readRule).toContain("auth.uid == '3LiD7JGCJTSJoVMU7fdR1ZrcIZH2'");
    expect(readRule).toContain("auth.uid == '0ghb1LphfASV0Y3b6J010v4CDyD2'");
    expect(readRule).toContain("child('userRole').val() != 'ed'");
  });

  it('keeps per-profile reads restricted to the owner and admins', () => {
    expect(rules.users.$uid['.read']).toContain('auth.uid == $uid');
  });
});
