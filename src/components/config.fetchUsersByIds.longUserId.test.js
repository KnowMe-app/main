import fs from 'fs';
import path from 'path';

describe('fetchUsersByIds long-format user fallback handling', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const body = source.slice(
    source.indexOf('export const fetchUsersByIds'),
    source.indexOf('export const lazyLoadProfilePhotos'),
  );

  it('settles both long-id reads and only selects a marked full-profile fallback', () => {
    expect(body).toContain('if (!source && isLongFormatUserId(id))');
    expect(body).toContain('const [usersResult, newUsersResult] = await Promise.allSettled([');
    expect(body).toContain('const useFallback = !hasUser || isFullProfileFallbackData(newUsersData);');
    expect(body).toContain("__sourceCollection: useFallback ? 'newUsers' : 'users'");
  });

  it('retains a cached card while a best-effort refresh is attempted', () => {
    expect(body).toContain('if (cached) result[id] = cached;');
    expect(body).toContain('return null;');
  });

  it('still fans out to both collections for short-format ids', () => {
    expect(body).toContain("const readSources = source ? [source] : ['users', 'newUsers'];");
  });
});
