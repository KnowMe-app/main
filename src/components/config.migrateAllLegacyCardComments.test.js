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

  it('never transacts on the database root: a root-anchored runTransaction needs .write on "/", which no real ruleset grants', () => {
    expect(fnBody).not.toContain('runTransaction(');
    expect(fnBody).not.toContain('valuesMatch');
    expect(fnBody).not.toContain('getValueAtPath');
    expect(fnBody).not.toContain('setValueAtPath');
  });

  it('clears both sources and writes the destination in one plain multi-path update()', () => {
    expect(fnBody).toMatch(/`users\/\$\{cardId\}\/myComment`\]\s*=\s*null;/);
    expect(fnBody).toMatch(/`newUsers\/\$\{cardId\}\/myComment`\]\s*=\s*null;/);
    expect(fnBody).toContain('updates[destinationPath] = { text: finalText, updatedAt: Date.now() };');
    expect(fnBody).toContain('await update(ref2(database), updates);');
  });

  it('merges conflicting/legacy/pre-existing comment text instead of dropping one side', () => {
    expect(fnBody).toContain(".join('\\n\\n')");
  });

  it('chunks writes into bounded update() calls instead of one unbounded request', () => {
    expect(fnBody).toContain('const BATCH_SIZE = 100;');
    expect(fnBody).toMatch(/for \(let i = 0; i < ids\.length; i \+= BATCH_SIZE\)/);
    const writeLoopBody = fnBody.slice(fnBody.indexOf('const BATCH_SIZE = 100;'));
    expect(writeLoopBody).not.toContain('Promise.all(');
    expect(writeLoopBody).toContain('await update(ref2(database), updates);');
  });

  it('collects per-chunk errors instead of letting one failing chunk abort the whole run', () => {
    expect(fnBody).toMatch(/catch \(error\) \{\s*chunkCardIds\.forEach/);
    expect(fnBody).toContain('report.errors.push(');
  });

  it('reports migrated card IDs only after the chunk update() call succeeds', () => {
    expect(fnBody.indexOf('report.migratedCards += chunkCardIds.length;')).toBeGreaterThan(
      fnBody.indexOf('await update(ref2(database), updates);'),
    );
    expect(fnBody).toContain('report.migratedCardIds.push(...chunkCardIds);');
  });

  it('reports progress so the UI can show percent complete', () => {
    expect(fnBody).toContain('onProgress?.(');
  });
});
