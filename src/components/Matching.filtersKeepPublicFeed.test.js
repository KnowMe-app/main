const fs = require('fs');
const path = require('path');

jest.mock('components/config', () => ({
  database: { app: 'test-db' },
  collectAgeIdsByFilters: jest.fn(),
}));

const { fetchMatchingIndexedCandidates } = require('utils/matchingDataProvider');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

// Фільтр «Тип профілю: крім Агентства» знімає одну галочку з чотирьох — і цим
// перетворює план індексу на суцільне відкидання: назвати кандидатів нема з
// чого, лишається послідовне читання стрічки. Доти, доки `loadMore` вважав таку
// відповідь справжньою, перший же фільтр обривав загальну стрічку і на екрані
// лишались тільки власні картки, які приходять іншими конвеєрами.
describe('фільтр, який лише відкидає, не обриває загальну стрічку', () => {
  it('індекс сам каже, що плану не склалось', async () => {
    const result = await fetchMatchingIndexedCandidates({
      filters: { userRole: { ed: true, ag: false, ip: true, other: true } },
      offset: 0,
      limit: 5,
      hydrateUsersByIds: async () => ({}),
      useIndexIdCache: false,
    });

    expect(result.usedIndex).toBe(false);
    expect(result.reason).toBe('exclude-only-index-plan');
    expect(result.userIds).toEqual([]);
  });

  it('loadMore не застосовує таку відповідь, а читає джерело', () => {
    const source = matchingSource();
    const loadMore = source.slice(
      source.indexOf('  const loadMore = React.useCallback'),
      source.indexOf('  const visibleUsers = useMemo'),
    );
    const branchIndex = loadMore.indexOf('if (activeIndexFilterGroups.length > 0) {');
    const guardIndex = loadMore.indexOf('if (!indexedPage.deferToSourcePagination) {', branchIndex);
    const applyIndex = loadMore.indexOf('setHasMore(indexedHasMore);', guardIndex);
    const sourcePaginationIndex = loadMore.indexOf('const collected = [];', branchIndex);

    expect(branchIndex).toBeGreaterThan(-1);
    // Застосування сторінки індексу живе всередині перевірки, а не поруч із нею.
    expect(guardIndex).toBeGreaterThan(branchIndex);
    expect(applyIndex).toBeGreaterThan(guardIndex);
    // …і після відмови виконання доходить до послідовної пагінації.
    expect(sourcePaginationIndex).toBeGreaterThan(applyIndex);
  });

  it('початкове завантаження так робило й раніше — обидва шляхи однакові', () => {
    const source = matchingSource();
    const loadInitial = source.slice(
      source.indexOf('  const loadInitial = React.useCallback'),
      source.indexOf('  const reloadDefault = React.useCallback'),
    );

    expect(loadInitial).toContain('empty users index result; falling back to source pagination');
  });
});
