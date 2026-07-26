import fs from 'fs';
import path from 'path';

describe('cleaning up migrated fields from newUsers after a users write', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const updateDataInRealtimeDBBody = source.slice(
    source.indexOf('export const updateDataInRealtimeDB'),
    source.indexOf('export const updateDataInNewUsersRTDB')
  );

  const pruneFnBody = source.slice(
    source.indexOf('const pruneMigratedFieldsFromNewUsers'),
    source.indexOf('export const updateDataInRealtimeDB')
  );

  it('only prunes newUsers for long-userId cards, after the users write has succeeded', () => {
    expect(updateDataInRealtimeDBBody).toContain('await update(userRefRTDB, cleanedUploadedInfo)');
    const writeIndex = updateDataInRealtimeDBBody.indexOf('await update(userRefRTDB, cleanedUploadedInfo)');
    const pruneCallIndex = updateDataInRealtimeDBBody.indexOf('await pruneMigratedFieldsFromNewUsers(');
    expect(pruneCallIndex).toBeGreaterThan(writeIndex);
    expect(updateDataInRealtimeDBBody).toContain("String(userId || '').length > 20");
  });

  it('deletes a duplicate after a users write or a successful null deletion', () => {
    expect(pruneFnBody).toContain("Object.prototype.hasOwnProperty.call(newUsersData, field)");
    expect(pruneFnBody).toContain("Object.prototype.hasOwnProperty.call(usersData, field)");
    expect(pruneFnBody).toContain('const confirmedDeletion = fieldValues[field] === null');
    expect(pruneFnBody).toContain('if (presentInNewUsers && (confirmedInUsers || confirmedDeletion))');
  });

  it('re-reads both collections instead of trusting the in-memory payload', () => {
    expect(pruneFnBody).toContain("get(ref2(database, `newUsers/${userId}`))");
    expect(pruneFnBody).toContain("get(ref2(database, `users/${userId}`))");
  });

  it('bails out with nothing to prune when there are no candidate field names', () => {
    expect(pruneFnBody).toContain('if (!candidateFields.length) return;');
  });

  it('swallows prune errors so a cleanup failure never fails the users write itself', () => {
    expect(pruneFnBody).toMatch(/catch \(error\) \{\s*console\.error/);
    expect(pruneFnBody).not.toMatch(/catch \(error\) \{\s*console\.error\([^)]*\);\s*throw error;/);
  });

  it('excludes userId and transient client-only keys from the prune candidates', () => {
    expect(pruneFnBody).toContain("field !== 'userId'");
    expect(pruneFnBody).toContain('!transientUserDataKeys.includes(field)');
  });
});
