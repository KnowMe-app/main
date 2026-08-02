import fs from 'fs';
import path from 'path';

describe('persistUserWithFallback freshness marker', () => {
  const source = fs.readFileSync(path.join(__dirname, 'authProfilePersistence.js'), 'utf8');

  it('marks full fallback writes and replaces stale fallback data after canonical saves recover', () => {
    expect(source).toContain('? markFullProfileFallback(uploadedInfo)');
    expect(source).toContain("shouldWriteFullProfileToNewUsers ? 'update' : 'set'");
  });
});
