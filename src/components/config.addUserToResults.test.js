import fs from 'fs';
import path from 'path';

describe('addUserToResults / addUserFromUsers skip newUsers for long-format userIds', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const userIdTemplate = `${String.fromCharCode(36)}{userId}`;

  const addUserToResultsBody = source.slice(
    source.indexOf('const addUserToResults'),
    source.indexOf('const getDateFormats'),
  );

  const addUserFromUsersBody = source.slice(
    source.indexOf('const addUserFromUsers'),
    source.indexOf('const searchBySearchIdUsers'),
  );

  it('addUserToResults checks isLongFormatUserId before reading newUsers', () => {
    expect(addUserToResultsBody).toContain('if (isLongFormatUserId(userId))');
  });

  it('addUserToResults reads users before any newUsers read is reachable, for a long-format id', () => {
    // The long-id branch (guarded by isLongFormatUserId) must read `users` first;
    // the unconditional short-id fallback (newUsers-then-users) must come after it,
    // i.e. only reachable once the long-id branch has already returned.
    const longIdBranchIndex = addUserToResultsBody.indexOf('if (isLongFormatUserId(userId))');
    const usersReadIndex = addUserToResultsBody.indexOf(`get(ref2(database, \`users/${userIdTemplate}\`))`);
    const unconditionalNewUsersReadIndex = addUserToResultsBody.indexOf(
      `const userSnapshotInNewUsers = await get(ref2(database, \`newUsers/${userIdTemplate}\`));`,
    );
    expect(longIdBranchIndex).toBeGreaterThanOrEqual(0);
    expect(usersReadIndex).toBeGreaterThan(longIdBranchIndex);
    expect(usersReadIndex).toBeLessThan(unconditionalNewUsersReadIndex);
  });

  it('addUserToResults still merges both collections unconditionally for short-format ids', () => {
    expect(addUserToResultsBody).toContain(
      'mergeUserCollectionData(userFromUsers, userFromNewUsers)',
    );
  });

  it('addUserFromUsers checks isLongFormatUserId before reading newUsers', () => {
    expect(addUserFromUsersBody).toContain('if (isLongFormatUserId(userId) && userSnap.exists())');
  });

  it('addUserFromUsers still merges both collections for short-format ids', () => {
    expect(addUserFromUsersBody).toContain('mergeUserCollectionData(userData, newUserData)');
  });

  it('imports isLongFormatUserId from the shared merge-collections util', () => {
    expect(source).toContain(
      "import { isLongFormatUserId, mergeUserCollectionData } from '../utils/mergeUserCollections';",
    );
  });
});
