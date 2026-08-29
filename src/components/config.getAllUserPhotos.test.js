import fs from 'fs';
import path from 'path';

describe('getAllUserPhotos', () => {
  const source = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
  const userIdTemplate = `${String.fromCharCode(36)}{userId}`;

  const getAllUserPhotosBody = source.slice(
    source.indexOf('export const getAllUserPhotos'),
    source.indexOf('export const getMedicationPhotos'),
  );

  it('prefers the profileDetails node and falls back to the single legacy collection', () => {
    const nodeIndex = getAllUserPhotosBody.indexOf('readPhotosFromProfileNode(userId)');
    const legacyIndex = getAllUserPhotosBody.indexOf("readPhotosField('users', userId)");

    expect(nodeIndex).toBeGreaterThanOrEqual(0);
    expect(legacyIndex).toBeGreaterThan(nodeIndex);
  });

  // Читання адресне: `users/${userId}/photos`, а не вузол анкети цілком. Стрічка
  // гідратує картку, а потім питає фото — читання цілого вузла означало другу
  // копію тієї самої анкети в трафіку на кожну картку.
  it('reads only the photos child, never the whole profile node', () => {
    const readerBody = source.slice(
      source.indexOf('const readPhotosField ='),
      source.indexOf('export const getAllUserPhotos'),
    );

    expect(readerBody).toContain(`ref2(database, \`\${collection}/${userIdTemplate}/photos\`)`);
    expect(getAllUserPhotosBody).not.toContain(`get(ref2(database, \`users/${userIdTemplate}\`))`);
  });

  it('keeps the legacy read best-effort when it rejects', () => {
    expect(getAllUserPhotosBody).toContain('Promise.allSettled');
    expect(getAllUserPhotosBody).toContain("console.error('Error loading user photos from users:'");
  });
});
