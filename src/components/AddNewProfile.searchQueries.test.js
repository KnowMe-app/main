import fs from 'fs';
import path from 'path';

describe('AddNewProfile search query persistence', () => {
  it('stores executed searches through the shared matching backend helper', () => {
    const source = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

    expect(source).toContain('addMatchingSearchQuery(normalized);');
    expect(source).toContain('addMatchingSearchQuery,');
  });

  it("always stores history below the authenticated user's UID", () => {
    const configSource = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
    const matchingSource = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

    expect(configSource).toMatch(/multiData\/searchQueries\/\$\{owner\.uid\}/);
    expect(configSource).not.toMatch(/multiData\/searchQueries\/\$\{ownerId \|\| owner\.uid\}/);
    expect(matchingSource).toContain('addMatchingSearchQuery(normalizedValue);');
  });
});
