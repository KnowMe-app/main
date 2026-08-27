import fs from 'fs';
import path from 'path';

describe('fetchUsersByIds long-format user fallback handling', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const body = source.slice(
    source.indexOf('export const fetchUsersByIds'),
    source.indexOf('export const lazyLoadProfilePhotos'),
  );

  it('settles both long-id reads and accepts marked or recognizable legacy fallbacks', () => {
    expect(body).toContain('if (isLongFormatUserId(id))');
    expect(body).toContain('const [usersResult, newUsersResult] = await Promise.allSettled([');
    expect(body).toContain('isFullProfileFallbackData(newUsersData)');
    expect(body).toContain('isLegacyFullProfileFallbackData(newUsersData)');
    expect(body).toContain('if (!hasUser && !hasUsableFallback) return null;');
    expect(body).toContain("__sourceCollection: useFallback ? 'newUsers' : 'users'");
  });

  it('віддає кешовану картку, але перечитує ту, що без позначки джерела', () => {
    // Картка без `__sourceCollection` лишилась від попередньої моделі даних.
    // Роздати її як є означало б показати анкету, зібрану за старими правилами.
    expect(body).toContain('result[id] = cached;');
    expect(body).toContain("if (source !== 'users' && source !== 'newUsers') missingIds.push(id);");
  });

  it('still fans out to both collections for short-format ids', () => {
    expect(body).toContain("const readSources = ['users', 'newUsers'];");
  });
});
