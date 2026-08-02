import fs from 'fs';
import path from 'path';

describe('fetchUserById fallback freshness', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const body = source.slice(
    source.indexOf('export const fetchUserById'),
    source.indexOf('export const removeKeyFromFirebase'),
  );

  it('settles both collection reads so either readable record can be returned', () => {
    expect(body).toContain('const [usersResult, newUsersResult] = await Promise.allSettled([');
    expect(body).toContain("usersResult.status === 'fulfilled'");
    expect(body).toContain("newUsersResult.status === 'fulfilled'");
  });

  it('only makes a long-id newUsers record authoritative when marked as a full fallback', () => {
    expect(body).toContain('isLongFormatUserId(userId) && isFullProfileFallbackData(newUsersData)');
    expect(body).toContain("const sourceCollection = useFallback ? 'newUsers' : 'users';");
  });

  it('hydrates photos from the same collection selected as authoritative', () => {
    expect(body).toContain('getAllUserPhotos(userId, sourceCollection)');
    expect(body).toContain('__sourceCollection: sourceCollection');
  });
});
