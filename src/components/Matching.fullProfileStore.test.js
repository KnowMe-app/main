const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');
const slice = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

/**
 * Повна анкета рядка живе в сховищі вкладки (`utils/cardStore`). Сховище
 * скидають («Оновити стрічку»), а розгорнутість рядка лишається — і рядок
 * мусить дочитати анкету сам, а не стояти розгорнутим без освіти й контактів.
 */
describe('повна анкета рядка зі сховища вкладки', () => {
  const effect = slice('const staleFullProfileRefetchRef = useRef(new Map());', '  const withLazyPhotos = React.useCallback(');

  it('дочитує застарілі анкети й розгорнуті рядки, чию анкету сховище забуло', () => {
    expect(effect).toContain('listStaleStoredFullProfileIds()');
    expect(effect).toContain('[...expandedRowIds].filter(id => id && !getStoredFullProfile(id))');
    expect(effect).toContain('[cardStoreVersion, ensureFullProfile, expandedRowIds, feedSource]');
  });

  it('після скидання сховища забуває запитане й не кладе запізнілу відповідь', () => {
    const ensure = slice('const ensureFullProfile = React.useCallback(', '  const staleFullProfileRefetchRef');
    expect(ensure).toContain('fullProfileRequestsRef.current.clear();');
    expect(ensure).toContain('if (!profile || !stillCurrent()) return;');
  });
});
