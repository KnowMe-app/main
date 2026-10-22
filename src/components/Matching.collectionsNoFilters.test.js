const fs = require('fs');
const path = require('path');

/**
 * Колекції «Не цікаві» й «Обране» фільтрами не звужуються: їх складає сама
 * мапа реакцій (`reactionTabUsers`). Рейка фільтрів там обіцяла звуження,
 * якого не було, тож стоїть вона лише в «Усіх».
 */
describe('рейка фільтрів у колекціях', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('малюється лише в стрічці «Усі»', () => {
    const rail = source.indexOf('<MatchingFilterRail');
    const guard = source.lastIndexOf('{!isSearching', rail);
    expect(source.slice(guard, rail)).toContain("viewMode === 'default'");
  });

  it('колекції справді беруть список повз фільтри', () => {
    expect(source).toContain("if (viewMode === 'favorites' || viewMode === 'dislikes') return reactionTabUsers;");
  });
});
