import fs from 'fs';
import path from 'path';

// Legacy-колекція одна — `users`. Читачі більше нічого не зводять по полях:
// зводити нема з чим, тож кожен із них робить рівно одне читання.
describe('single legacy collection reads', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  // Показ у вебі більше не спирається на legacy: колекція лишилась адресатом
  // дзеркального запису для мобільного застосунку, а не джерелом читання.
  // Читалась вона й так лише в адмінів (`users/$uid` відкритий власнику й
  // двом uid), тож для решти це було читання заради PERMISSION_DENIED — а він
  // із `Promise.all` валив увесь пошук у `catch`.
  it('fetchUsersByIds reads the profile nodes and never falls back to legacy', () => {
    const body = source.slice(
      source.indexOf('export const fetchUsersByIds'),
      source.indexOf('export const lazyLoadProfilePhotos'),
    );

    expect(body).toContain('await readProfileFromNodes(id)');
    expect(body).not.toContain('get(ref2(database, `users/${id}`))');
    expect(body).not.toContain('mergeUserCollectionData');
  });

  it('search hits are hydrated from the nodes only', () => {
    const body = source.slice(
      source.indexOf('const readProfileForSearchHit'),
      source.indexOf('const searchBySearchIdUsers'),
    );

    expect(body).toContain('readProfileFromNodes(userId)');
    expect(body).not.toContain('get(ref2(database, `users/${userId}`))');
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
