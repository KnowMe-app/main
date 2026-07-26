import fs from 'fs';
import path from 'path';
import { mergeUserCollectionData, mergeUserFieldValue } from '../utils/mergeUserCollections';

describe('newUsers/users merge behaviour', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const addNewProfileSource = fs.readFileSync(path.join(__dirname, 'AddNewProfile.jsx'), 'utf8');

  it('mergeUserFieldValue keeps unique array values from both sides without duplicates', () => {
    expect(mergeUserFieldValue(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('mergeUserFieldValue treats RTDB "sparse array as object" the same as a real array', () => {
    expect(mergeUserFieldValue({ 0: 'a', 1: 'b' }, ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('mergeUserFieldValue prefers the users (primary) value when a scalar field truly conflicts', () => {
    expect(mergeUserFieldValue('fresh-from-users', 'stale-from-newUsers')).toBe('fresh-from-users');
  });

  it('mergeUserFieldValue falls back to the other side when only one side has the field', () => {
    expect(mergeUserFieldValue(undefined, 'onlyInNewUsers')).toBe('onlyInNewUsers');
    expect(mergeUserFieldValue('onlyInUsers', undefined)).toBe('onlyInUsers');
  });

  it('mergeUserCollectionData does not drop fields that only exist in newUsers', () => {
    const merged = mergeUserCollectionData(
      { surname: 'FreshSurname' },
      { role: 'writer', surname: 'StaleSurname' }
    );
    expect(merged).toEqual({ surname: 'FreshSurname', role: 'writer' });
  });

  it('fetchUsersByIds merges users/newUsers per field instead of overwriting one side wholesale', () => {
    const fetchUsersByIdsBody = source.slice(
      source.indexOf('export const fetchUsersByIds'),
      source.indexOf('const addUserFromUsers')
    );

    expect(fetchUsersByIdsBody).toContain("const readSources = source ? [source] : ['users', 'newUsers'];");
    expect(fetchUsersByIdsBody).toContain('mergeUserCollectionData(');
    expect(fetchUsersByIdsBody).toContain("__sourceCollection: hasNewUser ? 'newUsers' : 'users'");
  });

  it('addUserFromUsers merges users/newUsers per field in search results', () => {
    const addUserFromUsersBody = source.slice(
      source.indexOf('const addUserFromUsers'),
      source.indexOf('const searchBySearchIdUsers')
    );

    expect(addUserFromUsersBody).toContain('mergeUserCollectionData(userData, newUserData)');
  });

  it('fetchUserById merges users/newUsers per field so stale newUsers data cannot shadow fresh users data', () => {
    const fetchUserByIdBody = source.slice(
      source.indexOf('export const fetchUserById'),
      source.indexOf('export const removeKeyFromFirebase')
    );

    expect(fetchUserByIdBody).toContain(
      'mergeUserCollectionData(userSnapshotInUsers.val(), newUserSnapshot.val())'
    );
  });

  it('bulk merged RTDB exports merge users/newUsers per field', () => {
    const fetchAllFilteredUsersBody = source.slice(
      source.indexOf('export const fetchAllFilteredUsers'),
      source.indexOf('export const fetchAllUsersFromRTDB')
    );
    const fetchAllUsersFromRTDBBody = source.slice(
      source.indexOf('export const fetchAllUsersFromRTDB'),
      source.indexOf('export const getAllUsersWithGetInTouch')
    );

    expect(fetchAllFilteredUsersBody).toContain('mergeUserCollectionData(usersData[userId], newUserRaw)');
    expect(fetchAllUsersFromRTDBBody).toContain('mergeUserCollectionData(usersData[userId], newUserRaw)');
  });

  it('local export collection merge merges users/newUsers per field', () => {
    const localExportMergeBody = addNewProfileSource.slice(
      addNewProfileSource.indexOf('const getMergedUsersFromLocalExportCollections'),
      addNewProfileSource.indexOf('const hasPhoneStartingWith38')
    );

    expect(localExportMergeBody).toContain('mergeUserCollectionData(usersData[userId], newUserRaw)');
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
