import fs from 'fs';
import path from 'path';

describe('getAllUserPhotos skips newUsers for long-format userIds on the cold-lookup path', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const userIdTemplate = `${String.fromCharCode(36)}{userId}`;

  const getAllUserPhotosBody = source.slice(
    source.indexOf('export const getAllUserPhotos'),
    source.indexOf('export const getMedicationPhotos'),
  );

  it('branches on isLongFormatUserId only when collectionSource is not explicitly given', () => {
    expect(getAllUserPhotosBody).toContain('if (!collectionSource && isLongFormatUserId(userId))');
  });

  it('reads users before any newUsers read in the long-id branch', () => {
    const longIdBranchBody = getAllUserPhotosBody.slice(
      getAllUserPhotosBody.indexOf('if (!collectionSource && isLongFormatUserId(userId))'),
      getAllUserPhotosBody.indexOf('const sourceCollections = getPhotoSourceCollections(collectionSource);'),
    );
    const usersReadIndex = longIdBranchBody.indexOf("readPhotosField('users', userId)");
    const newUsersReadIndex = longIdBranchBody.indexOf("readPhotosField('newUsers', userId)");

    expect(usersReadIndex).toBeGreaterThanOrEqual(0);
    expect(newUsersReadIndex).toBeGreaterThan(usersReadIndex);
  });

  // Обидва читання адресні: `${collection}/${userId}/photos`, а не вузол анкети
  // цілком. Стрічка гідратує картку, а потім питає фото — читання цілого вузла
  // означало другу копію тієї самої анкети в трафіку на кожну картку.
  it('reads only the photos child, never the whole profile node', () => {
    const readerBody = source.slice(
      source.indexOf('const readPhotosField ='),
      source.indexOf('export const getAllUserPhotos'),
    );

    expect(readerBody).toContain(`ref2(database, \`\${collection}/${userIdTemplate}/photos\`)`);
    expect(getAllUserPhotosBody).not.toContain(`get(ref2(database, \`users/${userIdTemplate}\`))`);
    expect(getAllUserPhotosBody).not.toContain(`get(ref2(database, \`newUsers/${userIdTemplate}\`))`);
  });

  it('keeps long-id database reads best-effort when either collection rejects', () => {
    const longIdBranchBody = getAllUserPhotosBody.slice(
      getAllUserPhotosBody.indexOf('if (!collectionSource && isLongFormatUserId(userId))'),
      getAllUserPhotosBody.indexOf('const sourceCollections = getPhotoSourceCollections(collectionSource);'),
    );

    expect(longIdBranchBody.match(/Promise\.allSettled/g)).toHaveLength(2);
    expect(longIdBranchBody).toContain("console.error('Error loading user photos from users:'");
    expect(longIdBranchBody).toContain("console.error('Error loading user photos from newUsers:'");
  });

  it('leaves the explicit-collectionSource path (getPhotoSourceCollections) untouched', () => {
    expect(getAllUserPhotosBody).toContain(
      'const sourceCollections = getPhotoSourceCollections(collectionSource);',
    );
  });

  it('getPhotoSourceCollections itself is unchanged (still defaults to both collections)', () => {
    const getPhotoSourceCollectionsBody = source.slice(
      source.indexOf('const getPhotoSourceCollections'),
      source.indexOf('const collectUserStorageAvatarItems'),
    );
    expect(getPhotoSourceCollectionsBody).toContain("['newUsers', 'users']");
  });
});
