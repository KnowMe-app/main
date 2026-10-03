import fs from 'fs';
import path from 'path';

describe('ProfileRow publication boundary', () => {
  it('derives the parent role from the published projection after hydration', () => {
    const row = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
    const matching = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const hiddenList = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.jsx'), 'utf8');

    expect(row).toContain('listProfileRoles(publishedUser).filter(role => role === \'ip\')');
    expect(row).not.toContain('listProfileRoles(user).filter(role => role === \'ip\')');
    expect(matching).toContain('publishedUser={feedSourceWithoutOwnEdits.find');
    expect(matching).toContain('publishedUsers={feedSourceWithoutOwnEdits}');
    expect(hiddenList).toContain('publishedUser={publishedUsersById.get(user.userId) || user}');
  });
});
