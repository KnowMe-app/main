import fs from 'fs';
import path from 'path';

describe('bulk migration of every leftover users/newUsers myComment into multiData/comments', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const fnBody = source.slice(
    source.indexOf('export const migrateAllLegacyCardComments'),
    source.indexOf('export const fetchUserComments')
  );

  it('exists and reads both users and newUsers roots wholesale', () => {
    expect(fnBody).toBeTruthy();
    expect(fnBody).toContain("get(ref2(database, 'users'))");
    expect(fnBody).toContain("get(ref2(database, 'newUsers'))");
  });

  it('writes comments via getCommentPath, without push() or querying helpers', () => {
    expect(fnBody).toContain('getCommentPath(commentsOwnerId, cardId)');
    expect(fnBody).not.toMatch(/push\(ref2\(/);
    expect(fnBody).not.toContain('orderByChild');
    expect(fnBody).not.toContain('equalTo');
  });

  it('merges the supported legacy comments fallback before choosing a destination', () => {
    expect(fnBody).toContain('getLegacyCommentPath(commentsOwnerId)');
    expect(fnBody).toContain('legacyExistingComments');
    expect(fnBody).toContain('legacyComment?.text');
  });

  it('clears myComment on both card collections with compare-and-set transactions', () => {
    expect(fnBody).toMatch(/`users\/\$\{cardId\}\/myComment`/);
    expect(fnBody).toMatch(/`newUsers\/\$\{cardId\}\/myComment`/);
    expect(fnBody).toContain('runTransaction(ref2(database, source.path)');
  });

  it('merges conflicting/legacy/pre-existing comment text instead of dropping one side', () => {
    expect(fnBody).toContain(".join('\\n\\n')");
  });

  it('chunks work and runs cards serially rather than starting unbounded transactions', () => {
    expect(fnBody).toContain('const BATCH_SIZE = 100;');
    expect(fnBody).toMatch(/for \(let i = 0; i < ids\.length; i \+= BATCH_SIZE\)/);
    const writeLoopBody = fnBody.slice(fnBody.indexOf('const BATCH_SIZE = 100;'));
    expect(writeLoopBody).toContain('for (const cardId of chunk)');
    expect(writeLoopBody).toContain('await runTransaction(ref2(database, destinationPath)');
  });

  it('collects per-chunk errors instead of letting one failing chunk abort the whole run', () => {
    expect(fnBody).toMatch(/catch \(error\) \{\s*report\.errors\.push/);
    expect(fnBody).toContain('report.errors.push(');
  });

  it('counts a card only after destination and source transactions commit', () => {
    expect(fnBody.indexOf('report.migratedCards += 1;')).toBeGreaterThan(
      fnBody.indexOf("sourceResults.some(result => !result.committed)"),
    );
  });

  it('reports progress so the UI can show percent complete', () => {
    expect(fnBody).toContain('onProgress?.(');
  });
});
