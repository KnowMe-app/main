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

  it('merges an existing multiData comment into the multiData destination', () => {
    expect(fnBody).toContain('fetchUserComment(commentsOwnerId, cardId)');
    expect(fnBody).toContain('existingComments');
    expect(fnBody).toContain('currentComment?.text');
    expect(fnBody).not.toContain('legacyExistingComments');
    expect(fnBody).not.toContain('get(ref2(database, getCommentPath(commentsOwnerId)))');
  });

  it('never transacts on the database root: a root-anchored runTransaction needs .write on "/", which no real ruleset grants', () => {
    expect(fnBody).not.toContain('runTransaction(');
    expect(fnBody).not.toContain('valuesMatch');
    expect(fnBody).not.toContain('getValueAtPath');
    expect(fnBody).not.toContain('setValueAtPath');
  });

  it('writes the destination before attempting best-effort source cleanup', () => {
    expect(fnBody).toMatch(/cleanup\[`users\/\$\{cardId\}\/myComment`\]\s*=\s*null;/);
    expect(fnBody).toMatch(/cleanup\[`newUsers\/\$\{cardId\}\/myComment`\]\s*=\s*null;/);
    expect(fnBody).toContain('updates[getCommentPath(commentsOwnerId, cardId)] = { text: finalText, updatedAt: Date.now() };');
    expect(fnBody).toContain('await update(ref2(database), updates);');
    expect(fnBody.indexOf('const cleanup = {};')).toBeGreaterThan(
      fnBody.indexOf('await update(ref2(database), updates);'),
    );
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
