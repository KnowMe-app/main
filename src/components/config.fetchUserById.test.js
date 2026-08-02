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

  it('makes short-id and valid long-id newUsers records authoritative', () => {
    expect(body).toContain('isLegacyFullProfileFallbackData(newUsersData)');
    expect(body).toContain('!isLongFormatUserId(userId) || longIdFallback');
    expect(body).toContain("const sourceCollection = useFallback ? 'newUsers' : 'users';");
  });

  it('falls back across collections when the authoritative payload has no photos', () => {
    expect(body).toContain('normalizePhotoValues(primaryData.photos).length > 0');
    expect(body).toContain('getAllUserPhotos(userId, photoSource)');
    expect(body).toContain('__sourceCollection: sourceCollection');
  });
});
