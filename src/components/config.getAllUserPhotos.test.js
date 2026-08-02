import fs from 'fs';
import path from 'path';

describe('getAllUserPhotos skips newUsers for long-format userIds on the cold-lookup path', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');

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
    const usersReadIndex = longIdBranchBody.indexOf('get(ref2(database, `users/${userId}`))');
    const newUsersReadIndex = longIdBranchBody.indexOf('get(ref2(database, `newUsers/${userId}`))');

    expect(usersReadIndex).toBeGreaterThanOrEqual(0);
    expect(newUsersReadIndex).toBeGreaterThan(usersReadIndex);
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
