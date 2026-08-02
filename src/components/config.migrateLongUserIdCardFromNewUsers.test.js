import fs from 'fs';
import path from 'path';

describe('migrateLongUserIdCardFromNewUsers sweeps a stale newUsers record into users', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const updateDataInRealtimeDBBody = source.slice(
    source.indexOf('export const updateDataInRealtimeDB'),
    source.indexOf('export const updateDataInNewUsersRTDB')
  );

  const migrateFnBody = source.slice(
    source.indexOf('const migrateLongUserIdCardFromNewUsers'),
    source.indexOf('export const migrateAllLongUserIdCardsFromNewUsers')
  );

  it('is no longer triggered automatically from updateDataInRealtimeDB (removed as a now-permanent no-op after the users-only migration)', () => {
    expect(updateDataInRealtimeDBBody).not.toContain('migrateLongUserIdCardFromNewUsers(');
    expect(updateDataInRealtimeDBBody).not.toContain("String(userId || '').length > 20");
  });

  it('is still exported for reuse by the manual bulk admin sweep (migrateAllLongUserIdCardsFromNewUsers)', () => {
    expect(source).toContain('await migrateLongUserIdCardFromNewUsers(userId, {});');
  });

  it('sweeps every field still present in newUsers, not just the fields from this save', () => {
    expect(migrateFnBody).toContain('Object.keys(newUsersData).forEach(field =>');
  });

  it('backfills a field into users when it only exists in the stale newUsers copy', () => {
    expect(migrateFnBody).toContain('const confirmedInUsers = Object.prototype.hasOwnProperty.call(usersData, field);');
    expect(migrateFnBody).toContain('if (!confirmedInUsers && !explicitlyDeletedNow)');
    expect(migrateFnBody).toContain('updates[`users/${userId}/${field}`] = newUsersData[field];');
  });

  it('never resurrects a field that this exact save just deleted from users', () => {
    expect(migrateFnBody).toContain(
      'const explicitlyDeletedNow = Object.prototype.hasOwnProperty.call(fieldValues, field)'
    );
    expect(migrateFnBody).toContain('&& fieldValues[field] === null;');
  });

  it('always deletes the newUsers copy once it is confirmed (or backfilled) in users', () => {
    expect(migrateFnBody).toContain('updates[`newUsers/${userId}/${field}`] = null;');
  });

  it('re-reads both collections instead of trusting the in-memory payload', () => {
    expect(migrateFnBody).toContain("get(ref2(database, `newUsers/${userId}`))");
    expect(migrateFnBody).toContain("get(ref2(database, `users/${userId}`))");
  });

  it('swallows migration errors so a cleanup failure never fails the users write itself', () => {
    expect(migrateFnBody).toMatch(/catch \(error\) \{\s*console\.error/);
    expect(migrateFnBody).not.toMatch(/catch \(error\) \{\s*console\.error\([^)]*\);\s*throw error;/);
  });

  it('removes observed userId and transient client-only keys as child updates', () => {
    expect(migrateFnBody).toContain("field === 'userId'");
    expect(migrateFnBody).toContain('transientUserDataKeys.includes(field)');
    expect(migrateFnBody).toContain('updates[`newUsers/${userId}/${field}`] = null;');
  });

  it('never deletes the whole node, so fields written after the snapshot survive', () => {
    expect(migrateFnBody).not.toContain("updates[`newUsers/${userId}`] = null");
    expect(migrateFnBody).not.toContain("{ [`newUsers/${userId}`]: null }");
    expect(migrateFnBody).toContain('await update(ref2(database), updates);');
  });

  it('preserves a non-empty legacy comment for the independent comment migration', () => {
    expect(migrateFnBody).toContain(
      "if (field === 'myComment' && String(newUsersData[field] || '').trim()) return;"
    );
  });
});
