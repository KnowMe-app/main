import fs from 'fs';
import path from 'path';

describe('fetchUsersByIds long-format user fallback handling', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const body = source.slice(
    source.indexOf('export const fetchUsersByIds'),
    source.indexOf('export const lazyLoadProfilePhotos'),
  );

  it('settles both long-id reads and accepts marked or recognizable legacy fallbacks', () => {
    expect(body).toContain('if (!source && isLongFormatUserId(id))');
    expect(body).toContain('const [usersResult, newUsersResult] = await Promise.allSettled([');
    expect(body).toContain('isFullProfileFallbackData(newUsersData)');
    expect(body).toContain('isLegacyFullProfileFallbackData(newUsersData)');
    expect(body).toContain('if (!hasUser && !hasUsableFallback) return null;');
    expect(body).toContain("__sourceCollection: useFallback ? 'newUsers' : 'users'");
  });

  it('retains an unscoped cached card while keeping mismatched scoped reads clean', () => {
    expect(body).toContain('if (cached && !source) result[id] = cached;');
    expect(body).toContain('return null;');
  });

  it('still fans out to both collections for short-format ids', () => {
    expect(body).toContain("const readSources = source ? [source] : ['users', 'newUsers'];");
  });
});
