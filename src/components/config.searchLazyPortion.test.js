const fs = require('fs');
const path = require('path');

// Пошук поширеного імені читав кожну знайдену картку: «Ольга» — 487 id, з них
// опубліковано 5, а читалось усі 487, щоб поставити опубліковані першими.
// Тепер видача стрічки читає порцію: спершу опубліковані за переліком
// (`utils/publishedFeedIndex`), далі решта, а хвіст дочитує стрічка.
describe('видача пошуку стрічки — порціями, опубліковані першими', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const searchById = source.slice(
    source.indexOf('const searchBySearchIdUsers = async ('),
    source.indexOf('export const readLazySearchPortion'),
  );

  it('читає лише першу порцію черги «опубліковані → решта»', () => {
    expect(searchById).toContain('splitSearchHitsByFeed(publishedIndex, freshIds)');
    expect(searchById).toContain('const queue = [...published, ...others];');
    expect(searchById).toContain('idsToRead = queue.slice(0, lazyPageSize);');
    expect(searchById).toContain('ids: queue.slice(lazyPageSize),');
  });

  it('хвіст бере той, хто питав, і лише раз', () => {
    expect(source).toContain('export const takeLazySearchRemainder = searchedValue => {');
    expect(source).toContain('if (key) lazySearchRemainders.delete(key);');
  });

  it('порція лише для видачі стрічки — решта пошуку віддає все', () => {
    expect(source).toContain("const lazyKey = cardsOnly && lazyPageSize > 0 ? buildLazySearchKey(searchedValue) : '';");
  });
});
