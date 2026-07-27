import fs from 'fs';
import path from 'path';

describe('every long-userId card save migrates the whole stale newUsers record into users', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const updateDataInRealtimeDBBody = source.slice(
    source.indexOf('export const updateDataInRealtimeDB'),
    source.indexOf('export const updateDataInNewUsersRTDB')
  );

  const migrateFnBody = source.slice(
    source.indexOf('const migrateLongUserIdCardFromNewUsers'),
    source.indexOf('export const updateDataInRealtimeDB')
  );

  it('only migrates newUsers for long-userId cards, after the users write has succeeded', () => {
    expect(updateDataInRealtimeDBBody).toContain('await update(userRefRTDB, cleanedUploadedInfo)');
    const writeIndex = updateDataInRealtimeDBBody.indexOf('await update(userRefRTDB, cleanedUploadedInfo)');
    const migrateCallIndex = updateDataInRealtimeDBBody.indexOf('await migrateLongUserIdCardFromNewUsers(');
    expect(migrateCallIndex).toBeGreaterThan(writeIndex);
    expect(updateDataInRealtimeDBBody).toContain("String(userId || '').length > 20");
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

  it('excludes userId and transient client-only keys from the migration sweep', () => {
    expect(migrateFnBody).toContain("field === 'userId'");
    expect(migrateFnBody).toContain('transientUserDataKeys.includes(field)');
  });
});
