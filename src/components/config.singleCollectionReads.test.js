import fs from 'fs';
import path from 'path';

// Legacy-колекція одна — `users`. Читачі більше нічого не зводять по полях:
// зводити нема з чим, тож кожен із них робить рівно одне читання.
describe('single legacy collection reads', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('fetchUsersByIds tries the profile nodes first and legacy only as a fallback', () => {
    const body = source.slice(
      source.indexOf('export const fetchUsersByIds'),
      source.indexOf('const addUserFromUsers'),
    );

    const nodesIndex = body.indexOf('await readProfileFromNodes(id)');
    const legacyIndex = body.indexOf('get(ref2(database, `users/${id}`))');

    expect(nodesIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeGreaterThan(nodesIndex);
    expect(body).not.toContain('mergeUserCollectionData');
  });

  it('search hits are hydrated from the nodes first, legacy only as a fallback', () => {
    const body = source.slice(
      source.indexOf('const readProfileForSearchHit'),
      source.indexOf('const searchBySearchIdUsers'),
    );

    const nodesIndex = body.indexOf('await readProfileFromNodes(userId)');
    const legacyIndex = body.indexOf('get(ref2(database, `users/${userId}`))');

    expect(nodesIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeGreaterThan(nodesIndex);
    expect(body).not.toContain('mergeUserCollectionData');
  });

  it('bulk RTDB exports read the one collection', () => {
    const fetchAllFilteredUsersBody = source.slice(
      source.indexOf('export const fetchAllFilteredUsers'),
      source.indexOf('export const fetchAllUsersFromRTDB'),
    );
    const fetchAllUsersFromRTDBBody = source.slice(
      source.indexOf('export const fetchAllUsersFromRTDB'),
      source.indexOf('export const getAllUsersWithGetInTouch'),
    );

    expect(fetchAllFilteredUsersBody).toContain("fetchByPathWithFilters('users', serverFilters)");
    expect(fetchAllUsersFromRTDBBody).toContain("get(ref2(database, 'users'))");
    expect(fetchAllFilteredUsersBody).not.toContain('mergeUserCollectionData');
    expect(fetchAllUsersFromRTDBBody).not.toContain('mergeUserCollectionData');
  });

  it('the local export merge is a plain pass-through of one file', () => {
    const localExportMergeBody = addNewProfileSource.slice(
      addNewProfileSource.indexOf('const getMergedUsersFromLocalExportCollections'),
      addNewProfileSource.indexOf('const hasPhoneStartingWith38'),
    );

    expect(localExportMergeBody).toContain('if (!localExportUsersData) return null;');
    expect(localExportMergeBody).not.toContain('mergeUserCollectionData');
  });

  it('strips client-only markers before database writes', () => {
    expect(source).toContain('const transientUserDataKeys = [');
    expect(source).toContain("'__sourceCollection'");
    expect(source).toContain("'__photosHydrated'");
    // Пейлоад ще й проходить приведення дат до формату бази — чистка від цього
    // не змінилась, просто вона тепер не остання ланка перед записом.
    expect(source).toContain('normalizeStoredDates(stripTransientUserDataFields(uploadedInfo));');
    expect(source.match(/markForRealtimeDeletion: condition === 'update'/g)).toHaveLength(2);
  });
});
