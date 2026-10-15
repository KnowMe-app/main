import fs from 'fs';
import path from 'path';

describe('ProfileRow publication boundary', () => {
  it('derives the parent role from the published projection after hydration', () => {
    const row = fs.readFileSync(path.join(__dirname, 'ProfileRow.jsx'), 'utf8');
    const matching = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
    const hiddenList = fs.readFileSync(path.join(__dirname, 'MatchingHiddenList.jsx'), 'utf8');

    // Ролі рядка — лише з картки стрічки: дочитана анкета (`withLazyPhotos`)
    // несе й сховані ролі, і розкладка, блок ролі й розділи батьків
    // показували б анкету, яку людина сховала.
    expect(row).toContain('const visibleRoles = listProfileRoles(publishedUser);');
    expect(row).toContain('const shown = listProfileRoles(publishedUser);');
    expect(row).toContain('shown.filter(role => role === \'ip\')');
    expect(row).not.toMatch(/listProfileRoles\(user\)|getProfileRole\(user\)|isCounterpartyCard\(user\)/);
    expect(matching).toContain('publishedUser={feedSourceWithoutOwnEdits.find');
    expect(matching).toContain('publishedUsers={feedSourceWithoutOwnEdits}');
    expect(hiddenList).toContain('publishedUser={publishedUsersById.get(user.userId) || user}');
  });
});
