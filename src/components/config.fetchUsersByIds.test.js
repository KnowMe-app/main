import fs from 'fs';
import path from 'path';

describe('newUsers merge priority', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('fetchUsersByIds reads both collections by default and lets newUsers override users fields', () => {
    const fetchUsersByIdsBody = source.slice(
      source.indexOf('export const fetchUsersByIds'),
      source.indexOf('const addUserFromUsers')
    );

    expect(fetchUsersByIdsBody).toContain("const readSources = source ? [source] : ['users', 'newUsers'];");
    expect(fetchUsersByIdsBody.indexOf('...(hasUser ? dataBySource.users : {})'))
      .toBeLessThan(fetchUsersByIdsBody.indexOf('...(hasNewUser ? dataBySource.newUsers : {})'));
    expect(fetchUsersByIdsBody).toContain("__sourceCollection: hasNewUser ? 'newUsers' : 'users'");
  });

  it('addUserFromUsers lets newUsers override users fields in search results', () => {
    const addUserFromUsersBody = source.slice(
      source.indexOf('const addUserFromUsers'),
      source.indexOf('const searchBySearchIdUsers')
    );

    expect(addUserFromUsersBody.indexOf('...userData'))
      .toBeLessThan(addUserFromUsersBody.indexOf('...newUserData'));
  });

  it('bulk merged RTDB exports let newUsers override users fields', () => {
    const fetchAllFilteredUsersBody = source.slice(
      source.indexOf('export const fetchAllFilteredUsers'),
      source.indexOf('export const fetchAllUsersFromRTDB')
    );
    const fetchAllUsersFromRTDBBody = source.slice(
      source.indexOf('export const fetchAllUsersFromRTDB'),
      source.indexOf('export const getAllUsersWithGetInTouch')
    );

    expect(fetchAllFilteredUsersBody.indexOf('...(usersData[userId] || {})'))
      .toBeLessThan(fetchAllFilteredUsersBody.indexOf('...newUserRaw'));
    expect(fetchAllUsersFromRTDBBody.indexOf('...(usersData[userId] || {})'))
      .toBeLessThan(fetchAllUsersFromRTDBBody.indexOf('...newUserRaw'));
  });


  it('local export collection merge lets newUsers override users fields', () => {
    const localExportMergeBody = addNewProfileSource.slice(
      addNewProfileSource.indexOf('const getMergedUsersFromLocalExportCollections'),
      addNewProfileSource.indexOf('const hasPhoneStartingWith38')
    );

    expect(localExportMergeBody.indexOf('...(usersData[userId] || {})'))
      .toBeLessThan(localExportMergeBody.indexOf('...newUserRaw'));
  });

  it('marks fetchUserById records with their backing collection', () => {
    expect(source).toContain("__sourceCollection: 'newUsers'");
    expect(source).toContain("__sourceCollection: 'users'");
  });

  it('strips client-only source markers before database writes', () => {
    expect(source).toContain('const transientUserDataKeys = [');
    expect(source).toContain("'__sourceCollection'");
    expect(source).toContain("'__photosHydrated'");
    expect(source).toContain('const cleanedUploadedInfo = stripTransientUserDataFields(uploadedInfo);');
    expect(source.match(/markForRealtimeDeletion: condition === 'update'/g)).toHaveLength(2);
  });
});
