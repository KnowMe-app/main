const fs = require('fs');
const path = require('path');

const matchingSource = () => fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

const sliceBetween = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  return source.slice(start, end);
};

// Деку збирають два незалежні потоки: опублікований `matchingCards` і звужений
// правилами індекс, який доливає відкриті глядачеві картки. Падають вони теж
// нарізно, тож збій загальної стрічки не підміняє надані картки екраном
// помилки. Але й мовчати не можна: коротка дека без пояснення читається як
// «більше нікого немає».
describe('збій загальної стрічки лишається сказаним, а не проковтнутим', () => {
  it('має один спосіб сказати про недоступну загальну стрічку', () => {
    const source = matchingSource();

    expect(source).toContain('const announcePublicFeedUnavailable = React.useCallback(error => {');
    expect(source).toContain("id: 'matching-public-feed-unavailable',");
    // Без помилки повідомляти нема про що: помилка могла й не статись.
    expect(source).toContain('if (!error) return;');
  });

  it('каже про збій, коли надані картки вже на екрані', () => {
    const loadInitial = sliceBetween(
      matchingSource(),
      '  const loadInitial = React.useCallback',
      '  const reloadDefault = React.useCallback',
    );
    const catchIndex = loadInitial.indexOf('} catch (error) {');
    const scopedBranchIndex = loadInitial.indexOf('if (additionalAccessUsersRef.current.length > 0) {', catchIndex);
    const announceIndex = loadInitial.indexOf('announcePublicFeedUnavailable(error);', scopedBranchIndex);
    const reportIndex = loadInitial.indexOf('reportInitialLoadError(error);', catchIndex);

    expect(catchIndex).toBeGreaterThan(-1);
    expect(scopedBranchIndex).toBeGreaterThan(catchIndex);
    expect(announceIndex).toBeGreaterThan(scopedBranchIndex);
    // Гілка з наданими картками не доходить до екрана помилки.
    expect(announceIndex).toBeLessThan(reportIndex);
  });

  it('каже про збій і тоді, коли картки приїхали пізніше за помилку', () => {
    const source = matchingSource();
    const scopedEffectIndex = source.indexOf('    const loadAccessScopedCards = async () => {');
    const dropIndex = source.indexOf('const droppedError = deferredInitialLoadErrorRef.current;', scopedEffectIndex);
    const announceIndex = source.indexOf('announcePublicFeedUnavailable(droppedError);', dropIndex);

    expect(scopedEffectIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(scopedEffectIndex);
    expect(announceIndex).toBeGreaterThan(dropIndex);
  });
});
