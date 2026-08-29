import fs from 'fs';
import path from 'path';

describe('fetchUserById', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const body = source.slice(
    source.indexOf('export const fetchUserById'),
    source.indexOf('export const removeKeyFromFirebase'),
  );

  it('reads the profile nodes first and only then the single legacy collection', () => {
    const nodesIndex = body.indexOf('await readProfileFromNodes(userId,');
    const legacyIndex = body.indexOf('get(ref2(db, `users/${userId}`))');

    expect(nodesIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeGreaterThan(nodesIndex);
  });

  it('reads legacy with `withLegacy` so mobile-app edits are visible on the profile', () => {
    expect(body).toContain('{ includeTechnical: true, withLegacy: true }');
  });

  it('hydrates photos for both paths', () => {
    expect(body.match(/getAllUserPhotos\(userId\)/g)).toHaveLength(2);
  });
});
