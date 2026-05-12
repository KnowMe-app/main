import fs from 'fs';
import path from 'path';

describe('fetchUsersByIds merging', () => {
  it('keeps newUsers fields and source marker ahead of users records', () => {
    const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
    const fetchUsersByIdsBody = source.slice(
      source.indexOf('export const fetchUsersByIds'),
      source.indexOf('const addUserFromUsers')
    );

    expect(fetchUsersByIdsBody.indexOf('...(hasUser ? userSnap.val() : {})'))
      .toBeLessThan(fetchUsersByIdsBody.indexOf('...(hasNewUser ? newSnap.val() : {})'));
    expect(fetchUsersByIdsBody).toContain("__sourceCollection: hasNewUser ? 'newUsers' : 'users'");
  });

  it('marks fetchUserById records with their backing collection', () => {
    const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

    expect(source).toContain("__sourceCollection: 'newUsers'");
    expect(source).toContain("__sourceCollection: 'users'");
  });
});
