import fs from 'fs';
import path from 'path';

const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');

describe('search query persistence', () => {
  it('records history only from a finished search, on every screen that searches', () => {
    // Пошук перезапускається на кожній паузі в наборі тексту, тож історію
    // пише окремий сигнал — інакше в базі осідає ланцюг початків одного слова.
    ['AddNewProfile.jsx', 'Matching.jsx', 'ProfileCreationWorkspace.jsx'].forEach(file => {
      const source = read(file);
      const committedHandlers = source.match(/onSearchCommitted=\{[^}]*\}/g) || [];
      expect(committedHandlers.length).toBeGreaterThan(0);
      expect(source).toContain('addMatchingSearchQuery');
    });

    const searchBar = read('SearchBar.jsx');
    expect(searchBar).toContain('onSearchCommitted');
    expect(searchBar).toContain("writeData(search, { committed: true })");
    // Прогін по таймеру набору тексту завершеним не рахується.
    expect(searchBar).toMatch(/committed = false,/);
  });

  it("always stores history below the authenticated user's UID", () => {
    const configSource = read('config.js');

    expect(configSource).toMatch(/\$\{SEARCH_QUERIES_ROOT_PATH\}\/\$\{owner\.uid\}/);
    expect(configSource).not.toMatch(/searchQueries\/\$\{ownerId \|\| owner\.uid\}/);
  });

  it('keys each stored query by its text instead of pushing a new row', () => {
    const configSource = read('config.js');

    expect(configSource).toContain('encodeSearchQueryKey(normalizedQuery)');
    expect(configSource).not.toMatch(/push\(ownerRef\)/);
  });
});
