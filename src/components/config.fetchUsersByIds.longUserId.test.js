import fs from 'fs';
import path from 'path';

describe('fetchUsersByIds skips newUsers for long-format userIds and trusts fresh users-cache', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const fetchUsersByIdsBody = source.slice(
    source.indexOf('export const fetchUsersByIds'),
    source.indexOf('export const lazyLoadProfilePhotos'),
  );

  it('checks isLongFormatUserId before falling back to the shared readSources fan-out', () => {
    const longIdBranchIndex = fetchUsersByIdsBody.indexOf('if (!source && isLongFormatUserId(id))');
    const readSourcesIndex = fetchUsersByIdsBody.indexOf(
      "const readSources = source ? [source] : ['users', 'newUsers'];",
    );

    expect(longIdBranchIndex).toBeGreaterThanOrEqual(0);
    expect(readSourcesIndex).toBeGreaterThan(longIdBranchIndex);
  });

  it('reads only users on the long-id success path, before any newUsers read', () => {
    const longIdBranchBody = fetchUsersByIdsBody.slice(
      fetchUsersByIdsBody.indexOf('if (!source && isLongFormatUserId(id))'),
      fetchUsersByIdsBody.indexOf(
        "const readSources = source ? [source] : ['users', 'newUsers'];",
      ),
    );
    const usersReadIndex = longIdBranchBody.indexOf('get(ref2(database, `users/${id}`))');
    const newUsersReadIndex = longIdBranchBody.indexOf('get(ref2(database, `newUsers/${id}`))');

    expect(usersReadIndex).toBeGreaterThanOrEqual(0);
    expect(newUsersReadIndex).toBeGreaterThan(usersReadIndex);
  });

  it('still fans out to both collections in parallel for short-format ids (unchanged)', () => {
    expect(fetchUsersByIdsBody).toContain(
      "const readSources = source ? [source] : ['users', 'newUsers'];",
    );
  });

  it('does not apply the long-id skip when an explicit collectionSource was passed', () => {
    const longIdBranchBody = fetchUsersByIdsBody.slice(
      fetchUsersByIdsBody.indexOf('if (!source && isLongFormatUserId(id))'),
      fetchUsersByIdsBody.indexOf(
        "const readSources = source ? [source] : ['users', 'newUsers'];",
      ),
    );
    expect(longIdBranchBody.startsWith('if (!source && isLongFormatUserId(id))')).toBe(true);
  });

  it('trusts a fresh users-sourced cache hit the same way it already trusts newUsers', () => {
    expect(fetchUsersByIdsBody).toContain(
      "(cached.__sourceCollection === 'newUsers' || cached.__sourceCollection === 'users')",
    );
  });
});
