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

// Історія пошуку — це слід роботи читача, і адмінка вміє на нього подивитись:
// картка читача плюс його запити під нею, з яких кожен можна повторити одним
// дотиком. Номер у списку — контакт, а не текст: поруч стоять ті самі три
// канали, якими з нього й пишуть.
describe('перелік читачів із їхніми запитами', () => {
  const source = read('AddNewProfile.jsx');

  it('читається на явне натискання, а не при відкритті екрана', () => {
    expect(source).toContain('const owners = (await fetchAllSearchQueryOwners()).slice(0, SEARCHERS_LIMIT);');
    expect(source).toContain('onClick={handleShowSearchers}');
    expect(source).not.toContain('useEffect(() => { handleShowSearchers');
  });

  it('фільтри картотеки перелік не звужують і не пересортовують', () => {
    expect(source).toContain('if (isDuplicateView || isSearchersView) return cards;');
    expect(source).toContain("if (isDuplicateView || isSearchersView || currentFilter === 'CYCLE_FAVORITE') {");
  });

  it('натиснутий запит іде тим самим шляхом, що й набраний у рядку', () => {
    expect(source).toContain('setSearch(normalizedValue);');
    expect(source).toContain('setSearchBarResetVersion(version => version + 1);');
  });

  it('біля номера стоять Telegram, Viber і WhatsApp', () => {
    expect(source).toContain("const phone = detected?.key === 'phone' ? detected.value : '';");
    expect(source).toContain('CONTACT_LINK_BUILDERS.telegramFromPhone(phone)');
    expect(source).toContain('CONTACT_LINK_BUILDERS.viberFromPhone(phone)');
    expect(source).toContain('CONTACT_LINK_BUILDERS.whatsappFromPhone(phone)');
  });

  it('список живе під карткою, а не всередині неї', () => {
    expect(source).toContain('renderCardFooter={renderSearcherFooter}');
    expect(read('UsersList.jsx')).toContain("typeof renderCardFooter === 'function' && renderCardFooter(userId, userData)");
  });
});
