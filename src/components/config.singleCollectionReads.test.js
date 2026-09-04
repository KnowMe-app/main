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

  // Широкий пошук більше не ходить у legacy взагалі. Два проходи, які там
  // лишались (`searchByPrefixes` по 16 полях × 2 регістри і `searchByIndexOn`
  // по метаданих `indexOn/users`), читали ту саму колекцію, з якої показ уже
  // не читає, — і коштували десятки запитів на один пошук. Контакти лежать у
  // `searchId`, а текст картки шукає `searchMatchingCardsByText`.
  it('the broad search no longer touches the legacy collection', () => {
    expect(source).not.toContain('const searchByPrefixes = async');
    expect(source).not.toContain('searchByIndexOn');
    expect(source).not.toContain("const SEARCH_COLLECTIONS = ['users']");
  });

  // Читання legacy лишилось рівно там, де сама колекція і є предметом роботи —
  // в інструментах адмінської консолі, які її вивантажують і зливають. Показ,
  // пошук і стрічка з неї не читають узагалі.
  it('the bulk export is the only bulk read left, and it is the admin tool', () => {
    const fetchAllUsersFromRTDBBody = source.slice(
      source.indexOf('export const fetchAllUsersFromRTDB'),
      source.indexOf('export const getAllUsersWithGetInTouch'),
    );

    // Експорт теж переїхав на вузли: та сама збірка, що й в індексації, тож
    // вивантажене й проіндексоване не можуть розійтись.
    expect(fetchAllUsersFromRTDBBody).toContain('loadProfilesFromNodesForIndexing({ forceRefresh: true })');
    expect(fetchAllUsersFromRTDBBody).not.toContain("get(ref2(database, 'users'))");
    expect(fetchAllUsersFromRTDBBody).not.toContain('mergeUserCollectionData');
    // Читачі, що качали колекцію заради показу, прибрані разом із їхніми
    // викликачами.
    expect(source).not.toContain('export const fetchAllFilteredUsers');
    expect(source).not.toContain('export const fetchAllUsers ');
    expect(source).not.toContain('export const fetchUsersByLastLogin2');
    expect(source).not.toContain('export const fetchLatestUsers');
    expect(source).not.toContain('export const cacheFilteredUsers');
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
