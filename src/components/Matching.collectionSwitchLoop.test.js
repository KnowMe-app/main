const fs = require('fs');
const path = require('path');

/**
 * «Обране» → «Усі» у донорки вішало вкладку.
 *
 * `users` бував новим масивом із тими самими картками на кожен рендер, а
 * ефекти нотаток трималися посилання на масив: прочитати нотатки → записати
 * стан → рендер → новий масив → прочитати знову. Спершу це був білий екран з
 * «Maximum update depth exceeded» (зняття позначки відновлення прокрутки з
 * layout-ефекту), потім — завислий потік.
 */
describe('перемикання колекцій стрічки не заходить у цикл', () => {
  const source = fs.readFileSync(path.join(__dirname, 'Matching.jsx'), 'utf8');

  it('нотатки питаються за набором карток, а не за посиланням на масив', () => {
    expect(source).toContain('}, [feedSourceIdsKey, loadCommentsFor]);');
    expect(source).toContain('}, [feedRowsIdsKey, loadCommentsFor]);');
    expect(source).not.toContain('}, [feedSource, loadCommentsFor]);');
    expect(source).not.toContain('}, [feedRows, loadCommentsFor]);');
  });

  it('записи нотаток не міняють посилання без зміни змісту', () => {
    expect(source).toContain('setComments(prev => keepNotesForIds(prev, ids));');
    expect(source).toContain('setComments(prev => mergeNotes(prev, commentsMap));');
  });

  it('знімає позначку відновлення прокрутки лише тоді, коли вона стоїть', () => {
    const effect = source.slice(
      source.indexOf('if (restoreRef.current || users.length === 0) return undefined;'),
      source.indexOf('const hasRenderedRows = users.length > 0;'),
    );
    expect(effect).not.toContain('setScrollRestorePending(false)');
    expect(source).toContain('if (!scrollRestorePendingRef.current) return;');
  });
});
