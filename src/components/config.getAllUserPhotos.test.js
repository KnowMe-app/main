import fs from 'fs';
import path from 'path';

describe('getAllUserPhotos', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const userIdTemplate = `${String.fromCharCode(36)}{userId}`;

  const getAllUserPhotosBody = source.slice(
    source.indexOf('export const getAllUserPhotos'),
    source.indexOf('export const getMedicationPhotos'),
  );

  // Фото живуть у `profileDetails`. Відкоту в legacy-колекцію більше немає:
  // веб із неї не читає. `null` означає «у вузлі цього немає» — і на цьому все;
  // аватар картки і файли Storage лишаються, тож галерея не порожня навіть в
  // анкети, яка ще не має `profileDetails`.
  it('reads photos from the profile node and nowhere else', () => {
    expect(getAllUserPhotosBody).toContain('readPhotosFromProfileNode(userId)');
    expect(getAllUserPhotosBody).toContain('databaseUrls = fromProfileNode || []');
    expect(getAllUserPhotosBody).not.toContain("readPhotosField('users', userId)");
    expect(source).not.toContain('const readPhotosField =');
  });

  // Читання адресне: `profileDetails/${userId}/photos`, а не вузол анкети
  // цілком. Стрічка гідратує картку, а потім питає фото — читання цілого вузла
  // означало другу копію тієї самої анкети в трафіку на кожну картку.
  it('reads only the photos child, never the whole profile node', () => {
    const readerBody = source.slice(
      source.indexOf('const readPhotosFromProfileNode ='),
      source.indexOf('export const getAllUserPhotos'),
    );

    expect(readerBody).toContain(`\${PROFILE_NODES.profileDetails}/${userIdTemplate}/photos`);
    expect(getAllUserPhotosBody).not.toContain(`get(ref2(database, \`users/${userIdTemplate}\`))`);
  });

  it('keeps the Storage listing as the other half of the gallery', () => {
    expect(getAllUserPhotosBody).toContain('await getUserStorageAvatarPhotos(userId)');
  });
});
