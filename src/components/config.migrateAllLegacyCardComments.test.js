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

  it('never touches the unused legacy comments root, so a permission-denied there cannot abort a chunk', () => {
    expect(fnBody).not.toMatch(/getLegacyCommentPath\(/);
    expect(fnBody).not.toMatch(/updates\[.*LEGACY_COMMENTS_ROOT_PATH/);
  });

  it('clears myComment on both card collections', () => {
    expect(fnBody).toContain('updates[`users/${cardId}/myComment`] = null;');
    expect(fnBody).toContain('updates[`newUsers/${cardId}/myComment`] = null;');
  });

  it('merges conflicting/legacy/pre-existing comment text instead of dropping one side', () => {
    expect(fnBody).toContain("finalParts.join('\\n\\n')");
  });

  it('chunks writes into bounded update() calls instead of one unbounded request', () => {
    expect(fnBody).toContain('const BATCH_SIZE = 100;');
    expect(fnBody).toMatch(/for \(let i = 0; i < ids\.length; i \+= BATCH_SIZE\)/);
    const writeLoopBody = fnBody.slice(fnBody.indexOf('const BATCH_SIZE = 100;'));
    expect(writeLoopBody).not.toContain('Promise.all(');
    expect(writeLoopBody).toContain('await update(ref2(database), updates);');
  });

  it('collects per-chunk errors instead of letting one failing chunk abort the whole run', () => {
    expect(fnBody).toMatch(/catch \(error\) \{\s*chunk\.forEach/);
    expect(fnBody).toContain('report.errors.push(');
  });

  it('reports progress so the UI can show percent complete', () => {
    expect(fnBody).toContain('onProgress?.(');
  });
});
