import fs from 'fs';
import path from 'path';

describe('fetchUserById skips newUsers for long-format userIds', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const fetchUserByIdBody = source.slice(
    source.indexOf('export const fetchUserById'),
    source.indexOf('export const removeKeyFromFirebase'),
  );

  it('checks isLongFormatUserId before the unconditional newUsers probe', () => {
    const longIdBranchIndex = fetchUserByIdBody.indexOf('if (isLongFormatUserId(userId))');
    const usersReadIndex = fetchUserByIdBody.indexOf('get(userRefInUsers)');
    const unconditionalNewUsersReadIndex = fetchUserByIdBody.indexOf(
      'const newUserSnapshot = await get(userRefInNewUsers);',
    );

    expect(longIdBranchIndex).toBeGreaterThanOrEqual(0);
    expect(usersReadIndex).toBeGreaterThan(longIdBranchIndex);
    expect(usersReadIndex).toBeLessThan(unconditionalNewUsersReadIndex);
  });

  it('returns a users-sourced record with photos when the long-id branch hits', () => {
    const longIdBranchBody = fetchUserByIdBody.slice(
      fetchUserByIdBody.indexOf('if (isLongFormatUserId(userId))'),
      fetchUserByIdBody.indexOf('const newUserSnapshot = await get(userRefInNewUsers);'),
    );
    expect(longIdBranchBody).toContain("getAllUserPhotos(userId, 'users')");
    expect(longIdBranchBody).toContain("__sourceCollection: 'users'");
  });

  it('still merges users/newUsers per field for the short-id path (unchanged)', () => {
    expect(fetchUserByIdBody).toContain(
      'mergeUserCollectionData(userSnapshotInUsers.val(), newUserSnapshot.val())',
    );
  });
});
