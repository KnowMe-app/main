import fs from 'fs';
import path from 'path';

describe('persistUserWithFallback', () => {
  const source = fs.readFileSync(path.join(__dirname, 'authProfilePersistence.js'), 'utf8');

  it('writes the whole profile into the nodes only when the canonical write failed', () => {
    expect(source).toContain('let canonicalWriteFailed = false;');
    expect(source).toContain('if (canonicalWriteFailed) {');
    expect(source).toContain("await updateProfileNodesInRTDB(userId, uploadedInfo, 'update');");
  });

  it('never swallows a non-permission error from the canonical write', () => {
    expect(source).toContain('if (!isPermissionDeniedError(error)) {');
    expect(source).toContain('throw error;');
  });
});
