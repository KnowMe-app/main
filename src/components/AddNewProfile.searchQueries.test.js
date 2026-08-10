import fs from 'fs';
import path from 'path';

describe('AddNewProfile search query persistence', () => {
  it('stores executed searches through the shared matching backend helper', () => {
    const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

    expect(source).toContain('addMatchingSearchQuery(normalized, ownerId);');
    expect(source).toMatch(/migrateAllLegacyCardComments,\s+addMatchingSearchQuery,/);
  });
});
