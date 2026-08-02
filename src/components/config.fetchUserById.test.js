import fs from 'fs';
import path from 'path';

describe('fetchUserById preserves newUsers fallbacks for every userId format', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const fetchUserByIdBody = source.slice(
    source.indexOf('export const fetchUserById'),
    source.indexOf('export const removeKeyFromFirebase'),
  );

  it('does not return a users record before probing the fallback collection', () => {
    const fallbackReadIndex = fetchUserByIdBody.indexOf('const newUserSnapshot = await get(userRefInNewUsers);');
    const usersOnlyReturnIndex = fetchUserByIdBody.indexOf("__sourceCollection: 'users'");

    expect(fetchUserByIdBody).not.toContain('if (isLongFormatUserId(userId))');
    expect(fallbackReadIndex).toBeGreaterThanOrEqual(0);
    expect(usersOnlyReturnIndex).toBeGreaterThan(fallbackReadIndex);
  });

  it('merges users/newUsers per field when both records exist', () => {
    expect(fetchUserByIdBody).toContain(
      '? mergeUserCollectionData(newUserSnapshot.val(), userSnapshotInUsers.val())',
    );
    expect(fetchUserByIdBody).toContain(
      ': mergeUserCollectionData(userSnapshotInUsers.val(), newUserSnapshot.val())',
    );
  });
});
