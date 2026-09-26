import fs from 'fs';
import path from 'path';

const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');

describe('«назад» телефона з видачі пошуку', () => {
  const matching = () => read('Matching.jsx');

  // Запит мусить бути окремим кроком історії: інакше «назад» виводить зі
  // сторінки, а не повертає в стрічку.
  it('кладе пошук окремим записом історії й знімає його, коли запит стерли', () => {
    const source = matching();
    expect(source).toContain("window.history.pushState({ ...(window.history.state || {}), matchingSearch: true }, '', url.toString());");
    expect(source).toContain('searchHistoryEntryRef.current = false;\n        if (onSearchEntry) {\n          window.history.back();');
  });

  it('на «назад» стирає запит, але не тоді, коли закрилась картка над видачею', () => {
    const source = matching();
    const handler = source.slice(source.indexOf('const handleSearchPopState'), source.indexOf("window.addEventListener('popstate', handleSearchPopState)"));
    expect(handler).toContain('if (window.history.state?.matchingSearch) return;');
    expect(handler).toContain('handleSearchCleared();');
  });
});

describe('кнопки колекцій', () => {
  it('несуть значки реакцій картки в її ж порядку: усі, хрестик, серце', () => {
    const source = read('Matching.jsx');
    const chips = source.slice(source.indexOf('const collectionChips = useMemo'), source.indexOf('], [\n    dislikeUsers,'));
    const order = ["key: 'default'", "key: 'dislikes'", "key: 'favorites'"].map(key => chips.indexOf(key));
    expect(order.every(index => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(chips).toContain('icon: <FaTimes size={14} aria-hidden="true" />');
    expect(chips).toContain('<FaRegHeart size={13} aria-hidden="true" />');

    const row = source.slice(source.indexOf('<ChipsRow role="group"'), source.indexOf('</ChipsRow>'));
    expect(row).toContain('<CollectionButton');
    expect(row).not.toContain('<Chip\n');
  });
});
