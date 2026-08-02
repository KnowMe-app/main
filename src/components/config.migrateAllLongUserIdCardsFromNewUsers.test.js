import fs from 'fs';
import path from 'path';

describe('bulk migration of every long-userId card from newUsers into users', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

  const fnBody = source.slice(
    source.indexOf('export const migrateAllLongUserIdCardsFromNewUsers'),
    source.indexOf('export const updateDataInRealtimeDB')
  );

  it('exists and reads the newUsers root wholesale, without querying helpers', () => {
    expect(fnBody).toBeTruthy();
    expect(fnBody).toContain("get(ref2(database, 'newUsers'))");
    expect(fnBody).not.toContain('orderByChild');
    expect(fnBody).not.toContain('equalTo');
  });

  it('only targets cards whose newUsers key (userId) is long, i.e. backed by a real account', () => {
    expect(fnBody).toContain("String(id || '').length > 20");
  });

  it('reuses the same per-card merge/cleanup logic as the per-save sweep instead of duplicating it', () => {
    expect(fnBody).toContain('await migrateLongUserIdCardFromNewUsers(userId, {});');
  });

  it('never transacts on the database root', () => {
    expect(fnBody).not.toContain('runTransaction(');
  });

  it('reports progress so the UI can show percent complete', () => {
    expect(fnBody).toContain('onProgress?.(');
  });

  it('verifies afterwards that no long-userId card is left behind in newUsers', () => {
    const verifyBody = fnBody.slice(fnBody.indexOf('const verifySnap'));
    expect(verifyBody).toContain("get(ref2(database, 'newUsers'))");
    expect(verifyBody).toContain("String(id || '').length > 20");
    expect(verifyBody).toContain('report.errors.push(');
  });

  it('collects migrated card ids and counts', () => {
    expect(fnBody).toContain('report.migratedCards += 1;');
    expect(fnBody).toContain('report.migratedCardIds.push(userId);');
  });
});
